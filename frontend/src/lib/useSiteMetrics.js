// useSiteMetrics: site + settings el mission -> kol el data men el backend
import { useEffect, useMemo, useState } from "react";
import { api, toApiTime } from "./api";

// fetch b sid; law el inputs etghayaret abl ma yerga3, nerma el natiga el adima
function useFetch(fn, deps, delay = 0, keep = false) {
  const [state, setState] = useState({ status: "idle", data: null, error: null });
  useEffect(() => {
    if (!fn) {
      setState({ status: "idle", data: null, error: null });
      return undefined;
    }
    let dead = false;
    setState((s) => ({ status: "loading", data: keep ? s.data : null, error: null }));
    const t = setTimeout(() => {
      fn()
        .then((data) => !dead && setState({ status: "ready", data, error: null }))
        .catch((e) => !dead && setState({ status: "error", data: null, error: e.message }));
    }, delay);
    return () => {
      dead = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useSiteMetrics(site, cfg) {
  const lat = site?.lat;
  const lon = site?.lon;
  const inPole = Number.isFinite(lat) && lat <= -80 && lat > -89.999;

  // 1) /point: lat/lon -> site id (bey7seb Stage 1-3 awel mara, ~1-3 s)
  const point = useFetch(site ? () => api.point(lat, lon) : null, [lat, lon]);
  const full = point.status === "ready" && point.data?.coverage === "full";
  const sid = full ? point.data.id : null;

  // 2) 7agat sabta lel site
  const insights = useFetch(sid ? () => api.insights(sid) : null, [sid]);
  const horizon = useFetch(sid ? () => api.horizon(sid) : null, [sid]);

  // 3) el mission (debounce 250 ms 3ashan el slider)
  const mission = useFetch(
    sid ? () => api.mission(sid, cfg) : null,
    [sid, cfg.start, cfg.days, cfg.loadW, cfg.panelM2],
    250,
    true
  );

  // 4) masar el shams wel ard men el landing (max 30 yom) lel panorama
  const trackDays = Math.min(cfg.days, 30);
  const track = useFetch(
    sid ? () => api.timeseries(sid, toApiTime(cfg.start), trackDays) : null,
    [sid, cfg.start, trackDays],
    250,
    true
  );

  const pano = useMemo(() => {
    const h = horizon.data;
    const t = track.data;
    if (!h || !t || t.site !== sid || h.site !== sid || !t.sun_az?.length) return null;
    const every = 6; // kol sa3a
    const pick = (az, el) => {
      const out = [];
      for (let i = 0; i < az.length; i += every) out.push({ azDeg: az[i], elDeg: el[i] });
      return out;
    };
    return {
      horizonDeg: h.mask,
      sun: {
        azDeg: +t.sun_az[0].toFixed(1),
        elDeg: +t.sun_el[0].toFixed(2),
        diameterDeg: 0.53,
        visible: t.sun_frac[0] > 0,
        track: pick(t.sun_az, t.sun_el),
      },
      earth: {
        azDeg: +t.earth_az[0].toFixed(1),
        elDeg: +t.earth_el[0].toFixed(2),
        safetyMarginDeg: 2,
        visible: !!t.earth_vis[0],
        track: pick(t.earth_az, t.earth_el),
      },
      at: t.t0,
      trackDays,
    };
  }, [horizon.data, track.data, trackDays, sid]);

  // el data el adima (site tany) ma tetla3sh
  const missionData = mission.data?.site === sid ? mission.data : null;
  return { inPole, point, sid, insights, mission: { ...mission, data: missionData }, pano };
}
