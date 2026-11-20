import test from 'node:test';import assert from 'node:assert/strict';import{proratedRent,lateFee,cancellationPenalty,billingPeriod}from'../backend/src/lib/rent.js';
test('mid-month rent prorates from 16th to month end',()=>assert.equal(proratedRent(15000,'2026-11-16'),7500));
test('leap-year month has 29 days',()=>assert.equal(proratedRent(2900,'2028-02-28'),200));
test('billing month and late fee window',()=>{assert.equal(billingPeriod('2026-11-16'),'2026-11');assert.equal(lateFee(10000,6),0);assert.equal(lateFee(10000,7),100);});
test('30 days cancellation is full refund tier',()=>{assert.equal(cancellationPenalty(30),0);assert.equal(cancellationPenalty(20),10);});
