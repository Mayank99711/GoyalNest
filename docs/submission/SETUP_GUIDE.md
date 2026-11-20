# Fresh computer setup / troubleshooting

## Before starting

- Node 20.19+; npm; PostgreSQL; Windows PowerShell 5.1+.
- Full source tree and `package-lock.json` in **both** backend/frontend.
- Root `package.json` named `goyalnest-property-living` because both app packages reference root with `file:..` dependency in the source snapshot.
- Development DB available; schema/migrations reviewed; local `backend/.env` configured.

## Install and run

1. `SETUP_GOYALNEST_V2.cmd` — installs backend/frontend dependencies and generates Prisma client. Copies safe example `.env` only if absent; **never overwrites an existing `.env`**. Does **not** create tables/seed/reset a database.
2. Edit `backend/.env`: `DATABASE_URL`, `JWT_SECRET >=32 chars`, `PORT`, `FRONTEND_ORIGIN`, optional SMTP and Razorpay TEST keys. Do not put secrets in documentation or Git.
3. Check DB connectivity, review schema migrations. If verified migrations exist, run `npx prisma migrate deploy` from `backend` against an approved DB. In older source snapshots migrations may not exist; schema setup then needs a reviewed, explicitly approved procedure. **Do not use `db push` on the valuable local DB as a shortcut.**
4. `START_GOYALNEST_V2.cmd`. Test `http://localhost:4000/api/health` and `http://localhost:5173`.

## Phone

Run `START_MOBILE_DEMO_V2.cmd`, use laptop IPv4 address printed and `http://<IPv4>:5173` on phone connected to same trusted Wi-Fi. Check firewall Private profile (do not disable globally), mobile-data switching and Wi-Fi client isolation. Production must use HTTPS. A smartphone cannot use `localhost:5173` to access the laptop.

## Typical failures

| Symptom | Check |
|---|---|
| `DATABASE_URL missing` | `backend/.env` populated |
| JWT secret error | Secret at least 32 characters |
| Prisma schema error | Correct Postgres, migrations/schema applied |
| `EADDRINUSE` | Another process using port 4000/5173 |
| `npm ci` fails | Supported Node version, lockfile consistent, complete root package present |
| UI shows `Request failed with status code 500` | Backend logs, SMTP, OTP flow, database, route errors; frontend validation alone does not prove cause |
| Phone `ERR_NETWORK_CHANGED` | Stabilize Wi-Fi; disable automatic mobile-data switching for test |
| `crypto.randomUUID is not a function` | Secure-context API on LAN HTTP; apply compatible code fix or use HTTPS |
| Checkout 409 | Existing in-progress checkout; reconcile before creating another payment |

## Developer QA

```powershell
node scripts/preflight.mjs
node scripts/source-check.mjs
node scripts/smoke-test.mjs
npm run build --prefix frontend
```

The above are not a substitute for testing the database and four role workflows.
