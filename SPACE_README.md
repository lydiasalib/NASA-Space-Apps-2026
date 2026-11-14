---
title: RIMLIGHT Lunar South Pole Illumination API
emoji: 🌑
colorFrom: gray
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# RIMLIGHT — Lunar South Pole Illumination & Mission Planner API

FastAPI + NASA NAIF SPICE + LOLA 80 m/px South Pole DEM backend for **RIMLIGHT**.

## How It Works on Hugging Face Spaces

1. **Container Build (`Dockerfile`)**:
   - Uses `python:3.12-slim` with `rasterio`, `pyproj`, `spiceypy`, `scipy`, `numpy`, and `fastapi`.
2. **Automatic NASA Data Bootstrap (`backend/bootstrap_data.py`)**:
   - On first container startup, automatically downloads the 5 NASA NAIF SPICE kernels (`de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`) and NASA PGDA Product 90 LOLA South Pole DEM (`LDEM_80S_80MPP_ADJ.TIF`).
   - Copies `sites.example.json` to `data/sites.json` and precomputes the Stage 1–3 ephemeris & horizon caches if `data/out/` is empty.
3. **API Server**:
   - Listens on port `7860` (`uvicorn app:app --app-dir backend --host 0.0.0.0 --port 7860`).
   - Allows CORS from `https://rimlight.vercel.app`, `https://*.vercel.app`, and `http://localhost:5173`.

## Connecting Vercel Frontend

Set the environment variable in your Vercel project settings:

```env
VITE_API_URL=https://<your-hf-username>-<your-space-name>.hf.space
```
