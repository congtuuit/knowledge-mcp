[CmdletBinding()]
param (
    [string]$NineRouterUrl = "http://localhost:20128/v1",
    [string]$NineRouterKey = "sk-dc085fc94dc709ea-8u73fh-aa082828",
    [int]$ServerPort = 3900
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

& "$ProjectRoot\setup-and-run.ps1" -NineRouterUrl $NineRouterUrl -NineRouterKey $NineRouterKey -ServerPort $ServerPort -NoStart
