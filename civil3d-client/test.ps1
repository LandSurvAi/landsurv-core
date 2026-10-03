#!/usr/bin/env pwsh
# Test the installed LandsurvConnector

Write-Host "=== LandsurvConnector Test ===" -ForegroundColor Green
Write-Host ""

$installDir = "C:\Program Files\LandSurv.ai"

# Check files
Write-Host "Checking installation..." -ForegroundColor Yellow
$dll = Join-Path $installDir "LandsurvConnector.dll"
$config = Join-Path $installDir "LandsurvConnector.dll.config"
$deps = Join-Path $installDir "LandsurvConnector.deps.json"
$pdb = Join-Path $installDir "LandsurvConnector.pdb"

Write-Host "DLL: $(if(Test-Path $dll) {'OK'} else {'MISSING'})" -ForegroundColor $(if(Test-Path $dll) {'Green'} else {'Red'})
Write-Host "Config: $(if(Test-Path $config) {'OK'} else {'MISSING'})" -ForegroundColor $(if(Test-Path $config) {'Green'} else {'Red'})
Write-Host "Deps: $(if(Test-Path $deps) {'OK'} else {'MISSING'})" -ForegroundColor $(if(Test-Path $deps) {'Green'} else {'Red'})
Write-Host "PDB: $(if(Test-Path $pdb) {'OK'} else {'MISSING'})" -ForegroundColor $(if(Test-Path $pdb) {'Green'} else {'Red'})

Write-Host ""

# Test DLL load
Write-Host "Loading DLL..." -ForegroundColor Yellow
try {
    $asm = [System.Reflection.Assembly]::LoadFrom($dll)
    Write-Host "Assembly loaded: $($asm.GetName().Name) v$($asm.GetName().Version)" -ForegroundColor Green
}
catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
    exit 1
}

# Check Civil 3D
Write-Host ""
Write-Host "Checking Civil 3D..." -ForegroundColor Yellow
$cadProc = Get-Process acad -ErrorAction SilentlyContinue
if ($cadProc) {
    Write-Host "Civil 3D is running" -ForegroundColor Green
    Write-Host ""
    Write-Host "READY TO TEST!" -ForegroundColor Green
    Write-Host "Run command in Civil 3D: LandsurvAI" -ForegroundColor Cyan
}
else {
    Write-Host "Civil 3D is not running" -ForegroundColor Yellow
}

Write-Host ""
