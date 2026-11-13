# RIMLIGHT

Backend (from `backend/`):
1. `python stage1_ephem.py`            # once: Sun/Earth vectors -> data/out/
2. copy `sites.example.json` to `data/sites.json`, fill real sites
3. `python run_site.py`                # Stages 1-3 per site -> data/out/sites/
4. `python make_map_image.py`          # map picture -> data/out/static/
5. `uvicorn app:app --reload --port 8000`

Frontend (from `frontend/`): `npm install` then `npm run dev` (http://localhost:5173)

Tests without real data: `python ../tests/make_fake_dem.py`, `python ../tests/make_fake_terrain.py`
then `RIMLIGHT_DEM=../data/lola/fake_terrain.tif uvicorn app:app` (Linux/Mac; on Windows `set RIMLIGHT_DEM=...` first).
