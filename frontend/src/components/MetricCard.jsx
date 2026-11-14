// MetricCard.jsx: el 7etat el soghayara el mshtaraka bein el panels el etnein

export function Stat({ label, value, unit, sub, tone = "neutral", icon, tooltip }) {
  return (
    <div className={`stat stat-${tone} ${tooltip ? "has-metric-tip" : ""}`} title={tooltip}>
      <div className="stat-label">
        {icon}
        <span>{label}</span>
        {tooltip && <span className="metric-tip-q" aria-hidden="true">?</span>}
      </div>
      <div className="stat-value mono">
        {value ?? "—"}
        {unit && value !== null && value !== undefined && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Meter({ value, max, color = "#ff8c2b", label }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="meter" title={label}>
      <div className="meter-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Loading({ text }) {
  return (
    <div className="metric-loading">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}

export function Notice({ tone = "info", children }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export const fmt = (v, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });

export const fmtUtc = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} ${d
    .toISOString()
    .slice(11, 16)} UTC`;
};

// "37.5" sa3a -> "1 d 13.5 h"
export const fmtDur = (h) => {
  if (h === null || h === undefined) return "—";
  if (h < 48) return `${fmt(h)} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${fmt(h - d * 24, 0)} h`;
};
