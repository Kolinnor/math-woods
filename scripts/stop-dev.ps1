$ErrorActionPreference = "Continue"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDir = Join-Path $Root "runtime"
$LauncherLog = Join-Path $RuntimeDir "launcher.log"
$PidFile = Join-Path $RuntimeDir "next-dev.pid"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
"[$(Get-Date)] Stop requested" | Add-Content -LiteralPath $LauncherLog

if (Test-Path $PidFile) {
  $pidValue = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($pidValue) {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

try {
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
    Where-Object {
      $_.CommandLine -like "*math-garden*next*dev*" -or
      $_.CommandLine -like "*math-hills*next*dev*" -or
      $_.CommandLine -like "*math-woods*next*dev*"
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {
  "[$(Get-Date)] Could not scan node processes: $($_.Exception.Message)" | Add-Content -LiteralPath $LauncherLog
}
