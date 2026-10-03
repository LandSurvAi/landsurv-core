# Package LandsurvConnector for Distribution
$ErrorActionPreference = "Stop"

Write-Host "Packaging LandsurvConnector for Distribution..." -ForegroundColor Cyan

$sourceDir = $PSScriptRoot
$buildDir = Join-Path $sourceDir "bin\Release\net8.0-windows"
$outputDir = Join-Path $sourceDir "published"

# Create output directory
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# Create package directory
$packageDir = "$outputDir\LandsurvConnector"
if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
New-Item -ItemType Directory -Path $packageDir | Out-Null

# Copy DLL and dependencies
Write-Host "Copying binaries..."
Copy-Item "$buildDir\LandsurvConnector.dll" -Destination $packageDir
Copy-Item "$buildDir\LandsurvConnector.pdb" -Destination $packageDir
Copy-Item "$buildDir\LandsurvConnector.dll.config" -Destination $packageDir
Copy-Item "$buildDir\LandsurvConnector.deps.json" -Destination $packageDir

# Copy documentation
Write-Host "Copying documentation..."
Copy-Item "$sourceDir\QUICK_INSTALL.md" -Destination "$packageDir\INSTALL.md"
Copy-Item "$sourceDir\README.md" -Destination "$packageDir\README.md"

# Create ZIP file
Write-Host "Creating ZIP file..."
$zipPath = "$outputDir\LandsurvConnector.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($packageDir, $zipPath)

Write-Host "✓ Package created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Distribution Files:"
Write-Host "  Installer: $zipPath"
Write-Host "  Size: $((Get-Item $zipPath).Length / 1MB)MB"
Write-Host ""
Write-Host "Upload this file to your download server and update the ConnectorDownload page."

