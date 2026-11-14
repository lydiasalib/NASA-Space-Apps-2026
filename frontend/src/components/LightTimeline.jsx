// LightTimeline.jsx: Two-level 6-year light & Earth-link timeline strip
// Level 1: 6-year overview strip (2026–2032) with draggable/clickable zoom viewport box
// Level 2: Zoom strip (1 / 3 / 12 months) showing every sunset & Earth blackout; click to set landing date
import { useEffect, useMemo, useRef, useState } from "react";
import { api, toApiTime } from "../lib/api";

const T_MIN_MS = Date.UTC(2026, 10, 13, 0, 0, 0); // 2026-11-13T00:00:00Z
const T_MAX_MS = Date.UTC(2032, 10, 12, 0, 0, 0); // 2032-11-12T00:00:00Z
const TOTAL_SPAN_MS = T_MAX_MS - T_MIN_MS;

const ZOOM_OPTIONS = [
  { id: 1, label: "1m", days: 30 },
  { id: 3, label: "3m", days: 90 },
  { id: 12, label: "12m", days: 365 },
];

const YEAR_TICKS = [2027, 2028, 2029, 2030, 2031, 2032].map((yr) => ({
  yr,
  ms: Date.UTC(yr, 0, 1),
}));

function msToLocalInput(ms) {
  const clamped = Math.max(T_MIN_MS, Math.min(T_MAX_MS - 14 * 86400 * 1000, ms));
  // Snap to 10-minute step (600,000 ms)
  const snapped = Math.round(clamped / 600000) * 600000;
  return new Date(snapped).toISOString().slice(0, 16);
}

function fmtShortDate(ms) {
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function LightTimeline({ sid, cfg, setCfg, onWindowsLoaded }) {
  const [zoomMonths, setZoomMonths] = useState(3);
  const [wins, setWins] = useState({ status: "idle", sun: [], earth: [] });
  const [hoverMs, setHoverMs] = useState(null);
  const overviewRef = useRef(null);
  const draggingRef = useRef(false);

  const missionStartMs = useMemo(() => {
    const iso = toApiTime(cfg?.start);
    const t = iso ? Date.parse(iso) : T_MIN_MS;
    return Number.isFinite(t) ? Math.max(T_MIN_MS, Math.min(T_MAX_MS, t)) : T_MIN_MS;
  }, [cfg?.start]);

  const missionEndMs = useMemo(
    () => Math.min(T_MAX_MS, missionStartMs + (Number(cfg?.days) || 14) * 86400 * 1000),
    [missionStartMs, cfg?.days]
  );

  const zoomSpanMs = useMemo(() => {
    const opt = ZOOM_OPTIONS.find((z) => z.id === zoomMonths) || ZOOM_OPTIONS[1];
    return opt.days * 86400 * 1000;
  }, [zoomMonths]);

  // Center zoom window around mission start by default, clamped to [T_MIN_MS, T_MAX_MS]
  const [viewCenterMs, setViewCenterMs] = useState(() => missionStartMs);

  // Keep mission start visible when user changes landing date externally
  useEffect(() => {
    const half = zoomSpanMs / 2;
    if (missionStartMs < viewCenterMs - half || missionStartMs > viewCenterMs + half) {
      setViewCenterMs(missionStartMs);
    }
  }, [missionStartMs, zoomSpanMs, viewCenterMs]);

  const zoomStartMs = useMemo(() => {
    const half = zoomSpanMs / 2;
    return Math.max(T_MIN_MS, Math.min(T_MAX_MS - zoomSpanMs, viewCenterMs - half));
  }, [viewCenterMs, zoomSpanMs]);

  const zoomEndMs = zoomStartMs + zoomSpanMs;

  useEffect(() => {
    if (!sid) return undefined;
    let dead = false;
    setWins({ status: "loading", sun: [], earth: [] });
    Promise.all([api.windows(sid, "sun"), api.windows(sid, "earth")])
      .then(([sunRes, earthRes]) => {
        if (dead) return;
        const parseList = (list) =>
          (list || [])
            .map((w) => ({ s: Date.parse(w.start), e: Date.parse(w.end), raw: w }))
            .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e > w.s);
        const sunParsed = parseList(sunRes?.windows);
        const earthParsed = parseList(earthRes?.windows);
        setWins({ status: "ready", sun: sunParsed, earth: earthParsed });
        onWindowsLoaded?.({
          sun: sunRes?.windows || [],
          earth: earthRes?.windows || [],
        });
      })
      .catch(() => {
        if (!dead) setWins({ status: "error", sun: [], earth: [] });
      });
    return () => {
      dead = true;
    };
  }, [sid, onWindowsLoaded]);

  // Count dark gaps in zoom window
  const zoomStats = useMemo(() => {
    if (wins.status !== "ready") return null;
    const sunInZoom = wins.sun.filter((w) => w.e > zoomStartMs && w.s < zoomEndMs);
    const darkGaps = Math.max(0, sunInZoom.length - 1);
    return { darkGaps };
  }, [wins, zoomStartMs, zoomEndMs]);

  const handleOverviewPoint = (clientX, updateLanding = false) => {
    const el = overviewRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const tMs = T_MIN_MS + f * TOTAL_SPAN_MS;
    setViewCenterMs(tMs);
    if (updateLanding) {
      setCfg?.((c) => ({ ...c, start: msToLocalInput(tMs) }));
    }
  };

  const handleZoomClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickedMs = zoomStartMs + f * zoomSpanMs;
    setCfg?.((c) => ({ ...c, start: msToLocalInput(clickedMs) }));
  };

  const handleZoomHover = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverMs(zoomStartMs + f * zoomSpanMs);
  };

  const W = 320;
  const H1 = 26;
  const H2 = 44;

  const x6Yr = (ms) => ((ms - T_MIN_MS) / TOTAL_SPAN_MS) * W;
  const xZoom = (ms) => ((ms - zoomStartMs) / zoomSpanMs) * W;

  const boxX = Math.max(0, x6Yr(zoomStartMs));
  const boxW = Math.max(6, Math.min(W - boxX, x6Yr(zoomEndMs) - boxX));

  const m1X = Math.max(0, Math.min(W, x6Yr(missionStartMs)));
  const m1W = Math.max(2, Math.min(W - m1X, x6Yr(missionEndMs) - m1X));

  const m2Start = Math.max(zoomStartMs, missionStartMs);
  const m2End = Math.min(zoomEndMs, missionEndMs);
  const m2Visible = m2End > m2Start;
  const m2X = m2Visible ? xZoom(m2Start) : -10;
  const m2W = m2Visible ? Math.max(2.5, xZoom(m2End) - m2X) : 0;

  return (
    <div
      className="drawer-card light-timeline-card"
      title="Two-level 6-year illumination & Earth contact timeline. Drag the top 6-year box to pan, or click the bottom zoom strip to set your landing date."
    >
      <div className="lt-head">
        <span className="section-title" style={{ margin: 0 }}>
          6-Yr Light &amp; Link Timeline
        </span>
        <div className="lt-zoom-Group" role="group" aria-label="Timeline zoom window">
          {ZOOM_OPTIONS.map((z) => (
            <button
              key={z.id}
              type="button"
              className={`step-pill mono ${zoomMonths === z.id ? "is-active" : ""}`}
              onClick={() => setZoomMonths(z.id)}
              title={`Zoom strip to ${z.days} days`}
            >
              {z.label}
            </button>
          ))}
        </div>
      </div>

      {/* LEVEL 1: 6-Year Overview Strip (2026–2032) */}
      <div className="lt-strip-label mono">
        <span>6-YR OVERVIEW (2026–2032) · DRAG BOX</span>
        <span>{wins.status === "loading" ? "loading…" : `${fmtShortDate(zoomStartMs)} – ${fmtShortDate(zoomEndMs)}`}</span>
      </div>
      <svg
        ref={overviewRef}
        viewBox={`0 0 ${W} ${H1}`}
        width="100%"
        className="lt-svg lt-svg-overview"
        onMouseDown={(e) => {
          draggingRef.current = true;
          handleOverviewPoint(e.clientX, false);
        }}
        onMouseMove={(e) => {
          if (draggingRef.current) handleOverviewPoint(e.clientX, false);
        }}
        onMouseUp={() => {
          draggingRef.current = false;
        }}
        onMouseLeave={() => {
          draggingRef.current = false;
        }}
        onDoubleClick={(e) => handleOverviewPoint(e.clientX, true)}
        role="img"
        aria-label="6 year overview strip from 2026 to 2032"
      >
        <rect x={0} y={0} width={W} height={16} rx={3} fill="#080c14" stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" />
        {wins.sun.map((w, i) => {
          const sx = Math.max(0, x6Yr(w.s));
          const ex = Math.min(W, x6Yr(w.e));
          if (ex <= sx) return null;
          return <rect key={i} x={sx} y={1.5} width={Math.max(0.6, ex - sx)} height={13} fill="#ff8c2b" opacity={0.75} />;
        })}

        {/* Active Mission Highlight on 6-yr strip */}
        <rect x={m1X} y={0} width={m1W} height={16} fill="rgba(52, 211, 153, 0.55)" />

        {/* Draggable Zoom Viewport Box */}
        <rect
          x={boxX}
          y={0.5}
          width={boxW}
          height={15}
          rx={2}
          fill="rgba(56, 189, 248, 0.16)"
          stroke="#38bdf8"
          strokeWidth="1.2"
        />

        {/* Year labels */}
        {YEAR_TICKS.map((t) => {
          const tx = x6Yr(t.ms);
          return (
            <g key={t.yr}>
              <line x1={tx} x2={tx} y1={16} y2={19} stroke="rgba(148,163,184,0.45)" strokeWidth="0.7" />
              <text x={tx} y={25} textAnchor="middle" fontSize="6.8" fill="rgba(203,213,225,0.65)" fontFamily="ui-monospace, monospace">
                {t.yr}
              </text>
            </g>
          );
        })}
      </svg>

      {/* LEVEL 2: Zoom Strip (Sun + Earth + Shaded Mission Window) */}
      <div className="lt-strip-label mono" style={{ marginTop: 2 }}>
        <span>ZOOM ({zoomMonths}M) · CLICK TO SET LANDING</span>
        <span style={{ color: "#fbbf24" }}>
          {hoverMs ? fmtShortDate(hoverMs) : zoomStats ? `${zoomStats.darkGaps} sunset gap(s) in view` : ""}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H2}`}
        width="100%"
        className="lt-svg lt-svg-zoom"
        onClick={handleZoomClick}
        onMouseMove={handleZoomHover}
        onMouseLeave={() => setHoverMs(null)}
        role="img"
        aria-label="Zoomed sunlight and Earth communications window strip"
      >
        {/* Row 1: Sun */}
        <rect x={28} y={2} width={W - 28} height={15} rx={2.5} fill="#080c14" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" />
        <text x={2} y={12} fontSize="7.5" fontWeight="700" fill="#fbbf24" fontFamily="ui-monospace, monospace">
          SUN
        </text>
        {wins.sun
          .filter((w) => w.e > zoomStartMs && w.s < zoomEndMs)
          .map((w, i) => {
            const sx = 28 + Math.max(0, ((Math.max(w.s, zoomStartMs) - zoomStartMs) / zoomSpanMs) * (W - 28));
            const ex = 28 + Math.min(W - 28, ((Math.min(w.e, zoomEndMs) - zoomStartMs) / zoomSpanMs) * (W - 28));
            return (
              <rect
                key={i}
                x={sx}
                y={3}
                width={Math.max(0.8, ex - sx)}
                height={13}
                fill="#ff8c2b"
                opacity={0.88}
              />
            );
          })}

        {/* Row 2: Earth */}
        <rect x={28} y={21} width={W - 28} height={15} rx={2.5} fill="#080c14" stroke="rgba(255,255,255,0.07)" strokeWidth="0.6" />
        <text x={2} y={31} fontSize="7.5" fontWeight="700" fill="#38bdf8" fontFamily="ui-monospace, monospace">
          DTE
        </text>
        {wins.earth
          .filter((w) => w.e > zoomStartMs && w.s < zoomEndMs)
          .map((w, i) => {
            const sx = 28 + Math.max(0, ((Math.max(w.s, zoomStartMs) - zoomStartMs) / zoomSpanMs) * (W - 28));
            const ex = 28 + Math.min(W - 28, ((Math.min(w.e, zoomEndMs) - zoomStartMs) / zoomSpanMs) * (W - 28));
            return (
              <rect
                key={i}
                x={sx}
                y={22}
                width={Math.max(0.8, ex - sx)}
                height={13}
                fill="#38bdf8"
                opacity={0.85}
              />
            );
          })}

        {/* Shaded Mission Window across both rows */}
        {m2Visible && (
          <g>
            <rect
              x={28 + ((m2Start - zoomStartMs) / zoomSpanMs) * (W - 28)}
              y={1}
              width={Math.max(3, ((m2End - m2Start) / zoomSpanMs) * (W - 28))}
              height={36}
              rx={2}
              fill="rgba(52, 211, 153, 0.22)"
              stroke="#34d399"
              strokeWidth="1.2"
            />
          </g>
        )}

        {/* Hover hairline */}
        {hoverMs && (
          <line
            x1={28 + ((hoverMs - zoomStartMs) / zoomSpanMs) * (W - 28)}
            x2={28 + ((hoverMs - zoomStartMs) / zoomSpanMs) * (W - 28)}
            y1={1}
            y2={37}
            stroke="#ffffff"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
        )}

        <text x={28} y={43} fontSize="6.8" fill="rgba(203,213,225,0.55)" fontFamily="ui-monospace, monospace">
          {fmtShortDate(zoomStartMs)}
        </text>
        <text x={W} y={43} textAnchor="end" fontSize="6.8" fill="rgba(203,213,225,0.55)" fontFamily="ui-monospace, monospace">
          {fmtShortDate(zoomEndMs)}
        </text>
      </svg>
    </div>
  );
}
