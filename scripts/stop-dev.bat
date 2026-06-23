@echo off
setlocal

cd /d "%~dp0.."

powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\stop-dev.ps1"

endlocal
