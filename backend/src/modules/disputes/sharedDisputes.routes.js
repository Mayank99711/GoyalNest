import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers, disputeRecipients } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);
router.use(roles("TENANT", "OWNER", "ADMIN"));

const messageSchema = z
  .object({
    body: z.string().trim().min(2).max(3000),
  })
  .strict();

function forbidden(res) {
  return res.status(404).json({
    error: "Dispute not found or inaccessible",
  });
}

async function getAccess(user, dispute) {
  if (!dispute) return false;
  if (user.role === "ADMIN") return true;

  if (!dispute.bookingId && !dispute.paymentId) {
    return false;
  }

  let booking = null;
  let paymentTenancy = null;

  if (dispute.bookingId) {
    booking = await prisma.booking.findUnique({
      where: { id: dispute.bookingId },
      select: {
        id: true,
        tenantId: true,
        unit: {
          select: {
            property: {
              select: { ownerId: true },
            },
          },
        },
      },
    });

    if (!booking) return false;
  }

  if (dispute.paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: dispute.paymentId },
      select: {
        tenancy: {
          select: {
            tenantId: true,
            bookingId: true,
            unit: {
              select: {
                property: {
                  select: { ownerId: true },
                },
              },
            },
          },
        },
      },
    });

    paymentTenancy = payment?.tenancy;

    if (!paymentTenancy) return false;
  }

  if (booking && paymentTenancy && paymentTenancy.bookingId !== booking.id) {
    return false;
  }

  const tenantId = booking?.tenantId || paymentTenancy?.tenantId;

  const ownerId =
    booking?.unit?.property?.ownerId || paymentTenancy?.unit?.property?.ownerId;

  return user.role === "TENANT" ? tenantId === user.id : ownerId === user.id;
}

async function accessibleReferenceIds(user) {
  const bookingWhere =
    user.role === "TENANT"
      ? { tenantId: user.id }
      : {
          unit: {
            property: { ownerId: user.id },
          },
        };

  const paymentWhere =
    user.role === "TENANT"
      ? {
          tenancy: { tenantId: user.id },
        }
      : {
          tenancy: {
            unit: {
              property: { ownerId: user.id },
            },
          },
        };

  const [bookings, payments] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      select: { id: true },
    }),
    prisma.payment.findMany({
      where: paymentWhere,
      select: { id: true },
    }),
  ]);

  return {
    bookingIds: bookings.map((b) => b.id),
    paymentIds: payments.map((p) => p.id),
  };
}

// GET /api/dispute-cases
// GET /api/dispute-cases
router.get(
  "/",
  asyncRoute(async (req, res) => {
    if (req.user.role === "ADMIN") {
      return res.status(403).json({
        error: "Use Admin Disputes API",
      });
    }

    const page = Math.max(
      1,
      Math.min(10000, parseInt(req.query.page, 10) || 1),
    );

    const status = ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"].includes(
      req.query.status,
    )
      ? req.query.status
      : undefined;

    // Both populated references must belong to this user, not merely one.
    // A payment+booking pair must also refer to the same booking.
    const { bookingIds, paymentIds } = await accessibleReferenceIds(req.user);
    const where = {
      ...(status ? { status } : {}),
      AND: [
        { OR: [{ bookingId: null }, { bookingId: { in: bookingIds } }] },
        { OR: [{ paymentId: null }, { paymentId: { in: paymentIds } }] },
        { OR: [
          { bookingId: { in: bookingIds } },
          { paymentId: { in: paymentIds } },
        ] },
      ],
    };

    // Verify legacy paired references as well. A maximum bounded snapshot
    // avoids an unbounded query on the mentor/demo environment.
    const candidateDisputes = await prisma.platformDispute.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 2000,
      select: {
        id: true, type: true, subject: true, description: true,
        priority: true, status: true, bookingId: true, paymentId: true,
        openedById: true, resolution: true, resolvedAt: true,
        createdAt: true, updatedAt: true,
      },
    });

    const pairedPaymentIds = [...new Set(candidateDisputes
      .filter((d) => d.bookingId && d.paymentId)
      .map((d) => d.paymentId))];
    const linkedPayments = await prisma.payment.findMany({
      where: { id: { in: pairedPaymentIds } },
      select: { id: true, tenancy: { select: { bookingId: true } } },
    });
    const paymentBooking = new Map(
      linkedPayments.map((p) => [p.id, p.tenancy?.bookingId])
    );
    const verified = candidateDisputes.filter(
      (d) => !d.bookingId || !d.paymentId ||
        paymentBooking.get(d.paymentId) === d.bookingId
    );
    const total = verified.length;
    const disputes = verified.slice((page - 1) * 20, page * 20);

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      total, page,
      totalPages: Math.max(1, Math.ceil(total / 20)),
      disputes,
      isSnapshotLimited: candidateDisputes.length === 2000,
    });
  }),
);

// GET /api/dispute-cases/:id
router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const dispute = await prisma.platformDispute.findUnique({
      where: { id: req.params.id },
    });

    if (!(await getAccess(req.user, dispute))) {
      return forbidden(res);
    }

    res.setHeader("Cache-Control", "private, no-store");

    const { adminNotes, ...publicDetails } = dispute;

    res.json({
      dispute: req.user.role === "ADMIN" ? dispute : publicDetails,
    });
  }),
);

// GET /api/dispute-cases/:id/messages
router.get(
  "/:id/messages",
  asyncRoute(async (req, res) => {
    const dispute = await prisma.platformDispute.findUnique({
      where: { id: req.params.id },
    });

    if (!(await getAccess(req.user, dispute))) {
      return forbidden(res);
    }

    const messages = await prisma.disputeMessage.findMany({
      where: { disputeId: dispute.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const authors = await prisma.user.findMany({
      where: {
        id: {
          in: [...new Set(messages.map((m) => m.authorId))],
        },
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    const authorMap = new Map(authors.map((author) => [author.id, author]));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      messages: messages.reverse().map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        authorId: message.authorId,
        authorName: authorMap.get(message.authorId)?.name || "User",
        authorRole: authorMap.get(message.authorId)?.role || "UNKNOWN",
      })),
    });
  }),
);

// POST /api/dispute-cases/:id/messages
router.post(
  "/:id/messages",
  asyncRoute(async (req, res) => {
    const parsed = messageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Message must contain 2-3000 characters",
      });
    }

    const dispute = await prisma.platformDispute.findUnique({
      where: { id: req.params.id },
    });

    if (!(await getAccess(req.user, dispute))) {
      return forbidden(res);
    }

    if (["RESOLVED", "REJECTED"].includes(dispute.status)) {
      return res.status(409).json({
        error: "Closed disputes are read-only",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.platformDispute.findUnique({
        where: { id: dispute.id },
        select: { status: true },
      });

      if (!current || ["RESOLVED", "REJECTED"].includes(current.status)) {
        return { error: "Dispute is closed", code: 409 };
      }

      const message = await tx.disputeMessage.create({
        data: {
          disputeId: dispute.id,
          authorId: req.user.id,
          body: parsed.data.body,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "DISPUTE_MESSAGE_ADDED",
          entityType: "PlatformDispute",
          entityId: dispute.id,
          metadata: {
            messageId: message.id,
            authorRole: req.user.role,
          },
        },
      });

      const recipients = await disputeRecipients(tx, dispute);
      await notifyUsers(tx, {
        userIds: recipients.filter(id => id !== req.user.id),
        title: 'New dispute reply',
        message: `A participant replied to dispute: ${dispute.subject}`,
        type: 'DISPUTE_REPLY',
        referenceId: dispute.id,
      });
      return { message };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.status(201).json(result);
  }),
);

export default router;
