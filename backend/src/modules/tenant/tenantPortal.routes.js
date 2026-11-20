import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();
router.use(authenticate);

const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || "",
  role: user.role,
  verified: user.verified,
});

router.get("/profile", roles("TENANT"), (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ profile: safeUser(req.user) });
});

router.patch("/profile", roles("TENANT"), asyncRoute(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  required(name.length >= 2 && name.length <= 100, "Name must be 2-100 characters", 400);
  required(!phone || /^\+?[0-9 ()-]{7,20}$/.test(phone), "Enter a valid phone number", 400);
  const profile = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: req.user.id }, data: { name, phone: phone || null } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "TENANT_PROFILE_UPDATED", entityType: "User", entityId: req.user.id, metadata: { fields: ["name", "phone"] } } });
    return safeUser(updated);
  });
  res.json({ message: "Profile updated", profile });
}));

router.post("/password", roles("TENANT"), asyncRoute(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  required(newPassword.length >= 10 && newPassword.length <= 128, "New password must contain 10-128 characters", 400);
  required(currentPassword !== newPassword, "New password must differ from current password", 400);
  const current = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
  required(current && await bcrypt.compare(currentPassword, current.passwordHash), "Current password is incorrect", 400);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "TENANT_PASSWORD_CHANGED", entityType: "User", entityId: req.user.id, metadata: {} } });
  });
  res.json({ message: "Password changed successfully" });
}));

// All visits are tenant-owned or owner-property-scoped. No foreign-user IDs are accepted.
router.get("/visits", roles("TENANT", "OWNER"), asyncRoute(async (req, res) => {
  const where = req.user.role === "TENANT"
    ? { tenantId: req.user.id }
    : { property: { ownerId: req.user.id } };
  const visits = await prisma.propertyVisit.findMany({
    where, orderBy: { scheduledAt: "desc" }, take: 150,
    include: { property: { select: { id: true, title: true, city: true, locality: true } } },
  });
  if (req.user.role === "OWNER" && visits.length) {
    const tenantIds = [...new Set(visits.map(v => v.tenantId))];
    const tenants = await prisma.user.findMany({
      where: { id: { in: tenantIds } }, select: { id: true, name: true },
    });
    const names = new Map(tenants.map(t => [t.id, t.name]));
    for (const visit of visits) visit.tenantName = names.get(visit.tenantId) || "Tenant";
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ visits });
}));

router.post("/visits", roles("TENANT"), asyncRoute(async (req, res) => {
  const propertyId = String(req.body?.propertyId || "");
  const scheduledAt = new Date(req.body?.scheduledAt);
  const note = String(req.body?.note || "").trim();
  required(propertyId.length > 0, "Select a property", 400);
  required(Number.isFinite(scheduledAt.getTime()), "Valid visit date/time required", 400);
  required(scheduledAt.getTime() >= Date.now() + 60 * 60 * 1000 && scheduledAt.getTime() <= Date.now() + 60 * 86400000,
    "Choose a time from 1 hour to 60 days in advance", 400);
  required(note.length <= 500, "Note must be under 500 characters", 400);
  const property = await prisma.property.findFirst({ where: { id: propertyId, status: "PUBLISHED" }, select: { id: true } });
  required(property, "Available property not found", 404);
  const start = new Date(scheduledAt.getTime() - 60 * 60 * 1000);
  const end = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
  const collision = await prisma.propertyVisit.count({ where: { tenantId: req.user.id, status: { in: ["REQUESTED", "CONFIRMED"] }, scheduledAt: { gte: start, lte: end } } });
  required(!collision, "You already have a visit near this time", 409);
  const visit = await prisma.$transaction(async (tx) => {
    const created = await tx.propertyVisit.create({ data: { propertyId, tenantId: req.user.id, scheduledAt, note, status: "REQUESTED" } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "PROPERTY_VISIT_REQUESTED", entityType: "PropertyVisit", entityId: created.id, metadata: { propertyId } } });
    return created;
  });
  res.status(201).json({ visit, message: "Visit request sent to property owner" });
}));

router.patch("/visits/:id/cancel", roles("TENANT"), asyncRoute(async (req, res) => {
  const current = await prisma.propertyVisit.findFirst({ where: { id: req.params.id, tenantId: req.user.id } });
  required(current, "Visit not found", 404);
  required(["REQUESTED", "CONFIRMED"].includes(current.status), "Visit cannot be cancelled", 409);
  const visit = await prisma.$transaction(async (tx) => {
    const updated = await tx.propertyVisit.update({ where: { id: current.id }, data: { status: "CANCELLED" } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "PROPERTY_VISIT_CANCELLED", entityType: "PropertyVisit", entityId: current.id, metadata: {} } });
    return updated;
  });
  res.json({ visit, message: "Visit cancelled" });
}));

router.patch("/visits/:id/decision", roles("OWNER"), asyncRoute(async (req, res) => {
  const decision = String(req.body?.status || "");
  required(["CONFIRMED", "DECLINED", "COMPLETED"].includes(decision), "Invalid decision", 400);
  const current = await prisma.propertyVisit.findFirst({ where: { id: req.params.id, property: { ownerId: req.user.id } } });
  required(current, "Visit not found", 404);
  required(decision === "COMPLETED" ? current.status === "CONFIRMED" : current.status === "REQUESTED", "Invalid visit status transition", 409);
  required(decision !== "COMPLETED" || current.scheduledAt <= new Date(), "Visit cannot be completed before scheduled time", 409);
  const visit = await prisma.$transaction(async (tx) => {
    const updated = await tx.propertyVisit.update({ where: { id: current.id }, data: { status: decision } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "PROPERTY_VISIT_" + decision, entityType: "PropertyVisit", entityId: current.id, metadata: {} } });
    return updated;
  });
  res.json({ visit, message: `Visit ${decision.toLowerCase()}` });
}));

export default router;
