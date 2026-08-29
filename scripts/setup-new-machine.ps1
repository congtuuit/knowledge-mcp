# ==============================================================================
# Script: setup-new-machine.ps1
# Muc dich: Tu dong hoa 100% qua trinh setup Knowledge MCP tren may moi da co 9router & Antigravity
# ==============================================================================

[CmdletBinding()]
param (
    [string]$NineRouterUrl = "http://localhost:20128/v1",
    [string]$NineRouterKey = "sk-dc085fc94dc709ea-8u73fh-aa082828",
    [string]$EmbeddingModel = "gemini/gemini-embedding-2-preview",
    [string]$ChatModel = "mcp-local",
    [int]$ServerPort = 3900
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 BAT DAU SETUP KNOWLEDGE MCP CHO MAY MOI" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Thu muc du an: $ProjectRoot" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# 1. Kiem tra Node.js & npm
# ------------------------------------------------------------------------------
Write-Host "`n[1/6] Kiem tra moi truong Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Host "  ✅ Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "  ✅ npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "  ❌ KHONG TIM THAY NODE.JS! Vui long cai dat Node.js >= 18 truoc." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------------------
# 2. Kiem tra ket noi toi 9router
# ------------------------------------------------------------------------------
Write-Host "`n[2/6] Kiem tra ket noi toi 9router ($NineRouterUrl)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$NineRouterUrl/models" -Headers @{ "Authorization" = "Bearer $NineRouterKey" } -Method Get -TimeoutSec 5
    Write-Host "  ✅ Ket noi 9router thanh cong! So luong models san sang: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Canh bao: Khong the ket noi toi 9router tai $NineRouterUrl." -ForegroundColor Magenta
    Write-Host "      Hay dam bao 9router dang duoc bat truoc khi chay reindex/embeddings." -ForegroundColor Magenta
}

# ------------------------------------------------------------------------------
# 3. Tao file .env neu chua co
# ------------------------------------------------------------------------------
Write-Host "`n[3/6] Khoi tao file cau hinh .env..." -ForegroundColor Yellow
$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) {
    $envContent = @"
# ---- Duong dan ----
VAULT_DIR=./data/raw
DB_PATH=./db/knowledge.db
PORT=$ServerPort

# ---- Embedding (9router) ----
EMBEDDING_BASE_URL=$NineRouterUrl
EMBEDDING_MODEL=$EmbeddingModel
EMBEDDING_API_KEY=$NineRouterKey
EMBEDDING_DIM=768

# ---- Contextual Retrieval (9router) ----
CONTEXTUAL_RETRIEVAL_ENABLED=true
CHAT_BASE_URL=$NineRouterUrl
CHAT_MODEL=$ChatModel
CHAT_API_KEY=$NineRouterKey

# ---- Bao mat MCP server (local de trong) ----
MCP_AUTH_TOKEN=
"@
    Set-Content -Path $envPath -Value $envContent -Encoding UTF8
    Write-Host "  ✅ Da tao file .env moi theo cau hinh 9router." -ForegroundColor Green
} else {
    Write-Host "  ℹ️  File .env da ton tai, giu nguyen cau hinh hien tai." -ForegroundColor Gray
}

# Dam bao cac thu muc data/raw va db ton tai
$dataRawDir = Join-Path $ProjectRoot "data\raw"
$dbDir = Join-Path $ProjectRoot "db"
if (-not (Test-Path $dataRawDir)) { New-Item -ItemType Directory -Path $dataRawDir -Force | Out-Null }
if (-not (Test-Path $dbDir)) { New-Item -ItemType Directory -Path $dbDir -Force | Out-Null }

# ------------------------------------------------------------------------------
# 4. Cai dat dependencies & Build TypeScript
# ------------------------------------------------------------------------------
Write-Host "`n[4/6] Cai dat npm packages & Build du an..." -ForegroundColor Yellow
npm install
npm run build
Write-Host "  ✅ Build TypeScript thanh cong!" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 5. Ingest du lieu (Reindex Knowledge Vault)
# ------------------------------------------------------------------------------
Write-Host "`n[5/6] Ingest & Vector Index du lieu ghi chu..." -ForegroundColor Yellow
try {
    npm run reindex
    Write-Host "  ✅ Ingest & Tao vector database thanh cong!" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Reindex gap loi (co the do 9router chua bat). Ban co the chay lai sau bang lenh 'npm run reindex'." -ForegroundColor Magenta
}

# ------------------------------------------------------------------------------
# 6. Cau hinh Antigravity IDE (MCP Config, Rules & Tool Schemas)
# ------------------------------------------------------------------------------
Write-Host "`n[6/6] Tich hop vao Antigravity IDE..." -ForegroundColor Yellow

$userProfile = [Environment]::GetFolderPath("UserProfile")
$geminiConfigDir = Join-Path $userProfile ".gemini\config"
$geminiRulesDir = Join-Path $geminiConfigDir "rules"
$mcpConfigPath = Join-Path $geminiConfigDir "mcp_config.json"
$ideMcpDir = Join-Path $userProfile ".gemini\antigravity-ide\mcp\knowledge-vault"

# 6.1 Tao rule tu dong tra cuu
if (-not (Test-Path $geminiRulesDir)) { New-Item -ItemType Directory -Path $geminiRulesDir -Force | Out-Null }
$globalRulePath = Join-Path $geminiRulesDir "knowledge-vault.md"
$ruleContent = @"
---
description: Tu dong tra cuu Knowledge Vault khi nguoi dung hoi ve kien thuc du an, ky thuat, Sitecore va coding standards
---

# Knowledge Vault Auto-Lookup Policy

## Quy tac kich hoat tu dong (Auto Trigger Rule)
- Khi nguoi dung hoi ve: kien truc, quy chuẩn code, checklist, tai lieu du an, ky thuat Sitecore/CMS, best practices...
- **LUON CHU DONG** goi tool `context_for_query` hoac `hybrid_search` tu MCP server `knowledge-vault` truoc khi tra loi.
- Nguoi dung khong can nhac cu tu "knowledge vault" hay "tai lieu noi bo".
"@
Set-Content -Path $globalRulePath -Value $ruleContent -Encoding UTF8
Write-Host "  ✅ Da tao Global Rule tai: $globalRulePath" -ForegroundColor Green

# 6.2 Cau hinh mcp_config.json
if (-not (Test-Path $geminiConfigDir)) { New-Item -ItemType Directory -Path $geminiConfigDir -Force | Out-Null }

$mcpConfigObj = @{ mcpServers = @{} }
if (Test-Path $mcpConfigPath) {
    try {
        $existingJson = Get-Content -Path $mcpConfigPath -Raw | ConvertFrom-Json
        if ($existingJson.mcpServers) {
            foreach ($prop in $existingJson.mcpServers.PSObject.Properties) {
                $mcpConfigObj.mcpServers[$prop.Name] = $prop.Value
            }
        }
    } catch {}
}
$mcpConfigObj.mcpServers["knowledge-vault"] = @{ serverUrl = "http://localhost:$ServerPort/mcp" }
$mcpConfigJson = $mcpConfigObj | ConvertTo-Json -Depth 5
Set-Content -Path $mcpConfigPath -Value $mcpConfigJson -Encoding UTF8
Write-Host "  ✅ Da dang ky MCP Server 'knowledge-vault' tai: $mcpConfigPath" -ForegroundColor Green

# 6.3 Copy Tool Schemas & Instructions vao Antigravity IDE (neu co thu muc assets)
$assetsMcpDir = Join-Path $ProjectRoot "assets\antigravity\mcp\knowledge-vault"
if (Test-Path $assetsMcpDir) {
    if (-not (Test-Path $ideMcpDir)) { New-Item -ItemType Directory -Path $ideMcpDir -Force | Out-Null }
    Copy-Item -Path "$assetsMcpDir\*" -Destination $ideMcpDir -Recurse -Force
    Write-Host "  ✅ Da cap nhat Tool Schemas & Instructions vao: $ideMcpDir" -ForegroundColor Green
}

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "🎉 SETUP HOAN TAT 100%!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Cac buoc tiep theo:" -ForegroundColor White
Write-Host "  1. Chay MCP Server bang script: .\scripts\start-service.bat (hoac npm start)" -ForegroundColor Yellow
Write-Host "  2. Mo Antigravity IDE va dat cau hoi bat ky, AI se tu dong tra cuu Knowledge Vault!" -ForegroundColor Yellow
Write-Host "============================================================`n" -ForegroundColor Cyan
