import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute, required, fail } from "../../lib/errors.js";

const r = Router();

r.use(authenticate);

// ------------------------------------
// GET: OWNER'S MANAGER ASSIGNMENTS
// ------------------------------------

r.get(
  "/",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const assignments = await prisma.managerAssignment.findMany({
      where: {
        property: {
          ownerId: req.user.id,
        },
      },
      include: {
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            active: true,
            verified: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    res.json(assignments);
  }),
);

// ------------------------------------
// POST: CREATE / APPOINT MANAGER
// ------------------------------------

r.post(
  "/appoint",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const propertyId = String(req.body?.propertyId || "");

    const name = String(req.body?.name || "").trim();

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body?.password || "");

    const phone = String(req.body?.phone || "").trim();

    required(
      propertyId &&
        name.length >= 2 &&
        name.length <= 100 &&
        /^\S+@\S+\.\S+$/.test(email) &&
        (!phone || phone.length <= 25),
      "Valid manager details required",
      400,
    );

    // Only the property owner can appoint a manager.
    await ownerProperty(req.user, propertyId);

    const existingManager = await prisma.user.findUnique({
      where: { email },
    });

    if (existingManager && existingManager.role !== "MANAGER") {
      fail(409, "Email belongs to another role");
    }

    if (existingManager) {
      required(
        existingManager.active && existingManager.verified,
        "Manager account is inactive or unverified",
        403,
      );
    } else {
      required(
        password.length >= 10 && password.length <= 128,
        "Temporary password must be 10-128 characters",
        400,
      );
    }

    // Password hashing before the database transaction
    // avoids unnecessarily holding transaction locks.
    const passwordHash = existingManager
      ? null
      : await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      let manager = existingManager;

      if (!manager) {
        manager = await tx.user.create({
          data: {
            name,
            email,
            phone: phone || null,
            passwordHash,
            role: "MANAGER",
            verified: true,
            active: true,
          },
        });
      }

      const existingAssignment = await tx.managerAssignment.findUnique({
        where: {
          managerId_propertyId: {
            managerId: manager.id,
            propertyId,
          },
        },
      });

      required(
        !existingAssignment,
        "Manager already assigned to this property",
        409,
      );

      const assignment = await tx.managerAssignment.create({
        data: {
          managerId: manager.id,
          propertyId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "MANAGER_ASSIGNED",
          entityType: "ManagerAssignment",
          entityId: assignment.id,
          metadata: {
            managerId: manager.id,
            propertyId,
            accountCreated: !existingManager,
          },
        },
      });

      return {
        assignmentId: assignment.id,
        managerId: manager.id,
        managerName: manager.name,
        managerEmail: manager.email,
        accountCreated: !existingManager,
      };
    });

    res.status(201).json({
      message: result.accountCreated
        ? "Manager account created and assigned"
        : "Existing manager assigned successfully",
      ...result,
    });
  }),
);

// ------------------------------------
// DELETE: REVOKE PROPERTY ACCESS
// ------------------------------------

r.delete(
  "/assignment/:id",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const assignment = await prisma.managerAssignment.findFirst({
      where: {
        id: req.params.id,
        property: {
          ownerId: req.user.id,
        },
      },
    });

    required(assignment, "Manager assignment not found", 404);

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
            managerId: assignment.managerId,
            propertyId: assignment.propertyId,
          },
        },
      });
    });

    res.json({
      message: "Manager property access revoked",
    });
  }),
);

export default r;
