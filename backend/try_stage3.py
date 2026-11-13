# try_stage3.py: Stage 3 3ala el shams wel ard el 7a2i2yeen + skyline mozayaf (le7ad ma el LOLA yegi)
import numpy as np
import matplotlib.pyplot as plt
from stage1_ephem import load_vectors, azel
from stage3_vis import sun_fraction, earth_visible, windows, stats, next_change
from fake_data import fake_mask
from config import STEP_S

LAT, LON = -89.5, 30.0                      # site tagreeby gamb el pole

ets, sun_v, earth_v = load_vectors()        # Stage 1 (el 7a2i2y mn SPICE)
sun_az, sun_el = azel(sun_v, LAT, LON)
earth_az, earth_el = azel(earth_v, LAT, LON)

for name, mask in [("flat ground", np.zeros(720, np.float32)), ("fake hills", fake_mask())]:
    frac = sun_fraction(sun_az, sun_el, mask)          # kam % mn el shams zaher
    evis = earth_visible(earth_az, earth_el, mask)     # el ard zahra?
    print(f"\n== {name}")
    print(stats(frac, evis))
    w = windows(frac > 0)
    print("first 3 sun windows (start step, end step):", [(s, e) for s, e, *_ in w[:3]])
    k = next_change(frac > 0, 0)
    print("from the start, the sun changes after", round(k * STEP_S / 3600, 1), "hours")

# rasma: 30 yom awel 7aga
n = 30 * 144
days = np.arange(n) * STEP_S / 86400
mask = fake_mask()
fig, ax = plt.subplots(3, 1, figsize=(11, 7), sharex=True)
ax[0].plot(days, sun_el[:n], label="sun elevation"); ax[0].plot(days, np.interp(sun_az[:n], np.arange(720) * 0.5, mask, period=360), label="skyline in sun direction"); ax[0].legend(); ax[0].set_ylabel("deg")
ax[1].plot(days, sun_fraction(sun_az[:n], sun_el[:n], mask), color="orange"); ax[1].set_ylabel("sun visible")
ax[2].plot(days, earth_visible(earth_az[:n], earth_el[:n], mask), color="tab:blue"); ax[2].set_ylabel("earth visible"); ax[2].set_xlabel("days from 13 Nov 2026")
plt.tight_layout(); plt.savefig("/tmp/stage3.png") if plt.get_backend().lower() == "agg" else plt.show()
