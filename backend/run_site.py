# run_site.py: site -> Stage 1 + 2 + 3 -> file wa7ed fe data/out/sites/
import json
import os
import numpy as np
from config import OUT, DEM_80, STEP_S, MAST_M
from stage1_ephem import load_vectors, azel
from stage2_horizon import Dem, horizon_mask
from stage3_vis import sun_fraction, earth_visible, full_stats, best_landing
from config import FINE_DEM

import datetime as dt


def step_to_utc(t0_utc, k):
    t0 = dt.datetime.fromisoformat(t0_utc.replace("Z", "+00:00"))
    return (t0 + dt.timedelta(seconds=int(k) * STEP_S)).strftime("%Y-%m-%dT%H:%M:%SZ")


SITES_DIR = OUT / "sites"
SITES_DIR.mkdir(parents=True, exist_ok=True)
BANDS_KM = [(0, 5), (5, 20), (20, 60), (60, 200)]      # lel depth layers fel panorama


def run_site(site, dem, vecs, t0_utc, mast=MAST_M, fine=None):
    ets, sun_v, earth_v = vecs
    lat, lon = site["lat"], site["lon"]
    hz = horizon_mask(dem, lat, lon, mast=mast, bands_km=BANDS_KM, fine=fine)   # Stage 2
    if not np.isfinite(hz["h_site"]):                                     # 3and 7arf el map: mafish irtifa3
        raise ValueError("no terrain data at this point (map edge)")
    h_km = (hz["h_site"] + mast) / 1000.0
    sun_az, sun_el = azel(sun_v, lat, lon, h_km)                          # Stage 1
    earth_az, earth_el = azel(earth_v, lat, lon, h_km)
    frac = sun_fraction(sun_az, sun_el, hz["mask"])                       # Stage 3
    evis = earth_visible(earth_az, earth_el, hz["mask"])
    summary = {**site, "x": hz["x"], "y": hz["y"], "h_site_m": round(hz["h_site"], 1),
               "mast_m": mast, "rays_off_map_percent": hz["rays_off_map_percent"], "t0_utc": t0_utc, "step_s": STEP_S, "n_steps": len(ets),
               **full_stats(frac, evis),
               "best_landing_14d": [{**b, "start_utc": step_to_utc(t0_utc, b["start_step"])}
                                    for b in best_landing(frac, evis, days=14)]}
    tmp = SITES_DIR / f"{site['id']}.tmp.npz"                             # ne3mel el file 3and tmp el awel
    np.savez_compressed(tmp,
                        mask=hz["mask"], layers=hz["layers"],
                        sun_az=sun_az, sun_el=sun_el, sun_frac=frac,
                        earth_az=earth_az, earth_el=earth_el, earth_vis=evis)
    os.replace(tmp, SITES_DIR / f"{site['id']}.npz")                      # rename = atomic, msh nos file
    tmpj = SITES_DIR / f"{site['id']}.json.tmp"
    tmpj.write_text(json.dumps(summary, indent=2, allow_nan=False))
    os.replace(tmpj, SITES_DIR / f"{site['id']}.json")
    return summary


def main():
    import spiceypy as spice
    from stage1_ephem import load_kernels
    load_kernels()
    vecs = load_vectors()
    t0 = spice.et2utc(vecs[0][0], "ISOC", 0) + "Z"
    dem = Dem(DEM_80)
    fine = Dem(FINE_DEM) if FINE_DEM else None
    sites = json.loads((OUT.parent / "sites.json").read_text())
    for s in sites:
        print(run_site(s, dem, vecs, t0, fine=fine))


if __name__ == "__main__":
    main()
