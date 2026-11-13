# make_fake_terrain.py: DEM mozayaf feeh tlal w 7ofar 3ashwa2eya (fixed seed) lel test el shakl
import numpy as np, rasterio
from rasterio.transform import from_origin
CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
px, half = 80.0, 250_000
n = int(2 * half / px)
x = -half + (np.arange(n) + 0.5) * px
X, Y = np.meshgrid(x, x[::-1])
Z = np.zeros_like(X, dtype=np.float32)
rng = np.random.default_rng(7)
for _ in range(120):
    cx, cy = rng.uniform(-half, half, 2); s = rng.uniform(2e3, 25e3); h = rng.uniform(-1500, 2500)
    Z += (h * np.exp(-((X - cx) ** 2 + (Y - cy) ** 2) / (2 * s * s))).astype(np.float32)
with rasterio.open("../data/lola/fake_terrain.tif", "w", driver="GTiff", width=n, height=n, count=1,
                   dtype="float32", crs=CRS, transform=from_origin(-half, half, px, px), nodata=-9999,
                   tiled=True) as ds:
    ds.write(Z, 1)
print("ok", n)
