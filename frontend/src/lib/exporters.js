// exporters.js: .ics Calendar Export, Mission Summary Card PNG, and Compare CSV export
import { fmt, fmtDur, fmtUtc } from "../components/MetricCard";
import { toApiTime } from "./api";

function toIcsDate(msOrIso) {
  const d = new Date(msOrIso);
  if (Number.isNaN(d.getTime())) return "20261113T000000Z";
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Winner Idea #1: Export every sunrise, sunset, Earth-rise, and Earth-blackout
 * during the mission window as an RFC 5545 .ics calendar file.
 */
export function exportMissionIcs({ site, cfg, mission, pano, sunWindows, earthWindows }) {
  if (!site || !cfg) return;
  const siteName = site.name || site.id || "Lunar South Pole Site";
  const startIso = toApiTime(cfg.start) || mission?.start || "2026-11-13T00:00:00Z";
  const startMs = Date.parse(startIso);
  const days = Number(cfg.days) || 14;
  const endMs = startMs + days * 86400 * 1000;
  const nowStamp = toIcsDate(Date.now());

  const events = [];

  // 1) Mission Touchdown event
  events.push({
    uid: `rimlight-touchdown-${site.id}-${startMs}@rimlight.space`,
    startMs,
    endMs: startMs + 1800 * 1000,
    summary: `Touchdown at ${siteName} (${days}d Mission)`,
    description: [
      `Site: ${siteName} (${site.lat?.toFixed(4)}°, ${site.lon?.toFixed(4)}°)`,
      `Stay: ${days} days | Load: ${cfg.loadW} W | Panel: ${cfg.panelM2} m²`,
      mission
        ? `Verdict: ${mission.power_positive ? "POWER-POSITIVE" : "POWER-NEGATIVE"} (${mission.energy_surplus_kwh >= 0 ? "+" : ""}${mission.energy_surplus_kwh} kWh, Battery needed: ${mission.battery_needed_kwh} kWh)`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  // Helper to extract transitions from /windows if available, else from pano.frames
  const collectWindowTransitions = (winList, riseTitle, setTitle, bodyLabel) => {
    if (Array.isArray(winList) && winList.length > 0) {
      for (const w of winList) {
        const w0 = Date.parse(w.start);
        const w1 = Date.parse(w.end);
        if (!Number.isFinite(w0) || !Number.isFinite(w1)) continue;
        if (w0 > startMs && w0 < endMs) {
          events.push({
            uid: `rimlight-${bodyLabel}-rise-${w0}@rimlight.space`,
            startMs: w0,
            endMs: w0 + 1800 * 1000,
            summary: `${riseTitle} at ${siteName}`,
            description: `${bodyLabel.toUpperCase()} visibility window opens at ${fmtUtc(new Date(w0).toISOString())} until ${fmtUtc(new Date(Math.min(endMs, w1)).toISOString())}.`,
          });
        }
        if (w1 > startMs && w1 < endMs) {
          events.push({
            uid: `rimlight-${bodyLabel}-set-${w1}@rimlight.space`,
            startMs: w1,
            endMs: w1 + 1800 * 1000,
            summary: `${setTitle} at ${siteName}`,
            description: `${bodyLabel.toUpperCase()} occulted by local LOLA terrain horizon at ${fmtUtc(new Date(w1).toISOString())}.`,
          });
        }
      }
      return true;
    }
    return false;
  };

  const usedSunWins = collectWindowTransitions(sunWindows, "Sunrise", "Sunset (Dark Gap Starts)", "sun");
  const usedEarthWins = collectWindowTransitions(
    earthWindows,
    "Earth Link Acquired (DTE)",
    "Earth Blackout Starts",
    "earth"
  );

  // Fallback to pano.frames transitions if /windows wasn't loaded
  if ((!usedSunWins || !usedEarthWins) && Array.isArray(pano?.frames) && pano.frames.length > 1) {
    const frames = pano.frames;
    for (let i = 1; i < frames.length; i++) {
      const prev = frames[i - 1];
      const cur = frames[i];
      const tMs = Date.parse(cur.atUtc);
      if (!Number.isFinite(tMs) || tMs < startMs || tMs > endMs) continue;

      if (!usedSunWins && prev.sun?.visible !== cur.sun?.visible) {
        const isRise = !!cur.sun?.visible;
        events.push({
          uid: `rimlight-sun-${isRise ? "rise" : "set"}-${tMs}@rimlight.space`,
          startMs: tMs,
          endMs: tMs + 1800 * 1000,
          summary: `${isRise ? "Sunrise" : "Sunset (Dark Gap Starts)"} at ${siteName}`,
          description: `Sun ${isRise ? "rises above" : "sets behind"} local LOLA horizon (Az ${cur.sun?.azDeg}°, El ${cur.sun?.elDeg}°).`,
        });
      }
      if (!usedEarthWins && prev.earth?.visible !== cur.earth?.visible) {
        const isRise = !!cur.earth?.visible;
        events.push({
          uid: `rimlight-earth-${isRise ? "rise" : "set"}-${tMs}@rimlight.space`,
          startMs: tMs,
          endMs: tMs + 1800 * 1000,
          summary: `${isRise ? "Earth Link Acquired (DTE)" : "Earth Blackout Starts"} at ${siteName}`,
          description: `Direct-to-Earth (DTE) link (2° margin) ${isRise ? "restored" : "blocked by ridge"} (Az ${cur.earth?.azDeg}°, El ${cur.earth?.elDeg}°).`,
        });
      }
    }
  }

  // Mission End event
  events.push({
    uid: `rimlight-end-${site.id}-${endMs}@rimlight.space`,
    startMs: endMs,
    endMs: endMs + 1800 * 1000,
    summary: `Mission Complete at ${siteName} (${days}d)`,
    description: `End of ${days}-day surface stay at ${siteName}.`,
  });

  events.sort((a, b) => a.startMs - b.startMs);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RIMLIGHT//Lunar South Pole Mission Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:RIMLIGHT - ${escapeIcs(siteName)}`,
  ];

  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART:${toIcsDate(ev.startMs)}`,
      `DTEND:${toIcsDate(ev.endMs)}`,
      `SUMMARY:${escapeIcs(ev.summary)}`,
      `DESCRIPTION:${escapeIcs(ev.description)}`,
      `LOCATION:${escapeIcs(`${siteName} (${site.lat?.toFixed(3)}S, ${site.lon?.toFixed(3)}E)`)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  const dateSlug = startIso.slice(0, 10);
  const safeId = String(site.id || "site").replace(/[^a-z0-9_-]/gi, "-");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  triggerDownload(blob, `${safeId}_${dateSlug}_${days}d_mission.ics`);
}

/**
 * Item #8: Download a high-DPI PNG Mission Summary Card for slides, reports, or judges.
 */
export function downloadMissionCardPng({ site, cfg, mission, insights, pano }) {
  if (!site) return;
  const W = 1200;
  const H = 680;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#070b14");
  bg.addColorStop(1, "#0f172a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle top accent bar
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, "#ff8c2b");
  topGrad.addColorStop(0.5, "#38bdf8");
  topGrad.addColorStop(1, "#34d399");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 5);

  const pad = 36;

  // Header
  ctx.fillStyle = "#ff8c2b";
  ctx.font = "700 13px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("RIMLIGHT · LUNAR SOUTH POLE MISSION BRIEFING CARD", pad, 42);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 30px Inter, system-ui, sans-serif";
  ctx.fillText(site.name || site.id || "Selected Site", pad, 80);

  const coordTxt = `${Math.abs(site.lat ?? -89).toFixed(4)}° S · ${Math.abs(site.lon ?? 0).toFixed(4)}° ${(site.lon ?? 0) >= 0 ? "E" : "W"} · Elev ${fmt(insights?.h_site_m, 0)} m · Mast ${fmt(insights?.mast_m ?? 2, 0)} m`;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "500 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(coordTxt, pad, 106);

  // Right header: Score + Grade badge
  if (insights) {
    const sc = Math.round(insights.score || 0);
    const grade = insights.grade || (sc >= 80 ? "A" : sc >= 65 ? "B" : sc >= 50 ? "C" : sc >= 35 ? "D" : "F");
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(W - pad - 210, 28, 210, 78, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.fillText("SITE GRADE & SCORE", W - pad - 192, 52);

    ctx.fillStyle = sc >= 65 ? "#34d399" : sc >= 40 ? "#fbbf24" : "#f87171";
    ctx.font = "800 28px ui-monospace, monospace";
    ctx.fillText(`Grade ${grade} · ${sc}/100`, W - pad - 192, 88);
  }

  // Mission window & Verdict banner
  const m = mission;
  const startStr = fmtUtc(m?.start || toApiTime(cfg?.start));
  const endStr = fmtUtc(m?.end);
  const pos = m?.power_positive ?? true;

  ctx.fillStyle = pos ? "rgba(52, 211, 153, 0.12)" : "rgba(248, 113, 113, 0.12)";
  ctx.strokeStyle = pos ? "rgba(52, 211, 153, 0.48)" : "rgba(248, 113, 113, 0.48)";
  ctx.beginPath();
  ctx.roundRect(pad, 126, W - pad * 2, 56, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = pos ? "#6ee7b7" : "#fca5a5";
  ctx.font = "700 16px ui-monospace, monospace";
  const surplusSign = (m?.energy_surplus_kwh ?? 0) >= 0 ? "+" : "";
  ctx.fillText(
    `${pos ? "✓ POWER-POSITIVE" : "✗ POWER-NEGATIVE"} · ${surplusSign}${fmt(m?.energy_surplus_kwh, 1)} kWh Surplus · Battery Needed: ${fmt(m?.battery_needed_kwh, 2)} kWh`,
    pad + 18,
    152
  );

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "500 12.5px ui-monospace, monospace";
  ctx.fillText(
    `Window: ${startStr} → ${endStr} (${cfg?.days ?? 14} d · ${cfg?.loadW ?? 100} W load · ${cfg?.panelM2 ?? 1} m² panel @ 30% eff)`,
    pad + 18,
    172
  );

  // Artemis III 4-Badge Row
  const r = insights?.artemis_rules;
  const earthOk = r ? !!r.earth_ok : (insights?.earth_contact_percent ?? 0) >= 25;
  const sunOk = r ? !!r.sun_ok : (insights?.percent_sunlit ?? 0) >= 5;
  const slopeOk = r ? !!r.slope_ok : (insights?.terrain?.slope_deg ?? 2) < 10;
  const latOk = r ? !!r.lat_ok : (site.lat ?? -89) <= -84;
  const elig = earthOk && sunOk && slopeOk && latOk;

  const rules = [
    { label: `Artemis III: ${elig ? "ELIGIBLE" : "INELIGIBLE"}`, ok: elig, header: true },
    { label: `Earth ≥ 25% (${fmt(insights?.earth_contact_percent, 1)}%)`, ok: earthOk },
    { label: `Sun ≥ 5% (${fmt(insights?.percent_sunlit, 1)}%)`, ok: sunOk },
    { label: `Slope < 10° (${fmt(insights?.terrain?.slope_deg, 1)}° / 100m)`, ok: slopeOk },
    { label: `Lat ≤ -84° (${Math.abs(site.lat ?? -89).toFixed(2)}°S)`, ok: latOk },
  ];

  const badgeW = (W - pad * 2 - 4 * 10) / 5;
  rules.forEach((b, idx) => {
    const bx = pad + idx * (badgeW + 10);
    const by = 198;
    ctx.fillStyle = b.ok ? "rgba(52, 211, 153, 0.1)" : "rgba(248, 113, 113, 0.12)";
    ctx.strokeStyle = b.ok ? "rgba(52, 211, 153, 0.4)" : "rgba(248, 113, 113, 0.45)";
    ctx.beginPath();
    ctx.roundRect(bx, by, badgeW, 36, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = b.ok ? "#a7f3d0" : "#fecaca";
    ctx.font = b.header ? "700 12px ui-monospace, monospace" : "600 11.5px ui-monospace, monospace";
    ctx.fillText(`${b.ok ? "✓" : "✗"} ${b.label}`, bx + 12, by + 23);
  });

  // 8 Key Stat Tiles (2 rows x 4 cols) on the left/top, or 4 cols x 2 rows
  const stats = [
    { label: "SUN HOURS (MISSION)", val: `${fmt(m?.sun_hours, 1)} h`, sub: `of ${fmt(m?.hours, 0)} h total`, color: "#fbbf24" },
    { label: "EARTH CONTACT (DTE)", val: `${fmt(m?.contact_hours, 1)} h`, sub: "2° horizon safety margin", color: "#38bdf8" },
    { label: "LONGEST DARK GAP", val: fmtDur(m?.longest_dark_h), sub: `${fmt(m?.dark_hours, 1)} h dark total`, color: "#a78bfa" },
    { label: "BATTERY REQUIRED", val: `${fmt(m?.battery_needed_kwh, 2)} kWh`, sub: `${cfg?.loadW ?? 100} W continuous load`, color: "#34d399" },
    { label: "ENERGY GENERATED", val: `${fmt(m?.energy_generated_kwh, 1)} kWh`, sub: `Needed: ${fmt(m?.energy_needed_kwh, 1)} kWh`, color: "#ff8c2b" },
    { label: "6-YR MEAN SUNLIT", val: `${fmt(insights?.percent_sunlit, 1)}%`, sub: `${fmt(insights?.sun_hours_per_year, 0)} h / yr`, color: "#fde68a" },
    { label: "SLOPE (100M BASELINE)", val: `${fmt(insights?.terrain?.slope_deg, 1)}°`, sub: `Max 200m: ${fmt(insights?.terrain?.max_slope_200m_deg, 1)}°`, color: "#6ee7b7" },
    { label: "6-YR EARTH LINK", val: `${fmt(insights?.earth_contact_percent, 1)}%`, sub: `${fmt(insights?.contact_hours_per_year, 0)} h / yr`, color: "#7dd3fc" },
  ];

  const colW = (W - pad * 2 - 3 * 12) / 4;
  const rowH = 82;
  stats.forEach((st, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const sx = pad + col * (colW + 12);
    const sy = 250 + row * (rowH + 12);

    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.beginPath();
    ctx.roundRect(sx, sy, colW, rowH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 10.5px ui-monospace, monospace";
    ctx.fillText(st.label, sx + 14, sy + 22);

    ctx.fillStyle = st.color;
    ctx.font = "700 22px ui-monospace, monospace";
    ctx.fillText(st.val, sx + 14, sy + 50);

    ctx.fillStyle = "#64748b";
    ctx.font = "500 11px Inter, sans-serif";
    ctx.fillText(st.sub, sx + 14, sy + 70);
  });

  // 360° Horizon Panorama box at bottom
  const px = pad;
  const py = 442;
  const pw = W - pad * 2;
  const ph = 180;

  ctx.fillStyle = "#090d16";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 11.5px ui-monospace, monospace";
  ctx.fillText("360° LOLA HORIZON SKYLINE & DIURNAL SUN / EARTH TRACKS", px + 14, py + 22);

  if (pano?.horizonDeg?.length) {
    const hz = pano.horizonDeg;
    const peak = Math.max(10, Math.ceil(Math.max(...hz) + 1));
    const minEl = -2;
    const plotX = px + 36;
    const plotY = py + 34;
    const plotW = pw - 52;
    const plotH = ph - 54;
    const azToX = (az) => plotX + (az / 360) * plotW;
    const elToY = (el) => plotY + ((peak - Math.max(minEl, Math.min(peak, el))) / (peak - minEl)) * plotH;

    // 0 deg horizon line
    const y0 = elToY(0);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(plotX, y0);
    ctx.lineTo(plotX + plotW, y0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Terrain polygon
    ctx.beginPath();
    ctx.moveTo(plotX, elToY(hz[0]));
    for (let i = 1; i < hz.length; i++) {
      ctx.lineTo(azToX((i * 360) / hz.length), elToY(hz[i]));
    }
    ctx.lineTo(plotX + plotW, elToY(hz[0]));
    ctx.lineTo(plotX + plotW, plotY + plotH);
    ctx.lineTo(plotX, plotY + plotH);
    ctx.closePath();
    ctx.fillStyle = "#1e293b";
    ctx.fill();

    // Ridge stroke
    ctx.beginPath();
    ctx.moveTo(plotX, elToY(hz[0]));
    for (let i = 1; i < hz.length; i++) {
      ctx.lineTo(azToX((i * 360) / hz.length), elToY(hz[i]));
    }
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Sun position
    if (pano.sun) {
      const sx = azToX(pano.sun.azDeg);
      const sy = elToY(pano.sun.elDeg);
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ff8c2b";
      ctx.fill();
    }
    // Earth position
    if (pano.earth) {
      const ex = azToX(pano.earth.azDeg);
      const ey = elToY(pano.earth.elDeg);
      ctx.beginPath();
      ctx.arc(ex, ey, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
    }
  }

  // Footer attribution
  ctx.fillStyle = "#64748b";
  ctx.font = "500 11.5px ui-monospace, monospace";
  ctx.fillText(
    "Data: NASA LRO LOLA 80 m/px South Pole DEM (PGDA #90) + NAIF SPICE DE440 Ephemeris (2026–2032) · Validated vs Gläser et al. (2014)",
    pad,
    H - 18
  );

  const dateSlug = (toApiTime(cfg?.start) || "2026-11-13").slice(0, 10);
  const safeId = String(site.id || "site").replace(/[^a-z0-9_-]/gi, "-");
  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, `${safeId}_${dateSlug}_${cfg?.days ?? 14}d.png`);
  }, "image/png");
}

/**
 * Export side-by-side comparison matrix from CompareModal as CSV.
 */
export function exportCompareCsv({ rows, metrics, cfg }) {
  if (!rows?.length || !metrics?.length) return;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = ["Metric", ...rows.map((r) => `${r.name} (${r.lat?.toFixed(2)}S, ${r.lon?.toFixed(2)}E)`)];
  const csvRows = [headers.map(esc).join(",")];

  for (const m of metrics) {
    const line = [m.label, ...rows.map((r) => m.format(m.get(r)))];
    csvRows.push(line.map(esc).join(","));
  }

  const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const dateSlug = (toApiTime(cfg?.start) || "2026-11-13").slice(0, 10);
  triggerDownload(blob, `rimlight_site_comparison_${dateSlug}.csv`);
}
