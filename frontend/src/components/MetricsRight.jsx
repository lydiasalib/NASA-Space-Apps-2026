// MetricsRight.jsx: el inspector el yemin be 3 tabs basatin (Overview · Mission · Site & Tools) mn gheir scroll
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BatteryCharging,
  CalendarDays,
  CalendarPlus,
  Crosshair,
  Download,
  Grid,
  Moon,
  Navigation,
  Radio,
  Rocket,
  Sun,
  TowerControl,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { downloadMissionCardPng, exportMissionIcs } from "../lib/exporters";
import HorizonPanorama from "./HorizonPanorama";
import LightTimeline from "./LightTimeline";
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

function checkArtemis(ins, fallbackLat) {
  if (!ins) return null;
  const r = ins.artemis_rules;
  const earthPct =
    r?.earth_contact_percent ?? ins.earth_contact_percent ?? ((ins.contact_hours_per_year || 0) / 8766) * 100;
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

  return { eligible, earthOk, sunOk, slopeOk, latOk, earthPct, sunPct, slopeVal, latVal, failedReasons };
}

export default function MetricsRight({
  site,
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
  const [square, setSquare] = useState({ status: "idle", data: null, error: null });
  const [near, setNear] = useState({ status: "idle" });
  const [nearRadius, setNearRadius] = useState(450);
  const [nearStep, setNearStep] = useState(150);
  const [bestBy, setBestBy] = useState("energy");
  const [best, setBest] = useState({ status: "idle", data: null, error: null });
  const [timelineWins, setTimelineWins] = useState({ sun: [], earth: [] });
  const nearReqRef = useRef(0);

  const effectiveStep = Math.min(nearStep, nearRadius);

  useEffect(() => {
    nearReqRef.current += 1;
    setMast({ status: "idle" });
    setSquare({ status: "idle", data: null, error: null });
    setNear({ status: "idle" });
    setTimelineWins({ sun: [], earth: [] });
    onNearbyChange?.([]);
  }, [sid, onNearbyChange]);

  useEffect(() => {
    setBest({ status: "idle", data: null, error: null });
  }, [cfg?.days, cfg?.loadW, bestBy, sid]);

  // Auto-load 100m x 100m landing-square check when user opens Site & Tools tab
  useEffect(() => {
    if (tab !== "tools" || !sid || square.status !== "idle") return;
    let dead = false;
    setSquare({ status: "loading", data: null, error: null });
    api
      .landingSquare(sid)
      .then((d) => {
        if (!dead) setSquare({ status: "ready", data: d, error: null });
      })
      .catch((e) => {
        if (!dead) setSquare({ status: "error", data: null, error: e.message });
      });
    return () => {
      dead = true;
    };
  }, [tab, sid, square.status]);

  const handleWindowsLoaded = useCallback((w) => {
    setTimelineWins(w);
  }, []);

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
              tooltip="Current solar elevation and azimuth above a flat lunar horizon (no LOLA DEM south of 80°S)."
            />
            {p.earth_now && (
              <Stat
                icon={<Radio size={12} color="#38bdf8" />}
                label="Earth now"
                value={`${fmt(p.earth_now.el, 2)}°`}
                sub={`az ${fmt(p.earth_now.az)}°`}
                tone="earth"
                tooltip="Current Earth elevation and azimuth from this coordinate."
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

  const findBest = (byCriterion = bestBy) => {
    if (best.status === "loading") return;
    setBest({ status: "loading", data: null, error: null });
    api
      .bestDates(sid, { days: cfg.days, loadW: cfg.loadW, by: byCriterion })
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
  const artemisInfo = checkArtemis(ins, point?.data?.lat ?? site?.lat);

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

      {/* TAB 1: OVERVIEW (decluttered so 360° Horizon Panorama + Time Slider fit with zero vertical cutoff) */}
      {tab === "overview" && (
        <div className={`tab-pane ${mission.status === "loading" ? "is-stale" : ""}`}>
          {!m && mission.status === "loading" && <Loading text="Computing mission balance…" />}
          {mission.status === "error" && <Notice tone="bad">{mission.error}</Notice>}

          {m && (
            <>
              {/* Hero Verdict Pill + Compact Clickable Artemis III Mini-Badge */}
              <div className="hero-verdict-row">
                <div
                  className={`hero-verdict-pill mono ${m.power_positive ? "is-ok" : "is-bad"}`}
                  title="Overall mission power balance: compares solar energy generated by your panel against lander load."
                >
                  <Zap size={13} />
                  <span>
                    {m.power_positive ? "POWER-POSITIVE" : "POWER-NEGATIVE"} · {m.energy_surplus_kwh >= 0 ? "+" : ""}
                    {fmt(m.energy_surplus_kwh, 1)} kWh · {sunPct}% Sun
                  </span>
                </div>
                {artemisInfo && (
                  <button
                    type="button"
                    className={`artemis-mini-badge mono ${artemisInfo.eligible ? "is-ok" : "is-bad"}`}
                    onClick={() => setTab("tools")}
                    title={
                      artemisInfo.eligible
                        ? "Passes all 4 NASA Artemis III rules (Earth ≥ 25%, Sun ≥ 5%, Slope < 10°, Lat ≤ -84°). Click to inspect in Site & Tools."
                        : `Fails Artemis III rules (${artemisInfo.failedReasons.join(", ")}). Click to open Site & Tools and find nearest eligible spot.`
                    }
                  >
                    {artemisInfo.eligible ? "✓ Artemis III" : "✗ Ineligible"}
                  </button>
                )}
              </div>

              {/* Core stat tiles (2x2 by default) with plain-language hover tooltips */}
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
                      tooltip="Total hours the solar disc is visible above the local LOLA mountain horizon during your mission stay."
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
                      tooltip="Hours with direct line-of-sight to Earth at least 2° above the local terrain for Direct-to-Earth (DTE) radio comms."
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
                        tooltip="The longest continuous stretch with no sunlight during the mission. Your battery must survive this gap."
                      />
                      <Stat
                        icon={<BatteryCharging size={12} color="#34d399" />}
                        label="Battery Needed"
                        value={fmt(m.battery_needed_kwh, 2)}
                        unit="kWh"
                        sub={`${cfg.days} d · ${cfg.loadW} W load`}
                        tone="ok"
                        tooltip="Smallest battery capacity (starting fully charged at landing) required so stored energy never drops to zero."
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
                      <span
                        className={`pano-badge ${m.at_landing.sun_visible ? "pano-badge-sun-ok" : "pano-badge-blocked"}`}
                        title="Illumination state at the exact moment of touchdown and countdown to the first transition."
                      >
                        {m.at_landing.sun_visible
                          ? `SUN UP · sets in ${fmtDur(m.at_landing.hours_to_first_sunset)}`
                          : `IN DARK · sun in ${fmtDur(m.at_landing.hours_to_first_sun)}`}
                      </span>
                      <span
                        className={`pano-badge ${m.at_landing.earth_visible ? "pano-badge-earth-ok" : "pano-badge-blocked"}`}
                        title="Direct-to-Earth communications state at touchdown."
                      >
                        {m.at_landing.earth_visible
                          ? "EARTH LINK · ready"
                          : `NO LINK · Earth in ${fmtDur(m.at_landing.hours_to_first_contact)}`}
                      </span>
                    </div>
                  )}

                  {prefs.energyBalance && (
                    <div
                      className="drawer-card energy-balance compact-detail-card"
                      title="Comparison between total solar electrical energy generated and total lander load energy consumed."
                    >
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
                        tooltip="Hours when both sunlight and Direct-to-Earth radio link are available at the same time (ideal for high-power science telemetry)."
                      />
                      <Stat
                        icon={<Radio size={12} color="#38bdf8" />}
                        label="Max Blackout"
                        value={fmtDur(m.longest_blackout_h)}
                        sub={`${fmt(m.blackout_hours)} h no-link total`}
                        tone="earth"
                        tooltip="Longest continuous period without Direct-to-Earth radio visibility during the mission."
                      />
                    </div>
                  )}

                  {prefs.annualsTerrain && ins && (
                    <div className="drawer-card compact-detail-card">
                      <div className="stat-grid-3">
                        <MiniStat
                          label="Sun h/yr"
                          value={`${fmt(ins.sun_hours_per_year, 0)} h`}
                          color="#ffb26b"
                          tooltip="Average sunlit hours per Earth year (out of 8,766 h) across 2026–2032."
                        />
                        <MiniStat
                          label="Earth h/yr"
                          value={`${fmt(ins.contact_hours_per_year, 0)} h`}
                          color="#7dd3fc"
                          tooltip="Average Direct-to-Earth contact hours per year (out of 8,766 h)."
                        />
                        <MiniStat
                          label="kWh/m²/yr"
                          value={fmt(ins.energy_kwh_per_year, 0)}
                          color="#34d399"
                          tooltip="Annual electrical energy generated per 1 m² of sun-tracking solar panel (30% efficiency)."
                        />
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
            <label title="UTC touchdown date and time (between Nov 2026 and Nov 2032).">
              <span>
                <CalendarDays size={12} /> Landing (UTC)
              </span>
              <input type="datetime-local" value={cfg.start} min={DATA_START} max={DATA_END} step={600} onChange={set("start")} />
            </label>
            <label title="Surface mission duration in Earth days (24 h each).">
              <span>
                Stay <b className="mono">{cfg.days} days</b>
              </span>
              <input type="range" min={1} max={60} value={cfg.days} onChange={set("days")} />
            </label>
            <div className="mission-form-row">
              <label title="Continuous electrical power draw of the lander or rover in Watts.">
                <span>Load (W)</span>
                <input type="number" min={1} max={5000} value={cfg.loadW} onChange={set("loadW")} />
              </label>
              <label title="Active solar array area in square meters (30% triple-junction efficiency assumed).">
                <span>Panel (m²)</span>
                <input type="number" min={0.1} max={100} step={0.1} value={cfg.panelM2} onChange={set("panelM2")} />
              </label>
            </div>
          </div>

          {/* Item #6: Two-level 6-year light & Earth-link timeline strip */}
          <LightTimeline sid={sid} cfg={cfg} setCfg={setCfg} onWindowsLoaded={handleWindowsLoaded} />

          {m?.daily?.length > 0 && <DailyChart daily={m.daily} />}

          {/* Winner Idea #1 (.ics Calendar Export) & Item #8 (Download Mission Card PNG) */}
          <div className="export-actions-grid">
            <button
              type="button"
              className="action-btn export-btn"
              onClick={() =>
                exportMissionIcs({
                  site: site || { id: sid, name: sid, lat: ins?.lat ?? -89, lon: ins?.lon ?? 0 },
                  cfg,
                  mission: m,
                  pano,
                  sunWindows: timelineWins.sun,
                  earthWindows: timelineWins.earth,
                })
              }
              title="Export every sunrise, sunset, Earth-rise, and Earth-blackout during this mission as an .ics calendar file"
            >
              <CalendarPlus size={13} /> Export Calendar (.ics)
            </button>
            <button
              type="button"
              className="action-btn export-btn"
              onClick={() =>
                downloadMissionCardPng({
                  site: site || { id: sid, name: sid, lat: ins?.lat ?? -89, lon: ins?.lon ?? 0 },
                  cfg,
                  mission: m,
                  insights: ins,
                  pano,
                })
              }
              title="Download a high-DPI PNG summary card of this site and mission window"
            >
              <Download size={13} /> Mission Card (.png)
            </button>
          </div>

          {/* Best Landing Dates with criterion selector (Energy vs Sun Hours vs Earth Contact) */}
          <div className="best-dates-bar">
            <div className="best-by-row">
              <span className="nearby-ctrl-label">Rank 6-Yr Windows By:</span>
              <div className="nearby-step-toggle" role="group" aria-label="Best dates ranking criterion">
                {[
                  { id: "energy", label: "Energy" },
                  { id: "sun", label: "Sun Hours" },
                  { id: "contact", label: "Earth Link" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`step-pill mono ${bestBy === opt.id ? "is-active" : ""}`}
                    onClick={() => {
                      setBestBy(opt.id);
                      findBest(opt.id);
                    }}
                    title={`Rank 6 years of ${cfg.days}-day windows by ${opt.label}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {best.status === "idle" && (
              <button className="action-btn" onClick={() => findBest(bestBy)}>
                <Rocket size={14} /> Find Best Landing Dates ({cfg.days}d)
              </button>
            )}
          </div>
          {best.status === "loading" && <Loading text="Ranking 6 years of start dates…" />}
          {best.status === "error" && <Notice tone="bad">{best.error}</Notice>}
          {best.status === "ready" && (
            <div className="best-list">
              {best.data.dates.map((d, i) => (
                <button
                  key={d.start}
                  className="best-item"
                  onClick={() => setCfg?.((c) => ({ ...c, start: d.start.slice(0, 16) }))}
                  title="Click to set your mission landing date to this optimal window"
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
              <div
                className="drawer-card score-card compact-score"
                title="Composite 0–100 site score: 40% sunlit fraction + 30% Earth contact fraction + 30% short-night resilience (0 pts if longest night ≥ 720 h)."
              >
                <ScoreRing value={ins.score} grade={ins.grade} />
                <div className="score-parts">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <div className={`site-class ${ins.psr ? "is-psr" : ""}`}>{ins.class}</div>
                    <span className="site-grade-pill mono" title="Simple letter grade (A ≥ 80, B ≥ 65, C ≥ 50, D ≥ 35, F < 35)">
                      Grade {ins.grade || (ins.score >= 80 ? "A" : ins.score >= 65 ? "B" : ins.score >= 50 ? "C" : ins.score >= 35 ? "D" : "F")}
                    </span>
                  </div>
                  <Part
                    label="Sun"
                    v={ins.parts.sun}
                    max={40}
                    color="#ff8c2b"
                    tooltip="Solar exposure points (up to 40 pts = 40 × 6-year sunlit fraction)."
                  />
                  <Part
                    label="Earth"
                    v={ins.parts.earth}
                    max={30}
                    color="#4da6ff"
                    tooltip="Direct-to-Earth communications points (up to 30 pts = 30 × Earth-visible fraction)."
                  />
                  <Part
                    label="Nights"
                    v={ins.parts.night}
                    max={30}
                    color="#a78bfa"
                    tooltip="Night survival points (up to 30 pts; shorter longest night scores higher, 720 h = 0 pts)."
                  />
                </div>
              </div>
              <div className="stat-grid-3">
                <MiniStat
                  label="Slope (100m)"
                  value={`${fmt(ins.terrain.slope_deg)}°`}
                  color={ins.terrain.safe_for_landing ? "#34d399" : "#f87171"}
                  tooltip="Ground tilt measured across a 100 m baseline (NASA Artemis III landing limit is < 10°)."
                />
                <MiniStat
                  label="Elevation"
                  value={`${fmt(ins.h_site_m, 0)} m`}
                  tooltip="Surface elevation relative to the lunar reference sphere (R = 1,737.4 km) from LOLA 80 m/px DEM."
                />
                <MiniStat
                  label="Sun / yr"
                  value={`${fmt(ins.sun_hours_per_year, 0)} h`}
                  color="#ffb26b"
                  tooltip="Average sunlit hours per Earth year (out of 8,766 h) across the 2026–2032 epoch."
                />
              </div>
              <ArtemisEligibilityCard
                ins={ins}
                fallbackLat={point?.data?.lat}
                onFindEligible={() => loadNear()}
              />
            </>
          )}

          {/* Item #5 & Winner Idea #2: 100 m × 100 m Landing-Square & Probability Check */}
          <LandingSquareCard square={square} />

          {mast.status === "idle" && (
            <button
              className="action-btn"
              onClick={loadMast}
              title="Re-compute horizon mask and solar exposure for 2 m, 5 m, 10 m, 20 m, and 50 m mast heights."
            >
              <TowerControl size={14} /> Compare 2 / 5 / 10 / 20 / 50 m Mast
            </button>
          )}
          {mast.status === "loading" && <Loading text="Re-running horizon at 2 / 5 / 10 / 20 / 50 m…" />}
          {mast.status === "error" && <Notice tone="bad">{mast.error}</Notice>}
          {mast.status === "ready" && (
            <table className="mini-table mono">
              <thead>
                <tr>
                  <th title="Solar array / antenna mast height above the lunar surface">Mast</th>
                  <th title="Average sunlit hours per Earth year at this mast height">Sun h/yr</th>
                  <th title="Percentage of all hours in 2026–2032 with sunlight">Sunlit</th>
                  <th title="Longest continuous dark period over 6 years">Longest night</th>
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
              <span className="nearby-ctrl-label" title="Radius around the selected coordinate to scan for higher-illumination & Artemis-eligible landing spots.">
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
                    title="Click to jump to this candidate spot"
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
          <div className="drawer-card validation-card" title="Comparison of RIMLIGHT's Stage 1–3 pipeline against peer-reviewed lunar illumination literature and NASA JPL Horizons.">
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

function LandingSquareCard({ square }) {
  if (square.status === "loading") {
    return <Loading text="Scoring 100 m × 100 m landing square (9 points)…" />;
  }
  if (square.status === "error" || !square.data) return null;
  const d = square.data;
  const riskTone = d.risk === "low" ? "is-ok" : d.risk === "moderate" ? "is-warn" : "is-bad";
  const riskLabel =
    d.risk === "low" ? "LOW VARIANCE" : d.risk === "moderate" ? "MODERATE SPREAD" : "HIGH RIDGE RISK";

  return (
    <div
      className="drawer-card landing-square-card"
      title="NASA's Artemis III landing dispersion is a 100 m × 100 m square around the target. We raytrace a 3×3 grid (-50 m, 0 m, +50 m) to check illumination dispersion and probability."
    >
      <div className="artemis-head">
        <span className="section-title" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Grid size={12} color="#38bdf8" /> 100m × 100m Landing Square
        </span>
        <span className={`artemis-status-pill mono ${riskTone}`}>{riskLabel}</span>
      </div>

      <div className="lsq-summary mono">
        <span>
          Target <b>{fmt(d.target_sun_pct, 1)}%</b> · Square range:{" "}
          <b style={{ color: "#fbbf24" }}>
            {fmt(d.min_sun_pct, 1)}%–{fmt(d.max_sun_pct, 1)}%
          </b>{" "}
          sun
        </span>
      </div>

      <div className="lsq-prob-grid mono">
        <div
          className="lsq-prob-pill"
          title={`Probability of getting at least ${d.threshold_sun_pct}% annual sunlight when landing anywhere inside the 100 m × 100 m dispersion box.`}
        >
          <span className="lsq-prob-val" style={{ color: d.prob_above_threshold_pct >= 75 ? "#34d399" : "#fbbf24" }}>
            {d.prob_above_threshold_pct}%
          </span>
          <span className="lsq-prob-lbl">chance of ≥ {fmt(d.threshold_sun_pct, 0)}% sun</span>
        </div>
        <div
          className="lsq-prob-pill"
          title="Probability that your actual touchdown point inside the 100 m × 100 m box passes all 4 NASA Artemis III rules."
        >
          <span className="lsq-prob-val" style={{ color: d.prob_artemis_eligible_pct >= 75 ? "#34d399" : "#f87171" }}>
            {d.prob_artemis_eligible_pct}%
          </span>
          <span className="lsq-prob-lbl">chance Artemis-eligible</span>
        </div>
      </div>

      {d.samples?.length === 9 && (
        <div className="lsq-grid-3x3 mono" aria-label="3 by 3 100m landing square illumination samples">
          {d.samples.map((s, idx) => {
            const isCenter = s.dx_m === 0 && s.dy_m === 0;
            return (
              <div
                key={idx}
                className={`lsq-cell ${isCenter ? "is-center" : ""} ${s.artemis_eligible ? "is-pass" : "is-fail"}`}
                title={`Offset (${s.dx_m >= 0 ? "+" : ""}${s.dx_m}m E, ${s.dy_m >= 0 ? "+" : ""}${s.dy_m}m N): ${s.sun_pct}% sun · slope ${s.slope_deg}°`}
              >
                <span>{fmt(s.sun_pct, 1)}%</span>
                <small>{s.slope_deg}°</small>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArtemisEligibilityCard({ ins, fallbackLat, onFindEligible }) {
  const info = checkArtemis(ins, fallbackLat);
  if (!info) return null;
  const { eligible, earthOk, sunOk, slopeOk, latOk, earthPct, sunPct, slopeVal, latVal, failedReasons } = info;

  const badges = [
    {
      key: "earth",
      label: "Earth ≥ 25%",
      ok: earthOk,
      tip: `Direct-to-Earth link must be visible at least 25% of all hours (this spot: ${earthPct.toFixed(1)}%).`,
    },
    {
      key: "sun",
      label: "Sun ≥ 5%",
      ok: sunOk,
      tip: `Minimum solar illumination floor of 5% across the year (this spot: ${sunPct.toFixed(1)}%).`,
    },
    {
      key: "slope",
      label: "Slope < 10°",
      ok: slopeOk,
      tip: `Ground tilt over a 100 m baseline must be under 10° to prevent lander tip-over (this spot: ${slopeVal.toFixed(1)}°).`,
    },
    {
      key: "lat",
      label: "Lat ≤ -84°",
      ok: latOk,
      tip: `Must lie within 6° of the Lunar South Pole, i.e., 84°S to 90°S (this spot: ${latVal.toFixed(2)}°).`,
    },
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
          <span key={b.key} className={`artemis-rule-badge ${b.ok ? "is-pass" : "is-fail"}`} title={b.tip}>
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

function MiniStat({ label, value, color = "#fff", tooltip }) {
  return (
    <div className={`mini-stat-tile ${tooltip ? "has-metric-tip" : ""}`} title={tooltip}>
      <div className="mini-stat-label">
        <span>{label}</span>
      </div>
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
    <div
      className="drawer-card daily-chart"
      style={{ padding: "10px 12px" }}
      title="Day-by-day breakdown of sunlit hours (orange) and Direct-to-Earth contact hours (blue) out of 24 hours per Earth day."
    >
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

function Part({ label, v, max, color, tooltip }) {
  return (
    <div className="part-row" title={tooltip}>
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

function ScoreRing({ value, grade }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const color = value >= 60 ? "#34d399" : value >= 35 ? "#fbbf24" : "#f87171";
  const letter = grade || (value >= 80 ? "A" : value >= 65 ? "B" : value >= 50 ? "C" : value >= 35 ? "D" : "F");
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`Site grade ${letter}, score ${value} of 100`}>
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
      <text x="30" y="29" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="ui-monospace, Menlo, monospace">
        {Math.round(value)}
      </text>
      <text x="30" y="41" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={color} fontFamily="ui-monospace, Menlo, monospace">
        {letter}
      </text>
    </svg>
  );
}
