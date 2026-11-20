# Release status / known limitations

As of 20 Nov 2026, based on a 19 Nov *source-only* upload and user-reported local patch runs.

## Verified from user terminal output
- NCR demo photo seeder: 66 of 67 demo properties updated, one already had images.
- Subscription & publication merged installer: 6 files applied, 7/7 focused tests passed, backend admin route syntax passed.
- Read-only audit: 69 published properties, 67 without unexpired subscriptions; all 67 labeled synthetic, zero other exceptions.

## Not established from the information provided
- That every previously distributed UI/notification patch is installed in the **current** local project.
- That a fresh machine can complete npm ci, database provisioning and all E2E tests.
- That the site functions on real mobile phone(s) over LAN.
- That subscription TEST_PAID creates real paid entitlement, or any actual funds settled.
- That current GitHub remote exists or code has been pushed.

## Release decision
Mentor demo can proceed once the QA checklist's demo-critical paths pass locally. Do not claim production readiness or payment settlement without additional evidence.
