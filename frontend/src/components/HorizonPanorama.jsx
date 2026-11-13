import { useId, useMemo, useState } from "react";

const W = 360;
const H = 128;
const PAD = { left: 26, right: 8, top: 10, bottom: 20 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const MIN_EL = -2;
// el scale beyekbar law el gebal a3la mn 10° (zay 2a3 Shackleton) 3ashan ma yeghatteesh el sora kolha
let MAX_EL = 10;
let EL_SPAN = MAX_EL - MIN_EL;

let GRID_ELEVATIONS = [0, 2, 5, 10];
const AZ_TICKS = [
  { az: 0, label: "0° N" },
  { az: 90, label: "90° E" },
  { az: 180, label: "180° S" },
  { az: 270, label: "270° W" },
  { az: 360, label: "360° N" },
];

const azToX = (az) => PAD.left + (Math.max(0, Math.min(360, az)) / 360) * PLOT_W;
const elToY = (el) => PAD.top + ((MAX_EL - Math.max(MIN_EL, Math.min(MAX_EL, el))) / EL_SPAN) * PLOT_H;
const degToYSize = (deg) => (deg / EL_SPAN) * PLOT_H;

export default function HorizonPanorama({ data }) {
  const uid = useId().replace(/:/g, "");
  const [hoverInfo, setHoverInfo] = useState(null);

  const horizonDeg = data?.horizonDeg;
  const peak = horizonDeg?.length ? Math.max(...horizonDeg) : 0;
  MAX_EL = Math.max(10, Math.ceil(peak + 1));
  EL_SPAN = MAX_EL - MIN_EL;
  GRID_ELEVATIONS = MAX_EL > 10 ? [0, 5, 10, MAX_EL] : [0, 2, 5, 10];
  const sun = data?.sun;
  const earth = data?.earth;

  const { fillPath, ridgePath } = useMemo(() => {
    if (!horizonDeg || horizonDeg.length === 0) return { fillPath: "", ridgePath: "" };
    const n = horizonDeg.length;
    const step = 360 / n;
    const pts = new Array(n + 1);
    for (let i = 0; i < n; i++) {
      pts[i] = `${azToX(i * step).toFixed(2)},${elToY(horizonDeg[i]).toFixed(2)}`;
    }
    // Close wrap to 360° using index 0 for seamless 360° panorama
    pts[n] = `${azToX(360).toFixed(2)},${elToY(horizonDeg[0]).toFixed(2)}`;
    const line = `M ${pts.join(" L ")}`;
    const bottomY = elToY(MIN_EL).toFixed(2);
    const fill = `${line} L ${azToX(360).toFixed(2)},${bottomY} L ${azToX(0).toFixed(2)},${bottomY} Z`;
    return { fillPath: fill, ridgePath: line };
  }, [horizonDeg]);

  // el masar beylef 360°: lama el az ye2fez (359 -> 0) nebda2 khat gedeed badal khat 3ard el sora
  const sunTrackPath = useMemo(() => trackPath(sun?.track), [sun]);
  const earthTrackPath = useMemo(() => trackPath(earth?.track), [earth]);

  if (!data) return null;

  const sunX = azToX(sun.azDeg);
  const sunY = elToY(sun.elDeg);
  // Angular diameter ~0.53° -> radius ~0.265° in elevation scale (clamped slightly for subpixel clarity)
  const sunR = Math.max(2.6, degToYSize((sun.diameterDeg ?? 0.53) * 0.5));

  const earthX = azToX(earth.azDeg);
  const earthY = elToY(earth.elDeg);
  const earthR = 3.2;
  const safetyR = degToYSize(earth.safetyMarginDeg ?? 2.0);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    if (svgX < PAD.left || svgX > W - PAD.right) {
      setHoverInfo(null);
      return;
    }
    const az = ((svgX - PAD.left) / PLOT_W) * 360;
    const idx = Math.min(horizonDeg.length - 1, Math.max(0, Math.round((az / 360) * horizonDeg.length)));
    setHoverInfo({
      x: svgX,
      az: az.toFixed(1),
      ridgeEl: horizonDeg[idx].toFixed(2),
      ridgeY: elToY(horizonDeg[idx]),
    });
  };

  return (
    <div className="drawer-card" style={{ padding: "12px 12px 10px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          360° Horizon Panorama
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className={`pano-badge ${sun.visible ? "pano-badge-sun-ok" : "pano-badge-blocked"}`}>
            {sun.visible ? "SUN LIT" : "SUN BLOCKED"}
          </span>
          <span className={`pano-badge ${earth.visible ? "pano-badge-earth-ok" : "pano-badge-blocked"}`}>
            {earth.visible ? "DTE LINK" : "DTE BLOCKED"}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        role="img"
        aria-label="360 degree lunar horizon skyline panorama"
      >
        <defs>
          <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#090d16" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>
          <radialGradient id={`sunglow-${uid}`}>
            <stop offset="0%" stopColor="#fff7e6" stopOpacity="1" />
            <stop offset="35%" stopColor="#ff8c2b" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ff8c2b" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip-${uid}`}>
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} rx="4" />
          </clipPath>
        </defs>

        {/* Sky background */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          rx="4"
          fill={`url(#sky-${uid})`}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="0.75"
        />

        {/* Horizontal elevation gridlines */}
        {GRID_ELEVATIONS.map((el) => {
          const y = elToY(el);
          const isZero = el === 0;
          return (
            <g key={el}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke={isZero ? "rgba(148,163,184,0.38)" : "rgba(148,163,184,0.14)"}
                strokeWidth={isZero ? "0.8" : "0.6"}
                strokeDasharray={isZero ? "3 2" : "2 3"}
              />
              <text
                x={PAD.left - 4}
                y={y + 2.5}
                textAnchor="end"
                fontSize="7"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="rgba(203,213,225,0.62)"
              >
                {el}°
              </text>
            </g>
          );
        })}

        {/* Bottom -2° label */}
        <text
          x={PAD.left - 4}
          y={elToY(MIN_EL) + 2}
          textAnchor="end"
          fontSize="7"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fill="rgba(203,213,225,0.45)"
        >
          -2°
        </text>

        {/* Clipped sky tracks, discs, and terrain silhouette */}
        <g clipPath={`url(#clip-${uid})`}>
          {/* Diurnal Sun path preview */}
          {sunTrackPath && (
            <path
              d={sunTrackPath}
              fill="none"
              stroke="rgba(255,140,43,0.28)"
              strokeWidth="0.8"
              strokeDasharray="2.5 2.5"
            />
          )}

          {/* Earth libration track */}
          {earth.track?.length > 1 && (
            <path
              d={earthTrackPath}
              fill="none"
              stroke="rgba(77,166,255,0.32)"
              strokeWidth="0.7"
              strokeDasharray="2 2"
            />
          )}

          {/* Render blocked discs behind terrain silhouette */}
          {!sun.visible && <SunMarker x={sunX} y={sunY} r={sunR} glowId={uid} blocked />}
          {!earth.visible && <EarthMarker x={earthX} y={earthY} r={earthR} safetyR={safetyR} blocked />}

          {/* 720-point Terrain Silhouette */}
          <path d={fillPath} fill="#1c2230" />
          <path d={ridgePath} fill="none" stroke="#6b7280" strokeWidth="1.2" strokeLinejoin="round" />

          {/* Render visible discs in front of terrain silhouette */}
          {sun.visible && <SunMarker x={sunX} y={sunY} r={sunR} glowId={uid} blocked={false} />}
          {earth.visible && <EarthMarker x={earthX} y={earthY} r={earthR} safetyR={safetyR} blocked={false} />}

          {/* Hover cursor hairline */}
          {hoverInfo && (
            <g pointerEvents="none">
              <line
                x1={hoverInfo.x}
                x2={hoverInfo.x}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="rgba(226,232,240,0.45)"
                strokeWidth="0.75"
                strokeDasharray="2 2"
              />
              <circle cx={hoverInfo.x} cy={hoverInfo.ridgeY} r="2.2" fill="#e2e8f0" />
            </g>
          )}
        </g>

        {/* Cardinal Azimuth Ticks */}
        {AZ_TICKS.map((t) => {
          const x = azToX(t.az);
          const anchor = t.az === 0 ? "start" : t.az === 360 ? "end" : "middle";
          return (
            <g key={t.az}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top + PLOT_H}
                y2={PAD.top + PLOT_H + 3}
                stroke="rgba(148,163,184,0.45)"
                strokeWidth="0.75"
              />
              <text
                x={x}
                y={H - 5}
                textAnchor={anchor}
                fontSize="7"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fill="rgba(203,213,225,0.68)"
              >
                {t.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Footer readout */}
      <div
        className="mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 6,
          fontSize: 10.5,
          color: "rgba(203,213,225,0.68)",
        }}
      >
        {hoverInfo ? (
          <span>
            Az {hoverInfo.az}° · Ridge {hoverInfo.ridgeEl}°
          </span>
        ) : (
          <span>
            Sun {sun.azDeg}° / {sun.elDeg}° · Earth {earth.azDeg}° / {earth.elDeg}°
          </span>
        )}
        <span style={{ color: "rgba(148,163,184,0.6)" }}>
          {data.trackDays ? `tracks: next ${data.trackDays} d` : "720-pt skyline"}
        </span>
      </div>
    </div>
  );
}

function SunMarker({ x, y, r, glowId, blocked }) {
  return (
    <g opacity={blocked ? 0.5 : 1}>
      {!blocked && <circle cx={x} cy={y} r={r * 3.4} fill={`url(#sunglow-${glowId})`} />}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={blocked ? "none" : "#ff8c2b"}
        stroke="#ff8c2b"
        strokeWidth={blocked ? "1.1" : "0.7"}
        strokeDasharray={blocked ? "1.5 1.5" : undefined}
      />
    </g>
  );
}

function EarthMarker({ x, y, r, safetyR, blocked }) {
  return (
    <g opacity={blocked ? 0.48 : 1}>
      {/* 2° safety margin ring */}
      <circle
        cx={x}
        cy={y}
        r={safetyR}
        fill="none"
        stroke="#4da6ff"
        strokeOpacity={blocked ? 0.3 : 0.45}
        strokeWidth="0.75"
        strokeDasharray="2 2"
      />
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={blocked ? "rgba(77,166,255,0.22)" : "#4da6ff"}
        stroke="#bae6fd"
        strokeWidth={blocked ? "1" : "0.8"}
        strokeDasharray={blocked ? "1.5 1.5" : undefined}
      />
    </g>
  );
}

function trackPath(track) {
  if (!track?.length) return "";
  let d = "";
  let prev = null;
  for (const p of track) {
    const cmd = prev === null || Math.abs(p.azDeg - prev) > 180 ? "M" : "L";
    d += `${cmd}${azToX(p.azDeg).toFixed(1)},${elToY(p.elDeg).toFixed(1)} `;
    prev = p.azDeg;
  }
  return d.trim();
}
