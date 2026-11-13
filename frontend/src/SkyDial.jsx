// SkyDial.jsx: el sama men foo2 (fisheye). el markaz = EL_MAX, el 7arf = EL_MIN
import { useMemo } from "react";
import { D2R, EL_MIN, EL_MAX } from "./geometry";

const S = 320, C = S / 2, R = 140;
const rOf = (el) => R * (EL_MAX - Math.min(Math.max(el, EL_MIN), EL_MAX)) / (EL_MAX - EL_MIN);
const xy = (az, el) => [C + rOf(el) * Math.sin(az * D2R), C - rOf(el) * Math.cos(az * D2R)];

export default function SkyDial({ mask, sun, earth, ts, k }) {
  // el ard: 7alaqa bein el 7arf wel skyline (evenodd) -> te7sab mara le kol site
  const terrain = useMemo(() => {
    const rim = mask.map((_, i) => xy(i * 0.5, EL_MIN).join(","));
    const sky = mask.map((m, i) => xy(i * 0.5, m).join(","));
    return `M${rim.join("L")}Z M${sky.join("L")}Z`;
  }, [mask]);

  // mashy el shams el 24 sa3a el gaya
  const path = useMemo(() => {
    const pts = [];
    for (let j = k; j < Math.min(k + 144, ts.sun_az.length); j++) pts.push(xy(ts.sun_az[j], ts.sun_el[j]).join(","));
    return pts.length > 1 ? "M" + pts.join("L") : "";
  }, [ts, k]);

  const sunR = Math.max(4, (0.265 * R) / (EL_MAX - EL_MIN));
  const [sx, sy] = xy(sun.az, sun.el), [ex, ey] = xy(earth.az, earth.el);

  return (
    <svg viewBox={`0 0 ${S} ${S + 22}`} className="dial">
      <defs>
        <radialGradient id="glow"><stop offset="0" stopColor="#ffb347" stopOpacity="0.9" /><stop offset="1" stopColor="#ffb347" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="#05070f" stroke="#2a3040" />
      {[0, 2, 4, 6].map((el) => (
        <g key={el}>
          <circle cx={C} cy={C} r={rOf(el)} fill="none" stroke="#2a3040" strokeDasharray={el === 0 ? "4 4" : "1 4"} />
          <text x={C + 3} y={C - rOf(el) - 2} fontSize="9" fill="#6b7385">{el}°</text>
        </g>
      ))}
      <path d={path} fill="none" stroke="#ffb347" strokeOpacity="0.6" strokeDasharray="2 4" />
      <circle cx={sx} cy={sy} r={sunR * 3} fill="url(#glow)" />
      <circle cx={sx} cy={sy} r={sunR} fill="#ffcf70" />
      <circle cx={ex} cy={ey} r="5" fill="#5aa9ff" />
      {/* el ard ba3d el shams 3ashan tegheteeha lama tkoon wara gabal */}
      <path d={terrain} fillRule="evenodd" fill="#3b3f4a" stroke="#596070" strokeWidth="0.6" />
      {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([t, az]) => {
        const [x, y] = [C + (R + 12) * Math.sin(az * D2R), C - (R + 12) * Math.cos(az * D2R)];
        return <text key={t} x={x} y={y + 4} textAnchor="middle" fontSize="12" fill="#c9d1e0">{t}</text>;
      })}
      <text x={C} y={S + 16} textAnchor="middle" fontSize="11" fill="#9aa3b5">Sun {sun.el.toFixed(2)}° · {Math.round(sun.frac * 100)}% visible · Earth {earth.vis ? "in view" : "hidden"}</text>
    </svg>
  );
}
