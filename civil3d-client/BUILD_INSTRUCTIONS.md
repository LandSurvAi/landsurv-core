# Building the LandsurvConnector MSI Installer

## Prerequisites

You'll need Visual Studio 2019 or 2022 with:
- .NET desktop development workload
- Civil 3D SDK (or references to Civil 3D DLLs)

## Option 1: Build in Visual Studio (Recommended)

1. Open `LandsurvConnector.csproj` in Visual Studio
2. Set Configuration to **Release**
3. Build > Build Solution
4. The compiled assembly is in `bin\Release\net8.0-windows\LandsurvConnector.dll`
5. The release script also refreshes the direct-load copies in `bin\Release\LandsurvConnector.dll` and `bin\Release\LandsurvConnector-v<version>.dll` so the file you NETLOAD is the current build, not a stale one left behind from an older run.

## Option 2: Command Line Build

```powershell
# Using MSBuild
cd civil3d-client
msbuild LandsurvConnector.csproj /p:Configuration=Release /t:Restore,Build
```

## Creating the MSI Installer

### Using WiX Toolset (Professional)

1. Install WiX Toolset v3.11: https://wixtoolset.org/releases/
2. Create a WiX installer project or use an existing template
3. Package the DLL from `bin\Release\`

### Manual Package (Quick Solution)

Since you don't have Visual Studio installed on this machine, here's what to do:

1. **On a development machine with Visual Studio:**
   - Clone the repository
   - Open civil3d-client\LandsurvConnector.csproj
   - Build in Release mode
   - The DLL will be in bin\Release\

2. **Create a simple installer:**
   - Use Inno Setup (free): https://jrsoftware.org/isinfo.php
   - Or create a ZIP file with installation instructions

## For Now: Pre-built DLL Distribution

If you have a pre-built DLL, you can:

1. Create a GitHub Release
2. Upload the DLL as a release asset
3. Include installation instructions:

```
Installation Instructions:
1. Download LandsurvConnector.dll
2. Open Civil 3D
3. Type: NETLOAD
4. Browse to and select LandsurvConnector.dll
5. Type: LandsurvAI to activate
```

## Alternative: Docker Build (Cross-Platform)

You could set up a Docker container with Visual Studio Build Tools to build the MSI in CI/CD.

