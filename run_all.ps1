# run_all.ps1: yeshaghal el validation kolo w yeftah el app (Windows PowerShell)
# Run from C:\rimlight:   powershell -ExecutionPolicy Bypass -File run_all.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$py = "$PSScriptRoot\.venv\Scripts\python.exe"

Write-Host "== 1. Stages 1-3 for every site in data\sites.json" -ForegroundColor Cyan
Push-Location backend
& $py run_site.py

Write-Host "== 2. Searching for the best spot near Connecting Ridge (about 30 s)" -ForegroundColor Cyan
& $py find_best_spot.py -89.4667 -136.6667 1000 125

Write-Host "== 3. Map image for the website" -ForegroundColor Cyan
& $py make_map_image.py | Out-Null
Pop-Location

Write-Host "== 4. Starting backend + frontend in two new windows" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; & '$py' -m uvicorn app:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"
Start-Sleep -Seconds 6
Start-Process "http://localhost:5173"
Write-Host "DONE: the app opens in your browser. Paste the numbers from steps 1 and 2 into the chat." -ForegroundColor Green
