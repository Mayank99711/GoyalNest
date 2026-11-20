const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

export function getIndiaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type) => Number(parts.find((p) => p.type === type).value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

export function getReminderSchedule(year, month) {
  const monthStart = utcDay(year, month, 1);

  const reminder = new Date(monthStart.getTime() - 5 * MS_PER_DAY);

  return {
    reminderDate: reminder.toISOString().slice(0, 10),
    monthStart: monthStart.toISOString().slice(0, 10),
  };
}

export function shouldSendReminder(now, billingYear, billingMonth) {
  const { year, month, day } = getIndiaDate(now);

  const today = [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

  const schedule = getReminderSchedule(billingYear, billingMonth);

  // Send on scheduled day OR catch up before
  // the next billing month begins.
  return today >= schedule.reminderDate && today < schedule.monthStart;
}

export function isInvoiceOverdue(invoice, now = new Date()) {
  return (
    invoice.status === "PENDING" &&
    new Date(invoice.dueDate).getTime() < now.getTime()
  );
}

export function calculateLateFee(amount) {
  return Math.min(500, Math.round(Number(amount) * 0.02));
}
