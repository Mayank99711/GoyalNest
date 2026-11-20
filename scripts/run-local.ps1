$ErrorActionPreference='Stop';$root=Split-Path -Parent $PSScriptRoot
if(-not (Test-Path (Join-Path $root 'backend/.env'))){throw 'Create backend/.env before running. See README.md.'}
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',"Set-Location '$($root.Replace("'","''"))\backend'; npm run dev")
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',"Set-Location '$($root.Replace("'","''"))\frontend'; npm run dev")
Write-Host 'Frontend: http://localhost:5173 | API: http://localhost:4000/api/health'
