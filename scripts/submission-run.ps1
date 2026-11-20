param([switch]$Mobile)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(-not (Test-Path -LiteralPath (Join-Path $root 'backend/.env'))) { throw 'backend/.env not found. Run SETUP_GOYALNEST_V2.cmd and configure local database and secret.' }
if(-not (Test-Path -LiteralPath (Join-Path $root 'backend/node_modules'))) { throw 'Backend dependencies not installed. Run SETUP_GOYALNEST_V2.cmd.' }
if(-not (Test-Path -LiteralPath (Join-Path $root 'frontend/node_modules'))) { throw 'Frontend dependencies not installed. Run SETUP_GOYALNEST_V2.cmd.' }
$apiDir=Join-Path $root 'backend'; $webDir=Join-Path $root 'frontend'
$apiCmd = 'Set-Location -LiteralPath ''' + $apiDir.Replace("'","''") + '''; npm run dev'
$webCmd = 'Set-Location -LiteralPath ''' + $webDir.Replace("'","''") + '''; npm run dev'
if ($Mobile) { $webCmd += ' -- --host 0.0.0.0' }
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',$apiCmd)
Start-Process powershell.exe -ArgumentList @('-NoExit','-NoProfile','-Command',$webCmd)
Write-Host 'Frontend: http://localhost:5173  Backend: http://localhost:4000/api/health' -ForegroundColor Cyan
if ($Mobile) {
  Write-Host 'Trusted Wi-Fi ONLY; do not expose Vite on internet. Phone address candidates:' -ForegroundColor Yellow
  Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } | ForEach-Object { Write-Host ('http://'+$_.IPAddress+':5173') }
  Write-Host 'Mobile browser may require HTTPS for payment crypto API features; never use real payments over LAN HTTP.' -ForegroundColor Yellow
}
