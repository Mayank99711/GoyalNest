import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const upload = read("../Kyc/kyc.routes.js");
const admin = read("../admin/adminOperations.routes.js");
const dashboard = read(
  "../../../../frontend/src/features/overview/PortalOverviews.jsx",
);
test("KYC upload creates ADMIN notification within its transaction", () => {
  assert.match(upload, /activeUserIdsByRole\(tx, "ADMIN"\)/);
  assert.match(upload, /type: "KYC_SUBMITTED"/);
});
test("KYC decisions notify Tenant", () => {
  assert.match(admin, /type: "KYC_REVIEWED"/);
  assert.match(upload, /type: "KYC_REVIEWED"/);
});
test("Admin pending count queries persisted records", () => {
  assert.match(admin, /"\/kyc\/pending-summary"/);
  assert.match(admin, /type: "KYC", status: "PENDING"/);
});
test("Dashboard includes pending KYC action and link", () => {
  assert.match(dashboard, /kyc\/pending-summary/);
  assert.match(dashboard, /to:'agreements#gn-kyc-review'/);
});
