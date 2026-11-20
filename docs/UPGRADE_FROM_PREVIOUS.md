# Upgrade from previous GoyalNest version (Windows)

**Do not delete your current working project or PostgreSQL database before creating backups.** This update changes the **account creation policy**, not existing database model names.

1. Stop the running API and frontend (Ctrl+C).
2. Copy your current project to a backup directory. Keep `backend/.env` private.
3. Extract this ZIP in a **new** folder (do not mix old and new files).
4. In the new folder create `backend/.env` by copying your own existing secrets locally. Do not share them or commit them to Git.
5. At project root: `npm run install:all`, `npm run db:generate`, `npm run db:push`, then `npm run db:seed`.
6. Start: `npm run dev:api` and `npm run dev:web` in separate terminal windows.
7. Super Admin logs in, creates Property Owner using the new **Create Property Owner** form. The Owner signs in with their own temporary password. The Owner creates/manages properties and can appoint a Manager.
8. Tenant self-registration with SMTP OTP continues. Public Owner registration now returns an error even when an API client sends `role: OWNER`.

Existing Owner records stay in PostgreSQL; this release does not delete accounts. The old frontend may need a hard refresh after switching versions.

**Verification:** `npm run check` covers unit and policy source assertions only. Full PostgreSQL API tests, SMTP delivery, React build, and cross-browser UX still need verification on your computer.
