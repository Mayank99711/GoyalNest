import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function canPayInvoice(period) {
  // Invoice period format: YYYY-MM
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    return false;
  }

  const paymentOpens = `${period}-01`;

  // Earlier invoices remain payable after the 6th.
  return indiaToday() >= paymentOpens;
}

const r = Router();

r.use(authenticate);

const PENALTY_RATE = 0.02;
const MAX_LATE_FEE = 500;

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function getPeriod(date) {
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0")
  );
}

// Payment deadline: 6th at 11:59:59 PM IST
function rentDeadline(period) {
  const [year, month] = period.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, 6, 18, 29, 59, 999));
}

function calculateLateFee(amount) {
  return Math.min(MAX_LATE_FEE, Math.round(amount * PENALTY_RATE));
}

// ------------------------------------
// TENANT: DEMO RENT / DEPOSIT PAYMENT
// ------------------------------------

r.post(
  "/payments/demo",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    required(
      process.env.NODE_ENV !== "production",
      "Demo payments disabled in production",
      403,
    );

    const { tenancyId, invoiceId, kind } = req.body;
    const requestedAmount = req.body.amount;

    required(["RENT", "DEPOSIT"].includes(kind), "Invalid payment kind", 400);

    required(
      typeof tenancyId === "string" && tenancyId,
      "Tenancy ID required",
      400,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        // PostgreSQL row lock prevents simultaneous
        // payment requests from overpaying a record.
        if (kind === "RENT") {
          required(
            typeof invoiceId === "string" && invoiceId,
            "Invoice ID required",
            400,
          );

          const locked = await tx.$queryRaw`
            SELECT id FROM "RentInvoice"
            WHERE id = ${invoiceId}
            FOR UPDATE
          `;

          required(locked.length === 1, "Invoice not found", 404);
        } else {
          const locked = await tx.$queryRaw`
            SELECT id FROM "Tenancy"
            WHERE id = ${tenancyId}
            FOR UPDATE
          `;

          required(locked.length === 1, "Tenancy not found", 404);
        }

        const tenancy = await tx.tenancy.findUnique({
          where: { id: tenancyId },
        });

        required(
          tenancy && tenancy.tenantId === req.user.id,
          "Tenancy not found",
          404,
        );

        required(
          !["VACATED", "CANCELLED"].includes(tenancy.status),
          "Tenancy is closed",
          400,
        );

        let balance = 0;
        let invoice = null;

        if (kind === "RENT") {
          invoice = await tx.rentInvoice.findFirst({
            where: {
              id: invoiceId,
              tenancyId,
            },
          });

          required(
            invoice && ["PENDING", "OVERDUE"].includes(invoice.status),
            "Unpaid invoice required",
            400,
          );

          // Reject future-month payments.
          const todayParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).formatToParts(new Date());

          const part = (type) => todayParts.find((p) => p.type === type).value;

          const today = `${part("year")}-${part("month")}-${part("day")}`;

          required(
            today >= `${invoice.period}-01`,
            "Payment opens on the first day of the billing month",
            400,
          );

          // Never simulate additional demo funds after verified real payments.
          const realPayment = await tx.payment.findFirst({
            where: { invoiceId, status: "REAL_PAID" }, select: { id: true },
          });
          required(!realPayment, "Invoice has real payments; demo mode is unavailable", 409);

          const paid = await tx.payment.aggregate({
            where: {
              tenancyId,
              invoiceId,
              kind: "RENT",
              status: "DEMO_PAID",
            },
            _sum: { amount: true },
          });

          const totalDue = invoice.amount + invoice.penalty;

          balance = Math.max(0, totalDue - (paid._sum.amount || 0));
        } else {
          balance = Math.max(0, tenancy.depositRequired - tenancy.depositPaid);
        }

        required(balance > 0, "No outstanding balance", 409);

        const amount =
          requestedAmount === undefined ? balance : requestedAmount;

        required(
          Number.isSafeInteger(amount) && amount > 0 && amount <= balance,
          `Payment must be between 1 and ${balance}`,
          400,
        );

        const payment = await tx.payment.create({
          data: {
            tenancyId,
            invoiceId: kind === "RENT" ? invoiceId : null,
            kind,
            amount,
            status: "DEMO_PAID",
          },
        });

        // Demo transaction notification: never imply actual funds were received.
        if (req.user.email) await tx.emailOutbox.upsert({
          where: { eventKey: `rent-demo:${payment.id}` },
          create: {
            eventKey: `rent-demo:${payment.id}`,
            toEmail: req.user.email,
            subject: "GoyalNest demo payment recorded",
            body: `TEST / DEMO PAYMENT ONLY: INR ${amount} (${kind}) recorded for tenancy ${tenancyId}. No real money was collected. Reference ${payment.id}.`,
          }, update: {},
        });

        const remaining = balance - amount;

        if (kind === "RENT" && remaining === 0) {
          await tx.rentInvoice.update({
            where: { id: invoice.id },
            data: { status: "PAID" },
          });
        }

        if (kind === "DEPOSIT") {
          await tx.tenancy.update({
            where: { id: tenancyId },
            data: {
              depositPaid: {
                increment: amount,
              },
            },
          });
        }

        return {
          payment,
          remaining,
          paymentState: remaining === 0 ? "FULLY_PAID" : "PARTIALLY_PAID",
        };
      },
      { timeout: 10000 },
    );

    res.json({
      ...result,
      message: "Demo payment recorded successfully",
      mode: "DEMO_ONLY_NO_BANK_TRANSFER",
    });
  }),
);

// ------------------------------------
// OWNER: MANUAL MONTHLY GENERATION
// ------------------------------------

r.post(
  "/generate-month",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const period = String(req.body.period || "");

    required(periodPattern.test(period), "Period must be YYYY-MM", 400);

    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: "ACTIVE",
        unit: {
          property: {
            ownerId: req.user.id,
          },
        },
      },
    });

    let generated = 0;
    let skipped = 0;

    for (const tenancy of tenancies) {
      const firstPeriod = getPeriod(tenancy.startDate);

      // First month is handled by the
      // prorated activation invoice.
      if (period <= firstPeriod) {
        skipped++;
        continue;
      }

      const result = await prisma.rentInvoice.createMany({
        data: [
          {
            tenancyId: tenancy.id,
            period,
            amount: tenancy.rent,
            penalty: 0,
            dueDate: rentDeadline(period),
            status: "PENDING",
          },
        ],
        skipDuplicates: true,
      });

      generated += result.count;

      if (result.count === 0) {
        skipped++;
      }
    }

    res.json({
      period,
      generated,
      skipped,
      message: "Monthly rent invoice processing completed",
    });
  }),
);

// ------------------------------------
// OWNER: MANUAL PENALTY PROCESSING
// ------------------------------------

r.post(
  "/apply-penalties",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const now = new Date();

    const invoices = await prisma.rentInvoice.findMany({
      where: {
        status: "PENDING",
        dueDate: {
          lt: now,
        },
        tenancy: {
          status: "ACTIVE",
          unit: {
            property: {
              ownerId: req.user.id,
            },
          },
        },
      },
      include: {
        tenancy: true,
      },
    });

    let updated = 0;

    for (const invoice of invoices) {
      const firstPeriod = getPeriod(invoice.tenancy.startDate);

      // Do not automatically penalize
      // a prorated first-month invoice.
      if (
        invoice.period === firstPeriod &&
        invoice.tenancy.startDate.getUTCDate() > 1
      ) {
        continue;
      }

      const penalty = calculateLateFee(invoice.amount);

      const processed = await prisma.$transaction(async (tx) => {
        const changed = await tx.rentInvoice.updateMany({
          where: {
            id: invoice.id,
            status: "PENDING",
            dueDate: {
              lt: now,
            },
          },
          data: {
            penalty,
            status: "OVERDUE",
          },
        });

        if (changed.count === 0) {
          return false;
        }

        await tx.rentNotice.upsert({
          where: {
            invoiceId_kind: {
              invoiceId: invoice.id,
              kind: "LATE_FEE",
            },
          },
          update: {},
          create: {
            invoiceId: invoice.id,
            kind: "LATE_FEE",
            title: `Rent Overdue - ${invoice.period}`,
            message:
              `Your rent for ${invoice.period} is overdue.\n` +
              `Rent: INR ${invoice.amount}\n` +
              `Late fee: INR ${penalty}\n` +
              `Total outstanding: INR ${invoice.amount + penalty}\n` +
              `Please check your GoyalNest portal.`,
          },
        });

        return true;
      });

      if (processed) {
        updated++;
      }
    }

    res.json({
      updated,
      message: "Late penalty processing completed",
    });
  }),
);

// Tenant / Owner: invoice payment balances
r.get(
  "/balances",
  roles("TENANT", "OWNER"),
  asyncRoute(async (req, res) => {
    const where =
      req.user.role === "TENANT"
        ? { tenancy: { tenantId: req.user.id } }
        : {
            tenancy: {
              unit: {
                property: {
                  ownerId: req.user.id,
                },
              },
            },
          };

    const invoices = await prisma.rentInvoice.findMany({
      where: {
        AND: [
          where,
          {
            status: {
              not: "CANCELLED",
            },
          },
        ],
      },
      include: {
        tenancy: {
          include: {
            unit: {
              include: { property: true },
            },
            tenant: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const results = await Promise.all(
      invoices.map(async (invoice) => {
        const payments = await prisma.payment.aggregate({
          where: {
            invoiceId: invoice.id,
            kind: "RENT",
            status: "DEMO_PAID",
          },
          _sum: { amount: true },
        });

        const paid = payments._sum.amount || 0;
        const total = invoice.amount + invoice.penalty;

        const remaining =
          invoice.status === "PAID" ? 0 : Math.max(0, total - paid);

        return {
          invoiceId: invoice.id,
          tenancyId: invoice.tenancyId,
          period: invoice.period,
          property: invoice.tenancy.unit.property.title,
          tenant: invoice.tenancy.tenant.name,
          amount: invoice.amount,
          penalty: invoice.penalty,
          total,
          paid,
          remaining,
          status:
            invoice.status === "PAID"
              ? "PAID"
              : paid > 0
                ? "PARTIALLY_PAID"
                : invoice.status,
          dueDate: invoice.dueDate,
        };
      }),
    );

    res.json(results);
  }),
);

// Tenant: request a refund review.
// This does NOT transfer money or reverse a payment.
r.post(
  "/refund-requests",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const { paymentId, reason } = req.body;

    required(
      typeof paymentId === "string" && paymentId,
      "Payment ID required",
      400,
    );

    required(
      typeof reason === "string" &&
        reason.trim().length >= 10 &&
        reason.trim().length <= 500,
      "Refund reason must be 10-500 characters",
      400,
    );

    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        tenancy: { tenantId: req.user.id },
        status: "DEMO_PAID",
      },
    });

    required(payment, "Payment not found", 404);

    const existing = await prisma.paymentRefundRequest.findUnique({
      where: { paymentId },
    });

    required(!existing, "Refund request already exists", 409);

    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentRefundRequest.create({
        data: {
          paymentId,
          requestedBy: req.user.id,
          amount: payment.amount,
          reason: reason.trim(),
          status: "REQUESTED",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "REFUND_REQUESTED",
          entityType: "PaymentRefundRequest",
          entityId: created.id,
          metadata: {
            paymentId,
            amount: payment.amount,
            reason: reason.trim(),
          },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "Refund review request recorded. No funds were transferred.",
      request,
    });
  }),
);

// Tenant: own refund requests
r.get(
  "/refund-requests/mine",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    res.json(
      await prisma.paymentRefundRequest.findMany({
        where: { requestedBy: req.user.id },
        orderBy: { createdAt: "desc" },
      }),
    );
  }),
);

export default r;
