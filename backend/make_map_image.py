# make_map_image.py: sora wa7da lel south pole (lel Leaflet) + 7dodha bel metr
import json
import numpy as np
import rasterio
from rasterio.enums import Resampling
from PIL import Image
from config import LOLA, OUT, DEM_80

STATIC = OUT / "static"
STATIC.mkdir(parents=True, exist_ok=True)
HILL = LOLA / "LDEM_80S_80MPP_ADJ_HILL.TIF"
MAX_PX = 4000


def read_small(path):
    # ne2ra el file mtsaghar (average) badal ma n7amlo kolo
    with rasterio.open(path) as ds:
        f = max(ds.width, ds.height) / MAX_PX
        w, h = int(ds.width / f), int(ds.height / f)
        a = ds.read(1, out_shape=(h, w), resampling=Resampling.average).astype(np.float32)
        if ds.nodata is not None:
            a[a == ds.nodata] = np.nan
        return a, ds.bounds, ds.crs.to_proj4(), abs(ds.res[0]) * f


def hillshade(z, px, az=315, alt=30):
    # law mafish HILL file: ne3mel hillshade bsee6 mn el DEM
    gy, gx = np.gradient(z, px)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    a, al = np.radians(az), np.radians(alt)
    return np.sin(al) * np.cos(slope) + np.cos(al) * np.sin(slope) * np.cos(a - aspect)


if __name__ == "__main__":
    if HILL.exists():
        img, b, crs, _ = read_small(HILL)
    else:
        z, b, crs, px = read_small(DEM_80)
        img = hillshade(z, px)
    ok = np.isfinite(img)
    lo, hi = np.percentile(img[ok], [1, 99])                 # contrast stretch
    out = np.zeros(img.shape, np.uint8)
    out[ok] = (np.clip((img[ok] - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)
    Image.fromarray(out).save(STATIC / "hillshade.png")
    info = {"image": "/static/hillshade.png", "crs": crs,
            "bounds": {"left": b.left, "bottom": b.bottom, "right": b.right, "top": b.top},
            "width": out.shape[1], "height": out.shape[0]}
    (STATIC / "mapinfo.json").write_text(json.dumps(info, indent=2))
    print(info)
