import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("OWNER"));

// Owner can view refund requests only
// for payments belonging to their properties.
router.get(
  "/requests",
  asyncRoute(async (req, res) => {
    const requests = await prisma.paymentRefundRequest.findMany({
      where: {
        paymentId: {
          in: (
            await prisma.payment.findMany({
              where: {
                tenancy: {
                  unit: {
                    property: {
                      ownerId: req.user.id,
                    },
                  },
                },
              },
              select: { id: true },
            })
          ).map((p) => p.id),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(requests);
  }),
);

// Owner approves or rejects a request.
// No actual bank refund is initiated.
router.patch(
  "/requests/:id/review",
  asyncRoute(async (req, res) => {
    const decision = req.body?.decision;
    const note = String(req.body?.note || "").trim();

    required(
      ["APPROVE", "REJECT"].includes(decision),
      "Decision must be APPROVE or REJECT",
      400,
    );

    required(
      note.length <= 500,
      "Review note must be under 500 characters",
      400,
    );

    const request = await prisma.paymentRefundRequest.findUnique({
      where: { id: req.params.id },
    });

    required(request, "Refund request not found", 404);

    const payment = await prisma.payment.findFirst({
      where: {
        id: request.paymentId,
        tenancy: {
          unit: {
            property: {
              ownerId: req.user.id,
            },
          },
        },
      },
    });

    required(payment, "You cannot review this refund request", 403);

    required(request.status === "REQUESTED", "Request already reviewed", 409);

    const status =
      decision === "APPROVE" ? "APPROVED_PENDING_REFUND" : "REJECTED";

    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.paymentRefundRequest.updateMany({
        where: {
          id: request.id,
          status: "REQUESTED",
        },
        data: {
          status,
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewNote: note || null,
        },
      });

      required(changed.count === 1, "Request already reviewed", 409);

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action:
            decision === "APPROVE" ? "REFUND_APPROVED" : "REFUND_REJECTED",
          entityType: "PaymentRefundRequest",
          entityId: request.id,
          metadata: {
            paymentId: request.paymentId,
            amount: request.amount,
            decision,
            note,
          },
        },
      });

      return tx.paymentRefundRequest.findUnique({
        where: { id: request.id },
      });
    });

    res.json({
      message:
        status === "APPROVED_PENDING_REFUND"
          ? "Refund approved for processing. No funds transferred."
          : "Refund request rejected.",
      request: result,
      moneyTransferred: false,
    });
  }),
);

export default router;
