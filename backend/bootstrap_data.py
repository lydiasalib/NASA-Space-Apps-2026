"""
bootstrap_data.py — Auto-bootstrap NASA SPICE kernels, LOLA South Pole DEM,
sites.json, and precomputed Stage 1–3 outputs on container startup.

Usage (from project root or backend/):
    python backend/bootstrap_data.py
"""
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import DATA, KERNELS, LOLA, OUT, DEM_80  # noqa: E402

NAIF_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
SPICE_KERNEL_URLS = {
    "naif0012.tls": f"{NAIF_BASE}/lsk/naif0012.tls",
    "pck00011.tpc": f"{NAIF_BASE}/pck/pck00011.tpc",
    "moon_pa_de440_200625.bpc": f"{NAIF_BASE}/pck/moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf": f"{NAIF_BASE}/fk/satellites/moon_de440_250416.tf",
    "de440.bsp": f"{NAIF_BASE}/spk/planets/de440.bsp",
}

PGDA_PRODUCT_90_URL = "https://pgda.gsfc.nasa.gov/products/90"
PGDA_FALLBACK_URLS = [
    "https://pgda.gsfc.nasa.gov/data/LOLA_80mpp/LDEM_80S_80MPP_ADJ.TIF",
    "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/80mpp/LDEM_80S_80MPP_ADJ.TIF",
    "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF",
]


def _download(url: str, dest: Path, label: str = "") -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    tag = label or dest.name
    print(f"[bootstrap] Downloading {tag} from {url} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "RIMLIGHT-Bootstrap/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(tmp, "wb") as out_f:
        total = int(resp.headers.get("Content-Length") or 0)
        read_bytes = 0
        next_pct = 20
        while True:
            chunk = resp.read(1024 * 256)
            if not chunk:
                break
            out_f.write(chunk)
            read_bytes += len(chunk)
            if total > 0:
                pct = int(read_bytes * 100 / total)
                if pct >= next_pct:
                    print(
                        f"[bootstrap]   {tag}: {pct}% ({read_bytes / (1024 * 1024):.1f} MB)",
                        flush=True,
                    )
                    next_pct += 20
    tmp.replace(dest)
    size_mb = dest.stat().st_size / (1024 * 1024)
    print(f"[bootstrap] Saved {dest} ({size_mb:.2f} MB)", flush=True)


def ensure_kernels() -> None:
    KERNELS.mkdir(parents=True, exist_ok=True)
    for name, url in SPICE_KERNEL_URLS.items():
        target = KERNELS / name
        if target.exists() and target.stat().st_size > 0:
            continue
        _download(url, target, label=f"SPICE kernel {name}")


def _discover_pgda_dem_url() -> list[str]:
    urls = []
    env_url = os.environ.get("RIMLIGHT_DEM_URL", "").strip()
    if env_url:
        urls.append(env_url)
    try:
        req = urllib.request.Request(
            PGDA_PRODUCT_90_URL, headers={"User-Agent": "RIMLIGHT-Bootstrap/1.0"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        matches = re.findall(
            r'href=["\']([^"\']*LDEM_80S_80MPP_ADJ\.TIF)["\']', html, flags=re.IGNORECASE
        )
        for href in matches:
            resolved = urllib.parse.urljoin(PGDA_PRODUCT_90_URL, href)
            if resolved not in urls:
                urls.append(resolved)
    except Exception as exc:
        print(f"[bootstrap] Note: could not scrape {PGDA_PRODUCT_90_URL}: {exc}", flush=True)

    for fallback in PGDA_FALLBACK_URLS:
        if fallback not in urls:
            urls.append(fallback)
    return urls


def ensure_lola_dem() -> None:
    LOLA.mkdir(parents=True, exist_ok=True)
    if DEM_80.exists() and DEM_80.stat().st_size > 1_000_000:
        return

    candidate_urls = _discover_pgda_dem_url()
    last_err = None
    for url in candidate_urls:
        try:
            _download(url, DEM_80, label="LOLA South Pole DEM (LDEM_80S_80MPP_ADJ.TIF)")
            if DEM_80.exists() and DEM_80.stat().st_size > 1_000_000:
                return
        except Exception as exc:
            last_err = exc
            print(f"[bootstrap] Warning: DEM download failed from {url}: {exc}", flush=True)

    raise RuntimeError(
        f"Failed to download LDEM_80S_80MPP_ADJ.TIF from NASA PGDA Product 90 ({last_err})"
    )


def ensure_sites_json() -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    sites_json = DATA / "sites.json"
    example_json = ROOT_DIR / "sites.example.json"
    if not sites_json.exists() and example_json.exists():
        shutil.copyfile(example_json, sites_json)
        print(f"[bootstrap] Copied {example_json.name} -> {sites_json}", flush=True)
    return sites_json


def ensure_precomputed_outputs(sites_json: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sites_out_dir = OUT / "sites"
    sites_out_dir.mkdir(parents=True, exist_ok=True)

    # Stage 1: SPICE ephemeris vectors (ets.npy, sun_vec.npy, earth_vec.npy)
    ephem_files = [OUT / "ets.npy", OUT / "sun_vec.npy", OUT / "earth_vec.npy"]
    if not all(f.exists() and f.stat().st_size > 0 for f in ephem_files):
        print("[bootstrap] Computing Stage 1 SPICE ephemeris vectors ...", flush=True)
        import stage1_ephem

        stage1_ephem.cache_vectors()

    # Stage 2 & 3: Precompute curated South Pole sites if missing
    if sites_json.exists():
        sites = json.loads(sites_json.read_text())
        missing = [
            s["id"]
            for s in sites
            if not (sites_out_dir / f"{s['id']}.json").exists()
            or not (sites_out_dir / f"{s['id']}.npz").exists()
        ]
        if missing:
            print(f"[bootstrap] Precomputing {len(missing)} site(s): {missing} ...", flush=True)
            import run_site

            run_site.main()


def main() -> None:
    print("[bootstrap] Checking RIMLIGHT NASA dataset & precomputed caches ...", flush=True)
    ensure_kernels()
    ensure_lola_dem()
    sites_json = ensure_sites_json()
    ensure_precomputed_outputs(sites_json)
    print("[bootstrap] All data ready.", flush=True)


if __name__ == "__main__":
    main()
