"""Prepare the high-resolution Lunar South Pole mosaic for the web viewer.

Reads the source GeoTIFF (or plain PNG fallback), downsamples it to 4096x4096
with Pillow LANCZOS resampling into `frontend/public/south_pole.png`, and writes
calibrated stereographic bounds and proj4 metadata to `frontend/src/data/mapMeta.json`.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

REPO_ROOT = Path(__file__).resolve().parent.parent
TARGET_SIZE = 4096
DEFAULT_PROJ4 = (
    "+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +k=1 "
    "+x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
)


def find_source_image() -> Path:
    """Locate the ~330 MB Lunar South Pole .tif or .png in repo or ~/Downloads."""
    preferred = REPO_ROOT / "LRO_WAC_Mosaic_SPole60_100mp.tif"
    if preferred.is_file():
        return preferred

    search_roots = [REPO_ROOT, REPO_ROOT / "data", Path.home() / "Downloads"]
    candidates: list[Path] = []
    for root in search_roots:
        if not root.exists():
            continue
        for ext in ("*.tif", "*.tiff", "*.TIF", "*.png", "*.PNG"):
            for p in root.rglob(ext):
                if ".git" in p.parts or ".venv" in p.parts or "node_modules" in p.parts:
                    continue
                if p.stat().st_size > 100 * 1024 * 1024:
                    candidates.append(p)
    if not candidates:
        raise FileNotFoundError("Could not find a >100 MB Lunar South Pole .tif or .png file.")
    # Prefer GeoTIFFs over plain PNGs
    candidates.sort(key=lambda p: (0 if p.suffix.lower() in {".tif", ".tiff"} else 1, -p.stat().st_size))
    return candidates[0]


def process_geotiff(src_path: Path, out_png: Path) -> dict:
    """Read bounds/CRS from GeoTIFF, downsample to 4096x4096 PNG, return metadata."""
    with rasterio.open(src_path) as ds:
        bounds = ds.bounds
        proj4_str = ds.crs.to_proj4() if ds.crs else DEFAULT_PROJ4
        # Clean "+no_defs=True" to "+no_defs" for proj4js compatibility
        proj4_str = proj4_str.replace("+no_defs=True", "+no_defs")
        band = ds.read(1)
        src_width, src_height = ds.width, ds.height

    img = Image.fromarray(band, mode="L")
    resized = img.resize((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out_png, format="PNG", optimize=True)

    return {
        "sourceFile": src_path.name,
        "sourceSize": [src_width, src_height],
        "width": TARGET_SIZE,
        "height": TARGET_SIZE,
        "proj4": proj4_str,
        "bounds": {
            "xmin": float(bounds.left),
            "ymin": float(bounds.bottom),
            "xmax": float(bounds.right),
            "ymax": float(bounds.top),
        },
        "metersPerPixel": float((bounds.right - bounds.left) / TARGET_SIZE),
    }


def process_plain_png(src_path: Path, out_png: Path) -> dict:
    """Crop black margin around circular Moon disk, downsample, calibrate 60S bounds."""
    with Image.open(src_path) as img:
        gray = img.convert("L")
        arr = np.asarray(gray)

    mask = arr > 8
    ys, xs = np.where(mask)
    if len(xs) == 0 or len(ys) == 0:
        raise ValueError("Source PNG appears completely black.")

    cx = 0.5 * (xs.min() + xs.max())
    cy = 0.5 * (ys.min() + ys.max())
    half_span = 0.5 * max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.01
    crop_box = (
        int(round(cx - half_span)),
        int(round(cy - half_span)),
        int(round(cx + half_span)),
        int(round(cy + half_span)),
    )
    cropped = gray.crop(crop_box)
    resized = cropped.resize((TARGET_SIZE, TARGET_SIZE), Image.Resampling.LANCZOS)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out_png, format="PNG", optimize=True)

    # Stereographic radius at 60S: 2 * R * tan(pi/12) ~= 931147 m
    r_moon = 1737400.0
    r_60s = 2.0 * r_moon * np.tan(np.radians(15.0)) * 1.01
    return {
        "sourceFile": src_path.name,
        "sourceSize": list(gray.size),
        "width": TARGET_SIZE,
        "height": TARGET_SIZE,
        "proj4": DEFAULT_PROJ4,
        "bounds": {
            "xmin": float(-r_60s),
            "ymin": float(-r_60s),
            "xmax": float(r_60s),
            "ymax": float(r_60s),
        },
        "metersPerPixel": float((2.0 * r_60s) / TARGET_SIZE),
    }


def main() -> None:
    src_path = find_source_image()
    out_png = REPO_ROOT / "frontend" / "public" / "south_pole.png"
    out_meta = REPO_ROOT / "frontend" / "src" / "data" / "mapMeta.json"

    if src_path.suffix.lower() in {".tif", ".tiff"}:
        meta = process_geotiff(src_path, out_png)
    else:
        meta = process_plain_png(src_path, out_png)

    out_meta.parent.mkdir(parents=True, exist_ok=True)
    out_meta.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    size_mb = out_png.stat().st_size / (1024 * 1024)
    print(f"Source: {src_path}")
    print(f"Saved:  {out_png} ({size_mb:.2f} MB)")
    print(f"Meta:   {out_meta}")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
