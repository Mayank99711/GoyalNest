import { queueEmail } from "../notifications/emailOutbox.js";
import { notifyUsers, activeManagerIdsForProperty } from "../notifications/notify.service.js";
import { tenancyActivatedEmail } from "../notifications/bookingEmailTemplates.js";
import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import {
  authenticate,
  roles,
  ownerProperty,
  managerProperty,
} from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
const r = Router();
r.use(authenticate);
r.get(
  "/mine",
  asyncRoute(async (req, res) => {
    const where =
      req.user.role === "TENANT"
        ? { tenantId: req.user.id }
        : req.user.role === "OWNER"
          ? { unit: { property: { ownerId: req.user.id } } }
          : {
              unit: {
                property: { assignments: { some: { managerId: req.user.id } } },
              },
            };
    required(req.user.role !== "ADMIN", "Not permitted", 403);
    res.json(
      await prisma.tenancy.findMany({
        where,
        include: {
          unit: { include: { property: true } },
          tenant: { select: { name: true, email: true } },
          invoices: true,
          payments: true,
          agreements: true,
          moveOut: true,
          maintenance: true,
        },
      }),
    );
  }),
);
r.post(
  "/kyc",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const { type, fileName, fileUrl } = req.body;
    required(
      type === "KYC" && fileName && /^https?:\/\//.test(fileUrl || ""),
      "Provide KYC document name and secure URL",
    );
    res.status(201).json(
      await prisma.tenantDocument.create({
        data: { userId: req.user.id, type, fileName, fileUrl },
      }),
    );
  }),
);
r.post(
  "/:id/move-out",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const t = await prisma.tenancy.findUnique({ where: { id: req.params.id } });
    required(
      t && t.tenantId === req.user.id && t.status === "ACTIVE",
      "Active tenancy required",
      403,
    );
    const requestedDate = new Date(req.body.requestedDate);
    required(
      !Number.isNaN(requestedDate.getTime()),
      "Valid vacating date required",
    );
    const result = await prisma.moveOut.create({
      data: { tenancyId: t.id, requestedDate },
    });
    await prisma.tenancy.update({
      where: { id: t.id },
      data: { status: "VACATING" },
    });
    res.json(result);
  }),
);

r.patch(
  "/:id/inspection",
  roles("OWNER", "MANAGER"),
  asyncRoute(async (req, res) => {
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: req.params.id },
      include: {
        unit: true,
        moveOut: true,
      },
    });

    required(
      tenancy && tenancy.status === "VACATING" && tenancy.moveOut,
      "Move-out request not found",
      404,
    );

    await managerProperty(req.user, tenancy.unit.propertyId);

    const notes = String(req.body.notes || "").trim();

    required(
      notes.length >= 10 && notes.length <= 1000,
      "Inspection notes must contain 10-1000 characters",
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.moveOut.update({
        where: { tenancyId: tenancy.id },
        data: {
          inspectionNotes: notes,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MOVE_OUT_INSPECTION_RECORDED",
          entityType: "Tenancy",
          entityId: tenancy.id,
          metadata: { notes },
        },
      });

      return updated;
    });

    res.json({
      message: "Inspection recorded",
      moveOut: result,
    });
  }),
);

r.post(
  "/:id/settle",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: req.params.id },
      include: {
        unit: true,
        moveOut: true,
      },
    });

    required(
      tenancy && tenancy.status === "VACATING" && tenancy.moveOut,
      "Vacating tenancy required",
      400,
    );

    await ownerProperty(req.user, tenancy.unit.propertyId);

    required(
      tenancy.moveOut.inspectionNotes?.trim(),
      "Inspection must be completed before settlement",
      400,
    );

    required(
      new Date(tenancy.moveOut.requestedDate) <= new Date(),
      "Vacating date has not arrived",
      400,
    );

    const deduction = req.body.deduction;

    required(
      Number.isSafeInteger(deduction) &&
        deduction >= 0 &&
        deduction <= tenancy.depositPaid,
      "Invalid deposit deduction",
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.tenancy.updateMany({
        where: {
          id: tenancy.id,
          status: "VACATING",
        },
        data: {
          status: "VACATED",
        },
      });

      required(changed.count === 1, "Tenancy already settled", 409);

      // A settled tenancy with no physical check-in may release its bed now.
      // If physically checked in, keep the bed occupied until Owner checkout.
      if (!tenancy.checkInAt || tenancy.checkOutAt) {
        const released = await tx.unitBed.updateMany({
          where: { tenancyId: tenancy.id },
          data: { tenancyId: null },
        });
        if (released.count) {
          await tx.auditLog.create({
            data: {
              actorId: req.user.id,
              action: "BED_RELEASED_ON_UNOCCUPIED_SETTLEMENT",
              entityType: "Tenancy",
              entityId: tenancy.id,
              metadata: { releasedBeds: released.count, unitId: tenancy.unitId },
            },
          });
        }
      }

      const updated = await tx.moveOut.update({
        where: { tenancyId: tenancy.id },
        data: {
          approved: true,
          deduction,
          refund: tenancy.depositPaid - deduction,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MOVE_OUT_SETTLEMENT_APPROVED",
          entityType: "Tenancy",
          entityId: tenancy.id,
          metadata: {
            depositPaid: tenancy.depositPaid,
            deduction,
            refund: tenancy.depositPaid - deduction,
            moneyTransferred: false,
          },
        },
      });

      return updated;
    });

    res.json({
      message: "Final settlement recorded",
      settlement: result,
      refundMode: "MANUAL_SETTLEMENT_REQUIRED",
      moneyTransferred: false,
    });
  }),
);

r.post(
  "/:id/move-out",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const requestedDate = new Date(req.body.requestedDate);

    required(
      !Number.isNaN(requestedDate.getTime()) && requestedDate > new Date(),
      "Select a future vacating date",
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.tenancy.updateMany({
        where: {
          id: req.params.id,
          tenantId: req.user.id,
          status: "ACTIVE",
        },
        data: { status: "VACATING" },
      });

      required(changed.count === 1, "Active tenancy required", 409);

      const moveOut = await tx.moveOut.create({
        data: {
          tenancyId: req.params.id,
          requestedDate,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MOVE_OUT_REQUESTED",
          entityType: "Tenancy",
          entityId: req.params.id,
          metadata: {
            requestedDate: requestedDate.toISOString(),
          },
        },
      });

      const linked=await tx.tenancy.findUnique({where:{id:req.params.id},select:{unit:{select:{property:{select:{ownerId:true,title:true}},propertyId:true}}}});
      const managers=await activeManagerIdsForProperty(tx,linked.unit.propertyId);
      await notifyUsers(tx,{userIds:[linked.unit.property.ownerId,...managers],type:'MOVEOUT_REVIEW',referenceId:req.params.id,
        title:'Tenant requested move-out',message:`A tenant requested move-out from ${linked.unit.property.title}. Review the inspection and settlement workflow.`});
      return moveOut;
    });

    res.status(201).json({
      message: "Move-out request submitted",
      moveOut: result,
    });
  }),
);

r.post(
  "/:id/activate",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const tenancy = await prisma.tenancy.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        unit: true,
        agreements: true,
        invoices: true,
      },
    });

    required(tenancy, "Tenancy not found", 404);

    // Only the actual property owner can activate.
    await ownerProperty(req.user, tenancy.unit.propertyId);

    required(
      tenancy.status === "PENDING_PAYMENT",
      "Tenancy is not awaiting activation",
      409,
    );

    // Tenant must have accepted an agreement.
    required(
      tenancy.agreements.some((agreement) => agreement.signedAt),
      "Tenant must sign the agreement first",
      400,
    );

    // If a security deposit was selected,
    // it must be recorded before activation.
    required(
      tenancy.depositPaid >= tenancy.depositRequired,
      "Security deposit is not fully recorded",
      400,
    );

    const start = tenancy.startDate;

    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const day = start.getUTCDate();

    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    const billableDays = daysInMonth - day + 1;

    const firstRent = Math.round((tenancy.rent * billableDays) / daysInMonth);

    const period = `${year}-${String(month + 1).padStart(2, "0")}`;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenancy.updateMany({
        where: {
          id: tenancy.id,
          status: "PENDING_PAYMENT",
        },
        data: {
          status: "ACTIVE",
        },
      });

      required(
        updated.count === 1,
        "Tenancy already activated or changed",
        409,
      );

      // Reuse an existing invoice.
      // Never reset a PAID invoice to PENDING.
      const invoice = await tx.rentInvoice.upsert({
        where: {
          tenancyId_period: {
            tenancyId: tenancy.id,
            period,
          },
        },
        update: {},
        create: {
          tenancyId: tenancy.id,
          period,
          amount: firstRent,
          penalty: 0,
          dueDate: new Date(Date.UTC(year, month, day)),
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "TENANCY_ACTIVATED",
          entityType: "Tenancy",
          entityId: tenancy.id,
          metadata: {
            propertyId: tenancy.unit.propertyId,
            period,
            invoiceId: invoice.id,
            invoiceAmount: invoice.amount,
            invoiceStatus: invoice.status,
          },
        },
      });

      const managers=await activeManagerIdsForProperty(tx,tenancy.unit.propertyId);
      await notifyUsers(tx,{userIds:[tenancy.tenantId],type:'TENANCY_ACTIVATED',referenceId:tenancy.id,
        title:'Tenancy activated',message:'Your tenancy is active. Check your agreement and check-in instructions.'});
      await notifyUsers(tx,{userIds:managers,type:'CHECKIN_READY',referenceId:tenancy.id,
        title:'Active tenancy - physical check-in pending',message:'An approved tenant is now eligible for the physical check-in verification workflow.'});
      const activated = await tx.tenancy.findUnique({
        where: {
          id: tenancy.id,
        },
      });

      return {
        tenancy: activated,
        invoice,
      };
    });

    const booking = await prisma.booking.findUnique({
      where: {id: tenancy.bookingId},
      include:{tenant:{select:{name:true,email:true}},unit:{include:{property:true}}}
    });
    if (booking?.tenant?.email) await queueEmail({key:`tenancy-activated:${tenancy.id}`,to:booking.tenant.email,
      ...tenancyActivatedEmail({booking,tenant:booking.tenant,unit:booking.unit,property:booking.unit.property,tenancy:result.tenancy})});
    res.json({
      message: "Tenancy activated successfully",
      ...result,
    });
  }),
);

export default r;
