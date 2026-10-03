# LandsurvConnector v0.1.0-alpha Release Notes

**Release Date:** December 9, 2025  
**Status:** Alpha/Staging  
**Version:** 0.1.0.0  

---

## Overview

The LandsurvConnector Civil 3D plugin is a .NET Framework-based extension that connects Autodesk Civil 3D to the LandSurv AI Cloud Brain via WebSocket. This alpha release provides core functionality for:

- **Real-time communication** with the Cloud Brain server
- **Command execution** for survey operations
- **AI-powered responses** to user queries
- **Secure authentication** with token-based API access
- **Thread-safe integration** with Civil 3D API

---

## System Requirements

### Minimum Requirements
- **Operating System:** Windows 10 or Windows Server 2019+
- **Civil 3D Version:** 2020+
- **.NET Framework:** 4.8 or higher
- **Memory:** 2 GB RAM
- **Disk Space:** 100 MB
- **Network:** Internet connection for Cloud Brain communication

### Recommended
- Windows 11 (latest build)
- Civil 3D 2024 or newer
- 8 GB+ RAM
- SSD storage

---

## Installation

### Option 1: Visual Studio Compilation (Development)

```bash
# Prerequisites
# 1. Install Visual Studio 2022 Community/Professional
# 2. Install .NET Framework 4.8 Development Pack
# 3. Install Autodesk Civil 3D SDK

# Build steps
cd civil3d-client
msbuild LandsurvConnector.csproj /p:Configuration=Release

# Output: bin\Release\LandsurvConnector.dll
```

### Option 2: Direct Plugin Loading (Testing)

```
1. Copy compiled DLL to Civil 3D plugins folder:
   C:\Program Files\Autodesk\Civil 3D [YEAR]\Plugins\

2. Start Civil 3D

3. Load plugin via:
   - NETLOAD command in Civil 3D
   - OR auto-load via registry entry
```

### Option 3: MSI Installer (Coming Soon)
Automated installation with:
- DLL registration
- Configuration setup
- Shortcut creation
- Uninstall support

---

## Configuration

### Configuration File Location
```
%APPDATA%\LandsurvConnector\config.json
```

### Default Configuration Template
```json
{
  "cloudBrainUrl": "http://localhost:8080",
  "apiKey": "your-api-key-here",
  "licenseKey": "your-license-key-here",
  "licenseExpiration": "2025-12-31",
  "reconnectAttempts": 5,
  "reconnectDelayMs": 2000,
  "requestTimeoutMs": 30000,
  "enableLogging": true,
  "logLevel": "Info"
}
```

### Environment Variables
```powershell
$env:LANDSURV_CLOUD_BRAIN_URL = "http://localhost:8080"
$env:LANDSURV_API_KEY = "your-api-key"
$env:LANDSURV_LICENSE_KEY = "your-license-key"
```

### Cloud Run Deployment Configuration
```json
{
  "cloudBrainUrl": "https://landsurv-brain-[HASH].a.run.app",
  "apiKey": "production-api-key",
  "licenseKey": "production-license-key",
  "licenseExpiration": "2026-12-31"
}
```

---

## Features

### 1. Real-Time Chat Interface
- WPF ChatWindow UI component
- Message history display
- Automatic message formatting

### 2. Command Execution
Supported operations:
- **create_cogo_point**: Create survey points
- **create_line_segment**: Draw line segments
- **get_drawing_info**: Retrieve drawing metadata
- Additional commands via AI routing

### 3. Security
- HMAC-SHA256 authentication
- License key validation
- API key rotation support
- Secure credential storage

### 4. Reliability
- Automatic reconnection (exponential backoff)
- Message retry logic
- Connection health monitoring
- Graceful error handling

### 5. Integration
- Thread-safe Civil 3D API calls
- Non-blocking UI operations
- Background message processing
- Drawing context preservation

---

## Usage Guide

### Loading the Plugin

```csharp
// In Civil 3D NETLOAD:
// 1. Open Civil 3D
// 2. Type: NETLOAD
// 3. Browse to: C:\path\to\LandsurvConnector.dll
// 4. Click Open

// Plugin automatically:
// - Initializes WebSocket connection
// - Loads configuration
// - Creates UI components
// - Starts message loop
```

### Executing Commands

```csharp
// Example: Create a COGO point
{
  "type": "prompt",
  "content": "Create a survey point at coordinates 100, 200, 0 named TP001"
}

// Expected response:
{
  "type": "response",
  "content": "Creating point TP001 at (100, 200, 0)...",
  "toolName": "create_cogo_point",
  "params": {
    "pointName": "TP001",
    "easting": 100,
    "northing": 200,
    "elevation": 0
  }
}

// Tool result:
{
  "type": "result",
  "requestId": "req-12345",
  "success": true,
  "data": {
    "pointHandle": "POINT-001",
    "coordinates": [100, 200, 0],
    "message": "Point created successfully"
  }
}
```

---

## Testing

### Pre-Deployment Testing
```bash
# 1. Verify configuration
# Edit config.json with test credentials
# Ensure Cloud Brain is running on localhost:8080

# 2. Load plugin in Civil 3D
# NETLOAD C:\path\to\LandsurvConnector.dll

# 3. Test connection
# Should see connection confirmation in chat window

# 4. Test sample command
# Type: "Create a test point at 0,0,0"
```

### Connectivity Tests
```powershell
# Test WebSocket connectivity
Test-NetConnection -ComputerName localhost -Port 8080

# Test cloud deployment (after deployment)
Test-NetConnection -ComputerName landsurv-brain-xxx.a.run.app -Port 443

# View logs
Get-Content $env:APPDATA\LandsurvConnector\logs.txt -Tail 50
```

### Mock Testing (Without Civil 3D)
```csharp
// Test WebSocket client separately
var client = new WebSocketSharp.WebSocket("ws://localhost:8080/ws");
client.OnMessage += (sender, e) => Console.WriteLine(e.Data);
client.Connect();
client.Send("{\"type\":\"prompt\",\"content\":\"Hello\"}");
```

---

## Known Issues and Limitations

### Version 0.1.0-alpha Limitations
1. **Civil 3D License Required**: Plugin requires valid Civil 3D 2020+ installation
2. **No Batch Operations**: Single command execution only (batch coming in 0.2.0)
3. **Limited Tool Set**: 3 core tools available (expanded in 0.2.0)
4. **No Multi-Drawing**: Single drawing context only (multi-drawing in 0.3.0)
5. **Alpha Stability**: May encounter edge cases; feedback appreciated

### Known Issues
- None reported at release time

### Platform Notes
- **Windows 11**: Fully tested and supported
- **Windows 10**: Fully tested and supported
- **Windows Server**: Tested; may require additional configuration
- **Mac/Linux**: Not supported (Civil 3D Windows only)

---

## Roadmap

### 0.2.0 (Q1 2026)
- [ ] Multi-drawing support
- [ ] Batch command execution
- [ ] Enhanced tool implementations (30+ tools)
- [ ] Improved error recovery
- [ ] Advanced logging and diagnostics

### 0.3.0 (Q2 2026)
- [ ] Role-based access control (RBAC)
- [ ] Audit logging for compliance
- [ ] Multi-user collaboration
- [ ] Advanced result caching
- [ ] Performance optimization

### 1.0.0 (Q3 2026)
- [ ] Full feature parity with server
- [ ] Enterprise support tier
- [ ] Comprehensive documentation
- [ ] Production SLA guarantees
- [ ] Premium tool collection

---

## Support and Documentation

### Getting Help
- **Cloud Brain Documentation**: See `c3dmcp-server/README.md`
- **Plugin Logs**: `%APPDATA%\LandsurvConnector\logs.txt`
- **Configuration Help**: `c3dmcp-server/RELEASE_NOTES.md`

### Bug Reports
Create issue in repository with:
- LandsurvConnector version
- Civil 3D version
- Windows version
- Error logs (see above)
- Steps to reproduce

### Feature Requests
Submit via GitHub Issues with label `enhancement`

---

## API Changes and Migration

### Previous Version (1.0.0 → 0.1.0)
- ✅ No breaking changes (new version)
- ✅ All APIs remain compatible
- ✅ Configuration format unchanged

### Upgrade Path
```json
// Old config: 1.0.0
{
  "cloudBrainUrl": "...",
  "apiKey": "..."
}

// New config: 0.1.0-alpha (same structure)
{
  "cloudBrainUrl": "...",
  "apiKey": "..."
  // No changes required
}
```

---

## Security Considerations

### API Key Management
- Store API keys in configuration file (not in code)
- Regenerate keys annually
- Use environment variables for sensitive data
- Never commit keys to version control

### License Key
- Validate on startup (checked automatically)
- Contact support for renewal
- Automatic check: daily

### Network Security
- Use HTTPS for Cloud Run deployments
- Verify SSL certificates
- Firewall rules: Allow outbound port 443 (HTTPS)

---

## Legal and Licensing

**Copyright (c) 2025 LandSurv.ai**

This software is provided under the terms of the LandSurv.ai Software License Agreement. By using this software, you agree to:
- Use only with valid license key
- Not reverse engineer or decompile
- Not share license keys
- Compliance with local laws

---

## Version Information

| Component | Version | Status |
|-----------|---------|--------|
| Plugin (DLL) | 0.1.0.0 | Alpha |
| Cloud Brain | 0.1.0-alpha | Alpha |
| .NET Framework | 4.8+ | Required |
| Civil 3D | 2020+ | Required |

---

**Last Updated:** December 9, 2025  
**Next Review:** January 9, 2026
