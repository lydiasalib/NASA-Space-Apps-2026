# app.py: el backend (FastAPI). el sites el gahza btet7amel mara wa7da fel memory
import json
import os
import datetime as dt
import math
import re
import threading
from functools import lru_cache
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from config import OUT, DEM_80, STEP_S, START_UTC
from stage3_vis import windows, next_change
from run_site import SITES_DIR, run_site
from metrics import (sun_dist_au, mission, best_dates, slope_deg, site_totals,
                     site_score, quick_eval)

app = FastAPI(title="RIMLIGHT")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
        "https://rimlight.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
STATIC = OUT / "static"
STATIC.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC), name="static")

T0 = dt.datetime.fromisoformat(START_UTC).replace(tzinfo=dt.timezone.utc)
DEM_PATH = os.environ.get("RIMLIGHT_DEM", str(DEM_80))
SITES = {}                                   # id -> {"meta", "arr", "flags"}


# ---------- wa2t <-> step ----------
def iso(k):
    return (T0 + dt.timedelta(seconds=int(k) * STEP_S)).strftime("%Y-%m-%dT%H:%M:%SZ")


def step_of(t_iso, n):
    try:
        s = re.sub(r" (\d\d:?\d\d)$", r"+\1", t_iso.strip()) if t_iso else ""   # "+02:00" fel URL beyeb2a " 02:00"
        t = dt.datetime.fromisoformat(s.replace("Z", "+00:00")) if s else dt.datetime.now(dt.timezone.utc)
    except ValueError:
        raise HTTPException(400, f"bad time {t_iso!r} (use ISO 8601, e.g. 2026-11-14T00:00:00Z)")
    if t.tzinfo is None:                     # mafish timezone -> UTC
        t = t.replace(tzinfo=dt.timezone.utc)
    k = round((t - T0).total_seconds() / STEP_S)
    if not 0 <= k < n:                       # bara el data: nerga3 error badal ma nelza2 fel 7arf
        raise HTTPException(400, f"time outside data range {iso(0)} .. {iso(n - 1)}")
    return int(k)


# ---------- ta7meel el sites ----------
def register(site_id):
    meta = json.loads((SITES_DIR / f"{site_id}.json").read_text())
    z = np.load(SITES_DIR / f"{site_id}.npz")
    arr = {k: z[k] for k in z.files}
    lit = arr["sun_frac"] > 0
    flags = {"sun": lit, "earth": arr["earth_vis"], "both": lit & arr["earth_vis"]}
    SITES[site_id] = {"meta": meta, "arr": arr, "flags": flags,
                      "wins": {b: windows(f) for b, f in flags.items()}}


@app.on_event("startup")
def load_all():
    for p in sorted(SITES_DIR.glob("*.json")):
        try:                                 # file bayez wa7ed may2a33sh el server kolo
            if not math.isfinite(json.loads(p.read_text()).get("h_site_m", 0)):
                raise ValueError("NaN height (old map-edge site)")
            register(p.stem)
        except Exception as e:
            print("skipped bad site", p.stem, e)
    print("loaded sites:", list(SITES))


def get_site(site_id):
    if site_id not in SITES:
        raise HTTPException(404, f"unknown site {site_id}")
    return SITES[site_id]


# ---------- heavy objects: bet7amel awel mara bs ----------
HEAVY = threading.RLock()                    # 7esba te2ila wa7da bs fel mara (memory + rasterio msh thread-safe)


@lru_cache(maxsize=1)
def _engine():
    from stage1_ephem import load_vectors
    from stage2_horizon import Dem
    return Dem(DEM_PATH), load_vectors()


def engine():
    with HEAVY:
        return _engine()


@lru_cache(maxsize=3)                          # kol wa7ed ~150 MB
def pano_site(site_id):
    from panorama import PanoramaSite
    m = get_site(site_id)["meta"]
    return PanoramaSite(engine()[0], m["lat"], m["lon"])


# ---------- endpoints ----------
@app.get("/")
@app.get("/health")
def health():
    return {"status": "ok", "service": "RIMLIGHT", "sites_loaded": len(SITES)}


@app.get("/sites")
def sites():
    return [s["meta"] for s in list(SITES.values()) if not s["meta"].get("custom")]


@app.get("/mapinfo")
def mapinfo():
    p = STATIC / "mapinfo.json"
    if not p.exists():
        raise HTTPException(404, "run make_map_image.py first")
    return json.loads(p.read_text())


@app.get("/horizon")
def horizon(site: str):
    s = get_site(site)
    return {"site": site, "az_step": 0.5, "mast_m": s["meta"]["mast_m"],
            "mask": np.round(s["arr"]["mask"].astype(float), 3).tolist(),
            "layers": np.round(s["arr"]["layers"].astype(float), 3).tolist()}


@app.get("/timeseries")
def timeseries(site: str, start: str | None = None, days: float = 30):
    if not (math.isfinite(days) and 0 < days <= 366):  # salb = el data kolha (10 MB), kbeer = OverflowError
        raise HTTPException(400, "days must be > 0 and <= 366")
    s = get_site(site)
    n = len(s["arr"]["sun_az"])
    k0 = step_of(start, n)
    k1 = min(n, k0 + max(1, math.ceil(days * 86400 / STEP_S)))   # days soghayara -> 3al a2al step wa7ed
    a = s["arr"]
    col = lambda name: np.round(a[name][k0:k1].astype(float), 3).tolist()
    return {"site": site, "t0": iso(k0), "step_s": STEP_S, "k0": k0,
            "sun_az": col("sun_az"), "sun_el": col("sun_el"), "sun_frac": col("sun_frac"),
            "earth_az": col("earth_az"), "earth_el": col("earth_el"),
            "earth_vis": a["earth_vis"][k0:k1].astype(int).tolist()}


@app.get("/windows")
def get_windows(site: str, body: str = "sun"):
    s = get_site(site)
    if body not in s["wins"]:
        raise HTTPException(400, "body = sun | earth | both")
    return {"site": site, "body": body,
            "windows": [{"start": iso(a), "end": iso(b), "open_start": os_, "open_end": oe}
                        for a, b, os_, oe in s["wins"][body]]}


def now_state(s, k):
    out = {}
    for body in ("sun", "earth"):
        f = s["flags"][body]
        nxt = next_change(f, k)
        out[f"{body}_now"] = {"visible": bool(f[k]),
                              "changes_at": iso(nxt) if nxt is not None else None}
    out["sun_now"]["fraction"] = round(float(s["arr"]["sun_frac"][k]), 3)
    return out


@app.get("/summary")
def summary(site: str, t: str | None = None):
    s = get_site(site)
    k = step_of(t, len(s["flags"]["sun"]))
    return {**s["meta"], "at": iso(k), **now_state(s, k)}


@app.get("/compare")
def compare(ids: str):
    return [summary(i) for i in ids.split(",") if i]


@app.get("/site")
def site_at(x: float, y: float):
    # click 3al map: metr -> lat/lon -> Stage 1-3 -> site gedeed (cached)
    if not (math.isfinite(x) and math.isfinite(y)):
        raise HTTPException(400, "x and y must be finite numbers")
    sid = f"pt_{round(x / 100)}_{round(y / 100)}"
    if sid in SITES:                               # cached: mesh me7tag el lock
        return summary(sid)
    with HEAVY:                                    # lock: nafs el no2ta mat7sebsh marten, w msh 15 7esba sawa
        if sid not in SITES:
            dem, vecs = engine()
            b = dem.ds.bounds
            if not (b.left + dem.px <= x <= b.right - dem.px and b.bottom + dem.px <= y <= b.top - dem.px):
                raise HTTPException(400, "outside the map")      # 3and el 7arf el DEM = NaN
            lat, lon = dem.xy_to_latlon(x, y)
            if not (-89.999 < lat <= -80 + 1e-6):
                raise HTTPException(400, f"outside the map (lat {lat:.2f})")
            site = {"id": sid, "name": f"{lat:.3f}, {lon:.3f}", "lat": lat, "lon": lon, "custom": True}
            try:
                run_site(site, dem, vecs, START_UTC + "Z")
            except ValueError as e:
                raise HTTPException(400, str(e))
            register(sid)
    return summary(sid)


@app.get("/panorama")
def panorama(site: str, t: str | None = None, el_lo: float = -3, el_hi: float = 7):
    if not (math.isfinite(el_lo) and math.isfinite(el_hi) and -90 <= el_lo < el_hi <= 90):
        raise HTTPException(400, "need -90 <= el_lo < el_hi <= 90")
    s = get_site(site)
    k = step_of(t, len(s["flags"]["sun"]))
    k = k - k % 6                                  # sora kol sa3a (cache)
    with HEAVY:                                    # el PanoramaSite bey2ra el DEM (rasterio) w bya5od memory
        png = _pano_png(site, k, el_lo, el_hi)
    return Response(png, media_type="image/png", headers={"X-At": iso(k)})


@lru_cache(maxsize=256)
def _pano_png(site, k, el_lo, el_hi):
    from panorama import to_png
    a = get_site(site)["arr"]
    rgba = pano_site(site).render(float(a["sun_az"][k]), float(a["sun_el"][k]),
                                  el_lo=el_lo, el_hi=el_hi)
    return to_png(rgba)


@app.get("/point")
def point(lat: float, lon: float):
    # click mn globe (lat/lon): gowa el map -> kol 7aga, bara el map -> Stage 1 bs (shams w ard)
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise HTTPException(400, "lat and lon must be finite numbers")
    lon = (lon + 180.0) % 360.0 - 180.0                    # 540, -720, ... -> [-180, 180)
    dem, vecs = engine()
    if -89.999 < lat <= -80 + 1e-9:                        # -80 bel zabt yerga3 -79.99999999 ba3d el round trip
        x, y = dem.latlon_to_xy(lat, lon)
        b = dem.ds.bounds
        if b.left + dem.px <= x <= b.right - dem.px and b.bottom + dem.px <= y <= b.top - dem.px:
            return {"coverage": "full", **site_at(x, y)}
    if not (-90 <= lat <= 90):
        raise HTTPException(400, "lat must be between -90 and 90")
    from stage1_ephem import azel
    _, sun_v, earth_v = vecs
    n = len(sun_v)
    k = step_of(None, n)                                   # el wa2t delwa2ty
    sa, se = azel(sun_v[k:k + 1], lat, lon)
    ea, ee = azel(earth_v[k:k + 1], lat, lon)
    return {"coverage": "stage1_only", "lat": lat, "lon": lon, "at": iso(k),
            "note": "no terrain data here: sun/earth position only, flat horizon assumed",
            "sun_now": {"az": round(float(sa[0]), 3), "el": round(float(se[0]), 3), "above_flat_horizon": bool(se[0] > 0)},
            "earth_now": {"az": round(float(ea[0]), 3), "el": round(float(ee[0]), 3), "above_flat_horizon": bool(ee[0] > 0)}}


# ---------- mission metrics: arqam bel zabt (sa3at, kWh) ----------
@lru_cache(maxsize=1)
def r_au():
    return sun_dist_au(engine()[1][1])           # masafet el shams kol step


def _check(name, v, lo, hi):
    if not (math.isfinite(v) and lo < v <= hi):
        raise HTTPException(400, f"{name} must be > {lo} and <= {hi}")


@app.get("/mission")
def get_mission(site: str, start: str | None = None, days: float = 14, load_w: float = 100,
                panel_m2: float = 1.0, eff: float = 0.30):
    _check("days", days, 0, 366); _check("load_w", load_w, -1e-9, 1e6)
    _check("panel_m2", panel_m2, 0, 1000); _check("eff", eff, 0, 1)
    s = get_site(site)
    n = len(s["flags"]["sun"])
    k0 = step_of(start, n)
    k1 = k0 + int(round(days * 86400 / STEP_S))
    if k1 > n:
        raise HTTPException(400, f"mission ends after the data range (last time {iso(n - 1)})")
    m = mission(s["arr"], r_au(), k0, days, load_w, panel_m2, eff)
    return {"site": site, "start": iso(k0), "end": iso(k1), **m}


@app.get("/best_dates")
def get_best_dates(site: str, days: float = 14, by: str = "energy", after: str | None = None,
                   before: str | None = None, top: int = 5, load_w: float = 100):
    _check("days", days, 0, 366); _check("load_w", load_w, -1e-9, 1e6)
    if by not in ("energy", "sun", "contact"):
        raise HTTPException(400, "by = energy | sun | contact")
    top = max(1, min(int(top), 10))
    s = get_site(site)
    n = len(s["flags"]["sun"])
    k_lo = step_of(after, n) if after else 0
    k_hi = step_of(before, n) + 1 if before else n
    ks = best_dates(s["arr"], r_au(), days, by=by, k_lo=k_lo, k_hi=k_hi, top=top)
    out = []
    for k in ks:
        m = mission(s["arr"], r_au(), k, days, load_w)
        m.pop("daily"); m.pop("assumptions")
        out.append({"start": iso(k), "end": iso(k + m["steps"]), **m})
    return {"site": site, "days": days, "ranked_by": by, "dates": out}


@app.get("/insights")
def insights(site: str):
    # 7agat sabta lel site: magamee3 el 6 snin, mail el ard, PSR, score
    s = get_site(site)
    if "insights" not in s:
        m = s["meta"]
        dem = engine()[0]
        with HEAVY:
            slope = slope_deg(dem, m["x"], m["y"])
        s["insights"] = {"site": site, "h_site_m": m["h_site_m"], "mast_m": m["mast_m"],
                         **site_totals(s["arr"], r_au()), "terrain": slope, **site_score(m),
                         "rays_off_map_percent": m.get("rays_off_map_percent", 0)}
    return s["insights"]


@lru_cache(maxsize=16)
def _mast(site):
    from stage1_ephem import azel
    from stage2_horizon import horizon_mask
    from stage3_vis import sun_fraction, earth_visible, stats
    m = get_site(site)["meta"]
    dem, (_, sun_v, earth_v) = engine()
    rows = []
    for mast in (2.0, 5.0, 10.0):
        hz = horizon_mask(dem, m["lat"], m["lon"], mast=mast)
        h = (hz["h_site"] + mast) / 1000
        fr = sun_fraction(*azel(sun_v, m["lat"], m["lon"], h), hz["mask"])
        ev = earth_visible(*azel(earth_v, m["lat"], m["lon"], h), hz["mask"])
        st = stats(fr, ev)
        rows.append({"mast_m": mast, "percent_sunlit": st["percent_sunlit"],
                     "earth_contact_percent": st["earth_contact_percent"],
                     "longest_night_h": st["longest_night_h"],
                     "sun_hours_per_year": round(float((fr > 0).mean() * 8766))})
    return rows


@app.get("/mast")
def mast(site: str):
    get_site(site)
    with HEAVY:
        return {"site": site, "options": _mast(site)}


@lru_cache(maxsize=16)
def _nearby(site, radius, step):
    # 1) scan sare3 (kol sa3a, horizon le 60 km)  2) 7esba kamla (200 km, kol 10 d) lel a7san 3
    from stage3_vis import sun_fraction, earth_visible, stats
    from stage1_ephem import azel
    from stage2_horizon import horizon_mask
    m = get_site(site)["meta"]
    dem, (_, sun_v, earth_v) = engine()
    sh, eh = sun_v[::6], earth_v[::6]
    x0, y0, nv, ev_ = dem.dirs(m["lat"], m["lon"])
    offs = np.arange(-radius, radius + 1e-6, step)
    cand = []
    for dx in offs:
        for dy in offs:
            if (dx or dy) and math.hypot(dx, dy) > radius + 1e-6:
                continue
            lat, lon = dem.xy_to_latlon(x0 + dx, y0 + dy)
            if not (-89.999 < lat <= -80):
                continue
            q = quick_eval(dem, sh, eh, lat, lon, m["mast_m"], 60)
            if q:
                cand.append((q["sun_pct"] + 0.01 * q["earth_pct"], dx, dy, lat, lon))
    cand.sort(reverse=True)
    out = []
    for _, dx, dy, lat, lon in cand[:3]:
        hz = horizon_mask(dem, lat, lon, mast=m["mast_m"])
        h = (hz["h_site"] + m["mast_m"]) / 1000
        fr = sun_fraction(*azel(sun_v, lat, lon, h), hz["mask"])
        evis = earth_visible(*azel(earth_v, lat, lon, h), hz["mask"])
        st = stats(fr, evis)
        d = np.array([dx, dy])
        bearing = (math.degrees(math.atan2(d @ ev_, d @ nv)) + 360) % 360 if (dx or dy) else 0.0
        out.append({"lat": round(lat, 6), "lon": round(lon, 6), "x": round(x0 + dx), "y": round(y0 + dy),
                    "distance_m": round(math.hypot(dx, dy)), "bearing_deg": round(bearing),
                    "h_site_m": round(float(hz["h_site"]), 1),
                    "slope_deg": slope_deg(dem, x0 + dx, y0 + dy)["slope_deg"],
                    "percent_sunlit": st["percent_sunlit"], "earth_contact_percent": st["earth_contact_percent"],
                    "longest_night_h": st["longest_night_h"],
                    "gain_sun_hours_per_year": round((st["percent_sunlit"] - m["percent_sunlit"]) / 100 * 8766)})
    out.sort(key=lambda r: (-r["percent_sunlit"], r["distance_m"]))
    return {"site": site, "here": {"percent_sunlit": m["percent_sunlit"],
                                   "earth_contact_percent": m["earth_contact_percent"],
                                   "longest_night_h": m["longest_night_h"]},
            "searched": {"radius_m": radius, "step_m": step, "points": len(cand)},
            "better": out}


@app.get("/nearby")
def nearby(site: str, radius: float = 450, step: float = 150):
    _check("radius", radius, 0, 2000); _check("step", step, 40, 1000)
    get_site(site)
    with HEAVY:
        return _nearby(site, float(radius), float(step))
