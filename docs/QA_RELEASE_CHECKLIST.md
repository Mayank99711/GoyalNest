# GoyalNest — Local QA and production release gates

## Safe commands (from the project root)
- `node scripts/qa-preflight.mjs` — validates core local project layout
- `npm test --prefix backend` — current rent unit tests, not the complete test suite
- `npm run build --prefix frontend` — requires frontend dependencies installed
- `npm run dev --prefix backend` and `npm run dev --prefix frontend` — run in separate terminals

## Before accepting a deployment
1. Verify all four role logins and that roles cannot call another role's APIs.
2. Confirm owner subscription checkout retries, 409 conflicts, gateway signatures and idempotency using official TEST credentials; never equate TEST_PAID with real revenue.
3. Run check-in, booking double-claim, rent/deposit/refund, attendance and payroll reconciliation against an isolated staging DB.
4. Verify email inbox delivery separately from SMTP acceptance.
5. Inspect responsive sidebar at 320/375/768/1024/1440px and admin checkout filters across more than 20 gateway records.
6. Confirm private document storage, retention, backups+restore rehearsal and scheduler coordination before multiple production instances.
7. Run vulnerability, security and accessibility scans plus authorized payment gateway E2E; record actual evidence.

No migration, payroll finalization, payment activation, gateway call or upload deletion is performed by this patch.
