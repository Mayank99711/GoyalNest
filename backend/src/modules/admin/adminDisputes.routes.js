import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers, disputeRecipients } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);
router.use(roles("ADMIN"));

const TYPES = ["BOOKING", "PAYMENT", "REFUND", "SECURITY_DEPOSIT", "OTHER"];

const STATUSES = ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"];

const createSchema = z
  .object({
    type: z.enum(TYPES),
    subject: z.string().trim().min(5).max(150),
    description: z.string().trim().min(10).max(3000),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
    bookingId: z.string().trim().min(1).optional(),
    paymentId: z.string().trim().min(1).optional(),
  })
  .strict();

const updateSchema = z
  .object({
    status: z.enum(["UNDER_REVIEW", "RESOLVED", "REJECTED"]),
    adminNotes: z.string().trim().max(3000),
    resolution: z.string().trim().max(3000).optional(),
    expectedStatus: z.enum(STATUSES),
  })
  .strict();

// GET /api/admin-disputes
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim().slice(0, 100)
        : "";

    const status = typeof req.query.status === "string" ? req.query.status : "";

    const where = {
      ...(STATUSES.includes(status) ? { status } : {}),
      ...(search
        ? {
            OR: [
              {
                subject: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                bookingId: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                paymentId: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const [total, disputes, grouped] = await Promise.all([
      prisma.platformDispute.count({ where }),

      prisma.platformDispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
      }),

      prisma.platformDispute.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));

    for (const item of grouped) {
      counts[item.status] = item._count._all;
    }

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / 20),
      summary: {
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        ...counts,
      },
      disputes,
    });
  }),
);

// POST /api/admin-disputes
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid dispute information",
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;

    if (payload.bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: payload.bookingId },
        select: { id: true },
      });

      if (!booking) {
        return res.status(404).json({
          error: "Referenced booking not found",
        });
      }
    }

    if (payload.paymentId) {
      const payment = await prisma.payment.findUnique({
        where: { id: payload.paymentId },
        select: { id: true },
      });

      if (!payment) {
        return res.status(404).json({
          error: "Referenced payment not found",
        });
      }
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.platformDispute.create({
        data: {
          ...payload,
          openedById: req.user.id,
          status: "OPEN",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_DISPUTE_CREATED",
          entityType: "PlatformDispute",
          entityId: created.id,
          metadata: {
            type: created.type,
            bookingId: created.bookingId,
            paymentId: created.paymentId,
          },
        },
      });

      const recipients = await disputeRecipients(tx, created);
      await notifyUsers(tx, {
        userIds: recipients.filter(id => id !== req.user.id),
        title: 'New dispute raised',
        message: `A new dispute was opened: ${created.subject}`,
        type: 'DISPUTE_CREATED', referenceId: created.id,
      });
      return created;
    });

    res.status(201).json({
      message: "Dispute created successfully",
      dispute,
    });
  }),
);

// PATCH /api/admin-disputes/:id/review
router.patch(
  "/:id/review",
  asyncRoute(async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid dispute review",
        details: parsed.error.flatten(),
      });
    }

    const { status, adminNotes, resolution, expectedStatus } = parsed.data;

    if (
      ["RESOLVED", "REJECTED"].includes(status) &&
      (!resolution || resolution.length < 10)
    ) {
      return res.status(400).json({
        error: "Resolution reason must be at least 10 characters",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.platformDispute.findUnique({
        where: { id: req.params.id },
      });

      if (!existing) {
        return { error: "Dispute not found", code: 404 };
      }

      if (existing.status !== expectedStatus) {
        return {
          error: "Dispute changed. Refresh and retry.",
          code: 409,
        };
      }

      if (["RESOLVED", "REJECTED"].includes(existing.status)) {
        return {
          error: "Closed disputes cannot be reviewed again",
          code: 409,
        };
      }

      if (status === "UNDER_REVIEW" && existing.status !== "OPEN") {
        return {
          error: "Dispute is already under review",
          code: 409,
        };
      }

      const updated = await tx.platformDispute.updateMany({
        where: {
          id: existing.id,
          status: expectedStatus,
        },
        data: {
          status,
          adminNotes,
          ...(status === "UNDER_REVIEW"
            ? {}
            : {
                resolution,
                resolvedById: req.user.id,
                resolvedAt: new Date(),
              }),
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Concurrent update. Refresh and retry.",
          code: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_DISPUTE_REVIEWED",
          entityType: "PlatformDispute",
          entityId: existing.id,
          metadata: {
            previousStatus: existing.status,
            newStatus: status,
            adminNotes,
            resolution: resolution || null,
            financialAction: "NONE",
          },
        },
      });

      const recipients = await disputeRecipients(tx, existing);
      await notifyUsers(tx, {
        userIds: recipients.filter(id => id !== req.user.id),
        title: `Dispute ${status.replaceAll('_', ' ').toLowerCase()}`,
        message: `The dispute "${existing.subject}" status is now ${status.replaceAll('_', ' ')}.`,
        type: 'DISPUTE_STATUS', referenceId: existing.id,
      });
      return { id: existing.id, status };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: "Dispute updated successfully",
      dispute: result,
    });
  }),
);

export default router;
