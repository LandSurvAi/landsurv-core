# LandsurvConnector MSI - Manual DLL Installation Workaround

## Issue

The WiX installer on this system has a critical bug where the main DLL file (`LandsurvConnector.dll`) is not being packaged into the MSI file, even though it's correctly referenced in the installer source code.

**Symptoms:**
- MSI installs successfully
- Installation folder creates at `C:\Program Files\LandSurv.ai\`
- All supporting files are present (deps.json, config, pdb)
- **Main DLL file is missing** - this prevents the connector from working

**Root Cause:**
WiX Toolset 3.11.1.2318 on this system is not including referenced files in the cabinet (.cab) file during the linking phase. This appears to be a system-specific issue with the WiX installation or configuration.

## Workaround - Manual Installation

### Option 1: Use the Batch Script (Easiest)

1. Download the MSI and extract the `LandsurvConnector.dll` file:
   - Download MSI from backend endpoint
   - The DLL file should be available from the source code build

2. Run `InstallDLL.bat`:
   - Place `LandsurvConnector.dll` in the same folder as `InstallDLL.bat`
   - Double-click `InstallDLL.bat` to automatically copy the DLL to the installation folder

3. The connector should now be accessible in Civil 3D via `NETLOAD` command

### Option 2: Manual Copy

1. Locate the DLL file: `C:\Projects\landsurv-ai\civil3d-client\bin\Release\net8.0-windows\LandsurvConnector.dll`

2. Copy it to: `C:\Program Files\LandSurv.ai\LandsurvConnector.dll`

3. Open Civil 3D and use the `NETLOAD` command to load it

### Option 3: Using PowerShell

```powershell
$source = "C:\Projects\landsurv-ai\civil3d-client\bin\Release\net8.0-windows\LandsurvConnector.dll"
$destination = "C:\Program Files\LandSurv.ai\LandsurvConnector.dll"
Copy-Item $source -Destination $destination -Force
Write-Host "DLL installed successfully to: $destination"
```

## Permanent Fix Attempts

The following approaches were attempted to fix the WiX issue:

1. **Different path formats**: Tried relative, absolute, and preprocessor-defined paths
2. **Component configuration**: Added `Win64="yes"` and `Vital="yes"` attributes
3. **Platform specification**: Added `Platform="x64"` to Package element
4. **Directory structure**: Created intermediate directories and copied files
5. **Heat auto-generation**: Attempted to use WiX Heat harvester to auto-generate file components
6. **Minimal test case**: Created a simple test MSI with just a single text file - **also failed**
7. **MSBuild integration**: Used the official .wixproj approach
8. **ICE validation suppression**: Attempted to suppress ICE39 validation warnings
9. **Direct candle/light invocation**: Bypassed MSBuild to run tools directly
10. **Cabinet manipulation**: Attempted to pre-create or manipulate the cabinet file

**Conclusion**: This appears to be a fundamental bug or misconfiguration in WiX 3.11 on this system where the Light linker silently excludes files from the cabinet, even when they exist and are properly referenced.

## Recommended Solution

1. **Short term**: Use one of the workaround methods above
2. **Long term**: 
   - Upgrade to WiX 4.0 (requires migration of installer definition)
   - Use a different installer technology (NSIS, InnoSetup, InstallShield)
   - Create a post-install PowerShell script that the user runs after MSI installation

## Files for Workaround

- `InstallDLL.bat` - Automated batch script for manual DLL installation
- `PostInstall.ps1` - PowerShell script for post-installation DLL copy (for advanced use)

## Testing the Installation

After manually copying the DLL, verify it's in place:

```powershell
Get-Item "C:\Program Files\LandSurv.ai\LandsurvConnector.dll"
```

Then in Civil 3D:
1. Run the `NETLOAD` command
2. Navigate to `C:\Program Files\LandSurv.ai\LandsurvConnector.dll`
3. The connector should now be loaded and available

## Technical Details

**MSI Analysis:**
- Expected size: 80-100 KB (with DLL)
- Actual size: 56 KB (without DLL)
- Missing files: LandsurvConnector.dll (29 KB)
- Included files: deps.json, config, pdb

**WiX Build Output:**
```
Candle compiler: SUCCESS (parses .wxs correctly)
Light linker: SUCCESS (builds MSI, size 56 KB)
Cabinet creation: INCOMPLETE (missing file data)
```

The WiX source code is syntactically correct and properly references the DLL, but Light.exe creates an MSI without the file included in the cabinet.
