import test from "node:test";
import assert from "node:assert/strict";
import { tenantPasswordError } from "./passwordPolicy.js";

test("7-character password rejected with actionable error", () => {
  assert.match(tenantPasswordError("abcdefg"), /at least 8 characters/);
  assert.match(tenantPasswordError(null), /at least 8 characters/);
});
test("8 and 10 character passwords are accepted", () => {
  assert.equal(tenantPasswordError("abcdefgh"), null);
  assert.equal(tenantPasswordError("abcdefghij"), null);
});
test("128 characters accepted, 129 rejected", () => {
  assert.equal(tenantPasswordError("a".repeat(128)), null);
  assert.match(tenantPasswordError("a".repeat(129)), /128 characters/);
});
