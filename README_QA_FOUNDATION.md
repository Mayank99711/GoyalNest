# GoyalNest safe QA foundation patch
This is a non-destructive incremental improvement, **not a production-ready certification**.
Changes: server-wide subscription checkout filtering; dashboard wording; sidebar CSS safety; broken Unicode label fix; root package metadata, basic scripts, env samples, QA docs, and repaired backend test script.

**Precaution:** Inspect `.env.example` before copying any values; existing `.env` files are untouched. `backend/package.json` is changed, but the backend lockfile is not changed because no dependencies were added; run `npm install --package-lock-only --ignore-scripts` on your own environment if your npm reports lock drift.

The PowerShell apply script checks source hashes for each existing file to avoid overwriting edits made after the uploaded ZIP, backs up existing files, and supports `-DryRun` and `-Rollback` using a created backup folder. New root files are created only when absent.
