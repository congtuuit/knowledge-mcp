# ==============================================================================
# Script: start-service.ps1
# Muc dich: Khoi chay Knowledge MCP Server
# ==============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 DANG KHOI CHAY KNOWLEDGE MCP SERVER..." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Test-Path "node_modules")) {
    Write-Host "[INFO] node_modules chua co. Dang chay npm install..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "dist\src\mcp-server.js")) {
    Write-Host "[INFO] dist/ chua duoc build. Dang chay npm run build..." -ForegroundColor Yellow
    npm run build
}

node dist/src/mcp-server.js
