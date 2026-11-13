// api.js: kol el kalam ma3 el backend (FastAPI) f makan wa7ed
// el URL: .env -> VITE_API_URL=http://localhost:8000 (default)
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");

async function get(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}${qs.toString() ? `?${qs}` : ""}`);
  } catch {
    throw new Error(`Backend not reachable at ${BASE} (is uvicorn running?)`);
  }
  if (!res.ok) {
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
  point: (lat, lon) => get("/point", { lat, lon }),
  insights: (site) => get("/insights", { site }),
  horizon: (site) => get("/horizon", { site }),
  timeseries: (site, start, days) => get("/timeseries", { site, start, days }),
  mission: (site, { start, days, loadW, panelM2 }) =>
    get("/mission", { site, start: toApiTime(start), days, load_w: loadW, panel_m2: panelM2 }),
  bestDates: (site, { days, loadW, by = "energy" }) => get("/best_dates", { site, days, load_w: loadW, by }),
  mast: (site) => get("/mast", { site }),
  nearby: (site) => get("/nearby", { site }),
};
