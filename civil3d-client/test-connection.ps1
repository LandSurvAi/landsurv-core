#!/usr/bin/env pwsh
# Quick local connection test for Civil 3D WebSocket
# Run this before deploying to catch connection issues early

param(
    [string]$ServerUrl = "wss://beta-landsurv-ai-y55gmt77ga-uw.a.run.app/c3d",
    [string]$SessionToken = "LSC-TEST-12345"
)

Write-Host "Civil 3D WebSocket Connection Test" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check if DLL exists and is recent
Write-Host "[1/4] Checking DLL build..." -ForegroundColor Yellow
$dllPath = "bin\Release\net8.0-windows\LandsurvConnector.dll"
if (-not (Test-Path $dllPath)) {
    Write-Host "  ❌ DLL not found. Run .\build.ps1 first." -ForegroundColor Red
    exit 1
}

$dllAge = (Get-Date) - (Get-Item $dllPath).LastWriteTime
if ($dllAge.TotalHours -gt 24) {
    Write-Host "  ⚠️  DLL is $([math]::Round($dllAge.TotalHours,1)) hours old" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ DLL found and recent" -ForegroundColor Green
}

# Test 2: Verify version consistency
Write-Host ""
Write-Host "[2/4] Checking version consistency..." -ForegroundColor Yellow
$wxsContent = Get-Content "LandsurvConnector.wxs" -Raw
$chatFormContent = Get-Content "UI\ChatForm.cs" -Raw

$wxsVersion = [regex]::Match($wxsContent, 'Version="(\d+\.\d+\.\d+\.\d+)"').Groups[1].Value
$chatFormVersion = [regex]::Match($chatFormContent, 'LandSurv\.ai Chat \(v(\d+\.\d+\.\d+\.\d+)\)').Groups[1].Value

if ($wxsVersion -ne $chatFormVersion) {
    Write-Host "  ❌ Version mismatch! WiX: $wxsVersion, ChatForm: $chatFormVersion" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Version: $wxsVersion" -ForegroundColor Green

# Test 3: Check backend compression setting
Write-Host ""
Write-Host "[3/4] Checking backend WebSocket configuration..." -ForegroundColor Yellow
$websocketPath = "..\backend\src\routes\c3d-websocket.ts"
if (Test-Path $websocketPath) {
    $wsContent = Get-Content $websocketPath -Raw
    if ($wsContent -match "perMessageDeflate:\s*false") {
        Write-Host "  ✓ Compression correctly disabled" -ForegroundColor Green
    } elseif ($wsContent -match "perMessageDeflate:\s*true") {
        Write-Host "  ❌ Compression is ENABLED! This will cause errors!" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "  ⚠️  Cannot find perMessageDeflate setting" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠️  Backend file not found" -ForegroundColor Yellow
}

# Test 4: Test WebSocket connection with Node.js
Write-Host ""
Write-Host "[4/4] Testing live WebSocket connection..." -ForegroundColor Yellow
$testScript = @"
const WebSocket = require('ws');

const ws = new WebSocket('$ServerUrl?token=$SessionToken');
let messageCount = 0;

ws.on('open', () => {
    console.log('  ✓ Connection established');
});

ws.on('message', (data) => {
    messageCount++;
    const msg = JSON.parse(data.toString());
    console.log('  ✓ Message received:', msg.type);
    
    if (messageCount === 1) {
        // Send test message
        ws.send(JSON.stringify({
            type: 'message',
            message: 'test',
            timestamp: new Date().toISOString()
        }));
    } else {
        ws.close();
        process.exit(0);
    }
});

ws.on('error', (error) => {
    console.error('  ❌ WebSocket error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    if (messageCount >= 1) {
        console.log('  ✓ Connection closed gracefully');
    }
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('  ❌ Connection timeout');
    ws.close();
    process.exit(1);
}, 10000);
"@

# Check if Node.js is available
if (Get-Command node -ErrorAction SilentlyContinue) {
    $testScript | node 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ All tests passed!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Connection test failed" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ⚠️  Node.js not found, skipping live connection test" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Ready to deploy!" -ForegroundColor Green
