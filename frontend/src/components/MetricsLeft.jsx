// MetricsLeft.jsx: el panel el shmal = el mission (yom el nzool + kam yom) w el power bel arqam el 7a2i2ia
import { useEffect, useState } from "react";
import { BatteryCharging, CalendarDays, ChevronLeft, ChevronRight, Moon, Rocket, Sun, Zap } from "lucide-react";
import { api } from "../lib/api";
import { Loading, Meter, Notice, Stat, fmt, fmtDur, fmtUtc } from "./MetricCard";

const DATA_START = "2026-11-13T00:00";
const DATA_END = "2032-10-29T00:00"; // akher bedaya momkena le mission 14 yom ta2riban

export default function MetricsLeft({ site, metrics, cfg, setCfg }) {
  const [open, setOpen] = useState(true);
  const [best, setBest] = useState({ status: "idle", data: null, error: null });
  const { inPole, point, sid, mission } = metrics;
  const m = mission.data;
  useEffect(() => setBest({ status: "idle", data: null, error: null }), [cfg.days, cfg.loadW, sid]);

  if (!site) return null;

  if (!open) {
    return (
      <button className="hud-glass metrics-tab metrics-tab-left" onClick={() => setOpen(true)} title="Open mission planner">
        <Rocket size={15} color="#ff8c2b" />
        <span>MISSION</span>
        <ChevronRight size={14} />
      </button>
    );
  }

  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === "range" || e.target.type === "number" ? +e.target.value : e.target.value }));

  const findBest = () => {
    setBest({ status: "loading", data: null, error: null });
    api
      .bestDates(sid, { days: cfg.days, loadW: cfg.loadW })
      .then((data) => setBest({ status: "ready", data, error: null }))
      .catch((e) => setBest({ status: "error", data: null, error: e.message }));
  };

  return (
    <aside className="hud-glass metrics-panel metrics-left" key={site.id}>
      <header className="metrics-head">
        <div>
          <div className="section-title">Mission Planner</div>
          <div className="metrics-site">{site.name}</div>
        </div>
        <button className="hud-btn" onClick={() => setOpen(false)} title="Collapse" aria-label="Collapse mission planner" style={{ width: 28, height: 28 }}>
          <ChevronLeft size={15} />
        </button>
      </header>

      {/* el settings */}
      <div className="drawer-card mission-form">
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

      {!inPole && (
        <Notice tone="info">
          Exact mission numbers need terrain data. Pick a spot between 80°S and the pole (LOLA 80 m map).
        </Notice>
      )}
      {inPole && point.status === "loading" && <Loading text="Computing 6 years of Sun & Earth for this spot…" />}
      {point.status === "error" && <Notice tone="bad">{point.error}</Notice>}
      {sid && mission.status === "error" && <Notice tone="bad">{mission.error}</Notice>}
      {sid && !m && mission.status === "loading" && <Loading text="Adding up the mission…" />}

      {m && (
        <div className={`metrics-body ${mission.status === "loading" ? "is-stale" : ""}`}>
          <div className={`verdict ${m.power_positive ? "verdict-ok" : "verdict-bad"}`}>
            <Zap size={15} />
            <span>{m.verdict}</span>
          </div>
          <div className="mission-range mono">
            {fmtUtc(m.start)} → {fmtUtc(m.end)} · {fmt(m.hours, 0)} h
          </div>

          <div className="section-title">Sunlight & power</div>
          <div className="stat-grid">
            <Stat icon={<Sun size={12} color="#fbbf24" />} label="Sun hours" value={fmt(m.sun_hours)} unit="h" sub={`of ${fmt(m.hours, 0)} h · ${fmt(m.full_sun_hours)} h full disc`} tone="sun" />
            <Stat icon={<Moon size={12} color="#a78bfa" />} label="Longest dark" value={fmtDur(m.longest_dark_h)} sub={`${fmt(m.dark_hours)} h dark in total`} tone="night" />
            <Stat icon={<Zap size={12} color="#fbbf24" />} label="Energy made" value={fmt(m.energy_generated_kwh, 1)} unit="kWh" sub={`${cfg.panelM2} m² panel, 30 % eff.`} tone="sun" />
            <Stat icon={<Zap size={12} color="#94a3b8" />} label="Energy needed" value={fmt(m.energy_needed_kwh, 1)} unit="kWh" sub={`${cfg.loadW} W × ${fmt(m.hours, 0)} h`} />
          </div>
          <div className="drawer-card energy-balance">
            <div className="eb-row">
              <span>Made</span>
              <Meter value={m.energy_generated_kwh} max={Math.max(m.energy_generated_kwh, m.energy_needed_kwh)} color="#ff8c2b" />
              <b className="mono">{fmt(m.energy_generated_kwh, 1)}</b>
            </div>
            <div className="eb-row">
              <span>Needed</span>
              <Meter value={m.energy_needed_kwh} max={Math.max(m.energy_generated_kwh, m.energy_needed_kwh)} color="#94a3b8" />
              <b className="mono">{fmt(m.energy_needed_kwh, 1)}</b>
            </div>
          </div>
          <Stat
            icon={<BatteryCharging size={12} color="#34d399" />}
            label="Battery needed"
            value={fmt(m.battery_needed_kwh, 2)}
            unit="kWh"
            sub="Smallest battery (starting full) that never runs empty during this mission"
            tone="ok"
          />

          <div className="section-title">Day by day</div>
          <DailyChart daily={m.daily} />

          <div className="section-title">Best landing dates · {cfg.days}-day stay</div>
          {best.status === "idle" && (
            <button className="action-btn" onClick={findBest}>
              <Rocket size={14} /> Rank all start dates (6 years)
            </button>
          )}
          {best.status === "loading" && <Loading text="Ranking every 6-hour start…" />}
          {best.status === "error" && <Notice tone="bad">{best.error}</Notice>}
          {best.status === "ready" && (
            <div className="best-list">
              {best.data.dates.map((d, i) => (
                <button
                  key={d.start}
                  className="best-item"
                  onClick={() => setCfg((c) => ({ ...c, start: d.start.slice(0, 16) }))}
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

          <div className="footnote">
            Every 10 min over the stay: Sun position from SPICE (DE440), horizon from LOLA, sunlight ∝ 1361 W/m² ÷ (Sun distance in AU)² ×
            visible part of the Sun disc. Panel is sun-tracking on a {fmt(metrics.insights.data?.mast_m ?? 2, 0)} m mast.
          </div>
        </div>
      )}
    </aside>
  );
}

function DailyChart({ daily }) {
  const [hover, setHover] = useState(null);
  if (!daily?.length) return null;
  const W = 300;
  const H = 74;
  const n = daily.length;
  const bw = W / n;
  const y = (h) => H - (h / 24) * (H - 4);
  const d = hover !== null ? daily[hover] : null;
  return (
    <div className="drawer-card daily-chart">
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
            Day {d.day}: {fmt(d.sun_h)} h sun · {fmt(d.energy_kwh, 2)} kWh · {fmt(d.contact_h)} h Earth link
          </span>
        ) : (
          <span>
            <i className="dot" style={{ background: "#ff8c2b" }} /> sun h <i className="dot" style={{ background: "#4da6ff" }} /> Earth link h (out of 24)
          </span>
        )}
      </div>
    </div>
  );
}
