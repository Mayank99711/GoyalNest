# Technical architecture

```text
Browser / React + Vite (5173)
     -> /api (Vite development proxy)
Node / Express (4000)
     -> Auth middleware (JWT cookie + RBAC)
     -> Feature route modules
     -> Prisma Client
PostgreSQL / goyalnest

SMTP provider <- Tenant registration -> Email OTP -> Verify -> Login
```

## Module ownership
- `auth`: registration, SMTP OTP, login/logout, single active browser portal.
- `subscriptions`: owner subscription demo plans.
- `properties`: listings, rentable rooms, approval submission.
- `admin`: moderation and platform oversight.
- `team`: owner-only appointment and assignment.
- `bookings`: owner approval, capacity and partial-month invoice.
- `tenancies`: KYC metadata, move-out and deposit settlement.
- `rent`: demo payments, monthly invoice creation, late fee.
- `maintenance`: tenant requests, manager updates.
- `agreements`: template text or uploaded link metadata + typed name consent (not certified e-sign).

## Authorization
Backend permissions are enforced per role **and** property owner / assignment. The frontend hides other portal pages, but frontend hiding is not authorization. Managers do not create staff or approve booking/refunds. Super Admin is created by an explicit seed step.

## Data model
`User -> Property -> Unit -> Booking -> Tenancy -> RentInvoice -> Payment` with supplemental `ManagerAssignment`, `Subscription`, `TenantDocument`, `OtpCode`, `MaintenanceTicket`, `Agreement`, `MoveOut`.

## Production follow-ups
- Atomic capacity reservations with row-level locking/advisory lock, concurrency retry and load tests.
- Durable scheduling beyond the in-process hourly rent cycle; queued retries and observability for missed reminders.
- S3/private object storage for KYC (current URL reference is NOT a secure upload mechanism).
- Legally compliant e-sign provider and PDF production.
- Real payment gateway, webhooks, reconciliation, idempotency, refunds.
- CSRF threat model, audit trails, RBAC matrix expansion, test coverage and Prisma migrations.
