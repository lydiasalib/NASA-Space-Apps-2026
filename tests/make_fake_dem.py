# make_fake_dem.py: DEM mozayaf bnafs projection el LOLA (polar stereographic)
import numpy as np, rasterio, sys
from rasterio.transform import from_origin
CRS = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
px, half = 80.0, 150_000
n = int(2 * half / px)
x = -half + (np.arange(n) + 0.5) * px
X, Y = np.meshgrid(x, x[::-1])               # row 0 = foo2 (y kbeer)
Z = np.zeros_like(X, dtype=np.float32)
cx, cy = map(float, sys.argv[1:3]) if len(sys.argv) > 2 else (3000.0, 0.0)
r = np.hypot(X - cx, Y - cy)
Z += np.clip(100 * (1 - r / 1000), 0, None)  # tal (cone) 100 m, 2o6ro 2 km
with rasterio.open("../data/lola/fake.tif", "w", driver="GTiff",
                   width=n, height=n, count=1, dtype="float32", crs=CRS,
                   transform=from_origin(-half, half, px, px), nodata=-9999) as ds:
    ds.write(Z, 1)
print("ok", n)
