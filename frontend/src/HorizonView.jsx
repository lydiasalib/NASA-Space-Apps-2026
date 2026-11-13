// HorizonView.jsx: el 360 panorama. x = azimuth, y = elevation (mamt6ta x6)
import { useMemo } from "react";
import { BASE } from "./api";
import { EL_MIN, EL_MAX, timeOf } from "./geometry";

const W = 1440, H = 240;
const X = (az) => (az / 360) * W;
const Y = (el) => (H * (EL_MAX - el)) / (EL_MAX - EL_MIN);
const SHADES = ["#8a8f99", "#6a6f7a", "#4b4f59", "#2e3139"];   // ba3eed (fat7) -> orayeb (ghame2)

// nogoom sabta (seed sabet 3ashan mat2fezsh)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const STARS = Array.from({ length: 140 }, () => [rnd() * W, rnd() * H * 0.6]);

function ridge(vals) {
  // path mn ta7t shmal -> 3ala el 720 no2ta -> ta7t yemeen
  const pts = vals.map((m, i) => `${X(i * 0.5).toFixed(1)},${Y(m).toFixed(1)}`);
  return `M0,${H} L${pts.join(" L")} L${W},${Y(vals[0]).toFixed(1)} L${W},${H} Z`;
}

export default function HorizonView({ hz, ts, k, sun, earth, site, realistic }) {
  const layers = useMemo(() => {
    // depth layers: el ba3eed el awel. kol layer = max lel bands elly ba3daha 3ashan mafeesh fat7at
    const L = hz.layers;
    return L.map((_, b) => L[0].map((__, i) => Math.max(...L.slice(b).map((l) => l[i])))).reverse();
  }, [hz]);

  const sunPath = useMemo(() => {
    let d = "", prev = null;
    for (let j = k; j < Math.min(k + 144 * 3, ts.sun_az.length); j++) {
      const az = ts.sun_az[j], p = `${X(az).toFixed(1)},${Y(ts.sun_el[j]).toFixed(1)}`;
      d += prev == null || Math.abs(az - prev) > 180 ? ` M${p}` : ` L${p}`;   // ne2ta3 3and el 360
      prev = az;
    }
    return d;
  }, [ts, k]);

  const sunR = Math.max(4, (0.265 * H) / (EL_MAX - EL_MIN));
  const hourK = k - (k % 6);
  const panoUrl = `${BASE}/panorama?site=${site.id}&t=${new Date(timeOf(ts, hourK)).toISOString()}`;

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="horizon">
      <defs>
        <radialGradient id="hglow"><stop offset="0" stopColor="#ffb347" stopOpacity="0.85" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width={W} height={H} fill="#03050b" />
      {STARS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 9 ? 0.6 : 1.1} fill="#fff" opacity={0.5} />)}
      {[-2, 0, 2, 4, 6].map((el) => (
        <g key={el}>
          <line x1="0" x2={W} y1={Y(el)} y2={Y(el)} stroke="#1c2230" strokeDasharray={el === 0 ? "6 6" : "2 6"} />
          <text x="4" y={Y(el) - 3} fontSize="10" fill="#5d6577">{el}°</text>
        </g>
      ))}
      <path d={sunPath} fill="none" stroke="#ffb347" strokeOpacity="0.5" strokeDasharray="3 5" />
      {[-360, 0, 360].map((off) => (   // marra tanya 3and el 7arf (wrap-around)
        <g key={off}>
          <circle cx={X(sun.az + off)} cy={Y(sun.el)} r={sunR * 4} fill="url(#hglow)" />
          <circle cx={X(sun.az + off)} cy={Y(sun.el)} r={sunR} fill="#ffd27a" />
          <circle cx={X(earth.az + off)} cy={Y(Math.min(earth.el, EL_MAX - 0.3))} r="6" fill="#5aa9ff" />
        </g>
      ))}
      {/* el ard foo2 el shams: btghatteeha tabee3y */}
      {realistic
        ? <image href={panoUrl} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
        : layers.map((l, i) => <path key={i} d={ridge(l)} fill={SHADES[i]} />)}
      {["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"].map((t, i) => (
        <text key={i} x={Math.min(Math.max(X(i * 45), 8), W - 8)} y={H + 16} textAnchor="middle" fontSize="12" fill="#c9d1e0">{t}</text>
      ))}
      <text x={W - 6} y="14" textAnchor="end" fontSize="10" fill="#5d6577">height ×6</text>
    </svg>
  );
}
