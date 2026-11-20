import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
const r = Router();
r.use(authenticate);
export const PLANS = {
  STARTER: { price: 499, limit: 2 },
  PRO: { price: 999, limit: 10 },
  BUSINESS: { price: 1999, limit: 50 },
};
r.get("/plans", (req, res) => res.json(PLANS));
r.get(
  "/mine",
  roles("OWNER"),
  asyncRoute(async (req, res) =>
    res.json(
      await prisma.subscription.findFirst({
        where: { ownerId: req.user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      }),
    ),
  ),
);
r.post(
  "/demo-activate",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Demo subscription activation is disabled in production" });
    }
    const requested = typeof req.body?.plan === 'string' ? req.body.plan : '';
    const plan = Object.hasOwn(PLANS, requested) ? PLANS[requested] : null;
    required(plan, "Invalid plan");
    const expiry = new Date();
    expiry.setUTCMonth(expiry.getUTCMonth() + 1);
    const s = await prisma.$transaction(async tx => {
      const created = await tx.subscription.create({
      data: {
        ownerId: req.user.id,
        plan: requested,
        price: plan.price,
        listingLimit: plan.limit,
        expiresAt: expiry,
      },
      });
      await tx.auditLog.create({ data: {
        actorId: req.user.id, action: 'OWNER_DEMO_SUBSCRIPTION_ACTIVATED',
        entityType: 'Subscription', entityId: created.id,
        metadata: { plan: requested, paymentMode: 'DEMO_ONLY' },
      } });
      return created;
    });
    res.json({ subscription: s, paymentMode: "DEMO_ONLY" });
  }),
);
export default r;
