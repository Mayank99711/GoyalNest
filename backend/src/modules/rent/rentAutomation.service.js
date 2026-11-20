import {
  shouldSendReminder,
  isInvoiceOverdue,
  calculateLateFee,
} from "./rentAutomation.rules.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { sendRentReminder } from "../../lib/email.js";
const TZ = "Asia/Kolkata";
const PENALTY_RATE = 0.02;
const MAX_LATE_FEE = 500;

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => Number(parts.find((p) => p.type === type).value);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function utcDate(year, month, day) {
  // month is 1-based
  return new Date(Date.UTC(year, month - 1, day));
}

function periodOf(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(year, month, count) {
  const date = utcDate(year, month + count, 1);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}
function canBillPeriod(tenancy, year, month) {
  if (tenancy.status !== "ACTIVE") {
    return false;
  }

  const period = periodOf(year, month);
  const start = dateParts(tenancy.startDate);

  if (period < periodOf(start.year, start.month)) {
    return false;
  }

  if (tenancy.moveOut?.requestedDate) {
    const moveOut = dateParts(tenancy.moveOut.requestedDate);

    if (period > periodOf(moveOut.year, moveOut.month)) {
      return false;
    }
  }

  return true;
}

function reminderDate(year, month) {
  const date = utcDate(year, month, 1);
  date.setUTCDate(date.getUTCDate() - 5);

  return date;
}

function paymentDeadline(year, month) {
  // 6th at 23:59:59 IST = 6th at 18:29:59 UTC
  return new Date(Date.UTC(year, month - 1, 6, 18, 29, 59, 999));
}

function istKey(date) {
  const { year, month, day } = dateParts(date);

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

async function createInvoice(tenancy, year, month) {
  const period = periodOf(year, month);

  // Re-read the tenancy before creating an invoice.
  const currentTenancy = await prisma.tenancy.findUnique({
    where: { id: tenancy.id },
    include: {
      moveOut: {
        select: {
          requestedDate: true,
        },
      },
    },
  });

  if (!currentTenancy || !canBillPeriod(currentTenancy, year, month)) {
    return null;
  }

  return prisma.rentInvoice.upsert({
    where: {
      tenancyId_period: {
        tenancyId: tenancy.id,
        period,
      },
    },
    create: {
      tenancyId: tenancy.id,
      period,
      amount: tenancy.rent,
      penalty: 0,
      dueDate: paymentDeadline(year, month),
      status: "PENDING",
    },
    update: {},
  });
}

async function createNotice(invoiceId, kind, title, message) {
  return prisma.rentNotice.upsert({
    where: {
      invoiceId_kind: {
        invoiceId,
        kind,
      },
    },
    update: {},
    create: {
      invoiceId,
      kind,
      title,
      message,
    },
  });
}

async function sendPendingEmails() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass || !env.smtp.from) {
    console.warn(
      "[Rent Automation] SMTP not configured. " +
        "Email pending; portal notifications remain available.",
    );
    return;
  }

  const notices = await prisma.rentNotice.findMany({
    where: {
      emailedAt: null,
    },
    include: {
      invoice: {
        include: {
          tenancy: {
            include: {
              tenant: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 100,
  });

  for (const notice of notices) {
    try {
      const invoice = notice.invoice;
      if (invoice.status === "CANCELLED") {
        console.log(
          "[Rent Automation] Skipping cancelled invoice:",
          invoice.id,
        );
        continue;
      }

      if (notice.kind === "ADVANCE_REMINDER") {
        const tenancy = await prisma.tenancy.findUnique({
          where: {
            id: invoice.tenancyId,
          },
          include: {
            moveOut: {
              select: { requestedDate: true },
            },
          },
        });

        const [year, month] = invoice.period.split("-").map(Number);

        if (
          !tenancy ||
          !canBillPeriod(tenancy, year, month) ||
          invoice.status === "PAID"
        ) {
          console.log(
            "[Rent Automation] Skipped ineligible reminder:",
            notice.id,
          );
          continue;
        }
      }

      const email = invoice.tenancy.tenant.email;

      await sendRentReminder(
        email,
        invoice.period,
        invoice.amount + invoice.penalty,
        new Date(invoice.dueDate).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      );

      await prisma.rentNotice.update({
        where: {
          id: notice.id,
        },
        data: {
          emailedAt: new Date(),
        },
      });

      console.log("[Rent Automation] Email submitted:", notice.id);
    } catch (error) {
      console.error(
        "[Rent Automation] Email failed:",
        notice.id,
        error.message,
      );
    }
  }
}

let running = false;

export async function runRentAutomation(now = new Date()) {
  if (running) {
    console.log("[Rent Automation] Previous run still active");
    return;
  }

  running = true;

  try {
    const today = dateParts(now);
    const todayKey = istKey(now);

    const next = addMonths(today.year, today.month, 1);

    const isReminderDay = shouldSendReminder(now, next.year, next.month);
    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
      },
      include: {
        tenant: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    for (const tenancy of tenancies) {
      // Do not bill before the tenancy start date.
      const startKey = istKey(tenancy.startDate);

      // Create the current month's full invoice when
      // no existing invoice exists.
      // First partial-month billing is managed
      // separately by the tenancy activation flow.
      const startMonth = periodOf(
        dateParts(tenancy.startDate).year,
        dateParts(tenancy.startDate).month,
      );

      const currentPeriod = periodOf(today.year, today.month);

      if (startKey <= todayKey && startMonth < currentPeriod) {
        await createInvoice(tenancy, today.year, today.month);
      }

      if (isReminderDay) {
        const upcomingPeriod = periodOf(next.year, next.month);

        if (startMonth <= upcomingPeriod) {
          const invoice = await createInvoice(tenancy, next.year, next.month);

          if (invoice && invoice.status !== "PAID") {
            await createNotice(
              invoice.id,
              "ADVANCE_REMINDER",
              `GoyalNest Rent Reminder - ${upcomingPeriod}`,
              `Hello ${tenancy.tenant.name},

Your rent for ${upcomingPeriod} is due soon.

Monthly Rent: INR ${invoice.amount}
Payment Window: 1st to 6th of the billing month
Last Date Without Penalty: 6th of the billing month

Please log in to GoyalNest to view your invoice and complete payment.

GoyalNest Property & Living`,
            );
          }
        }
      }
    }

    // Late fee only starts on or after the 7th.
    {
      const overdueInvoices = await prisma.rentInvoice.findMany({
        where: {
          status: "PENDING",
          dueDate: {
            lt: now,
          },
          tenancy: {
            status: "ACTIVE",
          },
        },
        include: {
          tenancy: true,
        },
      });

      for (const invoice of overdueInvoices) {
        // The first partial-month invoice has a
        // different due-date policy. Do not
        // automatically penalize it.
        const start = dateParts(invoice.tenancy.startDate);

        const firstPeriod = periodOf(start.year, start.month);

        if (invoice.period === firstPeriod && start.day > 1) {
          continue;
        }
        // Verify overdue status before applying penalty.
        if (!isInvoiceOverdue(invoice, now)) {
          continue;
        }
        const penalty = calculateLateFee(invoice.amount);

        const changed = await prisma.rentInvoice.updateMany({
          where: {
            id: invoice.id,
            status: "PENDING",
          },
          data: {
            status: "OVERDUE",
            penalty,
          },
        });

        if (changed.count === 1) {
          await createNotice(
            invoice.id,
            "LATE_FEE",
            `GoyalNest - Rent Overdue (${invoice.period})`,
            `Your rent payment for ${invoice.period} is overdue.

Rent: INR ${invoice.amount}
One-time late fee: INR ${penalty}
Total outstanding: INR ${invoice.amount + penalty}

Please visit your GoyalNest Tenant Portal to complete payment.

If payment has already been made, contact your Property Owner for reconciliation.`,
          );
        }
      }
    }

    await sendPendingEmails();

    console.log("[Rent Automation] Completed:", todayKey);
  } finally {
    running = false;
  }
}
