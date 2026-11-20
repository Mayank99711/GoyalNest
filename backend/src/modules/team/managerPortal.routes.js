import { Prisma } from "@prisma/client";
import { required } from "../../lib/errors.js";
import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);
router.use(roles("MANAGER"));

// Actual timestamped events for an Asia/Kolkata calendar day, scoped to assigned properties.
router.get("/daily-report",asyncRoute(async(req,res)=>{
 const date=String(req.query.date||"");
 required(/^\d{4}-\d{2}-\d{2}$/.test(date),"Date must be YYYY-MM-DD",400);
 const from=new Date(`${date}T00:00:00+05:30`);
 required(!Number.isNaN(from.valueOf())&&new Date(from.getTime()+19800000).toISOString().slice(0,10)===date,"Invalid date",400);
 const to=new Date(from.getTime()+86400000);
 const assignments=await prisma.managerAssignment.findMany({where:{managerId:req.user.id,property:{owner:{active:true}}},select:{propertyId:true}});
 const ids=assignments.map(a=>a.propertyId);
 const when={gte:from,lt:to};
 const whereProperty={unit:{propertyId:{in:ids}}};
 const [bookings,payments,maintenance,moveouts,checkins]=await Promise.all([
  prisma.booking.findMany({where:{...whereProperty,createdAt:when},select:{id:true,createdAt:true,status:true,tenant:{select:{name:true}},unit:{select:{label:true,property:{select:{title:true}}}}},orderBy:{createdAt:"desc"},take:500}),
  prisma.payment.findMany({where:{createdAt:when,tenancy:whereProperty},select:{id:true,createdAt:true,status:true,amount:true,kind:true,tenancy:{select:{tenant:{select:{name:true}},unit:{select:{label:true,property:{select:{title:true}}}}}}},orderBy:{createdAt:"desc"},take:500}),
  prisma.maintenanceTicket.findMany({where:{createdAt:when,tenancy:whereProperty},select:{id:true,createdAt:true,title:true,status:true,tenant:{select:{name:true}},tenancy:{select:{unit:{select:{label:true,property:{select:{title:true}}}}}}},orderBy:{createdAt:"desc"},take:500}),
  prisma.moveOut.findMany({where:{createdAt:when,tenancy:whereProperty},select:{id:true,createdAt:true,approved:true,tenancy:{select:{tenant:{select:{name:true}},unit:{select:{label:true,property:{select:{title:true}}}}}}},orderBy:{createdAt:"desc"},take:500}),
  prisma.tenancy.findMany({where:{...whereProperty,checkInAt:when},select:{id:true,checkInAt:true,status:true,tenant:{select:{name:true}},unit:{select:{label:true,property:{select:{title:true}}}}},orderBy:{checkInAt:"desc"},take:500}),
 ]);
 const events=[
  ...bookings.map(x=>({id:x.id,time:x.createdAt,type:"BOOKING_CREATED",property:x.unit.property.title,unit:x.unit.label,person:x.tenant.name,description:"Booking submitted",status:x.status})),
  ...payments.map(x=>({id:x.id,time:x.createdAt,type:"PAYMENT_RECORDED",property:x.tenancy.unit.property.title,unit:x.tenancy.unit.label,person:x.tenancy.tenant.name,description:`${x.kind}: INR ${x.amount}`,status:x.status,amount:x.status==="DEMO_PAID"?x.amount:0})),
  ...maintenance.map(x=>({id:x.id,time:x.createdAt,type:"MAINTENANCE_OPENED",property:x.tenancy.unit.property.title,unit:x.tenancy.unit.label,person:x.tenant.name,description:x.title,status:x.status})),
  ...moveouts.map(x=>({id:x.id,time:x.createdAt,type:"MOVE_OUT_REQUEST",property:x.tenancy.unit.property.title,unit:x.tenancy.unit.label,person:x.tenancy.tenant.name,description:"Move-out request created",status:x.approved?"APPROVED":"OPEN"})),
  ...checkins.map(x=>({id:x.id,time:x.checkInAt,type:"TENANT_CHECK_IN",property:x.unit.property.title,unit:x.unit.label,person:x.tenant.name,description:"Check-in recorded",status:x.status})),
 ].sort((a,b)=>new Date(b.time)-new Date(a.time));
 res.set("Cache-Control","private, no-store");
 res.json({date,timezone:"Asia/Kolkata",assignedProperties:ids.length,summary:{bookings:bookings.length,recordedPayments:payments.length,demoCollected:payments.filter(p=>p.status==="DEMO_PAID"&&p.kind==="RENT").reduce((sum,p)=>sum+p.amount,0),maintenance:maintenance.length,moveouts:moveouts.length,checkins:checkins.length},events});
}));

function buildProperty(property, tenancies) {
  const units = property.units || [];

  const propertyTenancies = tenancies.filter(
    (t) => t.unit.propertyId === property.id,
  );

  const capacity = units.reduce(
    (sum, unit) => sum + (unit.active ? unit.capacity : 0),
    0,
  );

  // Counts occupied tenancy records.
  // This is a provisional occupancy proxy,
  // not a verified per-bed allocation ledger.
  const occupied = propertyTenancies.filter(
    (t) => t.status === "ACTIVE" || t.status === "VACATING",
  ).length;

  return {
    id: property.id,
    title: property.title,
    city: property.city,
    locality: property.locality,
    address: property.address,
    status: property.status,
    units: units.length,
    capacity,
    occupied,
    available: Math.max(0, capacity - occupied),
    occupancyRate:
      capacity > 0 ? Math.min(100, Math.round((occupied / capacity) * 100)) : 0,
  };
}

router.get(
  "/summary",
  asyncRoute(async (req, res) => {
    // Only properties assigned to this Manager.
    const assignments = await prisma.managerAssignment.findMany({
      where: {
        managerId: req.user.id,
        property: {
          owner: { active: true },
        },
      },
      include: {
        property: {
          include: {
            units: {
              select: {
                id: true,
                label: true,
                capacity: true,
                rent: true,
                depositAmount: true,
                active: true,
              },
            },
          },
        },
      },
    });

    const properties = assignments.map((assignment) => assignment.property);

    const propertyIds = properties.map((p) => p.id);

    const [tenancies, maintenance, invoices] = await Promise.all([
      prisma.tenancy.findMany({
        where: {
          unit: {
            propertyId: { in: propertyIds },
          },
        },
        select: {
          id: true,
          status: true,
          startDate: true,
          tenant: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          unit: {
            select: {
              id: true,
              label: true,
              propertyId: true,
            },
          },
        },
      }),

      prisma.maintenanceTicket.findMany({
        where: {
          tenancy: {
            unit: {
              propertyId: { in: propertyIds },
            },
          },
        },
        select: {
          id: true,
          status: true,
        },
      }),

      prisma.rentInvoice.findMany({
        where: {
          status: {
            not: "CANCELLED",
          },
          tenancy: {
            unit: {
              propertyId: { in: propertyIds },
            },
          },
        },
        select: {
          id: true,
          amount: true,
          penalty: true,
          status: true,
        },
      }),
    ]);

    const propertySummary = properties.map((property) =>
      buildProperty(property, tenancies),
    );

    const rooms = properties.flatMap((property) =>
      property.units.map((unit) => {
        const occupants = tenancies.filter(
          (t) =>
            t.unit.id === unit.id && ["ACTIVE", "VACATING"].includes(t.status),
        );

        return {
          id: unit.id,
          propertyId: property.id,
          property: property.title,
          label: unit.label,
          capacity: unit.capacity,
          active: unit.active,
          rent: unit.rent,
          depositAmount: unit.depositAmount,
          occupied: occupants.length,
          available: unit.active
            ? Math.max(0, unit.capacity - occupants.length)
            : 0,
          occupants: occupants.map((t) => ({
            tenancyId: t.id,
            name: t.tenant.name,
            email: t.tenant.email,
            status: t.status,
          })),
        };
      }),
    );

    const summary = {
      assignedProperties: properties.length,
      totalRooms: rooms.length,
      totalCapacity: propertySummary.reduce((sum, p) => sum + p.capacity, 0),
      occupied: propertySummary.reduce((sum, p) => sum + p.occupied, 0),
      available: propertySummary.reduce((sum, p) => sum + p.available, 0),
      activeTenancies: tenancies.filter((t) => t.status === "ACTIVE").length,
      vacatingTenancies: tenancies.filter((t) => t.status === "VACATING")
        .length,
      openMaintenance: maintenance.filter((t) => t.status !== "RESOLVED")
        .length,
      resolvedMaintenance: maintenance.filter((t) => t.status === "RESOLVED")
        .length,
      outstandingInvoiceCount: invoices.filter((i) => i.status !== "PAID")
        .length,
    };

    res.json({
      summary,
      properties: propertySummary,
      rooms,
      occupancyMethod: "TENANCY_COUNT_PROXY",
    });
  }),
);

router.get(
  "/operations",
  asyncRoute(async (req, res) => {
    const assignments = await prisma.managerAssignment.findMany({
      where: {
        managerId: req.user.id,
        property: {
          owner: {
            active: true,
          },
        },
      },
      select: {
        propertyId: true,
      },
    });

    const propertyIds = assignments.map((a) => a.propertyId);

    const tenancies = await prisma.tenancy.findMany({
      where: {
        unit: {
          propertyId: {
            in: propertyIds,
          },
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        unit: {
          select: {
            id: true,
            label: true,
            propertyId: true,
            property: {
              select: {
                title: true,
                city: true,
              },
            },
          },
        },
        booking: {
          select: {
            moveIn: true,
            status: true,
          },
        },
        moveOut: {
          select: {
            requestedDate: true,
            inspectionNotes: true,
            approved: true,
          },
        },
        invoices: {
          where: {
            status: {
              not: "CANCELLED",
            },
          },
          select: {
            id: true,
            period: true,
            amount: true,
            penalty: true,
            dueDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const invoiceIds = tenancies.flatMap((t) => t.invoices.map((i) => i.id));

    const payments = await prisma.payment.groupBy({
      by: ["invoiceId"],
      where: {
        invoiceId: {
          in: invoiceIds,
        },
        kind: "RENT",
        status: "DEMO_PAID",
      },
      _sum: {
        amount: true,
      },
    });

    const paidMap = new Map(
      payments.map((p) => [p.invoiceId, p._sum.amount || 0]),
    );

    const tenantRecords = tenancies.map((t) => ({
      tenancyId: t.id,
      propertyId: t.unit.propertyId,
      property: t.unit.property.title,
      city: t.unit.property.city,
      room: t.unit.label,
      tenant: t.tenant,
      startDate: t.startDate,
      moveIn: t.booking.moveIn,
      status: t.status,
      depositRequired: t.depositRequired,
      depositPaid: t.depositPaid,
      moveOut: t.moveOut,
    }));

    const invoices = tenancies.flatMap((t) =>
      t.invoices.map((invoice) => {
        const total = invoice.amount + invoice.penalty;

        const paid = paidMap.get(invoice.id) || 0;

        const remaining = Math.max(0, total - paid);

        return {
          id: invoice.id,
          tenancyId: t.id,
          propertyId: t.unit.propertyId,
          property: t.unit.property.title,
          room: t.unit.label,
          tenant: t.tenant.name,
          period: invoice.period,
          amount: invoice.amount,
          penalty: invoice.penalty,
          total,
          paid,
          remaining,
          dueDate: invoice.dueDate,
          status:
            invoice.status === "PAID"
              ? "PAID"
              : paid > 0
                ? "PARTIALLY_PAID"
                : invoice.status,
        };
      }),
    );

    res.json({
      tenants: tenantRecords,
      invoices,
      properties: assignments.length,
      paymentMode: "DEMO_ONLY",
    });
  }),
);

router.get(
  "/agreements",
  asyncRoute(async (req, res) => {
    const agreements = await prisma.agreement.findMany({
      where: {
        tenancy: {
          unit: {
            property: {
              assignments: {
                some: {
                  managerId: req.user.id,
                  property: {
                    owner: { active: true },
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        type: true,
        content: true,
        signedAt: true,
        signerName: true,
        createdAt: true,
        tenancy: {
          select: {
            id: true,
            status: true,
            rent: true,
            tenant: {
              select: {
                name: true,
              },
            },
            unit: {
              select: {
                label: true,
                property: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(
      agreements.map((agreement) => ({
        id: agreement.id,
        type: agreement.type,
        content: agreement.content,
        signedAt: agreement.signedAt,
        signerName: agreement.signerName,
        createdAt: agreement.createdAt,
        tenancyId: agreement.tenancy.id,
        tenancyStatus: agreement.tenancy.status,
        monthlyRent: agreement.tenancy.rent,
        tenant: agreement.tenancy.tenant.name,
        room: agreement.tenancy.unit.label,
        propertyId: agreement.tenancy.unit.property.id,
        property: agreement.tenancy.unit.property.title,
        status: agreement.signedAt ? "SIGNED" : "PENDING_SIGNATURE",
      })),
    );
  }),
);

router.get(
  "/occupancy-audit",
  asyncRoute(async (req, res) => {
    const assignments = await prisma.managerAssignment.findMany({
      where: {
        managerId: req.user.id,
        property: {
          owner: { active: true },
        },
      },
      select: {
        propertyId: true,
      },
    });

    const propertyIds = assignments.map((item) => item.propertyId);

    const [units, tenancies] = await Promise.all([
      prisma.unit.findMany({
        where: {
          propertyId: { in: propertyIds },
        },
        select: {
          id: true,
          label: true,
          capacity: true,
          active: true,
          property: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),

      prisma.tenancy.findMany({
        where: {
          unit: {
            propertyId: { in: propertyIds },
          },
        },
        select: {
          id: true,
          status: true,
          tenantId: true,
          tenant: {
            select: {
              name: true,
            },
          },
          unitId: true,
          moveOut: {
            select: {
              requestedDate: true,
            },
          },
          invoices: {
            select: {
              id: true,
              period: true,
              amount: true,
              penalty: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const activeStatuses = new Set(["ACTIVE", "VACATING"]);

    const rooms = units.map((unit) => {
      const roomTenancies = tenancies.filter((t) => t.unitId === unit.id);

      const activeTenancies = roomTenancies.filter((t) =>
        activeStatuses.has(t.status),
      );

      const provisionalOccupied = activeTenancies.length;

      const capacity = unit.active ? unit.capacity : 0;

      return {
        unitId: unit.id,
        room: unit.label,
        property: unit.property.title,
        capacity,
        activeTenancies: activeTenancies.length,
        provisionalOccupied,
        provisionalAvailable: Math.max(0, capacity - provisionalOccupied),
        overCapacity: provisionalOccupied > capacity,
        occupancyVerified: false,
      };
    });

    const billingFlags = [];

    for (const tenancy of tenancies) {
      if (tenancy.status !== "VACATED") {
        continue;
      }

      for (const invoice of tenancy.invoices) {
        if (invoice.status === "PAID") {
          continue;
        }

        billingFlags.push({
          tenancyId: tenancy.id,
          tenant: tenancy.tenant.name,
          invoiceId: invoice.id,
          period: invoice.period,
          amount: invoice.amount,
          penalty: invoice.penalty,
          status: invoice.status,
          reason:
            "Unpaid invoice on a VACATED tenancy; review billing period and move-out settlement",
          suggestedAction: "REVIEW_ONLY",
        });
      }
    }

    const occupancyFlags = rooms
      .filter(
        (room) =>
          room.overCapacity || !units.find((u) => u.id === room.unitId)?.active,
      )
      .map((room) => ({
        unitId: room.unitId,
        room: room.room,
        reason: room.overCapacity
          ? "Active tenancy count exceeds room capacity"
          : "Inactive room requires occupancy review",
      }));

    res.json({
      summary: {
        assignedProperties: propertyIds.length,
        rooms: rooms.length,
        activeTenancies: tenancies.filter((t) => activeStatuses.has(t.status))
          .length,
        vacatedTenancies: tenancies.filter((t) => t.status === "VACATED")
          .length,
        occupancyFlags: occupancyFlags.length,
        billingFlags: billingFlags.length,
      },
      rooms,
      occupancyFlags,
      billingFlags,
      note: "Occupancy is provisional until physical check-in and bed allocation are recorded.",
    });
  }),
);

// Read-only diagnosis for the Manager check-in screen. Never exposes other owners' data.
router.get("/checkin-readiness", asyncRoute(async(req,res)=>{
  const assigned = await prisma.managerAssignment.findMany({
    where:{managerId:req.user.id,property:{owner:{active:true}}},
    select:{propertyId:true,property:{select:{title:true}}}
  });
  const ids=assigned.map(x=>x.propertyId);
  const where={unit:{propertyId:{in:ids}}};
  const [activeTenancies, awaitingCheckIn, confirmedCheckIns] = await Promise.all([
    prisma.tenancy.count({where:{...where,status:"ACTIVE"}}),
    prisma.tenancy.count({where:{...where,status:"ACTIVE",checkInAt:null,checkOutAt:null}}),
    prisma.tenancy.count({where:{...where,checkInAt:{not:null},checkOutAt:null}}),
  ]);
  res.set("Cache-Control","private, no-store");
  res.json({assignedProperties:assigned.length,properties:assigned.map(a=>({id:a.propertyId,title:a.property.title})),activeTenancies,awaitingCheckIn,confirmedCheckIns});
}));

router.get(
  "/checkins",
  asyncRoute(async (req, res) => {
    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: {
          in: ["ACTIVE", "VACATING"],
        },
        unit: {
          property: {
            owner: { active: true },
            assignments: {
              some: {
                managerId: req.user.id,
              },
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        checkInAt: true,
        checkInById: true,
        checkOutAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        unit: {
          select: {
            id: true,
            label: true,
            capacity: true,
            property: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    res.json(tenancies);
  }),
);

router.post(
  "/checkins/:tenancyId/confirm",
  asyncRoute(async (req, res) => {
    const tenancyId = req.params.tenancyId;
    required(req.body?.identityVerified === true && req.body?.roomVerified === true,
      "Identity and room verification are required", 400);

    const result = await prisma.$transaction(
      async (tx) => {
        const tenancy = await tx.tenancy.findUnique({
          where: {
            id: tenancyId,
          },
          select: {
            id: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            unitId: true,
            unit: {
              select: {
                id: true,
                capacity: true,
                active: true,
                propertyId: true,
              },
            },
          },
        });

        required(tenancy, "Tenancy not found", 404);

        // Recheck property assignment when writing.
        const assignment = await tx.managerAssignment.findFirst({
          where: {
            managerId: req.user.id,
            propertyId: tenancy.unit.propertyId,
            property: {
              owner: {
                active: true,
              },
            },
          },
          select: { id: true },
        });

        required(assignment, "You are not assigned to this property", 403);

        required(
          tenancy.status === "ACTIVE",
          "Only ACTIVE tenancies can check in",
          409,
        );

        required(tenancy.unit.active, "Room is inactive", 409);

        required(
          !tenancy.checkInAt && !tenancy.checkOutAt,
          "Check-in already recorded or tenancy checked out",
          409,
        );

        const occupied = await tx.tenancy.count({
          where: {
            unitId: tenancy.unitId,
            status: {
              in: ["ACTIVE", "VACATING"],
            },
            checkInAt: {
              not: null,
            },
            checkOutAt: null,
          },
        });

        required(
          occupied < tenancy.unit.capacity,
          "No confirmed capacity available",
          409,
        );

        const now = new Date();

        const updated = await tx.tenancy.updateMany({
          where: {
            id: tenancyId,
            status: "ACTIVE",
            checkInAt: null,
            checkOutAt: null,
          },
          data: {
            checkInAt: now,
            checkInById: req.user.id,
          },
        });

        required(updated.count === 1, "Check-in already processed", 409);

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "TENANT_CHECKED_IN",
            entityType: "Tenancy",
            entityId: tenancyId,
            metadata: {
              unitId: tenancy.unitId,
              propertyId: tenancy.unit.propertyId,
              confirmedAt: now.toISOString(),
              identityVerified: true,
              roomVerified: true,
            },
          },
        });

        const affected=await tx.tenancy.findUnique({where:{id:tenancyId},select:{tenantId:true,unit:{select:{property:{select:{ownerId:true}}}}}});
        await notifyUsers(tx,{userIds:[affected.tenantId,affected.unit.property.ownerId],type:'CHECKIN_CONFIRMED',referenceId:tenancyId,
          title:'Physical check-in confirmed',message:'Manager verified the tenant identity and room; the physical check-in has been recorded.'});
        return {
          tenancyId,
          checkInAt: now,
          checkInById: req.user.id,
          status: "CHECKED_IN",
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.status(200).json({
      message: "Physical check-in confirmed",
      ...result,
    });
  }),
);

/**
 * GET /api/manager-portal/checkout-inspections
 * Manager sees move-out requests for assigned properties.
 */
router.get(
  "/checkout-inspections",
  asyncRoute(async (req, res) => {
    const tenancies = await prisma.tenancy.findMany({
      where: {
        status: "VACATING",
        moveOut: {
          isNot: null,
        },
        unit: {
          property: {
            owner: { active: true },
            assignments: {
              some: { managerId: req.user.id },
            },
          },
        },
      },
      select: {
        id: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
        tenant: {
          select: {
            name: true,
          },
        },
        unit: {
          select: {
            label: true,
            property: {
              select: {
                title: true,
              },
            },
          },
        },
        moveOut: {
          select: {
            requestedDate: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const tenancyIds = tenancies.map((t) => t.id);

    const inspections = await prisma.managerCheckoutInspection.findMany({
      where: {
        tenancyId: { in: tenancyIds },
      },
    });

    const inspectionMap = new Map(inspections.map((i) => [i.tenancyId, i]));

    res.json(
      tenancies.map((tenancy) => ({
        ...tenancy,
        inspection: inspectionMap.get(tenancy.id) || null,
      })),
    );
  }),
);

/**
 * POST /api/manager-portal/checkout-inspections/:tenancyId
 * Records inspection only. Does not check out or settle.
 */
router.post(
  "/checkout-inspections/:tenancyId",
  asyncRoute(async (req, res) => {
    const tenancyId = req.params.tenancyId;

    const condition = String(req.body?.condition || "").trim();

    const notes = String(req.body?.notes || "").trim();

    const damageObserved = req.body?.damageObserved;

    required(
      ["GOOD", "NEEDS_REPAIR", "DAMAGED"].includes(condition),
      "Select a valid room condition",
      400,
    );

    required(
      notes.length >= 10 && notes.length <= 2000,
      "Inspection notes must contain 10-2000 characters",
      400,
    );

    required(
      typeof damageObserved === "boolean",
      "Damage observed must be true or false",
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findFirst({
        where: {
          id: tenancyId,
          status: "VACATING",
          moveOut: {
            isNot: null,
          },
          unit: {
            property: {
              owner: { active: true },
              assignments: {
                some: {
                  managerId: req.user.id,
                },
              },
            },
          },
        },
        select: {
          id: true,
          checkInAt: true,
          checkOutAt: true,
          unit: {
            select: {
              propertyId: true,
            },
          },
        },
      });

      required(tenancy, "Eligible move-out request not found", 404);

      required(
        tenancy.checkInAt && !tenancy.checkOutAt,
        "Tenant must be physically checked in",
        409,
      );

      const existing = await tx.managerCheckoutInspection.findUnique({
        where: { tenancyId },
      });

      required(!existing, "Inspection already submitted", 409);

      const inspection = await tx.managerCheckoutInspection.create({
        data: {
          tenancyId,
          managerId: req.user.id,
          condition,
          notes,
          damageObserved,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "CHECKOUT_INSPECTION_RECORDED",
          entityType: "ManagerCheckoutInspection",
          entityId: inspection.id,
          metadata: {
            tenancyId,
            propertyId: tenancy.unit.propertyId,
            condition,
            damageObserved,
          },
        },
      });

      return inspection;
    });

    res.status(201).json({
      message: "Inspection recorded for Owner review",
      inspection: result,
    });
  }),
);

router.get(
  "/physical-occupancy",
  asyncRoute(async (req, res) => {
    const units = await prisma.unit.findMany({
      where: {
        property: {
          owner: { active: true },
          assignments: {
            some: {
              managerId: req.user.id,
            },
          },
        },
      },
      select: {
        id: true,
        label: true,
        capacity: true,
        active: true,
        property: {
          select: {
            id: true,
            title: true,
          },
        },
        tenancies: {
          where: {
            status: {
              in: ["ACTIVE", "VACATING"],
            },
          },
          select: {
            id: true,
            status: true,
            checkInAt: true,
            checkOutAt: true,
            tenant: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const rooms = units.map((unit) => {
      const confirmed = unit.tenancies.filter(
        (t) => t.checkInAt && !t.checkOutAt,
      );

      const pendingCheckIn = unit.tenancies.filter(
        (t) => !t.checkInAt && !t.checkOutAt,
      );

      const occupied = confirmed.length;
      const capacity = unit.active ? unit.capacity : 0;

      return {
        unitId: unit.id,
        room: unit.label,
        propertyId: unit.property.id,
        property: unit.property.title,
        capacity,
        confirmedOccupied: occupied,
        awaitingCheckIn: pendingCheckIn.length,
        availableCapacity: Math.max(0, capacity - occupied),
        occupancyPercent:
          capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
        overCapacity: occupied > capacity,
        occupants: confirmed.map((t) => ({
          tenancyId: t.id,
          tenant: t.tenant.name,
          checkInAt: t.checkInAt,
        })),
      };
    });

    res.json({
      summary: {
        totalRooms: rooms.length,
        totalCapacity: rooms.reduce((sum, r) => sum + r.capacity, 0),
        confirmedOccupied: rooms.reduce(
          (sum, r) => sum + r.confirmedOccupied,
          0,
        ),
        awaitingCheckIn: rooms.reduce((sum, r) => sum + r.awaitingCheckIn, 0),
        availableCapacity: rooms.reduce(
          (sum, r) => sum + r.availableCapacity,
          0,
        ),
      },
      rooms,
      note: "Physical occupancy is tenancy-based, not individual bed-based. Available capacity is not booking availability.",
    });
  }),
);

export default router;
