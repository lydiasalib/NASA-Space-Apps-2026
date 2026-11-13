# stage2_horizon.py: el skyline (horizon mask) mn el LOLA DEM
import numpy as np
import rasterio
from rasterio.windows import Window
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from config import R_MOON_M, N_RAYS, MAX_KM, MAST_M, FINE_KM

GEO = "+proj=longlat +R=1737400 +no_defs"     # kora 2o6rha 1737.4 km zay el files


class Dem:
    def __init__(self, path):
        self.ds = rasterio.open(path)
        self.to_map = Transformer.from_crs(GEO, self.ds.crs, always_xy=True)
        self.to_geo = Transformer.from_crs(self.ds.crs, GEO, always_xy=True)
        self.inv = ~self.ds.transform              # metr -> pixel
        self.px = abs(self.ds.res[0])              # metr lel pixel
        self.scale = self.ds.scales[0] or 1.0
        self.offset = self.ds.offsets[0] or 0.0
        self.nodata = self.ds.nodata

    def info(self):
        d = self.ds
        print("crs:", d.crs.to_proj4())
        print("res:", d.res, "size:", d.width, "x", d.height)
        print("bounds:", d.bounds)
        print("nodata:", d.nodata, "scale/offset:", d.scales, d.offsets, "dtype:", d.dtypes)

    def latlon_to_xy(self, lat, lon):
        return self.to_map.transform(lon, lat)       # always_xy: (lon, lat) -> (x, y)

    def xy_to_latlon(self, x, y):
        lon, lat = self.to_geo.transform(x, y)
        return lat, lon

    def window(self, x0, y0, radius_m):
        # ne2ra bs 7etta 7awalein el site (msh el file kolo)
        c, r = self.inv * (x0, y0)
        n = int(radius_m / self.px) + 3
        c0, r0 = int(np.floor(c)) - n, int(np.floor(r)) - n
        win = Window(c0, r0, 2 * n + 1, 2 * n + 1)
        a = self.ds.read(1, window=win, boundless=True, fill_value=np.nan,
                         out_dtype="float32")
        if self.nodata is not None and not np.isnan(self.nodata):
            a[a == self.nodata] = np.nan
        a = a * self.scale + self.offset           # el arqam -> metr
        return a, c0, r0

    def dirs(self, lat, lon, eps=1e-3):
        # etgah el shamal wel shar2 3ala el map, ne2isha b khatwa soghayara
        x0, y0 = self.latlon_to_xy(lat, lon)
        xn, yn = self.latlon_to_xy(lat + eps, lon)
        xe, ye = self.latlon_to_xy(lat, lon + eps / np.cos(np.radians(lat)))
        n = np.array([xn - x0, yn - y0]); n /= np.linalg.norm(n)
        e = np.array([xe - x0, ye - y0])
        e -= (e @ n) * n; e /= np.linalg.norm(e)    # ne5aleeh 3amoodi 3al shamal bel zabt
        return x0, y0, n, e


def sample(dem, a, c0, r0, X, Y):
    # irtifa3 el ard 3and no2at (X, Y) bel metr, interpolation bein el pixels
    cols, rows = dem.inv * (X, Y)
    return map_coordinates(a, [np.asarray(rows) - 0.5 - r0, np.asarray(cols) - 0.5 - c0],
                           order=1, mode="nearest")


def horizon_mask(dem, lat, lon, mast=MAST_M, n_rays=N_RAYS, max_km=MAX_KM,
                 step=None, bands_km=None, fine=None, fine_km=FINE_KM):
    if abs(lat) > 89.999:
        raise ValueError("matestkhdemsh -90 bel zabt: el shamal msh ma3roof hnak")
    x0, y0, n, e = dem.dirs(lat, lon)
    a, c0, r0 = dem.window(x0, y0, max_km * 1000)
    step = step or dem.px
    d = np.arange(step, max_km * 1000 + step, step)           # masafat 3ala el shoa3
    drop = d ** 2 / (2 * R_MOON_M)                             # enhena2 el kora

    az = np.radians(np.arange(n_rays) * 360.0 / n_rays)[:, None]
    dx = np.cos(az) * n[0] + np.sin(az) * e[0]                 # etgah kol shoa3
    dy = np.cos(az) * n[1] + np.sin(az) * e[1]

    if fine is not None:                                       # 20 m lel ard el orayeba, 80 m lel ba3eeda
        fa, fc0, fr0 = fine.window(x0, y0, fine_km * 1000)
        d_near = np.arange(fine.px, fine_km * 1000, fine.px)
        d_far = np.arange(fine_km * 1000, max_km * 1000 + step, step)
        h_site = float(sample(fine, fa, fc0, fr0, np.array([x0]), np.array([y0]))[0])
        h = np.hstack([sample(fine, fa, fc0, fr0, x0 + dx * d_near, y0 + dy * d_near),
                       sample(dem, a, c0, r0, x0 + dx * d_far, y0 + dy * d_far)])
        d = np.concatenate([d_near, d_far])
        drop = d ** 2 / (2 * R_MOON_M)
    else:
        h_site = float(sample(dem, a, c0, r0, np.array([x0]), np.array([y0]))[0])
        h = sample(dem, a, c0, r0, x0 + dx * d, y0 + dy * d)   # (n_rays, len(d)) mara wa7da
    if not np.isfinite(h_site):                                # bara el map -> NaN fel natayeg
        raise ValueError(f"no DEM data at lat {lat:.4f}, lon {lon:.4f}")
    h0 = h_site + mast                                         # 3een el lander

    off_map = np.isnan(h).any(axis=1)                          # shoa3 5arag bara el map (orayeb mn 80S)
    ang = np.degrees(np.arctan2(h - h0 - drop, d))
    ang = np.where(np.isnan(ang), -90.0, ang)                  # NaN = mafish data
    mask = ang.max(axis=1).astype(np.float32)

    out = {"mask": mask, "h_site": h_site, "x": x0, "y": y0,
           "rays_off_map_percent": round(float(off_map.mean() * 100), 1)}   # >0 = el skyline na2es (natiga mtfa2ela shwaya)
    if bands_km:                                               # depth layers lel panorama
        layers = []
        for lo, hi in bands_km:
            sel = (d >= lo * 1000) & (d < hi * 1000)
            layers.append(ang[:, sel].max(axis=1) if sel.any() else np.full(n_rays, -90.0))
        out["layers"] = np.array(layers, dtype=np.float32)
    return out
