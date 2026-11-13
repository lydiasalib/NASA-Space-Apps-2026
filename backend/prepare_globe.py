"""Prepare lightweight textures for the Three.js 3D Moon globe.

Inputs (NASA SVS CGI Moon Kit, downloaded into data/moonkit/ which is git-ignored):
  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif
  https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif

Outputs (frontend/public/globe/, a few MB total, safe for Git):
  moon_albedo_4k.jpg  - LRO WAC colour mosaic (equirectangular, 4096x2048)
  moon_normal_4k.jpg  - tangent-space normal map derived from LOLA heights
  moon_shadow_4k.jpg  - baked cast-shadow mask for the fixed grazing Sun
and frontend/src/data/globeMeta.json with the Sun direction used for the bake.

Coordinate frame matches THREE.SphereGeometry with an equirectangular texture
whose left edge is lon=-180:
  x = cos(lat) cos(lon),  y = sin(lat),  z = -cos(lat) sin(lon)
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy.ndimage import map_coordinates

REPO = Path(__file__).resolve().parent.parent
KIT = REPO / "data" / "moonkit"
OUT_DIR = REPO / "frontend" / "public" / "globe"
META = REPO / "frontend" / "src" / "data" / "globeMeta.json"

R_KM = 1737.4
OUT_W, OUT_H = 4096, 2048
NORMAL_EXAGGERATION = 2.5

# Sun 3 degrees above the horizon at the South Pole (subsolar latitude -3).
SUN_LAT = -3.0
SUN_LON = 55.0
SUN_ANGULAR_RADIUS = np.radians(0.267)


def lonlat_to_vec(lat_deg, lon_deg):
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.stack(
        [np.cos(lat) * np.cos(lon), np.sin(lat), -np.cos(lat) * np.sin(lon)], axis=-1
    )


def load_heights_km() -> np.ndarray:
    with rasterio.open(KIT / "ldem_16_uint.tif") as ds:
        raw = ds.read(1).astype(np.float32)
    # Values are in 0.5 m units; absolute offset is irrelevant for relief.
    h = raw * 0.0005
    return h - float(np.median(h))


class HeightSampler:
    """Bilinear sampler on an equirectangular height grid with longitude wrap."""

    def __init__(self, h: np.ndarray):
        self.H, self.W = h.shape
        self.grid = np.concatenate([h, h[:, :1]], axis=1)

    def __call__(self, lat_deg, lon_deg):
        row = (90.0 - lat_deg) / 180.0 * self.H - 0.5
        col = ((lon_deg + 180.0) / 360.0 * self.W - 0.5) % self.W
        row = np.clip(row, 0, self.H - 1)
        return map_coordinates(self.grid, [row, col], order=1, mode="nearest")


def make_albedo():
    with rasterio.open(KIT / "lroc_color_poles_4k.tif") as ds:
        rgb = np.transpose(ds.read(), (1, 2, 0))
    img = Image.fromarray(rgb, "RGB")
    if img.size != (OUT_W, OUT_H):
        img = img.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    img.save(OUT_DIR / "moon_albedo_4k.jpg", quality=90, optimize=True, progressive=True)


def make_normal(h_km: np.ndarray):
    h = np.asarray(
        Image.fromarray(h_km, "F").resize((OUT_W, OUT_H), Image.Resampling.LANCZOS),
        dtype=np.float64,
    )
    lat = 90.0 - (np.arange(OUT_H) + 0.5) * 180.0 / OUT_H
    coslat = np.clip(np.cos(np.radians(lat)), 0.01, None)[:, None]
    dy = np.pi * R_KM / OUT_H
    dx = 2.0 * np.pi * R_KM / OUT_W * coslat

    dh_east = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2.0 * dx)
    up = np.vstack([h[:1], h[:-1]])
    down = np.vstack([h[1:], h[-1:]])
    dh_north = (up - down) / (2.0 * dy)

    k = NORMAL_EXAGGERATION
    n = np.stack([-k * dh_east, -k * dh_north, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgb = np.clip((n * 0.5 + 0.5) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(
        OUT_DIR / "moon_normal_4k.jpg", quality=92, subsampling=0, optimize=True
    )


def make_shadow(h_km: np.ndarray):
    sample = HeightSampler(h_km)
    sun = lonlat_to_vec(SUN_LAT, SUN_LON)

    lat = 90.0 - (np.arange(OUT_H) + 0.5) * 180.0 / OUT_H
    lon = -180.0 + (np.arange(OUT_W) + 0.5) * 360.0 / OUT_W
    LON, LAT = np.meshgrid(lon, lat)
    n = lonlat_to_vec(LAT, LON)
    mu = n @ sun

    shadow = np.where(mu > 0, 1.0, 0.0).astype(np.float32)
    cand = (mu > -0.09) & (mu < 0.5)
    idx = np.flatnonzero(cand)
    print(f"  shadow candidates: {idx.size:,} texels")

    steps = np.geomspace(1.5, 320.0, 72) / R_KM
    flat_lat, flat_lon = LAT.ravel(), LON.ravel()
    flat_n = n.reshape(-1, 3)
    out = shadow.ravel()

    for start in range(0, idx.size, 400_000):
        sel = idx[start : start + 400_000]
        la, lo = flat_lat[sel], flat_lon[sel]
        p = flat_n[sel] * (1.0 + sample(la, lo) / R_KM)[:, None]
        margin = np.full(sel.size, np.inf)
        for t in steps:
            q = p + sun * t
            r = np.linalg.norm(q, axis=1)
            qlat = np.degrees(np.arcsin(np.clip(q[:, 1] / r, -1, 1)))
            qlon = np.degrees(np.arctan2(-q[:, 2], q[:, 0]))
            ground = 1.0 + sample(qlat, qlon) / R_KM
            np.minimum(margin, (r - ground) / t, out=margin)
        e = SUN_ANGULAR_RADIUS
        x = np.clip((margin + e) / (2 * e), 0.0, 1.0)
        out[sel] = x * x * (3 - 2 * x)

    img = (out.reshape(OUT_H, OUT_W) * 255.0 + 0.5).astype(np.uint8)
    Image.fromarray(img, "L").save(OUT_DIR / "moon_shadow_4k.jpg", quality=90, optimize=True)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    print("albedo...")
    make_albedo()
    print("heights...")
    h = load_heights_km()
    print(f"  relief range: {h.min():.2f} .. {h.max():.2f} km")
    print("normal map...")
    make_normal(h)
    print("shadow bake (Sun lat %.1f, lon %.1f)..." % (SUN_LAT, SUN_LON))
    make_shadow(h)

    META.parent.mkdir(parents=True, exist_ok=True)
    META.write_text(
        json.dumps(
            {
                "sunLat": SUN_LAT,
                "sunLon": SUN_LON,
                "sunElevationAtSouthPoleDeg": -SUN_LAT,
                "textures": {
                    "albedo": "/globe/moon_albedo_4k.jpg",
                    "normal": "/globe/moon_normal_4k.jpg",
                    "shadow": "/globe/moon_shadow_4k.jpg",
                },
                "source": "NASA SVS CGI Moon Kit (LRO WAC color + LOLA LDEM)",
            },
            indent=2,
        )
        + "\n"
    )
    for f in sorted(OUT_DIR.iterdir()):
        print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")
    print(f"done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
