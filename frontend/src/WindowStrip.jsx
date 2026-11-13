// WindowStrip.jsx: timeline: shams (orange), ard (azra2), el etnein (a5dar)
import { timeOf, fmtTime } from "./geometry";

const W = 1440, ROW = 22, GAP = 6;
const ROWS = [["sun", "#ffb347", "Sun"], ["earth", "#5aa9ff", "Earth"], ["both", "#5fd38a", "Both"]];

export default function WindowStrip({ ts, wins, k, setK }) {
  const t0 = timeOf(ts, 0), t1 = timeOf(ts, ts.sun_az.length - 1);
  const x = (t) => 60 + ((t - t0) / (t1 - t0)) * (W - 60);       // wa2t -> pixel
  const H = ROWS.length * (ROW + GAP) + 18;

  function click(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;               // pixel -> wa2t -> step
    const f = (px - 60) / (W - 60);
    if (f >= 0 && f <= 1) setK(Math.round(f * (ts.sun_az.length - 1)));
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="strip" onClick={click}>
      {ROWS.map(([key, color, label], r) => (
        <g key={key} transform={`translate(0 ${r * (ROW + GAP)})`}>
          <text x="4" y={ROW - 7} fontSize="11" fill="#9aa3b5">{label}</text>
          <rect x="60" width={W - 60} height={ROW} fill="#0b0f1a" />
          {wins[key].filter((w) => w.end > t0 && w.start < t1).map((w, i) => {
            const a = x(Math.max(w.start, t0)), b = x(Math.min(w.end, t1));
            return <rect key={i} x={a} width={Math.max(1, b - a)} height={ROW} fill={color} opacity="0.85" />;
          })}
        </g>
      ))}
      <line x1={x(timeOf(ts, k))} x2={x(timeOf(ts, k))} y1="0" y2={H - 16} stroke="#fff" strokeWidth="1.5" />
      <text x="60" y={H - 3} fontSize="10" fill="#5d6577">{fmtTime(t0)}</text>
      <text x={W} y={H - 3} textAnchor="end" fontSize="10" fill="#5d6577">{fmtTime(t1)}</text>
    </svg>
  );
}
