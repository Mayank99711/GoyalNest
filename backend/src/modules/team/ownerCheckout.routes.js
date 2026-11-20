import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("OWNER"));

// Owner views Manager inspections for owned properties.
router.get(
  "/inspections",
  asyncRoute(async (req, res) => {
    const tenancies = await prisma.tenancy.findMany({
      where: {
        unit: {
          property: {
            ownerId: req.user.id,
          },
        },
        status: {
          in: ["VACATING", "VACATED"],
        },
        moveOut: {
          isNot: null,
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
            email: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const tenancyIds = tenancies.map((t) => t.id);

    const inspections = await prisma.managerCheckoutInspection.findMany({
      where: {
        tenancyId: {
          in: tenancyIds,
        },
      },
      orderBy: {
        inspectedAt: "desc",
      },
    });

    const inspectionsByTenancy = new Map(
      inspections.map((i) => [i.tenancyId, i]),
    );

    res.json(
      tenancies.map((tenancy) => ({
        ...tenancy,
        inspection: inspectionsByTenancy.get(tenancy.id) || null,
        canFinalize:
          tenancy.status === "VACATED" &&
          Boolean(tenancy.checkInAt) &&
          !tenancy.checkOutAt &&
          inspectionsByTenancy.has(tenancy.id),
      })),
    );
  }),
);

// Owner finalizes physical check-out only after settlement.
router.post(
  "/:tenancyId/finalize",
  asyncRoute(async (req, res) => {
    const tenancyId = req.params.tenancyId;

    const result = await prisma.$transaction(async (tx) => {
      const tenancy = await tx.tenancy.findFirst({
        where: {
          id: tenancyId,
          unit: {
            property: {
              ownerId: req.user.id,
            },
          },
        },
        select: {
          id: true,
          status: true,
          checkInAt: true,
          checkOutAt: true,
          unitId: true,
          unit: {
            select: {
              propertyId: true,
            },
          },
        },
      });

      required(tenancy, "Tenancy not found", 404);

      required(
        tenancy.status === "VACATED",
        "Complete the existing Owner settlement workflow first",
        409,
      );

      required(
        tenancy.checkInAt && !tenancy.checkOutAt,
        "Tenancy must be checked in and not yet checked out",
        409,
      );

      const inspection = await tx.managerCheckoutInspection.findUnique({
        where: {
          tenancyId,
        },
      });

      required(inspection, "Manager inspection is required", 409);

      const now = new Date();

      const updated = await tx.tenancy.updateMany({
        where: {
          id: tenancyId,
          status: "VACATED",
          checkInAt: {
            not: null,
          },
          checkOutAt: null,
        },
        data: {
          checkOutAt: now,
        },
      });

      required(updated.count === 1, "Check-out already finalized", 409);

      // Free the physical inventory only after finalized checkout.
      // This is in the same transaction, so checkout and bed release commit together.
      const releasedBeds = await tx.unitBed.updateMany({
        where: { tenancyId },
        data: { tenancyId: null },
      });
      if (releasedBeds.count) {
        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "BED_RELEASED_ON_PHYSICAL_CHECKOUT",
            entityType: "Tenancy",
            entityId: tenancyId,
            metadata: { unitId: tenancy.unitId, releasedBeds: releasedBeds.count },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "PHYSICAL_CHECKOUT_FINALIZED",
          entityType: "Tenancy",
          entityId: tenancyId,
          metadata: {
            propertyId: tenancy.unit.propertyId,
            unitId: tenancy.unitId,
            inspectionId: inspection.id,
            checkedOutAt: now.toISOString(),
          },
        },
      });

      return {
        tenancyId,
        checkOutAt: now,
        finalizedById: req.user.id,
      };
    });

    res.json({
      message: "Physical check-out finalized",
      ...result,
    });
  }),
);

export default router;
