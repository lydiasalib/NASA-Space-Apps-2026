# find_best_spot.py: ndawar 3ala a7san no2ta (a3la % shams) 7awalein site
# use: python find_best_spot.py -89.4667 -136.6667 [radius_m] [step_m]
import sys
import numpy as np
from config import DEM_80, MAST_M
from stage1_ephem import load_vectors, azel
from stage2_horizon import Dem, horizon_mask
from stage3_vis import sun_fraction


def score(dem, sun_v, lat, lon, mast=MAST_M):
    # % el wa2t el shams zahra feeh 3and el no2ta di
    hz = horizon_mask(dem, lat, lon, mast=mast)
    az, el = azel(sun_v, lat, lon, (hz["h_site"] + mast) / 1000.0)
    return float((sun_fraction(az, el, hz["mask"]) > 0).mean() * 100), hz["h_site"]


if __name__ == "__main__":
    lat0, lon0 = float(sys.argv[1]), float(sys.argv[2])
    radius = float(sys.argv[3]) if len(sys.argv) > 3 else 1000.0
    step = float(sys.argv[4]) if len(sys.argv) > 4 else 125.0   # el ridge dayya2: 400 m ketir
    dem = Dem(DEM_80)
    _, sun_v, _ = load_vectors()
    x0, y0 = dem.latlon_to_xy(lat0, lon0)
    results = []
    offs = np.arange(-radius, radius + 1, step)
    for dx in offs:
        for dy in offs:
            lat, lon = dem.xy_to_latlon(x0 + dx, y0 + dy)
            pct, h = score(dem, sun_v, lat, lon)
            results.append((pct, lat, lon, h, dx, dy))
            print(f"dx {dx:+6.0f} dy {dy:+6.0f}  height {h:7.1f} m  sunlit {pct:5.1f}%")
    best = max(results)
    print(f"\nBEST: {best[0]:.1f}% sunlit at lat {best[1]:.5f}, lon {best[2]:.5f} "
          f"(height {best[3]:.0f} m, {best[4]:+.0f} m / {best[5]:+.0f} m from start)")
    print(f'add to data/sites.json: {{"id": "cr-best", "name": "Connecting Ridge (best)", "lat": {best[1]:.5f}, "lon": {best[2]:.5f}}}')
