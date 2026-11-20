import test from "node:test";
import assert from "node:assert/strict";

import {
  getReminderSchedule,
  shouldSendReminder,
  isInvoiceOverdue,
  calculateLateFee,
} from "./rentAutomation.rules.js";

test("December reminder starts November 26", () => {
  const schedule = getReminderSchedule(2026, 12);

  assert.equal(schedule.reminderDate, "2026-11-26");
});

test("Reminder runs on November 26", () => {
  assert.equal(
    shouldSendReminder(new Date("2026-11-26T03:30:00Z"), 2026, 12),
    true,
  );
});

test("Missed reminder recovers November 28", () => {
  assert.equal(
    shouldSendReminder(new Date("2026-11-28T03:30:00Z"), 2026, 12),
    true,
  );
});

test("No advance reminder on December 1", () => {
  assert.equal(
    shouldSendReminder(new Date("2026-12-01T03:30:00Z"), 2026, 12),
    false,
  );
});

test("December invoice becomes overdue December 7", () => {
  const invoice = {
    status: "PENDING",
    dueDate: new Date("2026-12-06T18:29:59.999Z"),
  };

  assert.equal(
    isInvoiceOverdue(invoice, new Date("2026-12-07T03:30:00Z")),
    true,
  );
});

test("Paid invoice never receives late penalty", () => {
  const invoice = {
    status: "PAID",
    dueDate: new Date("2026-12-06T18:29:59.999Z"),
  };

  assert.equal(
    isInvoiceOverdue(invoice, new Date("2026-12-10T03:30:00Z")),
    false,
  );
});

test("Late fee 2 percent, capped at 500", () => {
  assert.equal(calculateLateFee(10000), 200);
  assert.equal(calculateLateFee(30000), 500);
});
