#!/usr/bin/env pwsh

# Build script for LandsurvConnector MSI installer using WiX 4.0
# This script builds the C# DLL and then packages it into an MSI

param(
    [string]$Configuration = "Release",
    [string]$Platform = "x64"
)

$ErrorActionPreference = "Stop"

# Add dotnet tools to PATH
$toolPath = "$env:USERPROFILE\.dotnet\tools"
if ($toolPath -notin $env:PATH.Split(";")) {
    $env:PATH = "$toolPath;$env:PATH"
}

# Colors for output
$green = [System.ConsoleColor]::Green
$yellow = [System.ConsoleColor]::Yellow
$cyan = [System.ConsoleColor]::Cyan

Write-Host ""
Write-Host "═" -ForegroundColor $green
Write-Host "  LandsurvConnector MSI Build (WiX 4.0)" -ForegroundColor $green
Write-Host "═" -ForegroundColor $green
Write-Host ""

# Step 1: Build the C# DLL
Write-Host " Building LandsurvConnector.dll..." -ForegroundColor $yellow
dotnet build "LandsurvConnector.csproj" -c $Configuration | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host " ✗ C# build failed!" -ForegroundColor Red
    exit 1
}

Write-Host " ✓ C# build successful" -ForegroundColor $green

$dllPath = "bin\$Configuration\net8.0-windows\LandsurvConnector.dll"
if (-not (Test-Path $dllPath)) {
    Write-Host " ✗ DLL file not found at: $dllPath" -ForegroundColor Red
    exit 1
}

$dllSize = (Get-Item $dllPath).Length / 1KB
Write-Host "   DLL Size: $([math]::Round($dllSize, 2)) KB" -ForegroundColor $cyan

# Step 2: Clean previous builds
Write-Host ""
Write-Host " Cleaning previous builds..." -ForegroundColor $yellow
Remove-Item -Path "bin\$Configuration\LandsurvConnector.msi" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Path "obj\$Configuration" -ErrorAction SilentlyContinue

Write-Host " ✓ Clean complete" -ForegroundColor $green

# Step 3: Build MSI using WiX 4.0
Write-Host ""
Write-Host " Building MSI with WiX 4.0..." -ForegroundColor $yellow

$wixOutput = & wix build "LandsurvConnector.wxs" -out "bin\$Configuration\LandsurvConnector.msi" -arch x64 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host " ✗ WiX build failed!" -ForegroundColor Red
    Write-Host $wixOutput
    exit 1
}

Write-Host " ✓ WiX build successful" -ForegroundColor $green

# Step 4: Verify MSI was created and check size
Write-Host ""
Write-Host " Verifying MSI..." -ForegroundColor $yellow

$msiPath = "bin\$Configuration\LandsurvConnector.msi"
if (Test-Path $msiPath) {
    $msiSize = (Get-Item $msiPath).Length / 1KB
    Write-Host " ✓ MSI created successfully" -ForegroundColor $green
    Write-Host "   Path: $msiPath" -ForegroundColor $cyan
    Write-Host "   Size: $([math]::Round($msiSize, 2)) KB" -ForegroundColor $cyan
    
    # Expected size check (should include DLL)
    if ($msiSize -gt 50) {
        Write-Host "   ✓ MSI size looks correct (includes DLL)" -ForegroundColor $green
    } else {
        Write-Host "   ⚠ WARNING: MSI size suspiciously small, may be missing DLL" -ForegroundColor Red
    }
} else {
    Write-Host " ✗ MSI file not created!" -ForegroundColor Red
    exit 1
}

# Step 5: Summary
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $green
Write-Host "  BUILD COMPLETE" -ForegroundColor $green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor $green
Write-Host ""
Write-Host " Output: bin\$Configuration\LandsurvConnector.msi" -ForegroundColor $cyan
Write-Host ""
Write-Host " To install the MSI:" -ForegroundColor $yellow
Write-Host " msiexec /i bin\$Configuration\LandsurvConnector.msi" -ForegroundColor $cyan
Write-Host ""
