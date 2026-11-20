import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers, disputeRecipients } from "../notifications/notify.service.js";

import {queueEmail} from "../notifications/emailOutbox.js";
const router = Router();

router.use(authenticate);
router.use(roles("TENANT", "OWNER"));

const schema = z
  .object({
    type: z.enum(["BOOKING", "PAYMENT", "REFUND", "SECURITY_DEPOSIT", "OTHER"]),
    subject: z.string().trim().min(5).max(150),
    description: z.string().trim().min(10).max(3000),
    bookingId: z.string().trim().min(1).optional(),
    paymentId: z.string().trim().min(1).optional(),
  })
  .strict();

async function authorizedBooking(user, bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      tenantId: true,
      unitId: true,
    },
  });

  if (!booking) return null;

  if (user.role === "TENANT") {
    return booking.tenantId === user.id ? booking : null;
  }

  const unit = await prisma.unit.findUnique({
    where: { id: booking.unitId },
    select: {
      property: {
        select: { ownerId: true },
      },
    },
  });

  return unit?.property?.ownerId === user.id ? booking : null;
}

async function authorizedPayment(user, paymentId) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      tenancyId: true,
    },
  });

  if (!payment?.tenancyId) return null;

  const tenancy = await prisma.tenancy.findUnique({
    where: { id: payment.tenancyId },
    select: {
      id: true,
      bookingId: true,
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

  if (!tenancy) return null;

  const allowed =
    user.role === "TENANT"
      ? tenancy.tenantId === user.id
      : tenancy.unit.property.ownerId === user.id;

  return allowed ? { payment, tenancy } : null;
}

// GET /api/my-disputes
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );

    const status = typeof req.query.status === "string" ? req.query.status : "";

    const allowedStatuses = ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"];

    const where = {
      openedById: req.user.id,
      ...(allowedStatuses.includes(status) ? { status } : {}),
    };

    const [total, disputes] = await Promise.all([
      prisma.platformDispute.count({ where }),

      prisma.platformDispute.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 20,
        take: 20,
        select: {
          id: true,
          type: true,
          subject: true,
          description: true,
          priority: true,
          status: true,
          bookingId: true,
          paymentId: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / 20),
      disputes,
    });
  }),
);

// GET /api/my-disputes/references
// Returns booking/payment IDs the logged-in user may reference.
router.get(
  "/references",
  asyncRoute(async (req, res) => {
    const user = req.user;

    const bookings = await prisma.booking.findMany({
      where:
        user.role === "TENANT"
          ? { tenantId: user.id }
          : {
              unit: {
                property: {
                  ownerId: user.id,
                },
              },
            },
      select: {
        id: true,
        status: true,
        unitId: true,
      },
      orderBy: { id: "desc" },
      take: 100,
    });

    const payments = await prisma.payment.findMany({
      where:
        user.role === "TENANT"
          ? {
              tenancy: {
                tenantId: user.id,
              },
            }
          : {
              tenancy: {
                unit: {
                  property: {
                    ownerId: user.id,
                  },
                },
              },
            },
      select: {
        id: true,
        tenancyId: true,
      },
      orderBy: { id: "desc" },
      take: 100,
    });

    res.setHeader("Cache-Control", "private, no-store");

    res.json({ bookings, payments });
  }),
);

// POST /api/my-disputes
router.post(
  "/",
  asyncRoute(async (req, res) => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid dispute details",
        details: parsed.error.flatten(),
      });
    }

    const payload = parsed.data;

    if (!payload.bookingId && !payload.paymentId) {
      return res.status(400).json({
        error: "Select a booking or payment",
      });
    }

    const booking = payload.bookingId
      ? await authorizedBooking(req.user, payload.bookingId)
      : null;

    if (payload.bookingId && !booking) {
      return res.status(403).json({
        error: "Booking is not accessible",
      });
    }

    const paymentResult = payload.paymentId
      ? await authorizedPayment(req.user, payload.paymentId)
      : null;

    if (payload.paymentId && !paymentResult) {
      return res.status(403).json({
        error: "Payment is not accessible",
      });
    }

    if (booking && paymentResult) {
      if (paymentResult.tenancy.bookingId !== booking.id) {
        return res.status(400).json({
          error: "Booking and payment do not belong together",
        });
      }
    }

    // Payments and security-deposit claims must be
    // linked to a payment record in this MVP.
    if (
      ["PAYMENT", "REFUND", "SECURITY_DEPOSIT"].includes(payload.type) &&
      !payload.paymentId
    ) {
      return res.status(400).json({
        error: "A payment reference is required for this dispute type",
      });
    }

    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.platformDispute.create({
        data: {
          type: payload.type,
          subject: payload.subject,
          description: payload.description,
          priority: "MEDIUM",
          bookingId: payload.bookingId || null,
          paymentId: payload.paymentId || null,
          openedById: req.user.id,
          status: "OPEN",
        },
        select: {
          id: true,
          status: true,
          subject: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "USER_DISPUTE_CREATED",
          entityType: "PlatformDispute",
          entityId: created.id,
          metadata: {
            submittedRole: req.user.role,
            bookingId: payload.bookingId || null,
            paymentId: payload.paymentId || null,
          },
        },
      });

      const recipients = await disputeRecipients(tx, { ...payload, openedById: req.user.id });
      await notifyUsers(tx, {
        userIds: recipients.filter(id => id !== req.user.id),
        title: 'New dispute raised',
        message: `A new dispute was opened: ${created.subject}`,
        type: 'DISPUTE_CREATED', referenceId: created.id,
      });
      return created;
    });

    const adminRecipients=await prisma.user.findMany({where:{role:"ADMIN",active:true},select:{email:true}});
    let ownerEmail=null;
    const refBooking=payload.bookingId || paymentResult?.tenancy?.bookingId;
    if(refBooking){const row=await prisma.booking.findUnique({where:{id:refBooking},include:{unit:{include:{property:{include:{owner:true}}}}}});ownerEmail=row?.unit?.property?.owner?.email;}
    for(const to of new Set([...adminRecipients.map(a=>a.email),ownerEmail].filter(Boolean))){
      await queueEmail({key:`dispute:${dispute.id}:${to}`,to,subject:`GoyalNest dispute ${dispute.id}`,body:`A new ${payload.type} dispute was raised. Reference ${dispute.id}. Subject: ${payload.subject}. Sign in to review details.`});
    }
    res.status(201).json({
      message: "Dispute submitted successfully",
      dispute,
    });
  }),
);

export default router;
