import { Router } from "express";
import { notifyUsers } from "../notifications/notify.service.js";
import { z } from "zod";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("ADMIN"));

const planSchema = z
  .object({
    plan: z.enum(["STARTER", "PRO", "BUSINESS"]),
    listingLimit: z.number().int().min(1).max(1000),
    reason: z.string().trim().min(10).max(500),
    expectedPlan: z.enum(["STARTER", "PRO", "BUSINESS"]),
    expectedListingLimit: z.number().int().min(1),
  })
  .strict();

// Read-only gateway checkout attempts, distinct from activated subscriptions.
// TEST_PAID never activates a subscription and must not be counted as revenue.
router.get("/checkouts", asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const take = 20;
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const status = typeof req.query.status === "string" ? req.query.status.trim().toUpperCase() : "";
  const allowedStatuses = new Set(["TEST_PAID", "PAID", "CREATED", "CREATING", "REVIEW_REQUIRED", "FAILED"]);
  if (status && !allowedStatuses.has(status)) {
    return res.status(400).json({ error: "Unsupported checkout status filter" });
  }
  const where = { purpose: "SUBSCRIPTION" };
  if (status) where.status = status;
  if (search) {
    const owners = await prisma.user.findMany({
      where: { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ] },
      select: { id: true },
    });
    const alternatives = [
      { referenceId: { contains: search, mode: "insensitive" } },
      { plan: { contains: search, mode: "insensitive" } },
    ];
    if (owners.length) alternatives.push({ userId: { in: owners.map(u => u.id) } });
    if (allowedStatuses.has(search.toUpperCase())) alternatives.push({ status: search.toUpperCase() });
    where.OR = alternatives;
  }
  const [total, checkouts] = await Promise.all([
    prisma.paymentCheckout.count({ where }),
    prisma.paymentCheckout.findMany({
      where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * take, take,
      select: { id: true, userId: true, referenceId: true, plan: true,
        amountPaise: true, status: true, createdAt: true, fulfilledAt: true },
    }),
  ]);
  const userIds = [...new Set(checkouts.map(c => c.userId))];
  const users = userIds.length ? await prisma.user.findMany({
    where: { id: { in: userIds } }, select: { id: true, name: true, email: true },
  }) : [];
  const ownerById = new Map(users.map(u => [u.id, u]));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ total, page, totalPages: Math.ceil(total / take),
    checkouts: checkouts.map(c => ({ ...c, owner: ownerById.get(c.userId) || null,
      isGatewayVerified: c.status === "PAID", activatesPlan: c.status === "PAID" })) });
}));

// GET /api/admin-subscriptions
router.get(
  "/",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );

    const pageSize = 20;

    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count(),

      prisma.subscription.findMany({
        select: {
          id: true,
          ownerId: true,
          plan: true,
          price: true,
          listingLimit: true,
          expiresAt: true,
          createdAt: true,
          owner: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / pageSize),
      subscriptions: subscriptions.map((s) => ({
        ...s,
        status: new Date(s.expiresAt) > new Date() ? "ACTIVE" : "EXPIRED",
      })),
    });
  }),
);

// PATCH /api/admin-subscriptions/:id/plan
router.patch(
  "/:id/plan",
  asyncRoute(async (req, res) => {
    const parsed = planSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid subscription update",
        details: parsed.error.flatten(),
      });
    }

    const { plan, listingLimit, reason, expectedPlan, expectedListingLimit } =
      parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          ownerId: true,
          plan: true,
          listingLimit: true,
        },
      });

      if (!existing) {
        return { error: "Subscription not found", code: 404 };
      }

      if (
        existing.plan !== expectedPlan ||
        existing.listingLimit !== expectedListingLimit
      ) {
        return {
          error: "Subscription changed. Refresh and retry.",
          code: 409,
        };
      }

      if (existing.plan === plan && existing.listingLimit === listingLimit) {
        return {
          error: "No subscription changes requested",
          code: 400,
        };
      }

      const updated = await tx.subscription.updateMany({
        where: {
          id: existing.id,
          plan: expectedPlan,
          listingLimit: expectedListingLimit,
        },
        data: {
          plan,
          listingLimit,
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Concurrent update detected. Refresh and retry.",
          code: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_SUBSCRIPTION_PLAN_CHANGED",
          entityType: "Subscription",
          entityId: existing.id,
          metadata: {
            previousPlan: existing.plan,
            newPlan: plan,
            previousListingLimit: existing.listingLimit,
            newListingLimit: listingLimit,
            reason,
            billingAction: "NONE",
          },
        },
      });

      await notifyUsers(tx,{userIds:[existing.ownerId],type:'SUBSCRIPTION_PLAN_CHANGE',referenceId:existing.id,
        title:'Subscription plan settings updated',
        message:`Admin updated plan settings to ${plan} and listing limit ${listingLimit}. No payment was processed by this administrative action.`});
      return {
        id: existing.id,
        plan,
        listingLimit,
      };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: "Subscription updated successfully",
      subscription: result,
    });
  }),
);

const lifecycleSchema = z
  .object({
    action: z.enum(["ACTIVATE", "EXTEND", "DEACTIVATE"]),
    expiresAt: z.string().datetime().optional(),
    reason: z.string().trim().min(10).max(500),
    expectedExpiresAt: z.string().datetime(),
  })
  .strict();

// PATCH /api/admin-subscriptions/:id/lifecycle
router.patch(
  "/:id/lifecycle",
  asyncRoute(async (req, res) => {
    const parsed = lifecycleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid lifecycle request",
        details: parsed.error.flatten(),
      });
    }

    const { action, expiresAt, reason, expectedExpiresAt } = parsed.data;

    const now = new Date();

    if (action !== "DEACTIVATE") {
      if (!expiresAt || new Date(expiresAt) <= now) {
        return res.status(400).json({
          error: "Select a future expiry date",
        });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          ownerId: true,
          plan: true,
          expiresAt: true,
        },
      });

      if (!existing) {
        return {
          error: "Subscription not found",
          code: 404,
        };
      }

      if (
        existing.expiresAt.getTime() !== new Date(expectedExpiresAt).getTime()
      ) {
        return {
          error: "Subscription changed. Refresh and retry.",
          code: 409,
        };
      }

      const currentTime = new Date();

      if (action === "EXTEND" && new Date(expiresAt) <= existing.expiresAt) {
        return {
          error: "Extension must increase the expiry date",
          code: 400,
        };
      }

      if (action === "ACTIVATE" && existing.expiresAt > currentTime) {
        return {
          error: "Subscription is already active",
          code: 409,
        };
      }

      if (action === "DEACTIVATE" && existing.expiresAt <= currentTime) {
        return {
          error: "Subscription is already expired",
          code: 409,
        };
      }

      const nextExpiry =
        action === "DEACTIVATE" ? currentTime : new Date(expiresAt);

      const updated = await tx.subscription.updateMany({
        where: {
          id: existing.id,
          expiresAt: existing.expiresAt,
        },
        data: {
          expiresAt: nextExpiry,
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Subscription changed. Refresh and retry.",
          code: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_SUBSCRIPTION_LIFECYCLE_CHANGED",
          entityType: "Subscription",
          entityId: existing.id,
          metadata: {
            ownerId: existing.ownerId,
            plan: existing.plan,
            operation: action,
            previousExpiresAt: existing.expiresAt.toISOString(),
            newExpiresAt: nextExpiry.toISOString(),
            reason,
            billingAction: "NONE",
          },
        },
      });

      return {
        id: existing.id,
        expiresAt: nextExpiry,
        status: nextExpiry > currentTime ? "ACTIVE" : "EXPIRED",
      };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: `Subscription ${action.toLowerCase()} completed`,
      subscription: result,
    });
  }),
);

export default router;
