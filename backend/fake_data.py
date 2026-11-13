# fake_data.py: data mozayafa bnafs shakl el 7a2i2y (lel test w lel frontend)
import numpy as np
from config import STEP_S, N_RAYS

def fake_mask():
    az = np.radians(np.arange(N_RAYS) * 0.5)
    return (1.2 + np.sin(3 * az) + 0.6 * np.sin(7 * az + 1)).astype(np.float32)   # tlal

def fake_series(days=30):
    k = np.arange(int(days * 86400 / STEP_S))
    sun_az = (k * STEP_S / (29.53 * 86400) * 360) % 360            # dawra kol 29.5 yom
    sun_el = 1.3 + 0.2 * np.sin(2 * np.pi * k / len(k))
    lib = np.sin(2 * np.pi * k * STEP_S / (27.3 * 86400))           # hezzet el ard
    earth_az = (180 + 4 * lib) % 360
    earth_el = 4.5 + 1.5 * lib
    return [a.astype(np.float32) for a in (sun_az, sun_el, earth_az, earth_el)]
