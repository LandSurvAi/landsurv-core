# LandSurv Connector for AutoCAD 2026 - Installation Guide

## System Requirements

- **AutoCAD 2026** (required - .NET 8 support)
- **Windows 10 or later** (x64)
- **.NET 8 Runtime** (included with AutoCAD 2026)
- **Internet connection** for cloud connectivity

## Installation Steps

### 1. Download the Plugin

Download `LandsurvConnector-v0.1.0-alpha.zip` from the [GitHub Releases](https://github.com/YOUR_REPO/releases) page.

### 2. Extract Files

Extract the ZIP file to a permanent location on your system, such as:
```
C:\Program Files\LandSurv\AutoCAD Connector\
```

The package contains:
- `LandsurvConnector.dll` - Main plugin (22 KB)
- `websocket-sharp.dll` - WebSocket client library
- `Newtonsoft.Json.dll` - JSON serialization
- `System.Management.dll` - Hardware ID generation
- `System.CodeDom.dll` - Supporting library

### 3. Load the Plugin in AutoCAD

1. Launch **AutoCAD 2026**
2. Type `NETLOAD` and press **Enter**
3. Browse to the extracted folder
4. Select `LandsurvConnector.dll`
5. Click **Open**

The plugin will load and register the `LANDSURVCONNECT` command.

### 4. Configure API Access

Before first use, you'll need:
- **API Key** - Obtain from LandSurv.ai dashboard
- **Client ID** - Your registered client identifier

Visit https://landsurv.ai to create an account and generate credentials.

## Usage

### Connect to LandSurv Cloud

```
LANDSURVCONNECT
```

When prompted:
- Enter your **API Key**
- Enter your **Client ID**

The plugin will:
1. Authenticate with the LandSurv cloud server
2. Establish a secure WebSocket connection
3. Enable AI-powered surveying features

### Server Details

- **Production Server**: `wss://c3dmcp.landsurv.ai/ws`
- **Protocol**: WebSocket Secure (WSS)
- **Port**: 443 (HTTPS)

## Known Limitations (v0.1.0-alpha)

### Temporarily Disabled Features

The following features are disabled in this initial .NET 8 build:

1. **COGO Point Creation**
   - Civil 3D API integration removed
   - Points are logged but not created in the drawing
   - Will be restored in future release

2. **Chat UI**
   - WPF chat window temporarily disabled
   - Command-line interaction only

3. **WebSocket Custom Headers**
   - Authentication headers not supported in WebSocketSharp + .NET 8
   - Authentication will be implemented via message protocol
   - Planned for next release

### What Works

✅ Plugin loads in AutoCAD 2026  
✅ WebSocket connection to cloud server  
✅ Basic command registration  
✅ API key validation  
✅ Hardware ID generation  

## Troubleshooting

### "Could not load file or assembly" Error

**Solution**: Ensure all DLL files from the ZIP are in the same folder.

### "LANDSURVCONNECT command not found"

**Solution**: Re-run `NETLOAD` and verify `LandsurvConnector.dll` loads successfully.

### Connection Failures

Check:
1. Internet connectivity
2. Firewall allows outbound connections to `c3dmcp.landsurv.ai:443`
3. API credentials are correct

### Plugin Won't Load

Verify:
- You're using **AutoCAD 2026** (earlier versions use .NET Framework 4.8)
- All 5 DLL files are present in the same folder
- Folder has read permissions

## Uninstalling

1. In AutoCAD, the plugin unloads when you close the application
2. To permanently remove, delete the installation folder
3. No registry changes or system modifications are made

## Getting Help

- **Documentation**: https://civil3d.landsurv.ai
- **Issues**: https://github.com/YOUR_REPO/issues
- **Email**: support@landsurv.ai

## Version History

### v0.1.0-alpha (Current)
- Initial .NET 8 build for AutoCAD 2026
- Basic WebSocket connectivity
- API authentication
- Civil 3D features temporarily disabled

### Coming in v0.2.0
- Restore COGO point creation
- Message-based authentication
- Enhanced error reporting
- AutoCAD 2025 backward compatibility (if possible)

## Build Information

- **Target Framework**: .NET 8.0 (net8.0-windows)
- **Platform**: x64
- **AutoCAD API**: 2026
- **Build Date**: December 2025

---

**Note**: This is an **alpha release** for testing with AutoCAD 2026. Not recommended for production use.
