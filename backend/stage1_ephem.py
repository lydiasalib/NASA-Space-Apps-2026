# stage1_ephem.py: fen el shams wel ard fe sama el site
import numpy as np
import spiceypy as spice
from config import KERNELS, OUT, R_MOON_KM, START_UTC, YEARS, STEP_S

KERNEL_FILES = [
    "naif0012.tls",               # leap seconds (el wa2t madbout)
    "pck00011.tpc",               # sabet el kawakeb (2o6r, shakl)
    "de440.bsp",                  # amaken el shams wel ard wel 2amar
    "moon_pa_de440_200625.bpc",   # dawaran el 2amar
    "moon_de440_250416.tf",       # ta3reef el frame MOON_ME
]


def load_kernels():
    for k in KERNEL_FILES:
        spice.furnsh(str(KERNELS / k))


def make_times():
    # kol STEP_S sanya le YEARS snin, bel "ET" (sawani mn sanet 2000)
    et0 = spice.str2et(START_UTC)
    return et0 + np.arange(0, YEARS * 365.25 * 86400, STEP_S)


def body_vectors(body, ets, chunk=20000):
    # sahm mn markaz el 2amar lel body (km) fe MOON_ME, 3ala da7arat 3ashan el memory
    out = np.empty((len(ets), 3))
    for i in range(0, len(ets), chunk):
        pos, _lt = spice.spkpos(body, ets[i:i + chunk], "MOON_ME", "LT+S", "MOON")
        out[i:i + chunk] = pos
    return out


def cache_vectors():
    # el 7esba di wa7da le kol el sites: ne3melha mara w nesayevha
    load_kernels()
    ets = make_times()
    np.save(OUT / "ets.npy", ets)
    np.save(OUT / "sun_vec.npy", body_vectors("SUN", ets))
    np.save(OUT / "earth_vec.npy", body_vectors("EARTH", ets))
    print("saved", len(ets), "steps, start UTC =", spice.et2utc(ets[0], "ISOC", 0))


def load_vectors():
    return (np.load(OUT / "ets.npy"),
            np.load(OUT / "sun_vec.npy"),
            np.load(OUT / "earth_vec.npy"))


def enu_basis(lat_deg, lon_deg):
    # el 3 aswaham el mo7aleya: shar2, shamal, foo2
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    return up, east, north


def azel(vecs, lat_deg, lon_deg, site_h_km=0.0):
    # vecs: (N,3) mn markaz el 2amar -> az/el (daragat) mn el site
    up, east, north = enu_basis(lat_deg, lon_deg)
    v = vecs - (R_MOON_KM + site_h_km) * up      # nenaqel el bedaya lel site
    e, n, u = v @ east, v @ north, v @ up
    az = np.degrees(np.arctan2(e, n)) % 360.0
    el = np.degrees(np.arctan2(u, np.hypot(e, n)))
    return az.astype(np.float32), el.astype(np.float32)


if __name__ == "__main__":
    cache_vectors()
