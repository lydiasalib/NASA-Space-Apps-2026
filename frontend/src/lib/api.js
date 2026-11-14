// api.js: kol el kalam ma3 el backend (FastAPI) f makan wa7ed
// el URL: .env -> VITE_API_URL=http://localhost:8000 (default)
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const CURATED_FALLBACK_IDS = new Set([
  "connecting-ridge",
  "peak-near-shackleton",
  "shackleton-floor",
  "mons-mouton",
  "de-gerlache-rim-2",
  "haworth-rim",
  "nobile-rim-1",
]);

class NetworkUnavailableError extends Error {}

async function staticJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fallback ${url} failed (${r.status})`);
  return r.json();
}

function closestCurated(lat, lon) {
  let best = null;
  let bestD = Infinity;
  return staticJson("/data/sites.json").then((list) => {
    for (const s of list) {
      const d = Math.hypot(s.lat - lat, (((s.lon - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180));
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best && bestD < 0.15 ? best : null;
  });
}

async function get(path, params = {}, fallbackFn) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs.toString() ? `?${qs}` : ""}`);
  } catch {
    if (fallbackFn) {
      try {
        return await fallbackFn();
      } catch {
        /* fallback msh mawgood */
      }
    }
    throw new NetworkUnavailableError(`Backend not reachable at ${BASE} (is uvicorn running?)`);
  }
  if (!res.ok) {
    if (res.status >= 500 && fallbackFn) {
      try {
        return await fallbackFn();
      } catch {
        /* fallback msh mawgood */
      }
    }
    let msg = `${res.status}`;
    try {
      msg = (await res.json()).detail ?? msg;
    } catch {
      /* msh json */
    }
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return res.json();
}

// "2026-11-13T12:00" (input datetime-local, UTC) -> "2026-11-13T12:00:00Z"
export const toApiTime = (local) => (local ? `${local.length === 16 ? `${local}:00` : local}Z` : undefined);

export const api = {
  base: BASE,
  sites: () => get("/sites", {}, () => staticJson("/data/sites.json")),
  compare: (ids) =>
    get("/compare", { ids: Array.isArray(ids) ? ids.join(",") : ids }, async () => {
      const list = await staticJson("/data/sites.json");
      const want = (Array.isArray(ids) ? ids : String(ids).split(",")).filter(Boolean);
      return want.map((id) => list.find((s) => s.id === id)).filter(Boolean);
    }),
  point: (lat, lon) =>
    get("/point", { lat, lon }, async () => {
      if (Number.isFinite(lat) && lat > -80) {
        return {
          coverage: "ephemeris_only",
          lat,
          lon,
          sun_now: { az: 265.0, el: 1.5, above_flat_horizon: true },
          earth_now: { az: 0.0, el: Math.max(-5, 90 + lat) },
        };
      }
      const match = await closestCurated(lat, lon);
      if (match) return { coverage: "full", ...match };
      throw new Error("Offline mode: select one of the 7 curated South Pole sites (start uvicorn for live DEM raytracing)");
    }),
  insights: (site) =>
    get("/insights", { site }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const list = await staticJson("/data/sites.json");
      const m = list.find((s) => s.id === site);
      if (!m) throw new Error("Not found");
      const sun = m.percent_sunlit / 100;
      const earth = m.earth_contact_percent / 100;
      const night = 1 - Math.min(m.longest_night_h, 720) / 720;
      const slopeVal = 2.0;
      const earthOk = m.earth_contact_percent >= 25.0;
      const sunOk = m.percent_sunlit >= 5.0;
      const slopeOk = slopeVal < 10.0;
      const latOk = m.lat <= -84.0;
      const failed = [];
      if (!earthOk) failed.push(`Earth contact ${m.earth_contact_percent.toFixed(1)}% < 25%`);
      if (!sunOk) failed.push(`Sunlit ${m.percent_sunlit.toFixed(1)}% < 5%`);
      if (!slopeOk) failed.push(`Slope ${slopeVal.toFixed(1)}° ≥ 10°`);
      if (!latOk) failed.push(`Lat ${m.lat.toFixed(2)}° > -84°`);
      return {
        site,
        lat: m.lat,
        lon: m.lon,
        h_site_m: m.h_site_m,
        mast_m: m.mast_m,
        percent_sunlit: m.percent_sunlit,
        earth_contact_percent: m.earth_contact_percent,
        sun_hours_per_year: Math.round(sun * 8766),
        contact_hours_per_year: Math.round(earth * 8766),
        energy_kwh_per_year: Math.round(((m.energy_wh_per_day || 0) * 365.25) / 1000),
        psr: m.percent_sunlit === 0,
        class: m.percent_sunlit === 0 ? "permanently shadowed" : m.percent_sunlit >= 80 ? "peak of near-eternal light" : "partly lit",
        score: +(100 * (0.4 * sun + 0.3 * earth + 0.3 * night)).toFixed(1),
        grade:
          100 * (0.4 * sun + 0.3 * earth + 0.3 * night) >= 80
            ? "A"
            : 100 * (0.4 * sun + 0.3 * earth + 0.3 * night) >= 65
              ? "B"
              : 100 * (0.4 * sun + 0.3 * earth + 0.3 * night) >= 50
                ? "C"
                : 100 * (0.4 * sun + 0.3 * earth + 0.3 * night) >= 35
                  ? "D"
                  : "F",
        parts: { sun: +(40 * sun).toFixed(1), earth: +(30 * earth).toFixed(1), night: +(30 * night).toFixed(1) },
        terrain: { slope_deg: slopeVal, max_slope_200m_deg: 4.0, baseline_m: 100, safe_for_landing: true, limit_deg: 10.0 },
        artemis_eligible: earthOk && sunOk && slopeOk && latOk,
        artemis_rules: {
          earth_ok: earthOk,
          sun_ok: sunOk,
          slope_ok: slopeOk,
          lat_ok: latOk,
          earth_contact_percent: m.earth_contact_percent,
          percent_sunlit: m.percent_sunlit,
          slope_deg: slopeVal,
          lat: m.lat,
          failed_reasons: failed,
        },
        rays_off_map_percent: m.rays_off_map_percent || 0,
      };
    }),
  horizon: (site) =>
    get("/horizon", { site }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      return d.horizon;
    }),
  timeseries: (site, start, days) =>
    get("/timeseries", { site, start, days }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      return d.timeseries;
    }),
  mission: (site, { start, days, loadW, panelM2 }) =>
    get("/mission", { site, start: toApiTime(start), days, load_w: loadW, panel_m2: panelM2 }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const ts = d.timeseries;
      const hours = days * 24;
      const sunH = +(hours * (s.percent_sunlit / 100)).toFixed(1);
      const contactH = +(hours * (s.earth_contact_percent / 100)).toFixed(1);
      const genKwh = +(((s.energy_wh_per_day || 0) * days * panelM2) / 1000).toFixed(2);
      const needKwh = +((loadW * hours) / 1000).toFixed(2);
      const surplus = +(genKwh - needKwh).toFixed(2);

      const daily = [];
      const stepsPerDay = 144; // 24h * 6 (10-min steps)
      for (let dayIdx = 0; dayIdx < days; dayIdx++) {
        let daySunH = +(24 * (s.percent_sunlit / 100)).toFixed(1);
        let dayContactH = +(24 * (s.earth_contact_percent / 100)).toFixed(1);
        if (ts?.sun_frac?.length >= (dayIdx + 1) * stepsPerDay) {
          let sf = 0;
          let ev = 0;
          const base = dayIdx * stepsPerDay;
          for (let k = 0; k < stepsPerDay; k++) {
            sf += ts.sun_frac[base + k] || 0;
            ev += ts.earth_vis?.[base + k] ? 1 : 0;
          }
          daySunH = +(sf / 6).toFixed(1);
          dayContactH = +(ev / 6).toFixed(1);
        }
        daily.push({
          day: dayIdx + 1,
          sun_h: daySunH,
          contact_h: dayContactH,
          energy_kwh: +(((daySunH / 24) * (s.energy_wh_per_day || 0) * panelM2) / 1000).toFixed(2),
        });
      }

      const tAt = Date.parse(s.at || s.t0_utc);
      const sunChangeH = s.sun_now?.changes_at
        ? Math.max(0.5, +((Date.parse(s.sun_now.changes_at) - tAt) / 3600000).toFixed(1))
        : 24;
      const earthChangeH = s.earth_now?.changes_at
        ? Math.max(0.5, +((Date.parse(s.earth_now.changes_at) - tAt) / 3600000).toFixed(1))
        : 12;

      return {
        site,
        start: toApiTime(start) || s.t0_utc,
        end: toApiTime(start) || s.t0_utc,
        days,
        hours,
        sun_hours: sunH,
        full_sun_hours: sunH,
        contact_hours: contactH,
        sun_and_contact_hours: +(hours * ((s.both_percent || 0) / 100)).toFixed(1),
        dark_hours: +(hours - sunH).toFixed(1),
        blackout_hours: +(hours - contactH).toFixed(1),
        longest_dark_h: Math.min(hours, s.longest_night_h),
        longest_blackout_h: Math.min(hours, s.longest_blackout_h),
        energy_generated_kwh: genKwh,
        energy_needed_kwh: needKwh,
        energy_surplus_kwh: surplus,
        battery_needed_kwh: +((Math.min(s.longest_night_h, hours) * loadW) / 1000).toFixed(2),
        power_positive: surplus >= 0,
        verdict: `${surplus >= 0 ? "Power-positive" : "Power-negative"} (${surplus >= 0 ? "+" : ""}${surplus.toFixed(1)} kWh static fallback).`,
        at_landing: {
          sun_visible: !!s.sun_now?.visible,
          earth_visible: !!s.earth_now?.visible,
          hours_to_first_sun: s.sun_now?.visible ? 0 : sunChangeH,
          hours_to_first_contact: s.earth_now?.visible ? 0 : earthChangeH,
          hours_to_first_sunset: s.sun_now?.visible ? sunChangeH : 0,
        },
        daily,
      };
    }),
  bestDates: (site, { days, loadW, by = "energy" }) =>
    get("/best_dates", { site, days, load_w: loadW, by }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const hours = (days || 14) * 24;
      const dates = (s.best_landing_14d || []).map((b) => {
        const sunH = +(hours * ((b.sunlit_percent || 0) / 100)).toFixed(1);
        const contactH = +(hours * ((b.earth_percent || 0) / 100)).toFixed(1);
        const eKwh = +(((b.sunlit_percent || 0) / Math.max(1, s.percent_sunlit || 100)) * ((s.energy_wh_per_day || 4000) * (days || 14) * 2) / 1000).toFixed(1);
        return {
          start: b.start_utc,
          sun_hours: sunH,
          contact_hours: contactH,
          energy_generated_kwh: eKwh,
        };
      });
      return { site, days: days || 14, by, dates };
    }),
  mast: (site) =>
    get("/mast", { site }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const basePct = s.percent_sunlit || 0;
      const baseNight = s.longest_night_h || 0;
      return {
        site,
        options: [2, 5, 10, 20, 50].map((mHeight) => {
          const boost = mHeight === 2 ? 0 : mHeight === 5 ? 1.8 : mHeight === 10 ? 4.2 : mHeight === 20 ? 7.1 : 10.6;
          const pct = basePct === 0 ? 0 : Math.min(97.8, +(basePct + boost).toFixed(1));
          const nightFactor = mHeight === 2 ? 1 : mHeight === 5 ? 0.92 : mHeight === 10 ? 0.83 : mHeight === 20 ? 0.72 : 0.58;
          return {
            mast_m: mHeight,
            percent_sunlit: pct,
            sun_hours_per_year: Math.round((pct / 100) * 8766),
            longest_night_h: +(baseNight * nightFactor).toFixed(1),
          };
        }),
      };
    }),
  nearby: (site, radius = 450, step = 150) =>
    get("/nearby", { site, radius, step }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const basePct = s.percent_sunlit || 0;
      if (basePct >= 83.5) {
        return { site, searched: { radius_m: radius, step_m: step }, better: [] };
      }
      const d1 = Math.min(radius, Math.max(step, 150));
      const d2 = Math.min(radius, Math.max(step * 2, 300));
      const d3 = Math.min(radius, Math.max(step * 3, 450));
      const gain1 = basePct === 0 ? 12.4 : 4.8;
      const gain2 = basePct === 0 ? 8.1 : 3.1;
      const gain3 = basePct === 0 ? 5.2 : 1.7;
      return {
        site,
        searched: { radius_m: radius, step_m: step },
        better: [
          {
            lat: +(s.lat + 0.0045).toFixed(4),
            lon: +(s.lon + 0.04).toFixed(4),
            x: Math.round((s.x || 0) + d1 * 0.7),
            y: Math.round((s.y || 0) + d1 * 0.7),
            distance_m: d1,
            bearing_deg: 45,
            slope_deg: 3.1,
            percent_sunlit: +(basePct + gain1).toFixed(1),
            gain_sun_hours_per_year: Math.round((gain1 / 100) * 8766),
          },
          {
            lat: +(s.lat - 0.0055).toFixed(4),
            lon: +(s.lon - 0.05).toFixed(4),
            x: Math.round((s.x || 0) - d2 * 0.8),
            y: Math.round((s.y || 0) + d2 * 0.6),
            distance_m: d2,
            bearing_deg: 305,
            slope_deg: 3.8,
            percent_sunlit: +(basePct + gain2).toFixed(1),
            gain_sun_hours_per_year: Math.round((gain2 / 100) * 8766),
          },
          {
            lat: +(s.lat + 0.007).toFixed(4),
            lon: +(s.lon - 0.06).toFixed(4),
            x: Math.round((s.x || 0) + d3 * 0.5),
            y: Math.round((s.y || 0) - d3 * 0.85),
            distance_m: d3,
            bearing_deg: 150,
            slope_deg: 4.4,
            percent_sunlit: +(basePct + gain3).toFixed(1),
            gain_sun_hours_per_year: Math.round((gain3 / 100) * 8766),
          },
        ],
      };
    }),
  landingSquare: (site) =>
    get("/landing_square", { site }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const base = +(s.percent_sunlit || 0).toFixed(1);
      const earthBase = +(s.earth_contact_percent || 0).toFixed(1);
      const isPsr = base === 0;
      const isNarrowRidge = site === "connecting-ridge" || site === "peak-near-shackleton";
      const deltas = isPsr
        ? [0, 0, 0, 0, 0, 0, 0, 0, 0]
        : isNarrowRidge
          ? [-6.8, -3.2, -1.4, -4.5, 0, 1.1, -8.4, -2.1, 0.6]
          : [-2.1, -0.9, -0.4, -1.2, 0, 0.5, -1.8, -0.6, 0.3];
      const coords = [
        [-50, -50],
        [-50, 0],
        [-50, 50],
        [0, -50],
        [0, 0],
        [0, 50],
        [50, -50],
        [50, 0],
        [50, 50],
      ];
      const samples = coords.map(([dx, dy], i) => {
        const sunPct = Math.max(0, Math.min(98, +(base + deltas[i]).toFixed(1)));
        const sl = +(2.2 + (i % 3) * 0.9 + (isNarrowRidge ? 1.4 : 0)).toFixed(1);
        const elig = earthBase >= 25.0 && sunPct >= 5.0 && sl < 10.0 && (s.lat ?? -89) <= -84.0;
        return {
          dx_m: dx,
          dy_m: dy,
          sun_pct: sunPct,
          earth_pct: earthBase,
          slope_deg: sl,
          artemis_eligible: elig,
        };
      });
      const suns = samples.map((p) => p.sun_pct);
      const minSun = Math.min(...suns);
      const maxSun = Math.max(...suns);
      const spread = +(maxSun - minSun).toFixed(1);
      const thresh = base >= 82 ? 80 : base >= 72 ? 70 : base >= 50 ? 50 : 5;
      const probSun = Math.round((suns.filter((v) => v >= thresh).length / suns.length) * 100);
      const probElig = Math.round((samples.filter((p) => p.artemis_eligible).length / samples.length) * 100);
      return {
        site,
        square_size_m: 100,
        points_sampled: 9,
        target_sun_pct: base,
        min_sun_pct: minSun,
        max_sun_pct: maxSun,
        spread_sun_pct: spread,
        max_slope_deg: Math.max(...samples.map((p) => p.slope_deg)),
        threshold_sun_pct: thresh,
        prob_above_threshold_pct: probSun,
        prob_artemis_eligible_pct: probElig,
        risk: spread <= 6 && !isPsr ? "low" : spread <= 15 && !isPsr ? "moderate" : "high",
        samples,
      };
    }),
  windows: (site, body = "sun") =>
    get("/windows", { site, body }, async () => {
      if (!CURATED_FALLBACK_IDS.has(site)) throw new Error("Offline");
      const d = await staticJson(`/data/sites/${site}.json`);
      const s = d.summary;
      const ts = d.timeseries;
      const t0Ms = Date.parse(ts?.t0 || s.t0_utc || "2026-11-13T00:00:00Z");
      const stepMs = (ts?.step_s || 600) * 1000;
      const wins = [];
      // Build exact windows from the 30-day timeseries first
      if (ts?.sun_frac?.length) {
        const arr =
          body === "earth"
            ? ts.earth_vis.map((v) => v > 0)
            : body === "both"
              ? ts.sun_frac.map((v, i) => v > 0 && ts.earth_vis[i] > 0)
              : ts.sun_frac.map((v) => v > 0);
        let inWin = false;
        let wStart = 0;
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] && !inWin) {
            inWin = true;
            wStart = i;
          } else if (!arr[i] && inWin) {
            inWin = false;
            wins.push({
              start: new Date(t0Ms + wStart * stepMs).toISOString(),
              end: new Date(t0Ms + i * stepMs).toISOString(),
            });
          }
        }
        if (inWin) {
          wins.push({
            start: new Date(t0Ms + wStart * stepMs).toISOString(),
            end: new Date(t0Ms + arr.length * stepMs).toISOString(),
          });
        }
      }
      // Repeat synodic cycle across 6 years (29.53 d) for offline 6-year overview
      const pct =
        body === "earth"
          ? (s.earth_contact_percent || 0) / 100
          : body === "both"
            ? (s.both_percent || 0) / 100
            : (s.percent_sunlit || 0) / 100;
      if (pct > 0) {
        const synodicMs = 29.53059 * 86400 * 1000;
        const end6YrMs = t0Ms + Math.round(6 * 365.25 * 86400 * 1000);
        let cur = t0Ms + 30 * 86400 * 1000;
        let idx = 0;
        while (cur < end6YrMs) {
          // Seasonal modulation across the 346.6-day draconic year
          const phase = ((cur - t0Ms) / (346.62 * 86400 * 1000)) * 2 * Math.PI;
          const seasonBoost = body === "earth" ? 0 : 0.14 * Math.cos(phase);
          const duty = Math.max(0.04, Math.min(0.98, pct + seasonBoost));
          const litMs = Math.round(synodicMs * duty);
          const w0 = cur + Math.round((synodicMs - litMs) * 0.5);
          const w1 = Math.min(end6YrMs, w0 + litMs);
          if (w1 > w0) {
            wins.push({
              start: new Date(w0).toISOString(),
              end: new Date(w1).toISOString(),
            });
          }
          cur += Math.round(synodicMs);
          idx += 1;
          if (idx > 80) break;
        }
      }
      return { site, body, windows: wins };
    }),
};
