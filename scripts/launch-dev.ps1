$ErrorActionPreference = "Continue"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeDir = Join-Path $Root "runtime"
$LauncherLog = Join-Path $RuntimeDir "launcher.log"
$DevLog = Join-Path $RuntimeDir "next-dev.log"
$PidFile = Join-Path $RuntimeDir "next-dev.pid"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
"[$(Get-Date)] Launch requested" | Set-Content -LiteralPath $LauncherLog

function Write-LaunchLog($Message) {
  "[$(Get-Date)] $Message" | Add-Content -LiteralPath $LauncherLog
}

function Test-SiteReady {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-ExistingNextDev {
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
    Write-LaunchLog "Could not scan existing Next dev processes: $($_.Exception.Message)"
  }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-LaunchLog "Docker was not found in PATH."
  Start-Process "https://www.docker.com/products/docker-desktop/"
  exit 1
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-LaunchLog "Docker is not running. Trying to start Docker Desktop."
  $dockerDesktop = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Start-Process -FilePath $dockerDesktop
    Start-Sleep -Seconds 20
  }
}

Push-Location $Root
try {
  $composeOutput = docker compose up -d 2>&1
  if ($composeOutput) {
    $composeOutput | ForEach-Object { Write-LaunchLog $_.ToString() }
  }

  Write-LaunchLog "Restarting Next dev server with a clean cache."
  Stop-ExistingNextDev
  $cmd = "/c npm.cmd run dev > `"$DevLog`" 2>&1"
  $process = Start-Process -FilePath "cmd.exe" -ArgumentList $cmd -WorkingDirectory $Root -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $PidFile -Value $process.Id

  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    if (Test-SiteReady) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  if (-not $ready) {
    Write-LaunchLog "Opened browser, but server was not confirmed ready yet. Check $DevLog."
  }

  Start-Process "http://localhost:3000"
} finally {
  Pop-Location
}
