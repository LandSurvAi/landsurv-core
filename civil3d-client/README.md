# Civil 3D Cloud Connector (LandsurvConnector)

## Overview
A .NET Framework 4.8 Civil 3D plugin that connects to the Landsurv AI cloud server via WebSocket and executes AI-driven commands in Civil 3D.

## Architecture

### Thread Safety (CRITICAL)
- The WebSocket client runs on a background thread
- All Civil 3D API calls **MUST** run on the main UI thread
- `ThreadMarshaler` ensures thread-safe execution
- Without this, Civil 3D will crash with cryptic errors

### Communication Flow
```
User: "NETLOAD LandsurvConnector.dll"
    ↓
[CivilAgent.ActivateLandsurvAI command executes]
    ↓
[Connects to wss://c3dmcp.landsurv.ai/ws]
    ↓
[Receives: {"type": "command", "tool": "create_cogo_point", "args": {...}}]
    ↓
[ThreadMarshaler.Execute(() => { CreateCogoPoint(...) })]
    ↓
[Sends back: {"type": "result", "data": "Point created successfully"}]
```

## Prerequisites

1. **Visual Studio 2022**
   - Install C# development tools
   - Install .NET Framework 4.8 targeting pack

2. **Civil 3D 2020-2025**
   - Installation with SDK/Developer Tools
   - Access to:
     - `AcMgd.dll`
     - `AcDbMgd.dll`
     - `AcCoreMgd.dll`

3. **NuGet Packages** (auto-installed via .csproj)
   - `WebSocketSharp` - WebSocket client
   - `Newtonsoft.Json` - JSON parsing

## Building

### Manual Build (Visual Studio)
1. Open `LandsurvConnector.sln`
2. Build → Build Solution (Ctrl+Shift+B)
3. Output: `civil3d-client\bin\Debug\LandsurvConnector.dll`

### Command Line Build
```bash
msbuild LandsurvConnector.sln /p:Configuration=Release
```

## Installation

### Option 1: NETLOAD (For Testing)
1. Open Civil 3D
2. Type `NETLOAD` at command line
3. Select `LandsurvConnector.dll`
4. Type `LandsurvAI` to activate

### Option 2: APPLOAD (For Production)
1. In Civil 3D: Tools → Load Application
2. Select `LandsurvConnector.dll`
3. Ensure it loads on startup (check "Retain in Future Sessions")

### Option 3: .NET Plugin Startup
Edit `Civil3D.pln` (Civil 3D startup file):
```
/M=LandsurvConnector.CivilAgent,LandsurvConnector,LandsurvAI
```

## Configuration

### Local Testing
In `CivilAgent.cs`, uncomment:
```csharp
// private const string SERVER_URL = "ws://localhost:8080/ws";
```

### Cloud Production
Keep default:
```csharp
private const string SERVER_URL = "wss://c3dmcp.landsurv.ai/ws";
```

## Usage

### Activate the Agent
```
Command: LandsurvAI
```

Expected output:
```
[Landsurv] Initializing Landsurv AI Agent...
[Landsurv] Connecting to: wss://c3dmcp.landsurv.ai/ws
[Landsurv] WebSocket connection opened
[Landsurv] ✓ Connected to Landsurv AI Server
[Landsurv] Session ID: <uuid>
[Landsurv] Waiting for commands from AI...
```

### Example: Create a Point
When the cloud AI sends:
```json
{
  "type": "command",
  "tool": "create_cogo_point",
  "args": {
    "easting": 1000.0,
    "northing": 2000.0,
    "elevation": 100.0,
    "rawDescription": "Test Point"
  },
  "requestId": "req-123"
}
```

The plugin will:
1. Create a COGO point at (1000, 2000, 100)
2. Send result back: `{"type": "result", "requestId": "req-123", "data": {...}}`

## Implemented Commands

### ✅ create_cogo_point
Creates a COGO (Coordinate Geometry) point
```json
{
  "tool": "create_cogo_point",
  "args": {
    "easting": number,
    "northing": number,
    "elevation": number (optional),
    "rawDescription": string (optional)
  }
}
```

### ✅ create_line_segment
Creates a 2D line segment
```json
{
  "tool": "create_line_segment",
  "args": {
    "startX": number,
    "startY": number,
    "endX": number,
    "endY": number
  }
}
```

### ✅ get_drawing_info
Gets current drawing information
```json
{
  "tool": "get_drawing_info",
  "args": {}
}
```

### ⏳ Coming Soon
- `list_civil_object_types`
- `get_selected_civil_objects_info`
- `create_alignment`
- `create_surface`

## Troubleshooting

### Issue: "AcMgd.dll not found"
**Solution:** Add Civil 3D references manually:
1. Right-click References → Add Reference
2. Browse to Civil 3D installation folder
3. Select `AcMgd.dll`, `AcDbMgd.dll`, `AcCoreMgd.dll`
4. Set Copy Local = **False** for each

### Issue: "Connection refused"
**Solution:** 
- Check server URL in code
- For local testing: ensure Node.js server running on port 8080
- For cloud: check that `c3dmcp.landsurv.ai` is reachable

### Issue: "WebSocket error: 1000"
**Solution:** This is normal on disconnect. Check editor messages for details.

### Issue: Civil 3D crashes when command executes
**Solution:** Ensure ThreadMarshaler is being called:
```csharp
ThreadMarshaler.Execute(() => {
    // All Civil 3D API calls here
});
```

## File Structure
```
civil3d-client/
├── CivilAgent.cs           # Main plugin class + command handlers
├── ThreadMarshaler.cs      # Thread-safe execution wrapper
├── Properties/
│   └── AssemblyInfo.cs     # Assembly metadata
├── LandsurvConnector.csproj # Project configuration
├── bin/
│   └── [compiled DLL files]
└── obj/
    └── [build artifacts]
```

## References
- [Civil 3D API Documentation](https://help.autodesk.com/view/civil3d/)
- [WebSocketSharp GitHub](https://github.com/sta/websocket-sharp)
- [Newtonsoft.Json Documentation](https://www.newtonsoft.com/json)

## License
MIT

## Support
For issues or feature requests, contact: support@landsurv.ai

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-09  
**Status:** Phase 2 - Core Implementation
