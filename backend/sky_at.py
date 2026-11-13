# sky_at.py: le ay no2ta fel south pole: azimuth w elevation el shams wel ard kol 10 dae2e le 6 snin
# use: python sky_at.py LAT LON            ->  data/out/sky_<lat>_<lon>.csv
#      python sky_at.py -89.9 0
import sys
import datetime as dt
from config import OUT, START_UTC, STEP_S
from stage1_ephem import load_vectors, azel

if __name__ == "__main__":
    lat, lon = float(sys.argv[1]), float(sys.argv[2])
    _, sun_v, earth_v = load_vectors()               # Stage 1 (mara wa7da le kol el no2at)
    sun_az, sun_el = azel(sun_v, lat, lon)
    earth_az, earth_el = azel(earth_v, lat, lon)
    n = len(sun_az)
    t0 = dt.datetime.fromisoformat(START_UTC)
    path = OUT / f"sky_{lat}_{lon}.csv"
    with open(path, "w") as f:
        f.write("time_utc,sun_az_deg,sun_el_deg,earth_az_deg,earth_el_deg\n")
        for k in range(n):
            t = (t0 + dt.timedelta(seconds=k * STEP_S)).strftime("%Y-%m-%d %H:%M")
            f.write(f"{t},{sun_az[k]:.4f},{sun_el[k]:.4f},{earth_az[k]:.4f},{earth_el[k]:.4f}\n")
    print(f"{n} rows ({n * STEP_S / 86400 / 365.25:.2f} years, every {STEP_S // 60} min) -> {path}")
    for k in (0, 1, 2, n - 1):
        print(f"  step {k}: sun az {sun_az[k]:.2f} el {sun_el[k]:.3f} | earth az {earth_az[k]:.2f} el {earth_el[k]:.3f}")
