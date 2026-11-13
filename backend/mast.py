# mast.py: el mast el atwal beyshoof foo2 el tlal -> kam % shams zyada?
# use: python mast.py LAT LON            (masts 0, 2, 5, 10, 20 m)
import sys
from config import DEM_80, FINE_DEM
from stage1_ephem import load_vectors, azel
from stage2_horizon import Dem, horizon_mask
from stage3_vis import sun_fraction, earth_visible, stats

MASTS = [0.5, 2, 5, 10, 20]


def mast_tradeoff(dem, vecs, lat, lon, masts=MASTS, fine=None):
    _, sun_v, earth_v = vecs
    rows = []
    for m in masts:
        hz = horizon_mask(dem, lat, lon, mast=m, fine=fine)
        h_km = (hz["h_site"] + m) / 1000
        frac = sun_fraction(*azel(sun_v, lat, lon, h_km), hz["mask"])
        ev = earth_visible(*azel(earth_v, lat, lon, h_km), hz["mask"])
        st = stats(frac, ev)
        rows.append({"mast_m": m, "percent_sunlit": st["percent_sunlit"],
                     "longest_night_h": st["longest_night_h"],
                     "earth_contact_percent": st["earth_contact_percent"]})
    return rows


if __name__ == "__main__":
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    dem = Dem(DEM_80)
    fine = Dem(FINE_DEM) if FINE_DEM else None
    for r in mast_tradeoff(dem, load_vectors(), lat, lon, fine=fine):
        print(f"mast {r['mast_m']:>4} m:  sunlit {r['percent_sunlit']:5.1f}%   "
              f"longest night {r['longest_night_h']:6.1f} h   earth {r['earth_contact_percent']:5.1f}%")
