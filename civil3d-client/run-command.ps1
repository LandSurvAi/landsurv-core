#!/usr/bin/env pwsh
# Check if LandsurvAI command is registered in Civil 3D

Write-Host "Checking if LandsurvAI command is registered..." -ForegroundColor Cyan
Write-Host ""

try {
    $acad = [System.Runtime.InteropServices.Marshal]::GetActiveObject("AutoCAD.Application")
    $doc = $acad.ActiveDocument
    
    if ($null -eq $doc) {
        Write-Host "ERROR: No active document" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Attempting to run LandsurvAI command..." -ForegroundColor Yellow
    
    # Try to execute the command
    $doc.SendCommand("LandsurvAI ")
    
    Start-Sleep -Seconds 1
    
    Write-Host "Command sent to Civil 3D" -ForegroundColor Green
    Write-Host ""
    Write-Host "Check Civil 3D command line for output" -ForegroundColor Cyan
}
catch {
    Write-Host "ERROR: $_" -ForegroundColor Red
}
