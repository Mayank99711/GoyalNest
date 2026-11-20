# GoyalNest mentor demo: release acceptance checklist

Record date, account (TEST ONLY), steps, observed result, screenshot and pass/fail for each scenario.

- [ ] Fresh machine: install Node >=20.19, PostgreSQL; `SETUP_GOYALNEST.cmd` works
- [ ] Environment: `backend/.env` configured; secrets excluded from Git
- [ ] `node scripts/preflight.mjs`, `node scripts/source-check.mjs`, `node scripts/smoke-test.mjs`
- [ ] `npm --prefix frontend run build`
- [ ] Backend `http://localhost:4000/api/health` returns status ok
- [ ] Public homepage/explore/property details render, no broken images or JS errors
- [ ] Public navbar hides when scrolling down, appears on scroll up
- [ ] Login: tenant, owner, manager and admin see correct names, dashboard links
- [ ] Logout clears protected access; cross-role API calls rejected
- [ ] Only tenant can submit booking; guest prompts login; owner/manager/admin denied
- [ ] Booking create -> Owner action inbox -> approve/reject -> Tenant notification
- [ ] Approved booking -> assigned Manager move-in preparation; check-in prerequisites enforced
- [ ] Cash reported -> Owner verification -> Tenant notified; ledger correct; no duplicate posting
- [ ] Maintenance request -> assigned recipient -> status change -> Tenant notified
- [ ] Owner publication without active subscription blocked; Admin guard works
- [ ] Subscription checkout 409 scoped by owner; sandbox test only; no duplicate charges
- [ ] Subscription history distinguishes TEST_PAID and active subscription
- [ ] Demo synthetic listings marked as illustrative; audit shows legacy exceptions
- [ ] Payroll, deposits, refunds and move-out smoke tests on synthetic records
- [ ] Responsive: 375px phone, 768px tablet, desktop; no horizontal scrollbar
- [ ] Same-Wi-Fi mobile: LAN address opens; backend API and auth work
- [ ] GitHub: no .env, uploaded documents, passwords, keys or actual tenant PII

Do not mark any item PASS without executing it on the current local version.
