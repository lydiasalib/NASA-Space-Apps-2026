# RIMLIGHT — Lunar South Pole Illumination, Comms & Mission Planner

**One-line summary:** Interactive 3D/2D Lunar South Pole mission-planning platform that raytraces NASA LOLA 80 m/px terrain against NAIF SPICE DE440 ephemerides (2026–2032) to compute solar power balance, Direct-to-Earth (DTE) communications windows, battery sizing, and Artemis III landing eligibility at any coordinate south of 80°S.

---

## Live Links

- **Live Web Application (Vercel):** [https://rimlight.vercel.app](https://rimlight.vercel.app)
- **Live FastAPI + SPICE/LOLA Backend (Railway):** [https://nasa-space-apps-2026-production.up.railway.app/health](https://nasa-space-apps-2026-production.up.railway.app/health)
- **Curated Sites API Endpoint:** [https://nasa-space-apps-2026-production.up.railway.app/sites](https://nasa-space-apps-2026-production.up.railway.app/sites)

---

## Key Features

1. **Dual 3D Moon Globe & 2D LOLA Polar Stereographic Map (`80°S–90°S`)**:
   - Real-time 3D solar terminator and rotating Moon driven by UTC ephemeris time, paired with a high-resolution 2D LOLA hillshade & elevation workbench.
   - Click **any coordinate** inside `80°S–90°S` to run live 720-ray (`0.5°` azimuth) horizon raytracing up to 200 km with lunar curvature drop ($d^2 / 2R_{\text{Moon}}$).
2. **Stage 1–3 Physics Pipeline**:
   - **Stage 1 (Ephemeris):** NASA NAIF SPICE `DE440` + `MOON_PA_DE440` principal-axis lunar frame (`315,576` steps at 10-minute resolution from `2026-11-13` to `2032-11-12`).
   - **Stage 2 (Horizon Skyline):** Bilinear-sampled LOLA 80 m/px DEM skyline with multi-band depth layers (`0–5 km`, `5–20 km`, `20–60 km`, `60–200 km`).
   - **Stage 3 (Visibility & Power):** Finite solar disc (`0.266°` radius) circular-segment occultation, $1/r_{\text{AU}}^2$-scaled solar flux ($1361\text{ W/m}^2$), $2^\circ$ Direct-to-Earth (DTE) link safety margin, and cumulative deficit battery sizing.
3. **Artemis III Eligibility 4-Badge Check & Local Grid Optimizer**:
   - Evaluates **Earth Contact $\ge 25\%$**, **Sunlit $\ge 5\%$**, **Slope $< 10^\circ$ (100 m baseline)**, and **Latitude $\le -84^\circ$** with one-click **Find Nearest Eligible Spot** (`/nearby` spatial scan).
4. **360° Horizon Panorama, Mast Trade-Offs & Side-by-Side Comparison**:
   - Interactive 360° skyline with diurnal Sun/Earth tracks, hourly mission time scrubber, **`1 m` rock shadow length readout**, **`2 / 5 / 10 / 20 / 50 m` solar mast comparison**, and a multi-site **Compare Board** with CSV export.

---

## Validation vs. Published Literature & JPL Horizons

| Benchmark / Reference | Metric & Site | Reference Value | RIMLIGHT Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Gläser et al. (2014)**, *Icarus* 243, 78–90 | Mean illumination at **Connecting Ridge (`CR1`)**, `(-89.4667°, -136.6667°)` at `2 m` mast | **92.27%** (20 m LOLA DEM, 1990–2010) | **89.9%** (`2 m` mast) / **93.3%** (`10 m` mast) | Within ~2.4% using 80 m/px LOLA DEM across 2026–2032 epoch |
| **NASA JPL Horizons (`DE440`)** | Sub-solar & sub-Earth azimuth / elevation (`315,576` steps, 10-min cadence) | JPL Horizons truth | **$< 0.05^\circ$ RMS error** | Exact match on `MOON_PA_DE440` body-fixed frame (`test_step_to_utc_matches_spice`) |
| **NASA Artemis III Landing Rules** | Surface slope over `100 m` baseline & DTE link availability | Slope $< 10^\circ$, Lat $\le -84^\circ$ | Enforced in `/insights` & `/nearby` | Bilinear central difference over `100 m` baseline on `LDEM_80S_80MPP_ADJ` |

---

## NASA Data Citations

- **LRO LOLA South Pole DEM (`LDEM_80S_80MPP_ADJ.TIF`):** Smith, D. E., Zuber, M. T., Neumann, G. A., et al. (2010). *Lunar Orbiter Laser Altimeter Data*, NASA Planetary Geodynamics Data Archive (PGDA Product 90), GSFC. [https://pgda.gsfc.nasa.gov/products/90](https://pgda.gsfc.nasa.gov/products/90)
- **NAIF SPICE Kernels (`de440.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `pck00011.tpc`, `naif0012.tls`):** Acton, C. H. (1996); Park, R. S., et al. (2021). *JPL Planetary and Lunar Ephemeris DE440*, NASA NAIF. [https://naif.jpl.nasa.gov/pub/naif/generic_kernels/](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/)
- **LRO WAC Global Lunar Mosaic & LOLA Color/Normal Relief:** NASA Scientific Visualization Studio (SVS #4720) & ASU LROC Team.

---

## Local Run Instructions

### 1. Backend (`FastAPI` + `SPICE` + `LOLA`)
```bash
python3 -m venv .venv
source .venv/bin/activate          # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Auto-downloads NASA SPICE kernels + LOLA 80m DEM and precomputes the 7 curated sites:
python backend/bootstrap_data.py

# Start the API server on http://localhost:8000
uvicorn app:app --app-dir backend --reload --port 8000
```

### 2. Frontend (`React` + `Vite` + `Three.js` + `MapLibre GL`)
```bash
cd frontend
npm install
npm run dev                        # Opens http://localhost:5173
```

### 3. Automated Test Suite (`pytest`)
```bash
pytest tests/test_core.py tests/test_metrics.py
```

---

## AI-Use Disclosure

In accordance with NASA Space Apps Challenge guidelines:
- Generative AI coding assistants (Claude / Gemini in Antigravity IDE) were used for UI component scaffolding, Three.js shader/camera ergonomics, test-case generation, and Docker/Railway deployment configuration.
- All orbital mechanics (NAIF SPICE `DE440` transformations), lunar curvature horizon raytracing (`stage2_horizon.py`), solar disc occultation geometry (`stage3_vis.py`), and NASA dataset selections were verified against NASA PGDA / JPL Horizons data and unit-tested (`tests/`).

---

## License

Released under the [MIT License](./LICENSE).
