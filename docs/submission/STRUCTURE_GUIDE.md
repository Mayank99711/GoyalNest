# Folder structure and refactoring policy

## Assessment

The inspected GoyalNest source already has a professional domain-based layout: frontend `src/app`, `src/components`, `src/features`, `src/lib`, `src/styles`; backend `src/config`, `src/middleware`, `src/modules`, `src/lib`, `src/jobs`; database `backend/prisma`. Keep it. It avoids fragile reorganization during mentor submission.

## Recommended hygiene

1. Keep one source of truth for each feature in `frontend/src/features/<domain>` and `backend/src/modules/<domain>`.
2. Use `frontend/src/components` for reusable navigation, accessible form controls, modals and tables only when actually shared. Use feature-local CSS when specific.
3. Add `src/hooks` or `src/services` directories **only when files need them**; empty folders do not belong in Git.
4. Keep root `README.md`, `scripts`, `docs/submission`, `.github/workflows`, root `package.json` and launchers.
5. `backend/private-storage` and uploads stay outside Git; store runtime artifacts on configured protected volumes in real deployment.
6. Move historical `.goyalnest_*_backup_*` folders to an archive **outside** repository, only after verifying copy completeness. Leave stubborn empty OneDrive directories; do not force ownership changes for demo.
7. Root `src/features/admin/PropertyOwners.jsx` was reported as a zero-byte stray path in a Windows backup log. **Do not remove** until checking imports and recent edits; structure audit only reports it.
8. Keep `.gn-backups` for local rollback, ignored from Git.
9. Never mix PII, KYC screenshots, customer exports, `.env` or database `.dump` into source ZIP/repository.

## Safe refactoring sequence (after submission)

- Choose **one** domain at a time, identify imports/re-exports, write component tests, move files, update imports, run `npm run build --prefix frontend`, check browser routes and API flows.
- Prefer deleting unused code only after a reference search and passing tests; do not delete a file because its name looks duplicate.
- Consider lazy loading large route bundles to address Vite >500 kB chunk warning.

## Audit command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/submission-structure-audit.ps1
```

The script is **read-only**; it never reorganizes files automatically.
