# LandsurvConnector - Manual Testing Guide

## Installation Status ✓
- **DLL**: Installed to `C:\Program Files\LandSurv.ai\LandsurvConnector.dll`
- **Version**: 0.1.0.0
- **Status**: Ready for Civil 3D

## Testing Steps

### Method 1: Command Line (Automated)
The DLL needs to be registered with Civil 3D. Run this in an elevated prompt:

```powershell
# Register the DLL with Civil 3D
netsh add isa vendor_code="LANDSURV" vendor_name="LandSurv.ai"

# Or use the NETLOAD command in Civil 3D:
# Command: NETLOAD
# File: C:\Program Files\LandSurv.ai\LandsurvConnector.dll
```

### Method 2: In Civil 3D GUI
1. Open Civil 3D 2026
2. In the Command Line, type: `NETLOAD`
3. Browse to: `C:\Program Files\LandSurv.ai\LandsurvConnector.dll`
4. Click Open
5. You should see: "LandsurvConnector plugin loaded successfully"
6. Type the command: `LandsurvAI`

### Method 3: Via Plugin Manager
1. In Civil 3D, go to: **Manage > Applications > Manage Applications**
2. Click **Load Application**
3. Select: `C:\Program Files\LandSurv.ai\LandsurvConnector.dll`
4. The plugin will be loaded
5. Type command: `LandsurvAI`

## Expected Behavior

When you run the `LandsurvAI` command:

1. **Configuration Check**: 
   - Validates API Key (from config.json or environment variable)
   - Validates License Key (from environment variable)
   - Warns if not configured

2. **WebSocket Connection**:
   - Connects to: `wss://c3dmcp.landsurv.ai/ws`
   - Server URL: configurable in config.json

3. **On Success**:
   - "✓ Connected to Landsurv AI Server"
   - Session ID displayed
   - Ready to execute commands

4. **On Failure**:
   - Error message explaining the issue
   - Check API key, License key, or network connectivity

## Configuration

### Environment Variables (Recommended)
Set these before launching Civil 3D:
```powershell
$env:LANDSURV_API_KEY = "your-api-key-here"
$env:LANDSURV_LICENSE_KEY = "your-license-key-here"
```

### Or via Config File
Location: `%APPDATA%\LandsurvConnector\config.json`

Example:
```json
{
  "ApiKey": "your-api-key-here",
  "LicenseKey": "your-license-key-here",
  "ServerUrl": "wss://c3dmcp.landsurv.ai/ws"
}
```

## Troubleshooting

### DLL Won't Load
- **Cause**: Missing dependencies (WebSocket, Newtonsoft.Json)
- **Solution**: Dependencies should be in the same folder
- **Check**: `C:\Program Files\LandSurv.ai\LandsurvConnector.deps.json`

### Command Not Found
- **Cause**: DLL not loaded with NETLOAD
- **Solution**: Follow "Method 2" above to load the DLL first

### Connection Failed
- **Check 1**: API Key is set correctly
- **Check 2**: License Key is set correctly
- **Check 3**: Server is reachable (ping c3dmcp.landsurv.ai)
- **Check 4**: Network connectivity (no proxy blocking websocket)

### Invalid API Key Format
- **Cause**: API key doesn't match expected format
- **Solution**: Get valid API key from backend at `/api/auth/apikeys/generate`

### License Key Expired
- **Cause**: License key has expired
- **Solution**: Renew license key or contact support

## Files Installed

| File | Size | Purpose |
|------|------|---------|
| LandsurvConnector.dll | 29 KB | Main plugin DLL |
| LandsurvConnector.dll.config | 690 B | App configuration |
| LandsurvConnector.deps.json | 3 KB | Dependency manifest |
| LandsurvConnector.pdb | 19 KB | Debug symbols |

## Server Information

- **Production Server**: `wss://c3dmcp.landsurv.ai/ws`
- **Backend API**: `https://landsurv-backend-y55gmt77ga-uw.a.run.app`
- **Status**: Live and operational

## Next Steps

After successful connection:
1. Commands from the backend will be executed in Civil 3D
2. Results are sent back to the server
3. The connector acts as a bridge for automated drawing operations

---

For issues or support, check the configuration and error messages in Civil 3D's Command Line output.
