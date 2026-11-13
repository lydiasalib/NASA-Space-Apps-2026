# setup.ps1: ye7aded kol 7aga lel project mara wa7da (Windows PowerShell)
# Run from the rimlight folder (where backend/ and frontend/ are, after unzipping rimlight_code.zip):
#   powershell -ExecutionPolicy Bypass -File setup.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host "== 1. Checking Python" -ForegroundColor Cyan
python --version
if ($LASTEXITCODE -ne 0) { throw "Python not found. Install Python 3.11/3.12 and tick 'Add to PATH'." }

Write-Host "== 2. Folders" -ForegroundColor Cyan
"data\kernels","data\lola","data\out" | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }

Write-Host "== 3. Virtual environment + libraries" -ForegroundColor Cyan
if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install numpy scipy matplotlib spiceypy rasterio pyproj pillow fastapi uvicorn
& .\.venv\Scripts\python.exe -c "import numpy, scipy, spiceypy, rasterio, pyproj, fastapi; print('python libs ok')"

Write-Host "== 4. SPICE kernels (Stage 1)" -ForegroundColor Cyan
$naif = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
$kernels = @{
  "naif0012.tls"             = "$naif/lsk/naif0012.tls"
  "pck00011.tpc"             = "$naif/pck/pck00011.tpc"
  "moon_pa_de440_200625.bpc" = "$naif/pck/moon_pa_de440_200625.bpc"
  "moon_de440_250416.tf"     = "$naif/fk/satellites/moon_de440_250416.tf"
  "de440.bsp"                = "$naif/spk/planets/de440.bsp"
}
foreach ($k in $kernels.Keys) {
  $dst = "data\kernels\$k"
  if (Test-Path $dst) { Write-Host "  have $k"; continue }
  Write-Host "  downloading $k ..."
  Invoke-WebRequest -Uri $kernels[$k] -OutFile $dst
}

Write-Host "== 5. Frontend (only if Node is installed)" -ForegroundColor Cyan
if (Get-Command npm -ErrorAction SilentlyContinue) {
  Push-Location frontend; npm install; Pop-Location
} else {
  Write-Host "  Node not found: install Node.js LTS, then run 'npm install' inside frontend\" -ForegroundColor Yellow
}

Write-Host "== 6. Quick tests" -ForegroundColor Cyan
Push-Location backend
& ..\.venv\Scripts\python.exe -c "import numpy as np; from stage3_vis import *; from fake_data import *; m=fake_mask(); print('stage 3 disc check:', sun_fraction(np.zeros(3), skyline_at(m,0)+np.array([0.265,0,-0.265]), m))"
& ..\.venv\Scripts\python.exe -c "from stage1_ephem import load_kernels; import spiceypy as s; load_kernels(); print('stage 1 kernels ok, Sun distance km:', round(float((sum(x*x for x in s.spkpos('SUN', s.str2et('2026-11-13'), 'MOON_ME', 'LT+S', 'MOON')[0]))**0.5)))"
Pop-Location

Write-Host ""
Write-Host "DONE. Still to do by hand:" -ForegroundColor Green
Write-Host "  - Download LDEM_80S_80MPP_ADJ.TIF (and optionally LDEM_80S_80MPP_ADJ_HILL.TIF) from https://pgda.gsfc.nasa.gov/products/90 into data\lola\"
Write-Host "  - Copy sites.example.json to data\sites.json and fill the real sites"
Write-Host "  - Then: cd backend; ..\.venv\Scripts\activate; python stage1_ephem.py; python run_site.py"
