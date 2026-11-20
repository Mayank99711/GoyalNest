param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
Write-Host 'GoyalNest clean-machine setup; database is NOT modified by this script.' -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20.19+ required.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm executable missing.' }
$v = @((node --version).TrimStart('v'))
$nums = ($v[0] -split '\.')
$major = [int]$nums[0]; $minor=[int]$nums[1]
if ($major -lt 20 -or ($major -eq 20 -and $minor -lt 19)) { throw ('Node.js 20.19+ required; found '+$v[0]) }
foreach($rel in @('package.json','frontend/package.json','frontend/package-lock.json','backend/package.json','backend/package-lock.json','backend/prisma/schema.prisma')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) { throw ('Required project file missing: '+$rel) }
}
$envPath = Join-Path $root 'backend/.env'
if (-not (Test-Path -LiteralPath $envPath)) {
  $template = Join-Path $root 'backend.env.example'
  if (-not (Test-Path -LiteralPath $template)) { throw 'backend.env.example missing. Create a safe backend/.env manually.' }
  Copy-Item -LiteralPath $template -Destination $envPath
  Write-Warning 'Created backend/.env with PLACEHOLDERS. Edit DATABASE_URL and JWT_SECRET before running API.'
} else { Write-Host 'Preserved existing backend/.env without modification.' -ForegroundColor Green }
if(-not $SkipInstall) {
  Write-Host 'npm ci: backend' -ForegroundColor Cyan
  & npm.cmd ci --prefix backend
  if($LASTEXITCODE -ne 0) { throw 'Backend npm ci failed.' }
  Write-Host 'npm ci: frontend' -ForegroundColor Cyan
  & npm.cmd ci --prefix frontend
  if($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed.' }
}
Write-Host 'Generate Prisma client only (NO migrations, NO seeding)' -ForegroundColor Cyan
& npm.cmd run db:generate --prefix backend
if($LASTEXITCODE -ne 0) { throw 'Prisma generate failed.' }
Write-Host 'Setup completed. Database must already be provisioned or migrated separately.' -ForegroundColor Green
Write-Host 'Next: configure backend/.env, then START_GOYALNEST_V2.cmd' -ForegroundColor Yellow
