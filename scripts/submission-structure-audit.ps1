$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Write-Host 'GoyalNest read-only professional folder audit' -ForegroundColor Cyan
$required=@('frontend/src/app','frontend/src/components','frontend/src/features','frontend/src/lib','backend/src/config','backend/src/middleware','backend/src/modules','backend/prisma','scripts','docs')
foreach($rel in $required){$exists=Test-Path -LiteralPath (Join-Path $root $rel); if($exists){ Write-Host ('PASS '+$rel) -ForegroundColor Green }else{ Write-Host ('MISSING '+$rel) -ForegroundColor Yellow }}
Write-Host "`nRoot files and folders:" -ForegroundColor Cyan
Get-ChildItem -LiteralPath $root -Force | Select-Object Name,Mode,Length | Format-Table -AutoSize
Write-Host "`nPotential duplicate/stray root src files (review, do not delete):" -ForegroundColor Yellow
$stray=Join-Path $root 'src'
if(Test-Path -LiteralPath $stray){Get-ChildItem -LiteralPath $stray -Recurse -File -Force | Select-Object FullName,Length | Format-Table -AutoSize}else{Write-Host 'No root src directory.'}
Write-Host "`nPatch-backup directories still within project:" -ForegroundColor Yellow
Get-ChildItem -LiteralPath $root -Force -Directory | Where-Object { $_.Name -match '^\.goyalnest_.*backup|^\.gn-backups$' } | Select-Object Name | Format-Table -AutoSize
Write-Host "`nEmpty files in active frontend/backend source:" -ForegroundColor Yellow
foreach($rel in @('frontend/src','backend/src')){Get-ChildItem -LiteralPath (Join-Path $root $rel) -File -Recurse -ErrorAction SilentlyContinue | Where-Object Length -eq 0 | Select-Object FullName}
Write-Host "`nREAD ONLY: no files moved, created, renamed, or removed." -ForegroundColor Green
