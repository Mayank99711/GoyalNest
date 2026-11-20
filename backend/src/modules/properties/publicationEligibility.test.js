import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionPublicationEligibility } from "./publicationEligibility.js";
const property = { id: "p1", ownerId: "o1" };
test("owner without active subscription is ineligible", async () => {
  const tx = { subscription: {findFirst: async () => null} };
  const result = await subscriptionPublicationEligibility(tx, property);
  assert.equal(result.ok, false);
});
test("pending property is excluded from listing capacity count", async () => {
  let where;
  const tx = {
    subscription: {findFirst: async () => ({ listingLimit: 2 })},
    property: {count: async args => { where = args.where; return 1; }},
  };
  const result = await subscriptionPublicationEligibility(tx, property);
  assert.equal(result.ok, true);
  assert.equal(where.id.not, "p1");
});
test("full capacity prevents publication", async () => {
  const tx = {
    subscription: {findFirst: async () => ({ listingLimit: 2 })},
    property: {count: async () => 2},
  };
  assert.equal((await subscriptionPublicationEligibility(tx, property)).ok, false);
});
