[CmdletBinding()]
param (
    [string]$NineRouterUrl = "http://localhost:20128/v1",
    [string]$NineRouterKey = "sk-dc085fc94dc709ea-8u73fh-aa082828",
    [int]$ServerPort = 3900,
    [switch]$NoStart
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

function Print-Header([string]$text) {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Print-Step([string]$step, [string]$text) {
    Write-Host "`n[$step] $text" -ForegroundColor Yellow
}

function Print-Success([string]$text) {
    Write-Host "  [OK] $text" -ForegroundColor Green
}

function Print-Warning([string]$text) {
    Write-Host "  [WARN] $text" -ForegroundColor Magenta
}

function Print-Error([string]$text) {
    Write-Host "  [ERR] $text" -ForegroundColor Red
}

Print-Header "KNOWLEDGE MCP - ALL-IN-ONE SETUP & RUNNER"
Write-Host "Thu muc du an: $ProjectRoot" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# 1. Kiem tra Node.js & npm
# ------------------------------------------------------------------------------
Print-Step "1/5" "Kiem tra moi truong Node.js..."
try {
    $nodeVer = node -v
    $npmVer = npm -v
    Print-Success "Node.js: $nodeVer | npm: $npmVer"
} catch {
    Print-Error "Khong tim thay Node.js! Vui long cai dat Node.js >= 18."
    Read-Host "Nhan Enter de thoat..."
    exit 1
}

# ------------------------------------------------------------------------------
# 2. Kiem tra 9router & Khoi tao .env
# ------------------------------------------------------------------------------
Print-Step "2/5" "Kiem tra 9router va Cau hinh .env..."
try {
    $resp = Invoke-RestMethod -Uri "$NineRouterUrl/models" -Headers @{ "Authorization" = "Bearer $NineRouterKey" } -Method Get -TimeoutSec 3
    Print-Success "Ket noi 9router ($NineRouterUrl) thanh cong!"
} catch {
    Print-Warning "Chua ket noi duoc 9router tai $NineRouterUrl. Hay chac chan 9router dang bat de embedding hoat dong."
}

$envPath = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envPath)) {
    $envLines = @(
        "# ---- Duong dan ----",
        "VAULT_DIR=./data/raw",
        "DB_PATH=./db/knowledge.db",
        "PORT=$ServerPort",
        "",
        "# ---- Embedding (9router) ----",
        "EMBEDDING_BASE_URL=$NineRouterUrl",
        "EMBEDDING_MODEL=gemini/gemini-embedding-2-preview",
        "EMBEDDING_API_KEY=$NineRouterKey",
        "EMBEDDING_DIM=768",
        "",
        "# ---- Contextual Retrieval (9router) ----",
        "CONTEXTUAL_RETRIEVAL_ENABLED=true",
        "CHAT_BASE_URL=$NineRouterUrl",
        "CHAT_MODEL=mcp-local",
        "CHAT_API_KEY=$NineRouterKey",
        "",
        "# ---- Bao mat MCP server (local de trong) ----",
        "MCP_AUTH_TOKEN="
    )
    $envLines -join [Environment]::NewLine | Out-File -FilePath $envPath -Encoding utf8
    Print-Success "Da tao file cau hinh .env"
} else {
    Write-Host "  [INFO] File .env da ton tai." -ForegroundColor Gray
}

# Tao cac thu muc can thiet
$null = New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "data\raw") -Force
$null = New-Item -ItemType Directory -Path (Join-Path $ProjectRoot "db") -Force

# ------------------------------------------------------------------------------
# 3. Cai dat dependencies, Build & Reindex
# ------------------------------------------------------------------------------
Print-Step "3/5" "Cai dat packages, Build va Index du lieu..."

if (-not (Test-Path "node_modules")) {
    Write-Host "  -> Dang chay npm install..." -ForegroundColor Gray
    cmd /c npm install
    Print-Success "Cai dat dependencies hoan tat."
}

Write-Host "  -> Dang build TypeScript..." -ForegroundColor Gray
cmd /c npm run build
Print-Success "Build TypeScript hoan tat."

$dbPath = Join-Path $ProjectRoot "db\knowledge.db"
if (-not (Test-Path $dbPath) -or ((Get-Item $dbPath).Length -eq 0)) {
    Write-Host "  -> Dang index du lieu ghi chu vao database..." -ForegroundColor Gray
    try {
        cmd /c npm run reindex
        Print-Success "Index du lieu Knowledge Vault thanh cong!"
    } catch {
        Print-Warning "Loi khi index du lieu (kiem tra lai 9router neu can)."
    }
} else {
    Print-Success "Database da san sang."
}

# ------------------------------------------------------------------------------
# 4. Cau hinh Antigravity IDE (Rules, MCP Config, Schemas)
# ------------------------------------------------------------------------------
Print-Step "4/5" "Cau hinh tich hop Antigravity IDE..."
$userProfile = [Environment]::GetFolderPath("UserProfile")
$geminiConfigDir = Join-Path $userProfile ".gemini\config"
$geminiRulesDir = Join-Path $geminiConfigDir "rules"
$mcpConfigPath = Join-Path $geminiConfigDir "mcp_config.json"
$ideMcpDir = Join-Path $userProfile ".gemini\antigravity-ide\mcp\knowledge-vault"

# 4.1 Global Rule
$null = New-Item -ItemType Directory -Path $geminiRulesDir -Force
$globalRulePath = Join-Path $geminiRulesDir "knowledge-vault.md"
$ruleLines = @(
    "---",
    "description: Tu dong tra cuu Knowledge Vault khi nguoi dung hoi ve kien thuc du an, ky thuat, Sitecore va coding standards",
    "---",
    "",
    "# Knowledge Vault Auto-Lookup Policy",
    "",
    "## Quy tac kich hoat tu dong (Auto Trigger Rule)",
    "- Khi nguoi dung hoi ve: kien truc, quy chuan code, checklist, tai lieu du an, ky thuat Sitecore/CMS, best practices...",
    "- **LUON CHU DONG** goi tool `context_for_query` hoac `hybrid_search` tu MCP server `knowledge-vault` truoc khi tra loi.",
    "- Nguoi dung khong can nhac cu tu 'knowledge vault' hay 'tai lieu noi bo'."
)
$ruleLines -join [Environment]::NewLine | Out-File -FilePath $globalRulePath -Encoding utf8
Print-Success "Global Rule: $globalRulePath"

# 4.2 MCP Config
$null = New-Item -ItemType Directory -Path $geminiConfigDir -Force
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
$mcpConfigJson | Out-File -FilePath $mcpConfigPath -Encoding utf8
Print-Success "MCP Server Config: $mcpConfigPath"

# 4.3 Copy Schemas & Instructions
$assetsMcpDir = Join-Path $ProjectRoot "assets\antigravity\mcp\knowledge-vault"
if (Test-Path $assetsMcpDir) {
    $null = New-Item -ItemType Directory -Path $ideMcpDir -Force
    Copy-Item -Path "$assetsMcpDir\*" -Destination $ideMcpDir -Recurse -Force
    Print-Success "Tool Schemas & Instructions: $ideMcpDir"
}

# ------------------------------------------------------------------------------
# 5. Khoi chay Server
# ------------------------------------------------------------------------------
if ($NoStart) {
    Print-Header "SETUP HOAN TAT (CHE DO NO-START)"
    exit 0
}

Print-Step "5/5" "Khoi chay Knowledge MCP Server..."
Print-Header "SERVER DANG CHAY TAI: http://localhost:$ServerPort/mcp"
Write-Host "  • Nhan Ctrl+C de dung server bat cu luc nao." -ForegroundColor Gray
Write-Host "  • Ban co the mo Antigravity IDE va chat ngay bay gio!`n" -ForegroundColor Green

cmd /c node dist/src/mcp-server.js
