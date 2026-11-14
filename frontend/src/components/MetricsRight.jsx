// MetricsRight.jsx: el inspector el yemin be 3 tabs basatin (Overview · Mission · Site & Tools) mn gheir scroll
import { useEffect, useRef, useState } from "react";
import {
  BatteryCharging,
  CalendarDays,
  Crosshair,
  Moon,
  Navigation,
  Radio,
  Rocket,
  Sun,
  TowerControl,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import HorizonPanorama from "./HorizonPanorama";
import { Loading, Meter, Notice, Stat, fmt, fmtDur, fmtUtc } from "./MetricCard";

const DATA_START = "2026-11-13T00:00";
const DATA_END = "2032-10-29T00:00";

const MISSION_PRESETS = [
  { id: "clps", label: "CLPS Lander", sub: "14d · 100W · 1m²", days: 14, loadW: 100, panelM2: 1 },
  { id: "artemis", label: "Artemis Crew", sub: "14d · 500W · 4m²", days: 14, loadW: 500, panelM2: 4 },
  { id: "rover", label: "Long-Stay Rover", sub: "60d · 200W · 2m²", days: 60, loadW: 200, panelM2: 2 },
];

const DEFAULT_PREFS = {
  sunPower: true,
  earthContact: true,
  darkBattery: true,
  landingCountdowns: false,
  energyBalance: false,
  powerCommsOverlap: false,
  annualsTerrain: false,
};

export default function MetricsRight({
  metrics,
  cfg,
  setCfg,
  metricPrefs = DEFAULT_PREFS,
  onTimeFrameChange,
  onPickSite,
  onNearbyChange,
}) {
  const { inPole, point, sid, insights, mission, pano } = metrics;
  const m = mission.data;
  const ins = insights.data;
  const prefs = { ...DEFAULT_PREFS, ...metricPrefs };

  const [tab, setTab] = useState("overview");
  const [mast, setMast] = useState({ status: "idle" });
  const [near, setNear] = useState({ status: "idle" });
  const [nearRadius, setNearRadius] = useState(450);
  const [nearStep, setNearStep] = useState(150);
  const [best, setBest] = useState({ status: "idle", data: null, error: null });
  const nearReqRef = useRef(0);

  const effectiveStep = Math.min(nearStep, nearRadius);

  useEffect(() => {
    nearReqRef.current += 1;
    setMast({ status: "idle" });
    setNear({ status: "idle" });
    onNearbyChange?.([]);
  }, [sid, onNearbyChange]);

  useEffect(() => {
    setBest({ status: "idle", data: null, error: null });
  }, [cfg?.days, cfg?.loadW, sid]);

  if (!inPole) {
    const p = point.data;
    return (
      <div className="metrics-right">
        <Notice tone="info">Outside 80°S–90°S LOLA terrain grid — showing flat-horizon Sun &amp; Earth ephemeris only.</Notice>
        {p?.sun_now && (
          <div className="stat-grid">
            <Stat
              icon={<Sun size={12} color="#fbbf24" />}
              label="Sun now"
              value={`${fmt(p.sun_now.el, 2)}°`}
              sub={`az ${fmt(p.sun_now.az)}° · ${p.sun_now.above_flat_horizon ? "up" : "down"}`}
              tone="sun"
            />
            {p.earth_now && (
              <Stat
                icon={<Radio size={12} color="#38bdf8" />}
                label="Earth now"
                value={`${fmt(p.earth_now.el, 2)}°`}
                sub={`az ${fmt(p.earth_now.az)}°`}
                tone="earth"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (point.status === "loading") return <Loading text="Running Stages 1–3 for this spot…" />;
  if (point.status === "error") return <Notice tone="bad">{point.error}</Notice>;
  if (!sid) return null;

  const set = (k) => (e) =>
    setCfg?.((c) => ({
      ...c,
      [k]: e.target.type === "range" || e.target.type === "number" ? +e.target.value : e.target.value,
    }));

  const loadMast = () => {
    if (mast.status === "loading") return;
    setMast({ status: "loading" });
    api
      .mast(sid)
      .then((d) => setMast({ status: "ready", data: d }))
      .catch((e) => setMast({ status: "error", error: e.message }));
  };

  const loadNear = () => {
    if (near.status === "loading") return;
    const reqId = ++nearReqRef.current;
    const r = Math.max(150, Math.min(1500, nearRadius));
    const st = Math.min(effectiveStep, r);
    setNear({ status: "loading" });
    api
      .nearby(sid, r, st)
      .then((d) => {
        if (nearReqRef.current !== reqId) return;
        setNear({ status: "ready", data: d });
        onNearbyChange?.((d.better || []).filter((b) => b.distance_m > 0));
      })
      .catch((e) => {
        if (nearReqRef.current !== reqId) return;
        setNear({ status: "error", error: e.message });
      });
  };

  const findBest = () => {
    if (best.status === "loading") return;
    setBest({ status: "loading", data: null, error: null });
    api
      .bestDates(sid, { days: cfg.days, loadW: cfg.loadW })
      .then((data) => setBest({ status: "ready", data, error: null }))
      .catch((e) => setBest({ status: "error", data: null, error: e.message }));
  };

  const sunPct = m && m.hours > 0 ? Math.round((m.sun_hours / m.hours) * 100) : null;
  const earthPct = m && m.hours > 0 ? Math.round((m.contact_hours / m.hours) * 100) : null;
  const bothPct = m && m.hours > 0 ? Math.round(((m.sun_and_contact_hours || 0) / m.hours) * 100) : 0;
  const showCoreGrid = prefs.sunPower || prefs.earthContact || prefs.darkBattery;
  const showDetailedSection =
    prefs.landingCountdowns || prefs.energyBalance || prefs.powerCommsOverlap || prefs.annualsTerrain;
  const eMax = m ? Math.max(m.energy_generated_kwh || 0, m.energy_needed_kwh || 0, 0.1) : 1;

  return (
    <div className="metrics-right">
      {/* 3 crisp tabs: Overview · Mission · Site & Tools */}
      <div className="panel-tabs" role="tablist" aria-label="Inspector sections">
        {[
          { id: "overview", label: "Overview" },
          { id: "mission", label: "Mission" },
          { id: "tools", label: "Site & Tools" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`panel-tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === "overview" && (
        <div className={`tab-pane ${mission.status === "loading" ? "is-stale" : ""}`}>
          {!m && mission.status === "loading" && <Loading text="Computing mission balance…" />}
          {mission.status === "error" && <Notice tone="bad">{mission.error}</Notice>}

          {m && (
            <>
              {/* Hero Verdict Pill */}
              <div className={`hero-verdict-pill mono ${m.power_positive ? "is-ok" : "is-bad"}`}>
                <Zap size={13} />
                <span>
                  {m.power_positive ? "POWER-POSITIVE" : "POWER-NEGATIVE"} · {m.energy_surplus_kwh >= 0 ? "+" : ""}
                  {fmt(m.energy_surplus_kwh, 1)} kWh · {sunPct}% Sun
                </span>
              </div>

              {/* Artemis III Eligibility 4-Badge Check */}
              {ins && (
                <ArtemisEligibilityCard
                  ins={ins}
                  fallbackLat={point?.data?.lat}
                  onFindEligible={() => {
                    setTab("tools");
                    loadNear();
                  }}
                />
              )}

              {/* Core stat tiles (2x2 by default) */}
              {showCoreGrid && (
                <div className="stat-grid">
                  {prefs.sunPower && (
                    <Stat
                      icon={<Sun size={12} color="#fbbf24" />}
                      label="Sun Hours"
                      value={fmt(m.sun_hours)}
                      unit="h"
                      sub={`${fmt(m.energy_generated_kwh, 1)} kWh made`}
                      tone="sun"
                    />
                  )}
                  {prefs.earthContact && (
                    <Stat
                      icon={<Radio size={12} color="#38bdf8" />}
                      label="Earth Contact"
                      value={fmt(m.contact_hours)}
                      unit="h"
                      sub={`${earthPct}% · 2° margin`}
                      tone="earth"
                    />
                  )}
                  {prefs.darkBattery && (
                    <>
                      <Stat
                        icon={<Moon size={12} color="#a78bfa" />}
                        label="Longest Dark"
                        value={fmtDur(m.longest_dark_h)}
                        sub={`${fmt(m.dark_hours)} h dark total`}
                        tone="night"
                      />
                      <Stat
                        icon={<BatteryCharging size={12} color="#34d399" />}
                        label="Battery Needed"
                        value={fmt(m.battery_needed_kwh, 2)}
                        unit="kWh"
                        sub={`${cfg.days} d · ${cfg.loadW} W load`}
                        tone="ok"
                      />
                    </>
                  )}
                </div>
              )}

              {/* Optional Detailed Metrics Section (OFF by default, toggled via SlidersHorizontal) */}
              {showDetailedSection && (
                <div className="detailed-metrics-section">
                  <div className="section-title">Detailed Metrics</div>

                  {prefs.landingCountdowns && m.at_landing && (
                    <div className="landing-pills">
                      <span className={`pano-badge ${m.at_landing.sun_visible ? "pano-badge-sun-ok" : "pano-badge-blocked"}`}>
                        {m.at_landing.sun_visible
                          ? `SUN UP · sets in ${fmtDur(m.at_landing.hours_to_first_sunset)}`
                          : `IN DARK · sun in ${fmtDur(m.at_landing.hours_to_first_sun)}`}
                      </span>
                      <span
                        className={`pano-badge ${m.at_landing.earth_visible ? "pano-badge-earth-ok" : "pano-badge-blocked"}`}
                      >
                        {m.at_landing.earth_visible
                          ? "EARTH LINK · ready"
                          : `NO LINK · Earth in ${fmtDur(m.at_landing.hours_to_first_contact)}`}
                      </span>
                    </div>
                  )}

                  {prefs.energyBalance && (
                    <div className="drawer-card energy-balance compact-detail-card">
                      <div className="eb-row">
                        <span>Energy Made</span>
                        <Meter value={m.energy_generated_kwh} max={eMax} color="#ff8c2b" />
                        <b className="mono">{fmt(m.energy_generated_kwh, 1)} kWh</b>
                      </div>
                      <div className="eb-row">
                        <span>Energy Needed</span>
                        <Meter value={m.energy_needed_kwh} max={eMax} color="#4da6ff" />
                        <b className="mono">{fmt(m.energy_needed_kwh, 1)} kWh</b>
                      </div>
                      <div className="detail-inline-meta mono">
                        Surplus: {m.energy_surplus_kwh >= 0 ? "+" : ""}
                        {fmt(m.energy_surplus_kwh, 1)} kWh ({cfg.panelM2} m² · 30% eff)
                      </div>
                    </div>
                  )}

                  {prefs.powerCommsOverlap && (
                    <div className="stat-grid">
                      <Stat
                        icon={<Zap size={12} color="#34d399" />}
                        label="Power + Comms"
                        value={fmt(m.sun_and_contact_hours)}
                        unit="h"
                        sub={`${bothPct}% simultaneous · 2° link margin`}
                        tone="ok"
                      />
                      <Stat
                        icon={<Radio size={12} color="#38bdf8" />}
                        label="Max Blackout"
                        value={fmtDur(m.longest_blackout_h)}
                        sub={`${fmt(m.blackout_hours)} h no-link total`}
                        tone="earth"
                      />
                    </div>
                  )}

                  {prefs.annualsTerrain && ins && (
                    <div className="drawer-card compact-detail-card">
                      <div className="stat-grid-3">
                        <MiniStat label="Sun h/yr" value={`${fmt(ins.sun_hours_per_year, 0)} h`} color="#ffb26b" />
                        <MiniStat label="Earth h/yr" value={`${fmt(ins.contact_hours_per_year, 0)} h`} color="#7dd3fc" />
                        <MiniStat label="kWh/m²/yr" value={fmt(ins.energy_kwh_per_year, 0)} color="#34d399" />
                      </div>
                      <div className="detail-inline-meta mono" style={{ marginTop: 6 }}>
                        Max Slope (200m): {fmt(ins.terrain?.max_slope_200m_deg, 1)}° · Rays off map:{" "}
                        {fmt(ins.rays_off_map_percent, 1)}%
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {pano && <HorizonPanorama data={pano} onFrameChange={onTimeFrameChange} />}
        </div>
      )}

      {/* TAB 2: MISSION */}
      {tab === "mission" && (
        <div className="tab-pane">
          <div className="drawer-card mission-form compact-form">
            <div className="mission-presets-block">
              <div className="mission-presets-head">
                <span>Mission Presets</span>
                <span className="mission-presets-note">illustrative</span>
              </div>
              <div className="mission-presets-grid">
                {MISSION_PRESETS.map((pr) => {
                  const active =
                    Number(cfg.days) === pr.days &&
                    Number(cfg.loadW) === pr.loadW &&
                    Math.abs(Number(cfg.panelM2) - pr.panelM2) < 0.05;
                  return (
                    <button
                      key={pr.id}
                      type="button"
                      className={`preset-pill ${active ? "is-active" : ""}`}
                      onClick={() =>
                        setCfg?.((c) => ({
                          ...c,
                          days: pr.days,
                          loadW: pr.loadW,
                          panelM2: pr.panelM2,
                        }))
                      }
                      title={`${pr.label}: ${pr.sub} (illustrative)`}
                    >
                      <span className="preset-pill-title">{pr.label}</span>
                      <span className="preset-pill-sub mono">{pr.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <label>
              <span>
                <CalendarDays size={12} /> Landing (UTC)
              </span>
              <input type="datetime-local" value={cfg.start} min={DATA_START} max={DATA_END} step={600} onChange={set("start")} />
            </label>
            <label>
              <span>
                Stay <b className="mono">{cfg.days} days</b>
              </span>
              <input type="range" min={1} max={60} value={cfg.days} onChange={set("days")} />
            </label>
            <div className="mission-form-row">
              <label>
                <span>Load (W)</span>
                <input type="number" min={1} max={5000} value={cfg.loadW} onChange={set("loadW")} />
              </label>
              <label>
                <span>Panel (m²)</span>
                <input type="number" min={0.1} max={100} step={0.1} value={cfg.panelM2} onChange={set("panelM2")} />
              </label>
            </div>
          </div>

          {m?.daily?.length > 0 && <DailyChart daily={m.daily} />}

          {best.status === "idle" && (
            <button className="action-btn" onClick={findBest}>
              <Rocket size={14} /> Find Best Landing Dates ({cfg.days}d)
            </button>
          )}
          {best.status === "loading" && <Loading text="Ranking 6 years of start dates…" />}
          {best.status === "error" && <Notice tone="bad">{best.error}</Notice>}
          {best.status === "ready" && (
            <div className="best-list">
              {best.data.dates.map((d, i) => (
                <button
                  key={d.start}
                  className="best-item"
                  onClick={() => setCfg?.((c) => ({ ...c, start: d.start.slice(0, 16) }))}
                  title="Use this landing date"
                >
                  <span className="best-rank mono">#{i + 1}</span>
                  <span className="best-date">{fmtUtc(d.start)}</span>
                  <span className="best-nums mono">
                    {fmt(d.energy_generated_kwh, 0)} kWh · {fmt(d.sun_hours, 0)} h sun · {fmt(d.contact_hours, 0)} h link
                  </span>
                </button>
              ))}
              <button className="link-btn" onClick={() => setBest({ status: "idle", data: null, error: null })}>
                re-rank
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SITE & TOOLS */}
      {tab === "tools" && (
        <div className="tab-pane">
          {!ins && insights.status === "loading" && <Loading text="Reading 6-year terrain profile…" />}
          {insights.status === "error" && <Notice tone="bad">{insights.error}</Notice>}
          {ins && (
            <>
              <div className="drawer-card score-card compact-score">
                <ScoreRing value={ins.score} />
                <div className="score-parts">
                  <div className={`site-class ${ins.psr ? "is-psr" : ""}`}>{ins.class}</div>
                  <Part label="Sun" v={ins.parts.sun} max={40} color="#ff8c2b" />
                  <Part label="Earth" v={ins.parts.earth} max={30} color="#4da6ff" />
                  <Part label="Nights" v={ins.parts.night} max={30} color="#a78bfa" />
                </div>
              </div>
              <div className="stat-grid-3">
                <MiniStat
                  label="Slope (100m)"
                  value={`${fmt(ins.terrain.slope_deg)}°`}
                  color={ins.terrain.safe_for_landing ? "#34d399" : "#f87171"}
                />
                <MiniStat label="Elevation" value={`${fmt(ins.h_site_m, 0)} m`} />
                <MiniStat label="Sun / yr" value={`${fmt(ins.sun_hours_per_year, 0)} h`} color="#ffb26b" />
              </div>
              <ArtemisEligibilityCard
                ins={ins}
                fallbackLat={point?.data?.lat}
                onFindEligible={() => loadNear()}
              />
            </>
          )}

          {mast.status === "idle" && (
            <button className="action-btn" onClick={loadMast}>
              <TowerControl size={14} /> Compare 2 / 5 / 10 / 20 / 50 m Mast
            </button>
          )}
          {mast.status === "loading" && <Loading text="Re-running horizon at 2 / 5 / 10 / 20 / 50 m…" />}
          {mast.status === "error" && <Notice tone="bad">{mast.error}</Notice>}
          {mast.status === "ready" && (
            <table className="mini-table mono">
              <thead>
                <tr>
                  <th>Mast</th>
                  <th>Sun h/yr</th>
                  <th>Sunlit</th>
                  <th>Longest night</th>
                </tr>
              </thead>
              <tbody>
                {mast.data.options.map((o) => (
                  <tr key={o.mast_m}>
                    <td>{o.mast_m} m</td>
                    <td>{fmt(o.sun_hours_per_year, 0)}</td>
                    <td>{fmt(o.percent_sunlit)}%</td>
                    <td>{fmtDur(o.longest_night_h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="drawer-card nearby-search-box">
            <div className="nearby-search-row">
              <span className="nearby-ctrl-label">
                Search Radius <b className="mono">{nearRadius} m</b>
              </span>
              <div className="nearby-step-toggle" role="group" aria-label="Grid step size">
                {[150, 300].map((st) => {
                  const activeSt = effectiveStep === st;
                  const disabledSt = st > nearRadius || near.status === "loading";
                  return (
                    <button
                      key={st}
                      type="button"
                      className={`step-pill mono ${activeSt ? "is-active" : ""}`}
                      disabled={disabledSt}
                      onClick={() => setNearStep(st)}
                      title={`Grid step ${st} m`}
                    >
                      {st}m step
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              type="range"
              min={150}
              max={1500}
              step={150}
              value={nearRadius}
              disabled={near.status === "loading"}
              aria-label="Search Radius (meters)"
              onChange={(e) => {
                const nextR = Number(e.target.value);
                setNearRadius(nextR);
                if (nearStep > nextR) setNearStep(nextR);
              }}
            />
            <button className="action-btn" disabled={near.status === "loading"} onClick={loadNear}>
              <Crosshair size={14} />
              {near.status === "loading"
                ? `Scanning ${nearRadius} m (${effectiveStep} m step)…`
                : `Find Better Spot (${nearRadius} m)`}
            </button>
          </div>

          {near.status === "error" && <Notice tone="bad">{near.error}</Notice>}
          {near.status === "ready" && (
            <div className="best-list">
              {near.data.better.filter((b) => b.distance_m > 0).length === 0 && (
                <Notice tone="ok">Already optimal within {near.data.searched?.radius_m ?? nearRadius} m.</Notice>
              )}
              {near.data.better
                .filter((b) => b.distance_m > 0)
                .map((b, idx) => (
                  <button
                    key={`${b.x}_${b.y}`}
                    className="best-item best-item-nearby"
                    onClick={() => onPickSite?.(b)}
                    title="Jump to this spot"
                  >
                    <span className="best-rank mono" style={{ color: "#34d399", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span>#{idx + 1}</span>
                      <Navigation size={11} style={{ transform: `rotate(${b.bearing_deg}deg)` }} />
                    </span>
                    <span className="best-date">
                      {b.distance_m} m · {b.bearing_deg}° · slope {fmt(b.slope_deg)}°
                    </span>
                    <span className="best-nums mono">
                      {fmt(b.percent_sunlit)}% sun ({b.gain_sun_hours_per_year >= 0 ? "+" : ""}
                      {fmt(b.gain_sun_hours_per_year, 0)} h/yr)
                    </span>
                  </button>
                ))}
            </div>
          )}

          {/* Validation vs Literature Card */}
          <div className="drawer-card validation-card">
            <div className="section-title" style={{ marginBottom: 6 }}>
              Validation vs Literature
            </div>
            <div className="validation-row">
              <span>Gläser et al. (2014) CR1 (2m)</span>
              <b className="mono">89.9% vs 92.27% lit.</b>
            </div>
            <div className="validation-row">
              <span>NASA JPL Horizons (DE440)</span>
              <b className="mono" style={{ color: "#34d399" }}>
                &lt; 0.05° flat-horizon err
              </b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArtemisEligibilityCard({ ins, fallbackLat, onFindEligible }) {
  const r = ins.artemis_rules;
  const earthPct = r?.earth_contact_percent ?? ins.earth_contact_percent ?? ((ins.contact_hours_per_year || 0) / 8766) * 100;
  const sunPct = r?.percent_sunlit ?? ins.percent_sunlit ?? ((ins.sun_hours_per_year || 0) / 8766) * 100;
  const slopeVal = r?.slope_deg ?? ins.terrain?.slope_deg ?? 0;
  const latVal = r?.lat ?? ins.lat ?? fallbackLat ?? -89.0;

  const earthOk = r ? !!r.earth_ok : earthPct >= 25.0;
  const sunOk = r ? !!r.sun_ok : sunPct >= 5.0;
  const slopeOk = r ? !!r.slope_ok : slopeVal < 10.0;
  const latOk = r ? !!r.lat_ok : latVal <= -84.0;
  const eligible = ins.artemis_eligible !== undefined ? !!ins.artemis_eligible : earthOk && sunOk && slopeOk && latOk;

  const failedReasons =
    r?.failed_reasons?.length > 0
      ? r.failed_reasons
      : [
          !earthOk && `Earth contact ${earthPct.toFixed(1)}% < 25%`,
          !sunOk && `Sunlit ${sunPct.toFixed(1)}% < 5%`,
          !slopeOk && `Slope ${slopeVal.toFixed(1)}° ≥ 10°`,
          !latOk && `Lat ${latVal.toFixed(2)}° > -84°`,
        ].filter(Boolean);

  const badges = [
    { key: "earth", label: "Earth ≥ 25%", ok: earthOk },
    { key: "sun", label: "Sun ≥ 5%", ok: sunOk },
    { key: "slope", label: "Slope < 10°", ok: slopeOk },
    { key: "lat", label: "Lat ≤ -84°", ok: latOk },
  ];

  return (
    <div className={`drawer-card artemis-card ${eligible ? "is-eligible" : "is-ineligible"}`}>
      <div className="artemis-head">
        <span className="section-title" style={{ margin: 0 }}>
          Artemis III Eligibility
        </span>
        <span className={`artemis-status-pill mono ${eligible ? "is-ok" : "is-bad"}`}>
          {eligible ? "✓ ELIGIBLE" : "✗ INELIGIBLE"}
        </span>
      </div>
      <div className="artemis-badge-grid mono">
        {badges.map((b) => (
          <span key={b.key} className={`artemis-rule-badge ${b.ok ? "is-pass" : "is-fail"}`}>
            <b>{b.ok ? "✓" : "✗"}</b> {b.label}
          </span>
        ))}
      </div>
      {!eligible && (
        <div className="artemis-fail-box">
          <div className="artemis-fail-text">
            Fails: <b>{failedReasons.join(" · ")}</b>
          </div>
          <button type="button" className="artemis-find-btn mono" onClick={onFindEligible}>
            <Crosshair size={11} /> Find Nearest Eligible Spot
          </button>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color = "#fff" }) {
  return (
    <div className="mini-stat-tile">
      <div className="mini-stat-label">{label}</div>
      <div className="mini-stat-val mono" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  if (!daily?.length) return null;
  const W = 300;
  const H = 64;
  const n = daily.length;
  const bw = W / n;
  const y = (h) => H - (h / 24) * (H - 4);
  const d = hover !== null ? daily[hover] : null;
  return (
    <div className="drawer-card daily-chart" style={{ padding: "10px 12px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" onMouseLeave={() => setHover(null)} role="img" aria-label="Sun and Earth-contact hours per day">
        <line x1={0} x2={W} y1={y(24)} y2={y(24)} stroke="rgba(148,163,184,0.18)" strokeDasharray="2 3" />
        {daily.map((row, i) => (
          <g key={row.day} onMouseEnter={() => setHover(i)}>
            <rect x={i * bw} y={0} width={bw} height={H} fill={hover === i ? "rgba(255,255,255,0.05)" : "transparent"} />
            <rect x={i * bw + bw * 0.12} y={y(row.sun_h)} width={bw * 0.38} height={H - y(row.sun_h)} rx={1} fill="#ff8c2b" />
            <rect x={i * bw + bw * 0.52} y={y(row.contact_h)} width={bw * 0.36} height={H - y(row.contact_h)} rx={1} fill="#4da6ff" opacity={0.85} />
          </g>
        ))}
      </svg>
      <div className="daily-legend mono">
        {d ? (
          <span>
            Day {d.day}: {fmt(d.sun_h)} h sun · {fmt(d.energy_kwh, 2)} kWh · {fmt(d.contact_h)} h link
          </span>
        ) : (
          <span>
            <i className="dot" style={{ background: "#ff8c2b" }} /> sun h <i className="dot" style={{ background: "#4da6ff" }} /> Earth h (24h max)
          </span>
        )}
      </div>
    </div>
  );
}

function Part({ label, v, max, color }) {
  return (
    <div className="part-row">
      <span>{label}</span>
      <div className="meter">
        <div className="meter-fill" style={{ width: `${(v / max) * 100}%`, background: color }} />
      </div>
      <b className="mono">
        {fmt(v)}/{max}
      </b>
    </div>
  );
}

function ScoreRing({ value }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const color = value >= 60 ? "#34d399" : value >= 35 ? "#fbbf24" : "#f87171";
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`Site score ${value} of 100`}>
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5.5" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 30 30)"
      />
      <text x="30" y="34" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily="ui-monospace, Menlo, monospace">
        {Math.round(value)}
      </text>
    </svg>
  );
}
