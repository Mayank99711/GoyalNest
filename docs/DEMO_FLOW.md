# Demo flow for mentor

1. Super Admin signs in using seeded credentials. Show pending listing moderation.
2. Owner registers with name/email/password without OTP. Sign in as Owner after Admin logs out (same-browser portal restriction).
3. Owner activates Pro **demo** subscription. Creates a flat/PG, adds unit(s), submits for moderation.
4. Admin logs back in and publishes listing.
5. Tenant signs up and receives **real SMTP OTP**. Verify, sign in, add KYC reference and emergency phone, and book a unit.
6. Owner approves booking. Booking status becomes APPROVED; tenancy is PENDING_PAYMENT; first prorated invoice is generated.
7. Tenant pays first rent in **demo mode** and deposit only if opted in; tenancy activates. Show monthly rent generation.
8. Owner appoints a property manager assigned to one property. Manager may view bookings and manage maintenance but cannot approve booking or add staff.
9. Tenant raises maintenance issue; Manager resolves it.
10. Tenant submits vacating notice; Manager records inspection; Owner settles deposit (calculation only).

Be transparent about demo payments and pending third-party integrations; do not claim these are live bank transfers or legally certified e-signatures.
