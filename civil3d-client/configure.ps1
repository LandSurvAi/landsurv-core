#!/usr/bin/env pwsh
# LandsurvConnector Configuration Setup
# Run this after installing the MSI to configure your API key

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  LandsurvConnector Configuration Setup            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Create config directory
$configDir = "$env:APPDATA\LandsurvConnector"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force > $null
    Write-Host "Created config directory: $configDir" -ForegroundColor Green
}

$configFile = "$configDir\config.json"

Write-Host ""
Write-Host "SETUP INSTRUCTIONS" -ForegroundColor Yellow
Write-Host "──────────────────────────────────────────────────"
Write-Host ""
Write-Host "1. Go to: https://landsurv.ai" -ForegroundColor White
Write-Host "2. Log in to your account" -ForegroundColor White
Write-Host "3. Go to: Settings > API Keys" -ForegroundColor White
Write-Host "4. Click: Generate New API Key" -ForegroundColor White
Write-Host "5. Copy the API key (starts with 'lsa_')" -ForegroundColor White
Write-Host "6. Paste it below when prompted" -ForegroundColor White
Write-Host ""

# Get API key from user
$apiKey = Read-Host "Enter your API key"
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    Write-Host "ERROR: API key cannot be empty" -ForegroundColor Red
    exit 1
}

# Validate API key format
if (-not $apiKey.StartsWith("lsa_")) {
    Write-Host "WARNING: API key should start with 'lsa_'" -ForegroundColor Yellow
    $confirm = Read-Host "Continue anyway? (y/n)"
    if ($confirm -ne "y") {
        exit 0
    }
}

# Get license key (optional)
Write-Host ""
Write-Host "Enter your License Key (press Enter to skip):" -ForegroundColor Cyan
$licenseKey = Read-Host

# Create config object
$config = @{
    ApiKey = $apiKey
    LicenseKey = if ([string]::IsNullOrWhiteSpace($licenseKey)) { "" } else { $licenseKey }
    ServerUrl = "wss://c3dmcp.landsurv.ai/ws"
    ClientVersion = "0.1.0"
    ConfiguredAt = (Get-Date -Format "o")
} | ConvertTo-Json

# Save config
try {
    Set-Content -Path $configFile -Value $config -Force
    Write-Host ""
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Configuration saved to: $configFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "NEXT STEPS:" -ForegroundColor Yellow
    Write-Host "1. Open Civil 3D 2026" -ForegroundColor White
    Write-Host "2. Open or create a drawing" -ForegroundColor White
    Write-Host "3. In Command Line, type: NETLOAD" -ForegroundColor White
    Write-Host "4. Select: C:\Program Files\LandSurv.ai\LandsurvConnector.dll" -ForegroundColor White
    Write-Host "5. Type command: LandsurvAI" -ForegroundColor White
    Write-Host ""
    Write-Host "The connector will now connect to the server!" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "ERROR: Failed to save configuration" -ForegroundColor Red
    Write-Host "Message: $_" -ForegroundColor Red
    exit 1
}
