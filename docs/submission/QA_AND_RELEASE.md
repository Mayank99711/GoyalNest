# Mentor submission QA / release assessment

## Verified from supplied user logs on 20 Nov 2026

- Node v22.20.0; project preflight 0 failures and 0 warnings.
- 80/80 backend JavaScript syntax checks passed.
- 18/18 discovered unit tests passed.
- Vite production build succeeded, with performance warning about a JS bundle >500 KB.
- GoyalNest public site opened on phone through same-Wi-Fi LAN after network switching was resolved; **mobile payments and all responsiveness were not passed**.
- Historical subscription audit: 69 published; 67 synthetic NCR demo listings without an unexpired subscription (not evidence of genuine payment).

## Not established from information provided

- Full browser end-to-end tests across all modules and four roles.
- Production security review, pen test, deployment, server monitoring, DB restore drill.
- Verified successful real online rent settlement, bank transfer, production SMS/email inbox delivery.
- Mentor acceptance or GitHub push.

## High-priority smoke checks with synthetic test accounts

| Priority | Flow | Expected result |
|---|---|---|
| P0 | Guest and Tenant booking permissions | Only TENANT can submit, other roles receive safe denial |
| P0 | Owner subscription and publication | Eligible plan required for new publication; no cross-owner checkout blocking |
| P0 | Tenant registration / OTP | Readable 4xx validation; no raw 500 on invalid length; valid OTP path works |
| P0 | KYC upload → Admin | Pending review count appears; authorized review modal; Verify/Reject changes status |
| P0 | Agreement publish → Tenant accept | Tenant notification/action; explicit acceptance; Owner receives status update |
| P0 | Rent payment methods | Demo/Test clearly labeled; cash not marked paid until Owner verifies; no duplicate settlement |
| P1 | Booking approval → Manager check-in | Owner approval not equal to physical check-in; assignment permissions respected |
| P1 | Maintenance | Correct Owner/Manager recipient; status updates; no wrong-property access |
| P1 | Bell and notification actions | Unread counts, correct role links, no silent nonfunctional buttons |
| P1 | Mobile all portal layouts | No clipped tables/overlay; proper navbar and touch targets |
| P1 | Auth/session and CSRF/access control | Refresh persistence, logout, scoped API permissions |
| P1 | Re-run after changes | Backend tests + frontend build, then actual end-to-end walkthrough |

## Recommended mentor demo scenario

1. Show responsive public homepage + searchable location.
2. Sign in as Tenant and submit a **demo** booking.
3. Sign in as Owner and review booking, subscription and listed property.
4. Sign in as Super Admin and show listing approval/KYC review on **synthetic** data.
5. Sign in as Manager, show allowed property scope and check-in readiness.
6. Demonstrate notification bell/links and agreement acceptance, if local integration tests pass.
7. Run build/test commands and show README + Windows setup launcher.
8. Git safety audit before private repository push.

## Go/no-go

**Mentor demo:** possible after the above priority smoke checks pass. **Production-ready:** not established. Do not claim actual money settlement from Razorpay TEST, nor pretend the 67 demo listings represent actual properties.
