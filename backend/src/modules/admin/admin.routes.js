import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required, fail } from "../../lib/errors.js";
import { notifyUsers } from "../notifications/notify.service.js";
import { subscriptionPublicationEligibility } from "../properties/publicationEligibility.js";
const r = Router();
r.use(authenticate, roles("ADMIN"));
r.get(
  "/summary",
  asyncRoute(async (req, res) => {
    const [owners, properties, tenants, pending] = await Promise.all([
      prisma.user.count({ where: { role: "OWNER" } }),
      prisma.property.count(),
      prisma.user.count({ where: { role: "TENANT" } }),
      prisma.property.count({ where: { status: "PENDING" } }),
    ]);
    res.json({ owners, properties, tenants, pending });
  }),
);
r.get(
  "/properties",
  asyncRoute(async (req, res) =>
    res.json(
      await prisma.property.findMany({
        include: {
          owner: { select: { name: true, email: true } },
          units: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
  ),
);
r.post(
  "/properties/:id/moderate",
  asyncRoute(async (req, res) => {
    required(
      ["PUBLISHED", "REJECTED", "SUSPENDED"].includes(req.body.status),
      "Invalid moderation status",
    );
    const requested = req.body.status;
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.property.findUnique({
        where: { id: req.params.id },
        select: { id: true, ownerId: true, status: true, title: true },
      });
      required(current, "Property not found", 404);
      required(current.status !== requested, "Property already has that status", 409);
      if (requested === "PUBLISHED") {
        required(current.status === "PENDING", "Only pending listings can be published", 409);
        const eligibility = await subscriptionPublicationEligibility(tx, current);
        required(eligibility.ok, eligibility.message, 403);
        const activeUnitCount = await tx.unit.count({
          where: { propertyId: current.id, active: true },
        });
        required(activeUnitCount > 0, "Property needs an active unit before publishing", 409);
      }
      const changed = await tx.property.updateMany({
        where: { id: current.id, status: current.status },
        data: { status: requested },
      });
      required(changed.count === 1, "Property changed, refresh and try again", 409);
      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_PROPERTY_MODERATED",
          entityType: "Property",
          entityId: current.id,
          metadata: { from: current.status, to: requested },
        },
      });
      await notifyUsers(tx, {
        userIds: [current.ownerId],
        type: "PROPERTY_DECISION",
        referenceId: current.id,
        title: `Property status changed to ${requested}`,
        message: `${current.title}: moderation decision ${requested}. Review your property dashboard.`,
      });
      return tx.property.findUnique({ where: { id: current.id } });
    }, { isolationLevel: "Serializable" });
    res.json(updated);
  }),
);
r.get(
  "/owners",
  asyncRoute(async (req, res) =>
    res.json(
      await prisma.user.findMany({
        where: { role: "OWNER" },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          createdAt: true,
        },
      }),
    ),
  ),
);

// Owner onboarding is an ADMIN-only action; no public OWNER registration route exists.
r.post(
  "/owners",
  asyncRoute(async (req, res) => {
    const { name, email, password, phone } = req.body;
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    required(String(name || "").trim().length >= 2, "Owner full name required");
    required(/^\S+@\S+\.\S+$/.test(normalized), "Valid owner email required");
    required(
      typeof password === "string" && password.length >= 12,
      "Temporary password must be 12+ characters",
    );
    const owner = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalized,
        phone: phone || null,
        passwordHash: await bcrypt.hash(password, 12),
        role: "OWNER",
        verified: true,
        active: true,
      },
    });
    res.status(201).json({
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
      active: owner.active,
    });
  }),
);
r.patch(
  "/owners/:id/status",
  asyncRoute(async (req, res) => {
    required(typeof req.body.active === "boolean", "active must be boolean");
    const owner = await prisma.user.findUnique({
      where: { id: req.params.id },
    });
    if (!owner || owner.role !== "OWNER") fail(404, "Owner not found");
    const changed = await prisma.user.update({
      where: { id: owner.id },
      data: { active: req.body.active },
    });
    res.json({ id: changed.id, active: changed.active });
  }),
);
export default r;
