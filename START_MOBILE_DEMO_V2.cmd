@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\submission-run.ps1" -Mobile
if errorlevel 1 echo Mobile startup encountered an error. Read the output above.
pause
