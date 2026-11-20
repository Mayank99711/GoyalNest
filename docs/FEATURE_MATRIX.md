# Feature scope — honest MVP status

| Area | Implemented locally | Needed for production |
|---|---|---|
| PostgreSQL persistence | Prisma schema and CRUD via PostgreSQL | Migration review, backups, monitoring |
| Portals | Admin / Owner / Manager / Tenant React workspaces | Accessibility QA, responsive browser regression |
| Portal lock | Same-browser storage sync + backend cookie mismatch rejection | Concurrency, session revocation, CSRF audit |
| Registration | Tenant OTP via SMTP, owner no OTP, manager by owner, admin seed | Resend OTP, delivery metrics, abuse/rate limit hardening |
| Property listing | Draft, units, submission and admin moderation | Photo upload / moderation audit logs |
| Booking | Tenant request, owner-only approve/reject, capacity check | Strong DB-level inventory reservation under concurrency |
| Rent | First month proration, monthly invoice endpoint, late fees | Production durable job queue, monitoring, missed-job recovery and retries |
| Payment | Demo recording only | Razorpay/other provider, webhook validation, refunds |
| Security deposit | Tenant opt-in and payment condition | Real escrow/deposit accounting and policy review |
| Refund | Cancellation policy calculator, move-out settlement record | Actual bank/gateway refund processing |
| KYC | Metadata link | Encrypted private document upload and data retention |
| Agreement | Text template / link metadata, typed consent | PDF generation, legally valid e-sign provider |
| Manager | Owner-appointed and property-scoped | Granular custom staff roles |
| Maintenance | Request and status workflow | Staff dispatch, notifications, SLAs |
| Reports | Basic counts | Financial/occupancy analytics |

Pricing examples: Starter ₹499/month for 2 listings; Pro ₹999 for 10; Business ₹1,999 for 50. All are illustrative pending mentor approval.

## Role creation policy (corrected)

- Super Admin is created using `npm run db:seed` and `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Super Admin alone creates OWNER accounts at `/api/admin/owners`, with a temporary password transmitted out-of-band. No owner self-registration.
- Property Owner alone appoints MANAGER accounts and property assignments via `/api/team/appoint`. No Manager self-registration or staff appointment by Managers.
- TENANT alone may use `/api/auth/register`, receive SMTP OTP, and verify email.

## Scope limitations in this release

- Full modules from the original business blueprint are NOT all complete. A module directory does not imply end-to-end UI or integration.
- Still needed: property visits/scheduling, full media uploads and galleries, employee types beyond Property Manager, robust secure KYC storage, PDF agreement creation, certified e-sign, live payments/refunds, detailed occupancy/expense reports, subscription payment gateway, notification queue and audit trails.
- Current agreement uses generated text / external URL metadata + consent, NOT generated PDF or certified e-sign.
- Current payments and subscription activation are demo only.
