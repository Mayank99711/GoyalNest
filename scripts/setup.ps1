param([switch]$SkipInstall)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host 'GoyalNest setup (does not modify database records)' -ForegroundColor Cyan
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js >=20.19 required.'}
if(-not (Get-Command npm -ErrorAction SilentlyContinue)){throw 'npm required.'}
node scripts/preflight.mjs
if($LASTEXITCODE -ne 0){throw 'Preflight failed; resolve errors first.'}
if(-not $SkipInstall){
  Write-Host 'Installing backend dependencies...' -ForegroundColor Cyan
  npm ci --prefix backend
  if($LASTEXITCODE -ne 0){throw 'Backend npm ci failed.'}
  Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
  npm ci --prefix frontend
  if($LASTEXITCODE -ne 0){throw 'Frontend npm ci failed.'}
}
Write-Host 'Generating Prisma client (NO migrations, NO seed)...' -ForegroundColor Cyan
npm --prefix backend run db:generate
if($LASTEXITCODE -ne 0){throw 'Prisma generation failed.'}
Write-Host 'Setup completed. Configure backend/.env, start app via scripts/run-local.ps1.' -ForegroundColor Green
