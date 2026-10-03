#!/usr/bin/env pwsh
# Script to load LandsurvConnector plugin into running Civil 3D instance

Write-Host "Loading LandsurvConnector into Civil 3D..." -ForegroundColor Cyan
Write-Host ""

$dllPath = "C:\Program Files\LandSurv.ai\LandsurvConnector.dll"

# Check if DLL exists
if (-not (Test-Path $dllPath)) {
    Write-Host "ERROR: DLL not found at $dllPath" -ForegroundColor Red
    exit 1
}

# Check if Civil 3D is running
$cadProc = Get-Process acad -ErrorAction SilentlyContinue
if (-not $cadProc) {
    Write-Host "ERROR: Civil 3D is not running" -ForegroundColor Red
    Write-Host "Start Civil 3D first, then run this script" -ForegroundColor Yellow
    exit 1
}

Write-Host "Civil 3D is running (PID: $($cadProc.Id))" -ForegroundColor Green
Write-Host ""

# Try to load via COM interface
try {
    Write-Host "Attempting to load via COM..." -ForegroundColor Yellow
    
    $acad = [System.Runtime.InteropServices.Marshal]::GetActiveObject("AutoCAD.Application")
    if ($null -eq $acad) {
        throw "Cannot get AutoCAD.Application COM object"
    }
    
    Write-Host "Connected to AutoCAD" -ForegroundColor Green
    
    # Get active document
    $doc = $acad.ActiveDocument
    if ($null -eq $doc) {
        Write-Host "ERROR: No active document in Civil 3D" -ForegroundColor Red
        Write-Host "Open a drawing file first" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "Active document: $($doc.Name)" -ForegroundColor Green
    Write-Host ""
    
    # Send NETLOAD command
    Write-Host "Sending NETLOAD command..." -ForegroundColor Yellow
    $doc.SendCommand("(command ""NETLOAD"" ""$dllPath"") ")
    
    Start-Sleep -Seconds 2
    
    Write-Host ""
    Write-Host "Plugin load command sent!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Check Civil 3D's command line for load confirmation"
    Write-Host "2. Run command: LandsurvAI"
    Write-Host ""
}
catch {
    Write-Host "ERROR: Could not communicate with Civil 3D via COM" -ForegroundColor Red
    Write-Host "Message: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual alternative:" -ForegroundColor Yellow
    Write-Host "1. In Civil 3D Command Line, type: NETLOAD" -ForegroundColor Cyan
    Write-Host "2. Select: $dllPath" -ForegroundColor Cyan
    Write-Host "3. Then type: LandsurvAI" -ForegroundColor Cyan
    exit 1
}
