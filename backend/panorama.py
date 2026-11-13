# panorama.py: sora wa2e3eya lel ofo2 mn el site (mn el LOLA + makan el shams)
import io
from collections import OrderedDict
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from config import R_MOON_M, MAST_M
from stage2_horizon import sample


class LocalTerrain:
    """Grid mo7aly 7awalein el site bel (E, N) metr, el irtifa3 feeh enhena2 el kora."""

    def __init__(self, dem, lat, lon, radius_m, step):
        x0, y0, n, e = dem.dirs(lat, lon)
        a, c0, r0 = dem.window(x0, y0, radius_m)
        g = np.arange(-radius_m, radius_m + step / 2, step, dtype=np.float32)
        E, N = np.meshgrid(g, g)                         # axis 0 = N, axis 1 = E
        H = sample(dem, a, c0, r0, x0 + E * e[0] + N * n[0],
                   y0 + E * e[1] + N * n[1]).astype(np.float32)
        mid = len(g) // 2
        self.h_site = float(H[mid, mid])
        self.h = H - (E ** 2 + N ** 2) / (2 * R_MOON_M)  # el ard btenzel ba3eed (kora)
        del H, E, N
        gN, gE = np.gradient(self.h, step)               # meil el ard
        self.gE, self.gN = gE.astype(np.float32), gN.astype(np.float32)
        self.R, self.step = radius_m, step
        self._shadow = OrderedDict()                    # LRU soghayar: kol entry lel far grid ~25 MB (float32), 6 MB (uint8)
        self.max_cache = 8

    def look(self, arr, E, N, order=1, cval=np.nan):
        return map_coordinates(arr, [(N + self.R) / self.step, (E + self.R) / self.step],
                               order=order, mode="constant", cval=cval)

    def lit_grid(self, sun_az, sun_el):
        # dell: nedawar el grid 3ashan el shams tmshi 3ala el sfoof, we running max
        key = (round(sun_az), round(sun_el, 1))
        if key not in self._shadow:
            az = np.radians(key[0])
            L = np.array([-np.sin(az), -np.cos(az)])     # etgah el nour (mn el shams lel ard)
            P = np.array([L[1], -L[0]])                  # 3amoodi 3aleih
            g = np.arange(-self.R, self.R + self.step / 2, self.step, dtype=np.float32)
            U, V = np.meshgrid(g, g)                     # axis 1 = U (ma3 el nour)
            hs = self.look(self.h, U * L[0] + V * P[0], U * L[1] + V * P[1])
            s = hs + U * np.tan(np.radians(key[1]))
            s = np.where(np.isnan(s), -np.inf, s)
            lit = s >= np.maximum.accumulate(s, axis=1) - 0.01   # mafish 7aga 3alya odamo
            self._shadow[key] = (lit.astype(np.uint8), L, P)
            if len(self._shadow) > self.max_cache:
                self._shadow.popitem(last=False)         # ne4eel el a2dam
        self._shadow.move_to_end(key)
        return self._shadow[key]

    def lit_at(self, E, N, sun_az, sun_el):
        lit, L, P = self.lit_grid(sun_az, sun_el)
        u, v = E * L[0] + N * L[1], E * P[0] + N * P[1]
        return map_coordinates(lit, [(v + self.R) / self.step, (u + self.R) / self.step],
                               order=0, mode="constant", cval=0.0)

    def lambert(self, E, N, sun_az, sun_el):
        # el ard wesh el shams? (0 = la, 1 = 3al ma7ar)
        az, el = np.radians(sun_az), np.radians(sun_el)
        sE, sN, sU = np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)
        gE = self.look(self.gE, E, N, cval=0.0)
        gN = self.look(self.gN, E, N, cval=0.0)
        return np.clip((-gE * sE - gN * sN + sU) / np.sqrt(gE ** 2 + gN ** 2 + 1), 0, None)


class PanoramaSite:
    def __init__(self, dem, lat, lon, near_km=20, far_km=200, far_step=160.0):
        self.near = LocalTerrain(dem, lat, lon, near_km * 1000, dem.px)
        self.far = LocalTerrain(dem, lat, lon, far_km * 1000, far_step)

    def render(self, sun_az, sun_el, mast=MAST_M, width=1440, height=240,
               el_lo=-3.0, el_hi=7.0, gain=5.0, ambient=0.06, shadows=True):
        az = np.radians((np.arange(width) + 0.5) * 360.0 / width)[:, None]
        h0 = self.near.h_site + mast
        vals, angs = [], []
        for grid, d in ((self.near, np.arange(self.near.step, self.near.R, self.near.step)),
                        (self.far, np.arange(self.near.R, self.far.R, self.far.step))):
            E, N = d * np.sin(az), d * np.cos(az)        # (width, len(d))
            h = grid.look(grid.h, E, N)
            ang = np.degrees(np.arctan2(h - h0, d))      # el h feeh el enhena2 already
            lam = grid.lambert(E, N, sun_az, sun_el)
            if shadows:
                lam = lam * grid.lit_at(E, N, sun_az, sun_el)
                if grid is self.near:                   # tlal ba3eeda momken te3mel dell orayeb
                    lam = lam * self.far.lit_at(E, N, sun_az, sun_el)
            v = ambient + gain * lam
            v = v + (0.6 - v) * 0.15 * (d / self.far.R)  # fade khafeef lel ba3eed (styling)
            angs.append(np.where(np.isnan(ang), -90.0, ang)); vals.append(v)
        ang, val = np.hstack(angs), np.hstack(vals)
        top = np.maximum.accumulate(ang, axis=1)         # el mar2y = elly a3la mn kol elly 2odamo
        el_rows = el_lo + (np.arange(height)[::-1] + 0.5) * (el_hi - el_lo) / height  # saff 0 = foo2
        img = np.zeros((height, width), np.float32)
        alpha = np.zeros((height, width), np.uint8)
        for c in range(width):
            idx = np.searchsorted(top[c], el_rows)       # ay sample bayn fe kol saff
            ground = idx < top.shape[1]
            img[ground, c] = val[c, idx[ground]]
            alpha[ground, c] = 255
        g = (np.clip(img, 0, 1) * 255).astype(np.uint8)
        rgba = np.dstack([g, g, g, alpha])
        return rgba


def to_png(rgba):
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, "PNG")
    return buf.getvalue()
