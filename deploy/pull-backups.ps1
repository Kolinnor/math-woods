param(
  [string]$Server = "ubuntu@37.156.45.153",
  [string]$RemotePath = "/opt/math-woods/backups/postgres",
  [string]$LocalPath = "$PSScriptRoot\..\backups\postgres"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $LocalPath | Out-Null

Write-Host "Downloading Postgres backups from $Server..."
scp "${Server}:$RemotePath/*.dump.gz" $LocalPath

Write-Host "Backups copied to $LocalPath"
