# Civil 3D WebSocket Connection Protection

## Overview
This document outlines the CI/CD and testing infrastructure created to prevent WebSocket compression errors and connection failures in the Civil 3D plugin.

## Problem History
On December 16-24, 2025, the Civil 3D plugin experienced a critical WebSocket compression error:
- **Error**: "The WebSocket received compressed frame when compression is not enabled"
- **Root Cause**: Attempting to use `System.Net.WebSockets.ClientWebSocket` which has stricter compression requirements
- **Solution**: Rolled back to `WebSocketSharp` library (commit a070721)
- **Server Config**: `perMessageDeflate: false` (CRITICAL - must never be changed)

## Protection Measures

### 1. Automated Tests

#### Connection Integration Test
**File**: `__tests__/c3d-websocket/connection.test.ts`

Tests:
- ✅ WebSocket connects without compression errors
- ✅ Welcome message is received
- ✅ Multiple messages can be sent/received
- ✅ No compression extension is negotiated
- ✅ Connection remains stable under load

Run: `npm run test:c3d` (in backend/)

#### Version Consistency Test
**File**: `__tests__/c3d-websocket/version-consistency.test.ts`

Validates:
- ✅ WiX file version matches ChatForm.cs
- ✅ ChatForm.cs version matches ConnectorDownload.tsx
- ✅ ConnectorDownload.tsx version matches Dockerfile
- ✅ MSI file exists with expected size

Run: `npm run test:c3d` (in backend/)

### 2. GitHub Actions CI/CD
**File**: `.github/workflows/c3d-connector-ci.yml`

Runs on every push to `main` or `LandSurv.ai-C3DMCP` branches.

**Jobs**:

1. **version-check**
   - Extracts versions from all files
   - Fails if any mismatch detected
   - Prevents deployment with inconsistent versions

2. **backend-tests**
   - Compiles TypeScript backend
   - Verifies `perMessageDeflate: false` is set
   - Runs WebSocket integration tests
   - **CRITICAL**: Fails if compression is enabled

3. **csharp-build**
   - Builds C# DLL
   - Verifies DLL size is reasonable (20-100 KB)
   - Confirms WebSocketSharp dependency exists
   - Prevents accidental removal of required library

4. **integration-summary**
   - Provides overall status
   - All jobs must pass for green check

### 3. Local Pre-Deployment Test
**File**: `civil3d-client/test-connection.ps1`

Quick local validation before deploying:
```powershell
cd civil3d-client
.\test-connection.ps1
```

Checks:
1. ✅ DLL exists and is recent
2. ✅ Version consistency
3. ✅ Backend compression disabled
4. ✅ Live WebSocket connection test

**Usage**: Run this script before every deployment!

### 4. Build Script Enhancements
**File**: `civil3d-client/build.ps1`

Already includes:
- Auto-extracts version from WiX (single source of truth)
- Warns about version mismatches
- Creates versioned MSI automatically
- Shows next steps for deployment

## Critical Configuration

### Backend WebSocket Server
**File**: `backend/src/routes/c3d-websocket.ts`

```typescript
const wss = new WebSocketServer({
  server,
  perMessageDeflate: false  // ⚠️ NEVER CHANGE THIS TO TRUE
});
```

**Why**: The `WebSocketSharp` library on the C# client side doesn't handle compression properly. Enabling compression will cause "compressed frame when compression is not enabled" errors.

### C# Client Library
**File**: `civil3d-client/LandsurvConnector.csproj`

```xml
<PackageReference Include="WebSocketSharp" Version="1.0.3-rc11" />
```

**Why**: `System.Net.WebSockets.ClientWebSocket` has stricter requirements and caused the week-long outage. `WebSocketSharp` is more lenient and stable.

## Deployment Checklist

Before deploying any Civil 3D changes:

1. ✅ Run local tests: `cd civil3d-client && .\test-connection.ps1`
2. ✅ Check version consistency warnings from build script
3. ✅ Verify GitHub Actions CI passes (all green checks)
4. ✅ Run integration tests: `cd backend && npm run test:c3d`
5. ✅ Build MSI: `cd civil3d-client && .\build.ps1`
6. ✅ Upload MSI: `gsutil cp bin\Release\LandsurvConnector-vX.X.X.X.msi gs://landsurv-downloads/`
7. ✅ Deploy backend: `gcloud builds submit --config=cloudbuild.yaml --region=us-west1`
8. ✅ Test connection with actual Civil 3D client

## Monitoring

### Key Metrics to Watch
- WebSocket connection success rate
- "Compressed frame" error occurrences
- Message send/receive latency
- Connection duration

### Logs to Check
- Cloud Run logs: `gcloud logs read --service=beta-landsurv-ai --limit=50`
- Backend WebSocket logs: Search for `[C3D-WebSocket]`
- Client logs: `%TEMP%\landsurv_ws.log` (if file logging enabled)

## Troubleshooting

### If Compression Error Returns
1. **IMMEDIATELY** check `perMessageDeflate` setting in c3d-websocket.ts
2. Verify C# client is using `WebSocketSharp`, not `System.Net.WebSockets`
3. Check Cloud Run isn't adding compression middleware
4. Roll back to last known working version (current: v25.12.23.18)

### Version Mismatch Warnings
1. Build script will show which files need updating
2. Update version in `LandsurvConnector.wxs` first (source of truth)
3. Run build script - it will detect mismatches
4. Manually update ChatForm.cs, ConnectorDownload.tsx, Dockerfile

### Failed CI Build
1. Check GitHub Actions tab for specific failure
2. Version check failure: Update versions
3. Compression check failure: Fix `perMessageDeflate` setting
4. C# build failure: Check dependencies, restore packages

## Version History
- **v25.12.23.18**: Working version with WebSocketSharp, compression disabled
- **v25.12.16.02**: Last known good before System.Net.WebSockets attempt
- **v25.12.23.01-17**: Failed versions using System.Net.WebSockets (DO NOT USE)

## References
- WebSocket Protocol: RFC 6455
- perMessageDeflate Extension: RFC 7692
- WebSocketSharp Library: https://github.com/sta/websocket-sharp
- Cloud Run WebSocket Support: https://cloud.google.com/run/docs/triggering/websockets

---

**Last Updated**: December 24, 2025
**Status**: ✅ Connection working and protected
**Maintainer**: LandSurv.ai Development Team
