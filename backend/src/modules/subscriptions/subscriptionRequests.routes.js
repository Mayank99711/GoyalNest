import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers, activeUserIdsByRole } from "../notifications/notify.service.js";

const router = Router();
router.use(authenticate);

const requestInput = z.object({
  plan: z.enum(["STARTER", "PRO", "BUSINESS"]),
  action: z.enum(["NEW", "UPGRADE", "RENEW"]),
  note: z.string().trim().max(500).default(""),
}).strict();

// Requesting a plan NEVER charges money or grants entitlements.
router.post("/requests", roles("OWNER"), asyncRoute(async (req, res) => {
  const parsed = requestInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid subscription request" });
  const data = parsed.data;
  const result = await prisma.$transaction(async tx => {
    const pending = await tx.subscriptionChangeRequest.findFirst({
      where: { ownerId: req.user.id, status: "PENDING" }, select: { id: true },
    });
    if (pending) return { code: 409, error: "A subscription request is already pending review" };
    const request = await tx.subscriptionChangeRequest.create({
      data: { ownerId: req.user.id, requestedPlan: data.plan, action: data.action, note: data.note },
    });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "OWNER_SUBSCRIPTION_REQUESTED", entityType: "SubscriptionChangeRequest", entityId: request.id, metadata: { plan: data.plan, action: data.action, paymentStatus: "NOT_CHARGED" } } });
    await notifyUsers(tx, {userIds:await activeUserIdsByRole(tx,'ADMIN'),type:'SUBSCRIPTION_REVIEW',referenceId:request.id,
      title:'Subscription change request requires review',message:`An Owner requested ${data.action} for ${data.plan}. No payment has been taken.`});
    return { request };
  });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.status(201).json({ ...result, message: "Request submitted for Admin review. No payment was taken." });
}));

router.get("/requests/mine", roles("OWNER"), asyncRoute(async (req, res) => {
  const requests = await prisma.subscriptionChangeRequest.findMany({
    where: { ownerId: req.user.id }, orderBy: { createdAt: "desc" }, take: 50,
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ requests });
}));

router.get("/requests/admin", roles("ADMIN"), asyncRoute(async (req, res) => {
  const status = ["PENDING", "REVIEWED", "REJECTED"].includes(req.query.status) ? req.query.status : undefined;
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const where = { ...(status ? { status } : {}) };
  const [total, requests] = await Promise.all([
    prisma.subscriptionChangeRequest.count({ where }),
    prisma.subscriptionChangeRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 20, take: 20,
      include: { owner: { select: { name: true, email: true } } } }),
  ]);
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ total, page, totalPages: Math.max(1, Math.ceil(total / 20)), requests });
}));

const decisionSchema = z.object({
  decision: z.enum(["REVIEWED", "REJECTED"]),
  adminNote: z.string().trim().min(10).max(500),
}).strict();

// REVIEWED means reviewed only. It does not activate, charge or extend subscriptions.
router.patch("/requests/:id/review", roles("ADMIN"), asyncRoute(async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a valid decision and at least 10 characters of review notes" });
  const result = await prisma.$transaction(async tx => {
    const updated = await tx.subscriptionChangeRequest.updateMany({
      where: { id: req.params.id, status: "PENDING" },
      data: { status: parsed.data.decision, adminNote: parsed.data.adminNote, reviewedAt: new Date(), reviewedById: req.user.id },
    });
    if (updated.count !== 1) return { code: 409, error: "Request not pending, not found, or already reviewed" };
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "ADMIN_SUBSCRIPTION_REQUEST_REVIEWED", entityType: "SubscriptionChangeRequest", entityId: req.params.id,
      metadata: { decision: parsed.data.decision, adminNote: parsed.data.adminNote, billingAction: "NONE", entitlementAction: "NONE" } } });
    const request=await tx.subscriptionChangeRequest.findUnique({where:{id:req.params.id},select:{ownerId:true,requestedPlan:true}});
    await notifyUsers(tx,{userIds:[request?.ownerId],type:'SUBSCRIPTION_DECISION',referenceId:req.params.id,
      title:'Subscription request reviewed',message:`Your ${request?.requestedPlan || ''} subscription request is ${parsed.data.decision}. This review did not charge money or activate a plan.`});
    return { ok: true };
  });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.json({ message: "Request reviewed. Subscription and payment records were not changed." });
}));

export default router;
