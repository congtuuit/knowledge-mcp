@echo off
title Knowledge MCP Server
color 0A
echo ============================================================
echo   Starting Knowledge MCP Server on Streamable HTTP
echo ============================================================
cd /d "%~dp0\.."

if not exist node_modules (
    echo [INFO] node_modules not found. Running npm install...
    call npm install
)

if not exist dist\src\mcp-server.js (
    echo [INFO] dist folder not found. Building TypeScript...
    call npm run build
)

echo [INFO] Launching Knowledge MCP Server...
node dist/src/mcp-server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Server stopped with error code %ERRORLEVEL%.
    pause
)
