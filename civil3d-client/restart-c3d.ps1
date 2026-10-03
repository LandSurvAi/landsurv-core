#!/usr/bin/env pwsh
# Force restart Civil 3D with fresh DLL load

Write-Host "Restarting Civil 3D with fresh plugin load..." -ForegroundColor Yellow
Write-Host ""

# Kill Civil 3D
Write-Host "Closing Civil 3D..." -ForegroundColor Cyan
Get-Process acad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 3

Write-Host "Civil 3D closed" -ForegroundColor Green
Write-Host ""

# Clear cache (optional but helpful)
Write-Host "Clearing AutoCAD cache..." -ForegroundColor Cyan
$cacheDir = "$env:APPDATA\Autodesk\AutoCAD 2026"
if (Test-Path $cacheDir) {
    Remove-Item "$cacheDir\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Cache cleared" -ForegroundColor Green
}

Write-Host ""
Write-Host "NOTE: Civil 3D is closed. Reopen it manually." -ForegroundColor Yellow
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Cyan
Write-Host "1. Open Civil 3D 2026" -ForegroundColor White
Write-Host "2. Open or create a drawing file" -ForegroundColor White
Write-Host "3. In the Command Line, type: NETLOAD" -ForegroundColor White
Write-Host "4. Select: C:\Program Files\LandSurv.ai\LandsurvConnector.dll" -ForegroundColor White
Write-Host "5. Type command: LandsurvAI" -ForegroundColor White
Write-Host ""
