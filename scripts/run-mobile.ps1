$ErrorActionPreference='Stop';$root=Split-Path -Parent $PSScriptRoot
if(-not (Test-Path (Join-Path $root 'backend/.env'))){throw 'Create backend/.env before running.'}
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',"Set-Location '$($root.Replace("'","''"))\backend'; npm run dev")
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',"Set-Location '$($root.Replace("'","''"))\frontend'; npm run dev -- --host 0.0.0.0")
Write-Host 'Open the following address on a phone on the SAME Wi-Fi:' -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notmatch '^(127\.|169\.254\.)'} | ForEach-Object {Write-Host ("  http://"+$_.IPAddress+":5173")}
Write-Host 'If blocked, allow Node.js on PRIVATE Windows firewall only. Do NOT expose development server to internet.' -ForegroundColor Yellow
