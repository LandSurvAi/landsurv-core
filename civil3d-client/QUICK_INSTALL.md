# LandsurvConnector Quick Install Guide

## Installation Steps

### Step 1: Download
Download `LandsurvConnector.zip` from the website

### Step 2: Extract
Extract the ZIP file to a temporary folder

### Step 3: Load in Civil 3D
1. Open Civil 3D 2026
2. At the command line, type: `NETLOAD`
3. Browse to and select `LandsurvConnector.dll`
4. Click "Open"

### Step 4: Activate
1. Type: `LANDSURVAI` at the Civil 3D command line
2. A dialog should appear with the LandsurvConnector logo
3. You're ready to use LandsurvConnector!

### Troubleshooting

**"NETLOAD command not found"**
- Make sure you're in Civil 3D (not regular AutoCAD)
- If using AutoCAD instead, you need Civil 3D

**"Error loading assembly"**
- Make sure you extracted the ZIP file completely
- Ensure the path to the DLL has no special characters

**"LANDSURVAI command not found"**
- The NETLOAD may not have succeeded
- Try NETLOAD again and check for error messages

## Uninstall

Simply delete the `LandsurvConnector.dll` file. No registry entries are created.

## System Requirements

- Civil 3D 2026 (also compatible with 2024, 2025 with minor changes)
- Windows 10 or Windows 11
- .NET 8.0 Runtime (included with Civil 3D)

## Support

For help, visit: https://landsurv.ai/support
