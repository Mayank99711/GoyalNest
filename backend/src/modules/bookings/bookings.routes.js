import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute, required, fail } from "../../lib/errors.js";
import {
  proratedRent,
  billingPeriod,
  cancellationPenalty,
} from "../../lib/rent.js";
import { bookingCancellationGuard } from "./bookingCancellationGuard.js";
import { queueEmail } from "../notifications/emailOutbox.js";
import { notifyUsers, activeManagerIdsForProperty } from "../notifications/notify.service.js";
import { bookingRequestEmail, bookingApprovedEmail, bookingRejectedEmail } from "../notifications/bookingEmailTemplates.js";
const r = Router();
r.use(authenticate);
r.get(
  "/mine",
  asyncRoute(async (req, res) => {
    if (req.user.role === "TENANT")
      return res.json(
        await prisma.booking.findMany({
          where: { tenantId: req.user.id },
          include: {
            unit: { include: { property: true } },
            tenancy: {
              include: {
                invoices: true,
                payments: true,
                agreements: true,
                moveOut: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    if (req.user.role === "OWNER")
      return res.json(
        await prisma.booking.findMany({
          where: { unit: { property: { ownerId: req.user.id } } },
          include: {
            tenant: { select: { name: true, email: true } },
            unit: { include: { property: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    if (req.user.role === "MANAGER")
      return res.json(
        await prisma.booking.findMany({
          where: {
            unit: {
              property: { assignments: { some: { managerId: req.user.id } } },
            },
          },
          include: {
            tenant: { select: { name: true, email: true } },
            unit: { include: { property: true } },
          },
        }),
      );
    fail(403, "Not permitted");
  }),
);

// Owner-only, read-only diagnosis for the approved-booking -> ACTIVE tenancy handoff.
// This endpoint does not override agreement or deposit conditions.
r.get(
  "/:id/move-in-readiness",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        unit: {
          include: {
            property: {
              select: {
                id: true, ownerId: true, title: true,
                assignments: { select: { manager: { select: { name: true, email: true, active: true } } } },
              },
            },
          },
        },
        tenancy: {
          include: {
            agreements: { select: { id: true, signedAt: true } },
          },
        },
      },
    });
    required(booking, "Booking not found", 404);
    await ownerProperty(req.user, booking.unit.propertyId);
    const tenancy = booking.tenancy;
    const agreementSigned = !!tenancy?.agreements?.some((item) => item.signedAt);
    const depositComplete = !!tenancy && tenancy.depositPaid >= tenancy.depositRequired;
    const activationEligible = booking.status === "APPROVED" && tenancy?.status === "PENDING_PAYMENT" && agreementSigned && depositComplete;
    res.json({
      bookingId: booking.id,
      bookingStatus: booking.status,
      propertyTitle: booking.unit.property.title,
      tenancyId: tenancy?.id ?? null,
      tenancyStatus: tenancy?.status ?? null,
      agreementSigned,
      agreementCreated: !!tenancy?.agreements?.length,
      depositRequired: tenancy?.depositRequired ?? null,
      depositPaid: tenancy?.depositPaid ?? null,
      depositComplete,
      activationEligible,
      checkInAt: tenancy?.checkInAt ?? null,
      assignedManagers: booking.unit.property.assignments
        .filter((assignment) => assignment.manager.active)
        .map((assignment) => ({ name: assignment.manager.name, email: assignment.manager.email })),
      nextAction: !tenancy
        ? "No tenancy linked: investigate booking approval and data integrity."
        : tenancy.status === "ACTIVE"
          ? tenancy.checkInAt ? "Physical check-in confirmed." : "Manager must verify physical arrival and room before check-in."
          : tenancy.status !== "PENDING_PAYMENT"
            ? "Tenancy is not eligible for activation in its current status."
            : !agreementSigned
              ? "Owner must generate an agreement and tenant must sign it."
              : !depositComplete
                ? "Record and verify the required security deposit before activation."
                : "Owner can activate the tenancy after reviewing the conditions.",
    });
  }),
);

r.post(
  "/",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const { unitId, moveIn, emergencyPhone, wantsDeposit } = req.body;
    required(req.user.verified, "Email verification required", 403);
    required(
      /^\+?[0-9 -]{7,18}$/.test(emergencyPhone || ""),
      "Emergency phone required",
    );
    const docs = await prisma.tenantDocument.count({
      where: { userId: req.user.id, type: "KYC" },
    });
    required(docs > 0, "Submit a KYC document first");
    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
      include: { property: true },
    });
    required(
      unit && unit.active && unit.property.active && unit.property.status === "PUBLISHED",
      "Unit not available",
      404,
    );
    const date = new Date(moveIn);
    required(
      !Number.isNaN(date.getTime()) &&
        date >= new Date(new Date().toISOString().slice(0, 10)),
      "Move-in date must be today or later",
    );
    const occupied = await prisma.tenancy.count({
      where: {
        unitId,
        status: { in: ["ACTIVE", "PENDING_PAYMENT", "VACATING"] },
      },
    });
    required(occupied < unit.capacity, "Unit at capacity", 409);
    const [existingPending, existingTenancy] = await Promise.all([
      prisma.booking.count({
        where: { tenantId: req.user.id, unitId, status: "PENDING" },
      }),
      prisma.tenancy.count({
        where: {
          tenantId: req.user.id,
          unitId,
          status: { in: ["ACTIVE", "PENDING_PAYMENT", "VACATING"] },
        },
      }),
    ]);
    required(
      existingPending === 0 && existingTenancy === 0,
      "You already have a pending booking or ongoing tenancy for this unit",
      409,
    );
    const booking = await prisma.$transaction(async tx => {
      const created = await tx.booking.create({data:{tenantId:req.user.id,unitId,moveIn:date,emergencyPhone,wantsDeposit:!!wantsDeposit}});
      await notifyUsers(tx, {
        userIds: [unit.property.ownerId], type: 'BOOKING_REVIEW', referenceId: created.id,
        title: 'New booking request - review required',
        message: `${req.user.name || 'A tenant'} requested a unit at ${unit.property.title}. Review before approving.`,
      });
      return created;
    });
    await queueEmail({key:`booking-request:${booking.id}`,to:req.user.email,...bookingRequestEmail({booking,unit,property:unit.property,tenant:req.user})});
    res.status(201).json(booking);
  }),
);
r.post(
  "/:id/decision",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: { unit: {include:{property:true}}, tenant: {select:{id:true,name:true,email:true}} },
    });
    required(booking, "Booking not found", 404);
    await ownerProperty(req.user, booking.unit.propertyId);
    required(booking.status === "PENDING", "Already reviewed", 409);
    if (req.body.approve !== true) {
      await prisma.$transaction(async tx => {
        const changed = await tx.booking.updateMany({
          where: { id: booking.id, status: "PENDING" },
          data: { status: "REJECTED" },
        });
        required(changed.count === 1, "Already reviewed", 409);
        await notifyUsers(tx, {
          userIds: [booking.tenantId], type: 'BOOKING_REJECTED', referenceId: booking.id,
          title: 'Booking request not approved',
          message: `Your booking request for ${booking.unit.property.title} was rejected. Check My Bookings for details.`,
        });
      });
      const rejected = await prisma.booking.findUnique({where:{id:booking.id}});
      await queueEmail({key:`booking-rejected:${booking.id}`,to:booking.tenant.email,
        ...bookingRejectedEmail({booking:rejected,tenant:booking.tenant,unit:booking.unit,property:booking.unit.property})});
      return res.json(rejected);
    }
    const verifiedKyc = await prisma.tenantDocument.count({
      where: {
        userId: booking.tenantId,
        type: "KYC",
        status: "VERIFIED",
        fileUrl: {
          startsWith: "private://kyc/",
        },
      },
    });

    required(
      verifiedKyc > 0,
      "Tenant KYC must be verified before booking approval",
      403,
    );
    // Serializable transaction prevents concurrent approvals from overselling capacity.
    const result = await prisma.$transaction(
      async (tx) => {
        const current = await tx.booking.findUnique({
          where: { id: booking.id },
        });
        required(current.status === "PENDING", "Already decided", 409);
        const occupied = await tx.tenancy.count({
          where: {
            unitId: booking.unitId,
            status: { in: ["ACTIVE", "PENDING_PAYMENT", "VACATING"] },
          },
        });
        required(
          occupied < booking.unit.capacity,
          "No capacity remaining",
          409,
        );
        const existingTenantTenancy = await tx.tenancy.count({
          where: {
            tenantId: booking.tenantId,
            unitId: booking.unitId,
            status: { in: ["ACTIVE", "PENDING_PAYMENT", "VACATING"] },
          },
        });
        required(
          existingTenantTenancy === 0,
          "Tenant already has an ongoing tenancy for this unit",
          409,
        );
        const tenancy = await tx.tenancy.create({
          data: {
            bookingId: booking.id,
            tenantId: booking.tenantId,
            unitId: booking.unitId,
            startDate: booking.moveIn,
            rent: booking.unit.rent,
            depositRequired: booking.wantsDeposit
              ? booking.unit.depositAmount
              : 0,
          },
        });
        await tx.rentInvoice.create({
          data: {
            tenancyId: tenancy.id,
            period: billingPeriod(booking.moveIn),
            amount: proratedRent(booking.unit.rent, booking.moveIn),
            dueDate: booking.moveIn,
          },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: "APPROVED" },
        });
        await notifyUsers(tx, {
          userIds: [booking.tenantId], type: 'BOOKING_APPROVED', referenceId: booking.id,
          title: 'Booking approved - next steps pending',
          message: `Your booking at ${booking.unit.property.title} was approved. Agreement, deposit and activation conditions must still be completed before move-in.`,
        });
        const managerIds = await activeManagerIdsForProperty(tx, booking.unit.propertyId);
        await notifyUsers(tx, {
          userIds: managerIds, type: 'CHECKIN_PREPARE', referenceId: booking.id,
          title: 'Approved booking - prepare for move-in',
          message: `${booking.tenant.name || 'A tenant'} has an approved booking at ${booking.unit.property.title}. Review readiness; this does not authorize check-in.`,
        });
        return tenancy;
      },
      { isolationLevel: "Serializable" },
    );
    await queueEmail({key:`booking-approved:${booking.id}`,to:booking.tenant.email,
      ...bookingApprovedEmail({booking,tenant:booking.tenant,unit:booking.unit,property:booking.unit.property})});
    res.json({ bookingStatus: "APPROVED", tenancy: result });
  }),
);
r.use("/:id/cancel", roles("TENANT"), bookingCancellationGuard);
r.post(
  "/:id/cancel",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const b = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        tenancy: {
          include: {
            payments: true,
            moveOut: true,
          },
        },
      },
    });
    required(b && b.tenantId === req.user.id, "Booking unavailable", 404);
    required(
      ["PENDING", "APPROVED"].includes(b.status),
      "Cancellation not allowed",
    );
    required(
      !b.tenancy ||
        (b.tenancy.status === "PENDING_PAYMENT" &&
          !b.tenancy.checkInAt &&
          !b.tenancy.checkOutAt &&
          !b.tenancy.moveOut),
      "Cannot cancel a booking after check-in, move-out or checkout. This stay is already in progress or completed.",
      409,
    );
    const days = Math.ceil((b.moveIn.getTime() - Date.now()) / 86400000),
      percent = cancellationPenalty(days);
    const paid = (b.tenancy?.payments || [])
      .filter((p) => p.status === "DEMO_PAID")
      .reduce((s, p) => s + p.amount, 0);
    await prisma.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({where:{id:b.id,status:b.status},data:{status:"CANCELLED"}});
      required(changed.count===1,"Booking already changed",409);
      if (b.tenancy)
        await tx.tenancy.update({
          where: { id: b.tenancy.id },
          data: { status: "CANCELLED" },
        });
      const property = await tx.unit.findUnique({where:{id:b.unitId},select:{property:{select:{ownerId:true,title:true}},propertyId:true}});
      const managers = property ? await activeManagerIdsForProperty(tx, property.propertyId) : [];
      await notifyUsers(tx, {
        userIds: [property?.property?.ownerId, ...managers], type:'BOOKING_CANCELLED', referenceId:b.id,
        title:'Tenant cancelled a booking',
        message:`A booking for ${property?.property?.title || 'your property'} was cancelled. Review any outstanding tasks.`,
      });
    });
    res.json({
      penaltyPercent: percent,
      refundDue: Math.round((paid * (100 - percent)) / 100),
      refundMode: "CALCULATED_ONLY",
    });
  }),
);
export default r;
