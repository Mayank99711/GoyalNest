import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const route = readFileSync(new URL("./agreementVersions.routes.js", import.meta.url), "utf8");
test("publish persists tenant notification in the same transaction", () => {
  assert.match(route, /type: "AGREEMENT_PUBLISHED"/);
  assert.match(route, /userIds: \[tenancy\.tenantId\]/);
  assert.match(route, /status: "PENDING_ACCEPTANCE"/);
});
test("accept persists owner notification after consent audit", () => {
  assert.match(route, /type: "AGREEMENT_ACCEPTED"/);
  assert.match(route, /userIds: \[property\?\.property\?\.ownerId\]/);
  assert.match(route, /AGREEMENT_CONSENT_RECORDED/);
});
