// MetricsRight.jsx: gowa el drawer el yemin = el ittisal bel ard + el site nafso (score, mail, mast, no2ta a7san)
import { useEffect, useState } from "react";
import { Antenna, Crosshair, Gauge, Mountain, Navigation, Radio, Sun, TowerControl } from "lucide-react";
import { api } from "../lib/api";
import { Loading, Notice, Stat, fmt, fmtDur } from "./MetricCard";

export default function MetricsRight({ metrics, onPickSite }) {
  const { inPole, point, sid, insights, mission } = metrics;
  const m = mission.data;
  const ins = insights.data;
  const [mast, setMast] = useState({ status: "idle" });
  const [near, setNear] = useState({ status: "idle" });
  useEffect(() => {
    setMast({ status: "idle" });
    setNear({ status: "idle" });
  }, [sid]);

  if (!inPole) {
    const p = point.data;
    return (
      <div className="metrics-right">
        <div className="section-title">Illumination & Earth link</div>
        <Notice tone="info">No terrain data this far north, so no horizon: showing the Sun and Earth over a flat horizon only.</Notice>
        {p?.sun_now && (
          <div className="stat-grid">
            <Stat icon={<Sun size={12} color="#fbbf24" />} label="Sun now" value={`${fmt(p.sun_now.el, 2)}°`} sub={`az ${fmt(p.sun_now.az)}° · ${p.sun_now.above_flat_horizon ? "up" : "down"}`} tone="sun" />
            {p.earth_now && (
              <Stat icon={<Radio size={12} color="#38bdf8" />} label="Earth now" value={`${fmt(p.earth_now.el, 2)}°`} sub={`az ${fmt(p.earth_now.az)}°`} tone="earth" />
            )}
          </div>
        )}
      </div>
    );
  }

  if (point.status === "loading") return <Loading text="Running Stages 1–3 for this spot…" />;
  if (point.status === "error") return <Notice tone="bad">{point.error}</Notice>;
  if (!sid) return null;

  const at = m?.at_landing;

  const loadMast = () => {
    setMast({ status: "loading" });
    api.mast(sid).then((d) => setMast({ status: "ready", data: d })).catch((e) => setMast({ status: "error", error: e.message }));
  };
  const loadNear = () => {
    setNear({ status: "loading" });
    api.nearby(sid).then((d) => setNear({ status: "ready", data: d })).catch((e) => setNear({ status: "error", error: e.message }));
  };

  return (
    <div className="metrics-right">
      {/* 3and el nzool */}
      {at && (
        <>
          <div className="section-title">At landing</div>
          <div className="landing-pills">
            <span className={`pano-badge ${at.sun_visible ? "pano-badge-sun-ok" : "pano-badge-blocked"}`}>
              {at.sun_visible ? `SUN UP · sets in ${fmtDur(at.hours_to_first_sunset)}` : at.hours_to_first_sun === null ? "NO SUN" : `DARK · sun in ${fmtDur(at.hours_to_first_sun)}`}
            </span>
            <span className={`pano-badge ${at.earth_visible ? "pano-badge-earth-ok" : "pano-badge-blocked"}`}>
              {at.earth_visible ? "EARTH LINK" : at.hours_to_first_contact === null ? "NO EARTH LINK" : `NO LINK · Earth in ${fmtDur(at.hours_to_first_contact)}`}
            </span>
          </div>
        </>
      )}

      {/* el ard */}
      {m && (
        <>
          <div className="section-title">Earth link · this mission</div>
          <div className="stat-grid">
            <Stat icon={<Radio size={12} color="#38bdf8" />} label="Contact" value={fmt(m.contact_hours)} unit="h" sub={`of ${fmt(m.hours, 0)} h`} tone="earth" />
            <Stat icon={<Antenna size={12} color="#94a3b8" />} label="Longest blackout" value={fmtDur(m.longest_blackout_h)} sub={`${fmt(m.blackout_hours)} h without Earth`} />
            <Stat icon={<Sun size={12} color="#fbbf24" />} label="Sun + Earth" value={fmt(m.sun_and_contact_hours)} unit="h" sub="Power and link at the same time" tone="sun" />
            <Stat icon={<Gauge size={12} color="#94a3b8" />} label="Link margin" value="2°" sub="Earth must clear the ridge by 2°" />
          </div>
        </>
      )}

      {/* el site */}
      <div className="section-title">Site · all 6 years</div>
      {!ins && insights.status === "loading" && <Loading text="Reading the terrain…" />}
      {insights.status === "error" && <Notice tone="bad">{insights.error}</Notice>}
      {ins && (
        <>
          <div className="drawer-card score-card">
            <ScoreRing value={ins.score} />
            <div className="score-parts">
              <div className={`site-class ${ins.psr ? "is-psr" : ""}`}>{ins.class}</div>
              <Part label="Sun" v={ins.parts.sun} max={40} color="#ff8c2b" />
              <Part label="Earth" v={ins.parts.earth} max={30} color="#4da6ff" />
              <Part label="Short nights" v={ins.parts.night} max={30} color="#a78bfa" />
            </div>
          </div>
          <div className="footnote">{ins.formula}</div>
          <div className="stat-grid">
            <Stat icon={<Sun size={12} color="#fbbf24" />} label="Sun / year" value={fmt(ins.sun_hours_per_year, 0)} unit="h" sub={`${fmt(ins.energy_kwh_per_year, 0)} kWh per m² of panel`} tone="sun" />
            <Stat icon={<Radio size={12} color="#38bdf8" />} label="Earth / year" value={fmt(ins.contact_hours_per_year, 0)} unit="h" tone="earth" />
            <Stat
              icon={<Mountain size={12} color={ins.terrain.safe_for_landing ? "#34d399" : "#f87171"} />}
              label="Slope"
              value={`${fmt(ins.terrain.slope_deg)}°`}
              sub={`max ${fmt(ins.terrain.max_slope_200m_deg)}° within 200 m · limit ${ins.terrain.limit_deg}°`}
              tone={ins.terrain.safe_for_landing ? "ok" : "bad"}
            />
            <Stat icon={<Mountain size={12} color="#94a3b8" />} label="Height" value={fmt(ins.h_site_m, 0)} unit="m" sub="above the 1737.4 km sphere" />
          </div>
          {ins.rays_off_map_percent > 0 && (
            <Notice tone="warn">{fmt(ins.rays_off_map_percent, 0)} % of the horizon runs off the map: real sunlight may be lower.</Notice>
          )}
        </>
      )}

      {/* el mast */}
      <div className="section-title">Taller mast?</div>
      {mast.status === "idle" && (
        <button className="action-btn" onClick={loadMast}>
          <TowerControl size={14} /> Compare 2 m / 5 m / 10 m mast
        </button>
      )}
      {mast.status === "loading" && <Loading text="Re-running the horizon 3 times (~4 s)…" />}
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

      {/* no2ta a7san orayeba */}
      <div className="section-title">Better spot nearby?</div>
      {near.status === "idle" && (
        <button className="action-btn" onClick={loadNear}>
          <Crosshair size={14} /> Search 450 m around this spot
        </button>
      )}
      {near.status === "loading" && <Loading text="Scanning ~30 nearby points (~8 s)…" />}
      {near.status === "error" && <Notice tone="bad">{near.error}</Notice>}
      {near.status === "ready" && (
        <div className="best-list">
          {near.data.better.filter((b) => b.distance_m > 0).length === 0 && <Notice tone="ok">This spot is already the best within 450 m.</Notice>}
          {near.data.better
            .filter((b) => b.distance_m > 0)
            .map((b) => (
              <button key={`${b.x}_${b.y}`} className="best-item" onClick={() => onPickSite?.(b)} title="Go to this spot">
                <span className="best-rank mono">
                  <Navigation size={12} style={{ transform: `rotate(${b.bearing_deg}deg)` }} />
                </span>
                <span className="best-date">
                  {b.distance_m} m · bearing {b.bearing_deg}° · slope {fmt(b.slope_deg)}°
                </span>
                <span className="best-nums mono">
                  {fmt(b.percent_sunlit)}% sun ({b.gain_sun_hours_per_year >= 0 ? "+" : ""}
                  {fmt(b.gain_sun_hours_per_year, 0)} h/yr) · night {fmtDur(b.longest_night_h)}
                </span>
              </button>
            ))}
          <div className="footnote">
            Here: {fmt(near.data.here.percent_sunlit)}% sun, longest night {fmtDur(near.data.here.longest_night_h)}. Checked {near.data.searched.points} points, then
            re-ran the top 3 in full.
          </div>
        </div>
      )}
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
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = value >= 60 ? "#34d399" : value >= 35 ? "#fbbf24" : "#f87171";
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`Site score ${value} of 100`}>
      <circle cx="34" cy="34" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle
        cx="34"
        cy="34"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        transform="rotate(-90 34 34)"
      />
      <text x="34" y="38" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff" fontFamily="ui-monospace, Menlo, monospace">
        {Math.round(value)}
      </text>
    </svg>
  );
}
