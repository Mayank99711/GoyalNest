# Apply the GoyalNest pre-GitHub documentation/setup package

This patch **does not replace application React/Express code, Prisma schema, existing setup launchers, project root package.json, or user data**. It adds `*_V2.cmd`, a thorough README and new `scripts/submission-*` and `docs/submission/*` files.

Existing root `README.md` is **backed up and replaced**; existing `.gitignore` is **appended with additional safe patterns** without deleting rules. All other pre-existing destinations with different content cause a safe stop. `backend.env.example` is **preserved** if already present; compare with the included reference and add missing environment keys manually.

## Windows PowerShell

```powershell
$project = 'C:\Users\DELL\OneDrive\Desktop\GoyalNest_v1_1_1'
$folder = "$env:USERPROFILE\Downloads\GoyalNest_PreGit_Submission_20261120"
$script = Get-ChildItem $folder -Filter APPLY.ps1 -Recurse -File | Select-Object -First 1 -ExpandProperty FullName
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -ProjectRoot $project -DryRun
# If preflight passes, apply:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -ProjectRoot $project
```

## After applying

```powershell
cd $project
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/submission-structure-audit.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/submission-git-audit.ps1
node scripts/preflight.mjs
node scripts/source-check.mjs
node scripts/smoke-test.mjs
npm run build --prefix frontend
```

Then test both setup and role features on a **disposable** machine/database. Do **not** initialize/push Git until safety and E2E testing are complete.
