$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
Write-Host 'GoyalNest PRE-GITHUB READ-ONLY safety audit' -ForegroundColor Cyan
$check=@('backend/.env','backend/private-storage','backend/uploads','.gn-backups','src')
foreach($rel in $check){ if(Test-Path -LiteralPath (Join-Path $root $rel)){Write-Host ('PRESENT LOCALLY (do not commit secrets/private data): '+$rel) -ForegroundColor Yellow} }
$patterns=@('*.dump','*.sqlite','*.sqlite3','*.pem','*.p12','*.pfx','*.key','*.bak','*.backup')
foreach($pat in $patterns){$matches=@(Get-ChildItem -LiteralPath $root -File -Recurse -Force -Filter $pat -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\\.gn-backups\\' } | Select-Object -First 12); if($matches.Count){Write-Host ('REVIEW files like '+$pat+': '+$matches.Count+' sample(s)') -ForegroundColor Yellow; $matches|ForEach-Object{Write-Host ('  '+$_.FullName)}}}
if(-not (Get-Command git -ErrorAction SilentlyContinue)){Write-Warning 'git not installed; no repo actions taken';return}
if(-not (Test-Path -LiteralPath (Join-Path $root '.git'))){ Write-Host 'Git not initialized; do not push before review.' -ForegroundColor Yellow;return }
$tracked=@(git ls-files)
$unsafe=@($tracked|Where-Object { $_ -match '(^|/)(\.env($|\.)|private-storage/|uploads/|\.gn-backups/|node_modules/|\.goyalnest_.*backup)' -or $_ -match '\.(dump|sqlite3?|pem|p12|pfx|key|backup)$' })
if($unsafe.Count){Write-Host 'BLOCKER: potentially sensitive tracked paths:' -ForegroundColor Red; $unsafe|ForEach-Object{Write-Host ('  '+$_)};throw 'Review/remove sensitive paths from index and rotate exposed secrets before GitHub push.'}
Write-Host 'No unsafe tracked path patterns detected (this does NOT check contents for secrets).' -ForegroundColor Green
Write-Host 'Staged paths:' -ForegroundColor Cyan
git diff --cached --name-only
Write-Host 'Git status:' -ForegroundColor Cyan
git status --short
Write-Host 'No git add/commit/push performed.' -ForegroundColor Green
