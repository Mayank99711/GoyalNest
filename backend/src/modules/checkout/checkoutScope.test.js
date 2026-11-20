import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "checkout.service.js"), "utf8");
const start = source.indexOf("export async function startCheckout(");
const end = source.indexOf("\nexport async function reconcileCapturedPayment", start);
assert.ok(start !== -1 && end > start, "Cannot isolate startCheckout");
const expression = source.slice(start, end).replace("export async function", "async function").trim();
// Controlled execution of the actual function body; mocks do not connect to DB or Razorpay.
const factory = new Function("prisma", "gatewayReady", "getCheckoutDetails", "razorpay", "gatewayKeyId", expression + "\nreturn startCheckout;");
function setup() {
  let next = 0;
  const rows = [];
  const locks = [];
  const tx = {
    $queryRaw: async (strings, lockScope) => { locks.push(lockScope); return []; },
    paymentCheckout: {
      findUnique: async ({where}) => rows.find(r => r.userId === where.userId_idempotencyKey.userId && r.idempotencyKey === where.userId_idempotencyKey.idempotencyKey) || null,
      findFirst: async ({where}) => [...rows].reverse().find(r => r.userId === where.userId && r.purpose === where.purpose && r.referenceId === where.referenceId && where.status.in.includes(r.status)) || null,
      create: async ({data}) => { const record = {...data, id:`checkout-${++next}`}; rows.push(record); return record; },
    },
  };
  const prisma = {
    $transaction: async callback => callback(tx),
    paymentCheckout: {
      update: async ({where,data}) => { const row=rows.find(r=>r.id===where.id); Object.assign(row,data); return {...row}; },
      updateMany: async ({where,data}) => { const row=rows.find(r=>r.id===where.id && r.status===where.status); if(row)Object.assign(row,data); return {count:row?1:0}; },
    },
  };
  const orders = [];
  const razorpay = async (path,{body}) => { orders.push(body); return {id:`order-${orders.length}`,amount:body.amount,currency:'INR'}; };
  const startCheckout = factory(prisma, () => true, async (user,purpose,referenceId) => ({purpose,referenceId,amountPaise:99900,label:'PRO · 1 month',plan:'PRO'}),razorpay,()=> 'rzp_test_fake');
  return {startCheckout, rows, locks, orders};
}
test('different owners independently start the same PRO plan checkout', async () => {
  const s=setup();
  const first=await s.startCheckout({id:'owner-A'}, 'SUBSCRIPTION','PRO','key-A');
  const second=await s.startCheckout({id:'owner-B'}, 'SUBSCRIPTION','PRO','key-B');
  assert.ok(first.checkout && second.checkout);
  assert.notEqual(first.checkout.id, second.checkout.id);
  assert.equal(s.orders.length, 2);
  assert.notEqual(s.locks[0],s.locks[1]);
});
test('same owner reuses existing in-progress checkout instead of duplicating', async () => {
  const s=setup();
  const first=await s.startCheckout({id:'owner-A'},'SUBSCRIPTION','PRO','key-A');
  const again=await s.startCheckout({id:'owner-A'},'SUBSCRIPTION','PRO','key-B');
  assert.equal(again.checkout.id,first.checkout.id);
  assert.equal(s.orders.length,1);
});
test('same-owner idempotency key cannot be reused for a different plan', async () => {
  const s=setup();
  await s.startCheckout({id:'owner-A'},'SUBSCRIPTION','PRO','same-key');
  const other=await s.startCheckout({id:'owner-A'},'SUBSCRIPTION','BASIC','same-key');
  assert.equal(other.status,409);
});
test('rent lock stays invoice-scoped', async () => {
  const s=setup();
  await s.startCheckout({id:'tenant-A'},'RENT','invoice-1','key-A');
  assert.equal(s.locks[0], 'RENT:invoice-1');
});
