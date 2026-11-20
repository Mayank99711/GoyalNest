# GoyalNest - role rules, current scope and development backlog

## Confirmed access hierarchy

| Actor | Account creation | Access |
|---|---|---|
| Super Admin | Manually seeded via backend `.env` | Platform owner provisioning, listing moderation, owner directory |
| Property Owner | Super Admin creates via `/api/admin/owners` | Own properties, manager appointments, room inventory, booking approval, rent and settlement |
| Property Manager | Owner creates and assigns via `/api/team/appoint` | Only assigned properties; inspections, maintenance and booking visibility; cannot create staff, approve booking or refund |
| Tenant | Public registration + real SMTP OTP | Own booking, KYC reference, rent, agreement, complaints and move-out |

No public OWNER or MANAGER registration is permitted. Backend authorization is enforced; hiding UI alone would not be sufficient.

## Working pieces in this patch

- Admin-only Owner creation and Owner activate/deactivate API
- Admin UI for creating Owner (temporary password entered by Admin; share separately)
- Public registration restricted to Tenant OTP only
- Existing owner -> manager appointment and owner-only booking decisions preserved
- Original Prisma enum formatting and seed syntax corrected

## Confirmed full business modules: implementation state

| Module | State | Notes |
|---|---|---|
| Property listings and moderation | Partial | Draft/unit/publish; media upload and video pending |
| Room and bed management | Partial | Units with capacity; physical bed-level IDs and allocation pending |
| Search and filters | Partial | City; advanced budget/gender/amenities pending |
| Visit booking | Not implemented | Calendar, reminders, approvals pending |
| Booking management | Partial | Tenant request and Owner approval, pending operational refinements |
| Tenant onboarding and KYC | Partial | KYC metadata URL only, no secure actual upload or document review |
| Rent schedule and reminders | Partial | Prorated invoice and scheduler, queue/retry and proof-of-delivery pending |
| Payments and deposit | Demo | No real gateway or bank refund |
| Agreement / legal e-sign | Partial | Text and URL metadata, no PDF/e-sign integration |
| Maintenance | Partial | Ticket statuses, no staff dispatch or SLAs |
| Employee management | Partial | Property Manager appointment only; caretaker/security staff pending |
| Vacating and settlement | Partial | Notice, inspection, settlement calculation; refund payout pending |
| Reporting | Minimal | Dashboard counts only; occupancy/collections/expenses pending |
| Subscriptions | Demo | Suggested plans, simulated activation, no live payment |

**This is a corrected foundation, not the complete full-scope commercial application.** Avoid using real KYC data or collecting real payments in this version.

## Safe rollout on your existing Windows database

1. Back up the existing `goyalnest` PostgreSQL database and your existing source folder.
2. Replace source with this release in a separate folder; copy local `backend/.env` from your private backup, not into Git.
3. Install dependencies in root: `npm run install:all`.
4. Run `npm run db:generate`, `npm run db:push`, `npm run db:seed` from root.
5. Restart backend + frontend (`npm run dev:api`, `npm run dev:web`).
6. Sign in as existing Super Admin. Create a test Owner in Admin Dashboard. Sign out, Owner sign in, create a property, appoint Manager, check Tenant can register with OTP.
7. Test `POST /api/auth/register` with `role: OWNER` returns a validation error.

Existing Owner accounts are NOT automatically deleted. To disable an incorrectly self-registered Owner, use Admin's `PATCH /api/admin/owners/:id/status` with `{ "active": false }` after reviewing their data.
