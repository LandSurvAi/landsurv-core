# Post-installation script for LandsurvConnector
# This script manually copies the DLL file if it wasn't included in the MSI

$installFolder = "C:\Program Files\LandSurv.ai"
$dllName = "LandsurvConnector.dll"
$sourceDll = Join-Path $PSScriptRoot $dllName
$targetDll = Join-Path $installFolder $dllName

# Check if DLL is missing from installation folder
if (-not (Test-Path $targetDll)) {
    Write-Host "DLL file not found in installation folder. Attempting to copy from source..."
    
    # Try to copy from the script's directory (if running from installer)
    if (Test-Path $sourceDll) {
        try {
            Copy-Item $sourceDll -Destination $targetDll -Force
            Write-Host "Successfully copied $dllName to $installFolder"
        }
        catch {
            Write-Host "Error copying DLL: $_"
            exit 1
        }
    }
    else {
        Write-Host "Source DLL not found at: $sourceDll"
        exit 1
    }
}
else {
    Write-Host "$dllName already exists in $installFolder"
}

exit 0
