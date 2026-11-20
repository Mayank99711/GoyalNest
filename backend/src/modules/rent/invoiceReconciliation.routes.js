import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("OWNER"));

function monthKey(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(date));

  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;

  return `${year}-${month}`;
}

function eligibleForReview(invoice) {
  const tenancy = invoice.tenancy;
  const moveOutDate = tenancy.moveOut?.requestedDate;

  return (
    tenancy.status === "VACATED" &&
    Boolean(moveOutDate) &&
    invoice.period > monthKey(moveOutDate) &&
    ["PENDING", "OVERDUE"].includes(invoice.status)
  );
}

// Read-only review list.
router.get(
  "/review",
  asyncRoute(async (req, res) => {
    const invoices = await prisma.rentInvoice.findMany({
      where: {
        status: { in: ["PENDING", "OVERDUE"] },
        tenancy: {
          status: "VACATED",
          unit: {
            property: { ownerId: req.user.id },
          },
          moveOut: { isNot: null },
        },
      },
      include: {
        tenancy: {
          include: {
            moveOut: true,
            tenant: {
              select: { id: true, name: true },
            },
            unit: {
              select: {
                label: true,
                property: {
                  select: { id: true, title: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      invoices.filter(eligibleForReview).map((i) => ({
        invoiceId: i.id,
        tenancyId: i.tenancyId,
        tenant: i.tenancy.tenant.name,
        property: i.tenancy.unit.property.title,
        room: i.tenancy.unit.label,
        period: i.period,
        amount: i.amount,
        penalty: i.penalty,
        status: i.status,
        moveOutDate: i.tenancy.moveOut.requestedDate,
      })),
    );
  }),
);

// Cancel only an eligible unpaid future-period invoice.
router.post(
  "/:invoiceId/cancel",
  asyncRoute(async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const reason = String(req.body?.reason || "").trim();

    required(
      reason.length >= 10 && reason.length <= 500,
      "Cancellation reason must be 10-500 characters",
      400,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const invoice = await tx.rentInvoice.findFirst({
          where: {
            id: invoiceId,
            tenancy: {
              unit: {
                property: { ownerId: req.user.id },
              },
            },
          },
          include: {
            tenancy: {
              include: { moveOut: true },
            },
          },
        });

        required(invoice, "Invoice not found", 404);

        required(
          eligibleForReview(invoice),
          "Invoice is not eligible for future-period cancellation",
          409,
        );

        // Any existing payment or attempt at payment requires
        // a separate financial reconciliation.
        const paymentCount = await tx.payment.count({
          where: { invoiceId },
        });

        required(
          paymentCount === 0,
          "Invoice has payment records; manual reconciliation required",
          409,
        );

        const changed = await tx.rentInvoice.updateMany({
          where: {
            id: invoiceId,
            status: { in: ["PENDING", "OVERDUE"] },
            cancelledAt: null,
          },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledById: req.user.id,
            cancellationReason: reason,
          },
        });

        required(changed.count === 1, "Invoice already changed", 409);

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "RENT_INVOICE_CANCELLED",
            entityType: "RentInvoice",
            entityId: invoiceId,
            metadata: {
              tenancyId: invoice.tenancyId,
              period: invoice.period,
              originalAmount: invoice.amount,
              originalPenalty: invoice.penalty,
              reason,
            },
          },
        });

        return { invoiceId, status: "CANCELLED" };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.json({
      message: "Future-period invoice cancelled",
      ...result,
    });
  }),
);

export default router;
