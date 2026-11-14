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

  // 4) masar el shams wel ard men el landing (30 yom = dawret shams kamla 360° lel time slider)
  const trackDays = 30;
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
    const every = 6; // kol sa3a (step = 10 min -> 6 steps = 1 h)
    const stepMs = (t.step_s || 600) * 1000;
    const t0Ms = Date.parse(t.t0);
    const pick = (az, el) => {
      const out = [];
      for (let i = 0; i < az.length; i += every) out.push({ azDeg: az[i], elDeg: el[i] });
      return out;
    };
    const frames = [];
    for (let i = 0; i < t.sun_az.length; i += every) {
      frames.push({
        offsetH: Math.round(i / every),
        atUtc: Number.isFinite(t0Ms) ? new Date(t0Ms + i * stepMs).toISOString() : t.t0,
        sun: {
          azDeg: +t.sun_az[i].toFixed(1),
          elDeg: +t.sun_el[i].toFixed(2),
          diameterDeg: 0.53,
          visible: t.sun_frac[i] > 0,
        },
        earth: {
          azDeg: +t.earth_az[i].toFixed(1),
          elDeg: +t.earth_el[i].toFixed(2),
          safetyMarginDeg: 2,
          visible: !!t.earth_vis[i],
        },
      });
    }
    return {
      site: sid,
      horizonDeg: h.mask,
      sun: {
        ...frames[0].sun,
        track: pick(t.sun_az, t.sun_el),
      },
      earth: {
        ...frames[0].earth,
        track: pick(t.earth_az, t.earth_el),
      },
      frames,
      at: t.t0,
      trackDays: Math.max(1, Math.round(frames.length / 24)),
    };
  }, [horizon.data, track.data, trackDays, sid]);

  // el data el adima (site tany) ma tetla3sh
  const missionData = mission.data?.site === sid ? mission.data : null;
  return { inPole, point, sid, insights, mission: { ...mission, data: missionData }, pano };
}
