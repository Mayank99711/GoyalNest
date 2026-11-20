@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\submission-setup.ps1"
if errorlevel 1 echo Setup encountered an error. Read the output above.
pause
