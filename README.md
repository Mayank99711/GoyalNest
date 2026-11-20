# GoyalNest — Property & Rental Management Platform

> **Mentor submission | 20 November 2026**
> React 19 + Vite frontend · Node.js/Express API · Prisma 6/PostgreSQL · Razorpay **TEST** integration · SMTP/email outbox.
>
> **Status:** Source syntax, discovered unit tests and Vite production build passed on the developer's Windows machine on 20 November 2026 (80/80 backend JS syntax checks, 18/18 discovered tests). This does **not** establish full end-to-end, payment, security, production deployment or mobile responsiveness certification. The source snapshot available for documentation predates some subsequent local patches.

## 1. Overview

GoyalNest is a role-based property and rental management web application. It includes a public property marketplace and separate portal workflows for **Super Admin, Property Owner, Manager and Tenant**. Workflows represented in the code include property listings/rooms, bookings, tenant KYC, agreements, rent invoices/payments, maintenance, move-in/check-in, move-out, subscriptions, payroll/team management and notifications. Features vary by role and some require local/test services.

**Demonstration warning:** The NCR sample property data was synthetically seeded; photos are illustrative, not photos of those addresses. Demo/TEST payment statuses are not evidence of bank settlement. Do not use real KYC documents or real-money gateway credentials for mentor testing.

## 2. Repository structure

```text
GoyalNest/
├── frontend/                    React/Vite browser app
│   ├── public/                  Public static demo images
│   ├── src/
│   │   ├── app/                 Routing, auth/session, navigation
│   │   ├── components/          Shared UI (incl. navigation)
│   │   ├── features/            Admin, owner, manager, tenant, marketplace,
│   │   │                        agreements, checkout, rent, notifications, etc.
│   │   ├── lib/                 HTTP client and shared helpers
│   │   └── styles/              Global styling
│   ├── vite.config.js           /api and /uploads -> localhost:4000 proxy
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── app.js               Express route/middleware assembly
│   │   ├── server.js            DB connection and background workers
│   │   ├── config/              Env and Prisma connection
│   │   ├── middleware/          Auth/authorization
│   │   ├── modules/             Domain API routes and services
│   │   ├── jobs/                Scheduled rent jobs
│   │   └── lib/                 Shared services
│   ├── prisma/                  Schema, explicit seed/audit scripts
│   └── package.json
├── scripts/                     Setup, run, QA and Git safety scripts
├── docs/
│   ├── ARCHITECTURE.md          Existing project architecture (preserved)
│   └── submission/             Onboarding, QA, folder audit, release notes
├── tests/                       Existing cross-module unit tests, if present
├── .github/workflows/           CI checks (if enabled)
├── backend.env.example          Safe placeholder config, not live secrets
├── SETUP_GOYALNEST.cmd          Existing setup launcher
├── START_GOYALNEST.cmd          Existing local launcher
├── START_MOBILE_DEMO.cmd        Existing LAN demo launcher
├── SETUP_GOYALNEST_V2.cmd       New, non-destructive setup
├── START_GOYALNEST_V2.cmd       New local launcher
├── START_MOBILE_DEMO_V2.cmd     New private-LAN launcher
└── README.md
```

**Why no mass relocation?** The existing `frontend/src/features` and `backend/src/modules` structure is already a professional feature-based layout. Moving components on submission day without updating all imports and automated E2E tests could break a working build. `scripts/submission-structure-audit.ps1` identifies extras and potential redundant files without deleting or moving anything. Empty directories are not committed to Git.

## 3. Prerequisites

- **Node.js 20.19+** (Node 22 LTS recommended), npm and Windows PowerShell 5.1+ for the `.cmd` launchers.
- A running **PostgreSQL** server, accessible to the machine, with a dedicated development database and user.
- An existing DB schema consistent with `backend/prisma/schema.prisma`; a fresh DB requires an explicit reviewed schema/migration step (see below).
- Optional **Razorpay TEST** and **SMTP sandbox** values for relevant demonstrations.
- Git for version control; no need to initialize until security audit and smoke tests pass.

## 4. Setup on another Windows computer

1. Copy/clone the **entire project** including frontend, backend, lockfiles, Prisma schema, scripts, public images and migration history if any. Do **not** copy private uploads, `.env`, database dumps or KYC files into Git.
2. Open `backend.env.example` and create `backend/.env` with actual development settings. On a new machine, `SETUP_GOYALNEST_V2.cmd` will copy the template only if `.env` is absent; placeholders must be edited before starting. Configure `DATABASE_URL`, `JWT_SECRET` (strong random secret >=32 characters), `PORT=4000`, email/test keys as needed. Never publish this file.
3. Double-click **`SETUP_GOYALNEST_V2.cmd`**; or run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/submission-setup.ps1`. It validates Node/npm, performs `npm ci` in both app folders, then runs Prisma client generation. **No DB migration, reset or seed happens automatically.**
4. Provision DB schema separately with a reviewed migration strategy. If vetted `backend/prisma/migrations` exist, a DB administrator can use `npx prisma migrate deploy` from `backend` after backing up. Without migration history, **do not run `prisma db push` or reset** on valuable data; use a disposable DB and carefully review SQL/schema impact. A separate seed may be needed for demo users/categories; it is never run automatically.
5. Double-click **`START_GOYALNEST_V2.cmd`**. Visit `http://localhost:5173` and test backend `http://localhost:4000/api/health`.
6. Run the QA commands below. Use **synthetic test accounts only**.

**Common setup blockers:** missing Postgres; invalid `DATABASE_URL`; `JWT_SECRET` below 32 characters; npm dependency installation failure; root `package.json` missing (backend/frontend use `file:..` dependencies); a DB schema not migrated; port 4000/5173 occupied; SMTP/OTP configuration required for account signup.

### Cross-platform command equivalents

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm run db:generate --prefix backend
# In separate terminals:
npm run dev --prefix backend
npm run dev --prefix frontend
```

Copy a **safe, non-secret** environment template to `backend/.env` and configure PostgreSQL before starting. Windows `.cmd` launchers are not available on macOS/Linux.

## 5. Development & QA commands

```powershell
node scripts/preflight.mjs
node scripts/source-check.mjs
node scripts/smoke-test.mjs
npm run build --prefix frontend
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/submission-structure-audit.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/submission-git-audit.ps1
```

For API health: `Invoke-RestMethod http://localhost:4000/api/health` (when backend is running). Build warnings about Vite chunks >500KB are performance warnings, not failed builds; investigate lazy loading before deployment.

**Known verification gap:** Syntax/unit tests do not verify live booking→approval→agreement→KYC→payment→check-in or all responsive screens. See [QA checklist](docs/submission/QA_AND_RELEASE.md).

## 6. Mobile testing (same trusted Wi-Fi)

Run `START_MOBILE_DEMO_V2.cmd`. The frontend should bind on `0.0.0.0:5173`; the Vite proxy forwards `/api` and `/uploads` to the laptop backend `127.0.0.1:4000`. From the phone, open **`http://<laptop-LAN-ip>:5173`**. Mobile data switching, VPN, corporate Wi-Fi client isolation or Windows firewall may interrupt the connection. Never expose the development server to the public internet.

**Security limitation:** LAN HTTP is not HTTPS. Some browser APIs (e.g., `crypto.randomUUID`) require secure contexts; a targeted payment compatibility patch was prepared separately. For real deployment/payments, serve app over **HTTPS** and verify the provider webhook/settlement flow. Mobile open on the developer's phone was reported, but full mobile E2E remains unverified.

## 7. Functional roles and key workflows

| Role | Primary workspaces | Critical test |
|---|---|---|
| Guest | Public Home, Explore, Property Details | Browse without authenticated booking |
| Tenant | Bookings, KYC, Agreements, Rent, Notifications, Maintenance | Tenant-only booking and agreement acceptance |
| Owner | Listings, Booking approvals, Subscriptions, Payments, Agreements, Team | Subscription publication guard, booking decisions and cash confirmation |
| Manager | Assigned properties, Check-in/out, Maintenance | Restricted data access and physical check-in gate |
| Super Admin | Owners, Listings, KYC, Subscriptions, Financial oversight, Notifications | Review KYC, moderation, and role scoping |

**Agreement flow:** A draft is not a Tenant acceptance request. Once published for acceptance, Tenant reviews it and explicitly accepts; notifications are separate from business state.
**KYC:** Store documents securely; use a synthetic test file for demos.
**Payments:** TEST and demo records must never be represented as settled funds. Razorpay callbacks/webhooks and ledger reconciliation must be verified independently.
**Subscription:** A source-level bug fix scoped checkouts by Owner and publication requires eligibility; synthetic NCR properties seeded as PUBLISHED are exceptions in historical data.
**Notifications:** Some events have been integrated in patches, but end-to-end delivery and role-linked action routing require testing.

## 8. Environments and safety

- `backend/.env` is developer-private. `backend.env.example` contains placeholders only.
- Never commit `backend/private-storage`, `backend/uploads`, database `.dump` files, OneDrive backups, credentials or genuine identity documents.
- `backend/prisma/seed*` and recovery/backfill scripts may mutate data. Run only after checking purpose and using a disposable DB/backup.
- Do not execute database reset/push/seed as part of generic setup.
- Use TLS/HTTPS, CSRF/session/access review, rate limits, centralized logging, backup/restore and full E2E validation before describing this as production-ready.

## 9. GitHub submission procedure

1. Run `scripts/submission-structure-audit.ps1` and `scripts/submission-git-audit.ps1` (read-only).
2. Review `.gitignore`, code for embedded credentials, and any **tracked** files. Do not include test KYC, real user records or DB backups.
3. Only after review: `git init`, `git add` **specific reviewed paths**, `git diff --cached --name-only`, `git diff --cached --check`, `git status`.
4. Create a **private GitHub repository** first and add its remote; push after the author confirms the selected repository and Git safety checks. Do not publish credentials or real-person documents in Git history.
5. Include a mentor demo note: local PostgreSQL must be provisioned independently; copying repo alone does **not** install a database with existing business records.

## 10. Documentation

- [Setup and troubleshooting](docs/submission/SETUP_GUIDE.md)
- [Professional structure audit](docs/submission/STRUCTURE_GUIDE.md)
- [QA, remaining work and release checklist](docs/submission/QA_AND_RELEASE.md)
- [Existing architecture](docs/ARCHITECTURE.md) (if present)

**Maintainer note:** This README reflects inspected source and user-reported test output. It does not claim unverified integrations, a real-money payment, deployed server or GitHub push.
