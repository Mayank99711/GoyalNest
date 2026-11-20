import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("OWNER"));

const isPeriod = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function emptySummary() {
  return {
    billed: 0,
    demoCollected: 0,
    outstanding: 0,
    overdue: 0,
    overdueCount: 0,
    invoiceCount: 0,
    paidInvoiceCount: 0,
    partialInvoiceCount: 0,
    approvedPendingRefund: 0,
    requestedRefund: 0,
    rejectedRefund: 0,
    refundCount: 0,
  };
}

router.get(
  "/owner",
  asyncRoute(async (req, res) => {
    const period = String(req.query.period || "");
    const propertyId = String(req.query.propertyId || "");

    required(!period || isPeriod(period), "Period must be YYYY-MM", 400);

    // Always scope queries to the logged-in Owner.
    const properties = await prisma.property.findMany({
      where: { ownerId: req.user.id },
      select: {
        id: true,
        title: true,
        city: true,
      },
      orderBy: { title: "asc" },
    });

    if (propertyId) {
      required(
        properties.some((p) => p.id === propertyId),
        "Property not found",
        404,
      );
    }

    const selectedIds = propertyId ? [propertyId] : properties.map((p) => p.id);

    const summary = emptySummary();
    const propertyMap = new Map(
      properties
        .filter((p) => selectedIds.includes(p.id))
        .map((p) => [p.id, { ...p, ...emptySummary() }]),
    );

    const invoices = await prisma.rentInvoice.findMany({
      where: {
        ...(period ? { period } : {}),
        status: {
          not: "CANCELLED",
        },
        tenancy: {
          unit: {
            propertyId: { in: selectedIds },
          },
        },
      },
      select: {
        id: true,
        period: true,
        amount: true,
        penalty: true,
        status: true,
        dueDate: true,
        tenancyId: true,
        tenancy: {
          select: {
            unit: {
              select: {
                propertyId: true,
              },
            },
          },
        },
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
    });

    const invoiceIds = invoices.map((i) => i.id);

    // Only successful demo payments are included.
    // Real gateway receipts must be reconciled separately.
    const payments = await prisma.payment.findMany({
      where: {
        invoiceId: { in: invoiceIds },
        kind: "RENT",
        status: "DEMO_PAID",
      },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
      },
    });

    const paidByInvoice = new Map();

    for (const payment of payments) {
      paidByInvoice.set(
        payment.invoiceId,
        (paidByInvoice.get(payment.invoiceId) || 0) + payment.amount,
      );
    }

    const invoiceRows = invoices.map((invoice) => {
      const propertyId = invoice.tenancy.unit.propertyId;

      const total = invoice.amount + invoice.penalty;

      const rawPaid = paidByInvoice.get(invoice.id) || 0;

      // Protect reporting from inconsistent legacy data.
      const paid = Math.min(total, rawPaid);

      const remaining = Math.max(0, total - paid);

      const reportStatus =
        invoice.status === "PAID"
          ? "PAID"
          : paid > 0
            ? "PARTIALLY_PAID"
            : invoice.status;

      const row = {
        id: invoice.id,
        propertyId,
        period: invoice.period,
        amount: invoice.amount,
        penalty: invoice.penalty,
        total,
        paid,
        remaining,
        status: reportStatus,
        overdue:
          invoice.status === "OVERDUE" ||
          (invoice.status !== "PAID" && invoice.dueDate < new Date()),
      };

      for (const target of [summary, propertyMap.get(propertyId)]) {
        if (!target) continue;

        target.invoiceCount++;
        target.billed += total;
        target.demoCollected += paid;
        target.outstanding += remaining;

        if (reportStatus === "PAID") {
          target.paidInvoiceCount++;
        }

        if (reportStatus === "PARTIALLY_PAID") {
          target.partialInvoiceCount++;
        }

        if (row.overdue && remaining > 0) {
          target.overdue += remaining;
          target.overdueCount++;
        }
      }

      return row;
    });

    // Refunds belong to their original payment/property.
    const refundRequests = await prisma.paymentRefundRequest.findMany({
      where: {
        paymentId: {
          in: (
            await prisma.payment.findMany({
              where: {
                tenancy: {
                  unit: {
                    propertyId: {
                      in: selectedIds,
                    },
                  },
                },
              },
              select: { id: true },
            })
          ).map((p) => p.id),
        },
        ...(period
          ? {
              createdAt: {
                gte: new Date(`${period}-01T00:00:00.000Z`),
                lt: (() => {
                  const [year, month] = period.split("-").map(Number);
                  return new Date(Date.UTC(year, month, 1));
                })(),
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Map refund payment ID -> property ID.
    const refundPaymentIds = refundRequests.map((r) => r.paymentId);

    const refundPayments = await prisma.payment.findMany({
      where: {
        id: { in: refundPaymentIds },
      },
      select: {
        id: true,
        tenancy: {
          select: {
            unit: {
              select: { propertyId: true },
            },
          },
        },
      },
    });

    const refundPropertyMap = new Map(
      refundPayments.map((p) => [p.id, p.tenancy.unit.propertyId]),
    );

    const refunds = refundRequests.map((refund) => {
      const linkedPropertyId = refundPropertyMap.get(refund.paymentId);

      for (const target of [summary, propertyMap.get(linkedPropertyId)]) {
        if (!target) continue;

        target.refundCount++;

        if (refund.status === "APPROVED_PENDING_REFUND") {
          target.approvedPendingRefund += refund.amount;
        } else if (refund.status === "REQUESTED") {
          target.requestedRefund += refund.amount;
        } else if (refund.status === "REJECTED") {
          target.rejectedRefund += refund.amount;
        }
      }

      return {
        id: refund.id,
        propertyId: linkedPropertyId,
        amount: refund.amount,
        status: refund.status,
        createdAt: refund.createdAt,
        reviewedAt: refund.reviewedAt,
      };
    });

    // These are filter options, not just selected records.
    const availablePeriods = await prisma.rentInvoice.findMany({
      where: {
        status: {
          not: "CANCELLED",
        },
        tenancy: {
          unit: {
            property: {
              ownerId: req.user.id,
            },
          },
        },
      },
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "desc" },
    });

    res.json({
      filters: {
        period: period || null,
        propertyId: propertyId || null,
      },
      properties,
      periods: availablePeriods.map((p) => p.period),
      summary,
      propertySummary: [...propertyMap.values()],
      invoices: invoiceRows,
      refunds,
      dataMode: "DEMO_FINANCIAL_REPORT",
    });
  }),
);

export default router;
