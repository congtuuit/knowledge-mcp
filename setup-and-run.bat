@echo off
title Knowledge MCP - Setup and Run
color 0B
cd /d "%~dp0"

echo ============================================================
echo   Knowledge MCP Server - 1-Click Setup & Launch
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-and-run.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Process exited with code %ERRORLEVEL%.
    pause
)
