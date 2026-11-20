$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location $root
if(-not (Get-Command git -ErrorAction SilentlyContinue)){throw 'Git not found.'}
if(-not (Test-Path '.git')){Write-Host 'No Git repository detected; initialize only when ready.';exit 0}
Write-Host 'Git remotes:' -ForegroundColor Cyan
git remote -v
Write-Host 'Tracked files matching sensitive patterns:' -ForegroundColor Yellow
$files=@(git ls-files)
$bad=@($files | Where-Object { $_ -match '(^|/)(\.env(\.|$)|node_modules/|uploads/|\.gn-backups/|\.git/)|\.(pem|key|p12|pfx|dump|backup|sqlite|sqlite3)$' })
if($bad.Count -gt 0){$bad | ForEach-Object {Write-Host "REVIEW: $_" -ForegroundColor Red};throw 'Potential sensitive tracked paths detected; do not push.'}
Write-Host 'No tracked paths matching basic secrets/PII file pattern. Inspect contents and staged diff manually.' -ForegroundColor Green
Write-Host 'Working tree:' -ForegroundColor Cyan
git status --short
