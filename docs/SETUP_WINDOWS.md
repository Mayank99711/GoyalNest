# GoyalNest - Clean Windows setup (PowerShell)

## 1. Prerequisites
- **Node.js 20.19+ or 22**, npm, VS Code and **PostgreSQL 15+**.
- Install PostgreSQL with a local superuser (usually `postgres`) and keep its password safe.
- Extract the ZIP to `C:\Projects\GoyalNest` (avoid overwriting your previous project).

## 2. Create PostgreSQL database
Open **SQL Shell (psql)** from the Windows Start menu. Sign in as `postgres`. Run:

```sql
CREATE DATABASE goyalnest;
```

Alternatively in pgAdmin: Databases > Create > Database > name `goyalnest`.

Test in SQL Shell:

```sql
\c goyalnest
SELECT current_database();
```

For team deployment create a dedicated least-privilege DB role instead of using the `postgres` superuser.

## 3. Configure backend

```powershell
cd C:\Projects\GoyalNest
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

Set these **real, local** values (never paste secrets in chat):

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/goyalnest?schema=public"
JWT_SECRET=USE_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS_LONG
FRONTEND_ORIGIN=http://localhost:5173
ADMIN_NAME=Your Name
ADMIN_EMAIL=your-admin@example.com
ADMIN_PASSWORD=YOUR_STRONG_UNIQUE_ADMIN_PASSWORD
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-sending-account@gmail.com
SMTP_PASSWORD=your_google_app_password
MAIL_FROM=your-sending-account@gmail.com
DEV_SHOW_OTP=false
```

**Passwords containing `@`, `#`, `:` or other URL-reserved characters must be URL-encoded in DATABASE_URL.** Example: `@` becomes `%40`. This prevents confusing database connection failures.

For Gmail SMTP: enable 2-Step Verification on the sending Google account, create a permitted **App Password** (availability depends on account policy), and use that password in `SMTP_PASSWORD`. Never use your normal Google account password.

`frontend/.env` is optional: the Vite proxy forwards `/api` to `localhost:4000`. Do not place secrets in frontend variables.

## 4. Install packages and create schema

From project root in PowerShell:

```powershell
node -v
npm run install:all
npm run db:generate
npm run db:push
npm run db:seed
```

`db:push` creates PostgreSQL tables using `backend/prisma/schema.prisma`. `db:seed` creates one Super Admin if not already present. **If the admin already exists, changing `.env` will not reset the password automatically.** The project deliberately does not overwrite existing admin credentials.

## 5. Run both servers

Terminal 1 (backend):

```powershell
npm run dev:api
```

Terminal 2 (frontend):

```powershell
npm run dev:web
```

Open http://localhost:5173. To verify API, open http://localhost:4000/api/health.

If E-Shop already uses port 4000, stop E-Shop before starting GoyalNest.

## 6. First login & workflow
1. Super Admin: use the email/password you set in backend/.env at the **Super Admin** portal.
2. Property Owner: register using email and password, no owner OTP required.
3. Owner activates a **demo subscription** and adds property/rooms, then submits listing.
4. Super Admin approves the listing.
5. Tenant registers; the system sends OTP via SMTP; tenant verifies email and signs in.
6. Tenant adds a **KYC reference** and emergency contact, then requests a unit/room.
7. Owner approves; system creates prorated rent invoice, optional deposit and tenancy.
8. Tenant uses demo payment buttons; tenancy becomes active.
9. Owner can appoint a Manager, who manages assigned property maintenance but cannot approve bookings.
10. Tenant requests move-out; Manager records inspection; Owner approves manual deposit settlement.

## 7. Portal-lock behavior
You can only sign in to one portal per browser profile at a time. To switch roles, **log out first**. Incognito and other browser profiles are independent. Backend also checks the active auth cookie before switching accounts.

## 8. Troubleshooting
- `P1001` / cannot reach database: start PostgreSQL, verify hostname/port and password.
- `P1000` authentication failed: fix `DATABASE_URL` and URL-encode reserved characters.
- SMTP 535 / authentication: verify Google App Password and the SMTP account.
- Tenant email fails: check Gmail App Password and server logs; `DEV_SHOW_OTP=false` keeps real-email verification mandatory.
- Prisma client not generated: run `npm run db:generate`.
- Port 4000 busy: stop other apps, or change backend PORT and frontend vite proxy target.
- Login fails after editing seeded admin credentials: admin seed does not overwrite existing accounts. Use a safe password reset flow rather than deleting the database.

## 9. Development limitations
Real card processing, scheduled notification jobs, legally compliant e-sign, secure identity-document uploads, production file storage, and end-to-end browser QA are not complete. Keep demo mode local until those are implemented and reviewed.
