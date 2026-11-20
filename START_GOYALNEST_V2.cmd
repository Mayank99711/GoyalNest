@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\submission-run.ps1"
if errorlevel 1 echo Startup encountered an error. Read the output above.
pause
