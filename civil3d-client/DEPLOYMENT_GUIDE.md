# LandsurvConnector - Deployment & Installation Guide

## Complete User Workflow

### Step 1: Get API Key from LandSurv.ai Website

1. Go to **https://landsurv.ai**
2. **Log in** to your account (or create one)
3. Navigate to **Settings > API Keys**
4. Click **"Generate New API Key"**
5. **Copy the key** (starts with `lsa_`)
   - ⚠️ **Important**: You'll only see it once - save it securely!

### Step 2: Download & Install MSI

**Option A: Direct MSI Download**
```
https://landsurv-backend-y55gmt77ga-uw.a.run.app/api/downloads/LandsurvConnector.msi
```

**Option B: From LandSurv.ai Dashboard**
1. Go to **Dashboard > Downloads**
2. Click **"Download Civil 3D Connector"**
3. Run the installer

**Installation Steps:**
1. Double-click `LandsurvConnector.msi`
2. Accept the license agreement
3. Choose installation directory (default: `C:\Program Files\LandSurv.ai`)
4. Click **Install**
5. **Do not close** the installer yet

### Step 3: Configure the Plugin

**After MSI Installation:**

1. The installer will display your **API Key configuration URL**
2. Click **"Configure Now"** button, OR
3. Manually run the configuration script:

```powershell
# In PowerShell (as administrator):
C:\Program Files\LandSurv.ai\configure.ps1
```

4. **Paste your API key** when prompted
5. Configuration saved to: `%APPDATA%\LandsurvConnector\config.json`

### Step 4: Load Plugin in Civil 3D

1. **Open Civil 3D 2026**
2. **Open a drawing file** (or create new)
3. In the **Command Line** at the bottom, type:
   ```
   NETLOAD
   ```
4. **Select the DLL file:**
   ```
   C:\Program Files\LandSurv.ai\LandsurvConnector.dll
   ```
5. Press **Enter** - you should see:
   ```
   LandsurvConnector loaded successfully
   ```

### Step 5: Activate the Connector

1. In the **Command Line**, type:
   ```
   LandsurvAI
   ```
2. Press **Enter**
3. You should see:
   ```
   [Landsurv] Initializing Landsurv AI Agent...
   [Landsurv] ✓ Connected to Landsurv AI Server
   [Landsurv] Session ID: [your-session-id]
   ```

## Troubleshooting

### "Unknown command LandsurvAI"
- DLL not loaded with NETLOAD
- **Solution**: Follow Step 4 above

### "No API key configured"
- Configuration file not created
- **Solution**: Run `configure.ps1` with your API key

### "Cannot connect to server"
- Network issue or server down
- Check: `https://landsurv-backend-y55gmt77ga-uw.a.run.app/api/health`
- Contact support if server is down

### "Invalid API key"
- API key doesn't exist or is revoked
- Generate a new one from the website
- Reconfigure with `configure.ps1`

## Configuration File

**Location**: `%APPDATA%\LandsurvConnector\config.json`

**Format**:
```json
{
  "ApiKey": "lsa_your_api_key_here",
  "LicenseKey": "optional_license_key",
  "ServerUrl": "wss://c3dmcp.landsurv.ai/ws",
  "ClientVersion": "0.1.0",
  "ConfiguredAt": "2025-12-11T..."
}
```

## What the Connector Does

Once connected, the Civil 3D Connector:
- Receives commands from the LandSurv.ai server
- Executes drawing modifications in Civil 3D
- Sends results back to the server
- Maintains secure encrypted connection

## API Key Management

### View Your Keys
```
https://landsurv.ai/settings/api-keys
```

### Revoke a Key (Temporary Disable)
1. Go to **Settings > API Keys**
2. Find the key
3. Click **"Revoke"**

### Delete a Key (Permanent)
1. Go to **Settings > API Keys**
2. Find the key
3. Click **"Delete"**
4. Confirm

### Regenerate Expired Key
If your key expires:
1. Go to **Settings > API Keys**
2. Click **"Generate New Key"**
3. Reconfigure connector with new key

## Support

- **Website**: https://landsurv.ai
- **Documentation**: https://docs.landsurv.ai
- **Support Email**: support@landsurv.ai
- **Status**: https://status.landsurv.ai

---

**Version**: 0.1.0  
**Last Updated**: 2025-12-11
