import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("OWNER"));

// List Owner's properties and their managers.
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const properties = await prisma.property.findMany({
      where: {
        ownerId: req.user.id,
      },
      select: {
        id: true,
        title: true,
        city: true,
        assignments: {
          select: {
            id: true,
            managerId: true,
            manager: {
              select: {
                name: true,
                email: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: {
        title: "asc",
      },
    });

    res.json(properties);
  }),
);

// Assign an existing active, verified Manager.
router.post(
  "/assign",
  asyncRoute(async (req, res) => {
    const propertyId = String(req.body?.propertyId || "");

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    required(
      propertyId && /^\S+@\S+\.\S+$/.test(email),
      "Property and valid manager email required",
      400,
    );

    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        ownerId: req.user.id,
      },
    });

    required(property, "Property not found", 404);

    const manager = await prisma.user.findUnique({
      where: { email },
    });

    required(
      manager &&
        manager.role === "MANAGER" &&
        manager.active &&
        manager.verified,
      "No eligible manager account found",
      400,
    );

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.managerAssignment.findUnique({
        where: {
          managerId_propertyId: {
            managerId: manager.id,
            propertyId,
          },
        },
      });

      required(!existing, "Manager is already assigned to this property", 409);

      const assignment = await tx.managerAssignment.create({
        data: {
          propertyId,
          managerId: manager.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MANAGER_ASSIGNED",
          entityType: "ManagerAssignment",
          entityId: assignment.id,
          metadata: {
            propertyId,
            managerId: manager.id,
          },
        },
      });

      return assignment;
    });

    res.status(201).json({
      message: "Manager assigned successfully",
      assignment: result,
    });
  }),
);

// Remove a Manager's property assignment.
router.delete(
  "/assignments/:id",
  asyncRoute(async (req, res) => {
    const assignment = await prisma.managerAssignment.findUnique({
      where: {
        id: req.params.id,
      },
      include: {
        property: {
          select: {
            ownerId: true,
          },
        },
      },
    });

    required(
      assignment && assignment.property.ownerId === req.user.id,
      "Assignment not found",
      404,
    );

    await prisma.$transaction(async (tx) => {
      const removed = await tx.managerAssignment.deleteMany({
        where: {
          id: assignment.id,
          property: {
            ownerId: req.user.id,
          },
        },
      });

      required(removed.count === 1, "Assignment already removed", 409);

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MANAGER_UNASSIGNED",
          entityType: "ManagerAssignment",
          entityId: assignment.id,
          metadata: {
            propertyId: assignment.propertyId,
            managerId: assignment.managerId,
          },
        },
      });
    });

    res.json({
      message: "Manager access removed",
    });
  }),
);

export default router;
