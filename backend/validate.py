# validate.py: el natayeg bta3tna vs el abhath el manshoora (Connecting Ridge)
# Published: ESA lander study: 89°28'S 136°40'W, 1947 m, 85.7% illumination
#            Gläser et al. 2014 (Icarus): best ridge spots 92.27% at 2 m, 95.65% at 10 m
# Note: el ESA point 3ala gamb ridge dayya2: ±200 m beyghayar el natiga mn 38% le 87%,
#       fa el moqarna el sa7 hya "a7san no2ta orayeba" vs Gläser.
import numpy as np
from config import DEM_80, FINE_DEM
from stage1_ephem import load_vectors
from stage2_horizon import Dem, horizon_mask
from find_best_spot import score

LAT, LON = -(89 + 28 / 60), -(136 + 40 / 60)
PUB_H, PUB_ESA, PUB_BEST2, PUB_BEST10 = 1947.0, 85.7, 92.27, 95.65


def best_near(dem, sun_v, mast, radius=1000, step=125):
    x0, y0 = dem.latlon_to_xy(LAT, LON)
    best = (0.0, 0.0, 0.0, 0.0)
    for dx in np.arange(-radius, radius + 1, step):
        for dy in np.arange(-radius, radius + 1, step):
            la, lo = dem.xy_to_latlon(x0 + dx, y0 + dy)
            pct = score(dem, sun_v, la, lo, mast=mast)[0]
            best = max(best, (pct, la, lo, float(np.hypot(dx, dy))))
    return best


if __name__ == "__main__":
    dem = Dem(DEM_80)
    fine = Dem(FINE_DEM) if FINE_DEM else None
    _, sun_v, _ = load_vectors()
    print("map used:", "20 m near + 80 m" if fine else "80 m")

    h = horizon_mask(dem, LAT, LON, fine=fine)["h_site"]
    esa = score(dem, sun_v, LAT, LON)[0]
    print(f"\n1) ESA point height: ours {h:.0f} m vs published {PUB_H:.0f} m  ({h - PUB_H:+.0f} m)")
    print(f"   ESA point sunlit (2 m): ours {esa:.1f}% vs published {PUB_ESA}%  (narrow ridge: very sensitive to exact spot)")

    print("\n2) Best spot within 1 km (125 m grid, takes a few minutes)...")
    b2 = best_near(dem, sun_v, 2.0)
    b10 = best_near(dem, sun_v, 10.0)
    print(f"   2 m mast : ours {b2[0]:.2f}% vs Gläser {PUB_BEST2}%  at lat {b2[1]:.5f}, lon {b2[2]:.5f} ({b2[3]:.0f} m away)")
    print(f"   10 m mast: ours {b10[0]:.2f}% vs Gläser {PUB_BEST10}%  at lat {b10[1]:.5f}, lon {b10[2]:.5f} ({b10[3]:.0f} m away)")

    ok_h = abs(h - PUB_H) <= 100
    ok_2 = abs(b2[0] - PUB_BEST2) <= 3
    ok_10 = abs(b10[0] - PUB_BEST10) <= 3
    print("\nVERDICT:", "VALIDATED" if (ok_h and ok_2 and ok_10) else "NOT VALIDATED",
          f"(height {'ok' if ok_h else 'off'}, best@2m {'ok' if ok_2 else 'off'}, best@10m {'ok' if ok_10 else 'off'}; tolerance 100 m / 3 points)")
