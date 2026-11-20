import { Router } from "express";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { prisma } from "../../config/prisma.js";
import { gatewayReady, signatureMatches, startCheckout, reconcileCapturedPayment,
  reconcileFromOrder } from "./checkout.service.js";

const router = Router();
router.use(authenticate, roles("TENANT", "OWNER"));

router.get("/config", (req, res) => res.json({
  configured: gatewayReady(), provider: gatewayReady() ? "RAZORPAY" : "NOT_CONFIGURED",
  mode: process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") ? "TEST" :
    process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") ? "LIVE" : "UNAVAILABLE",
}));

router.get("/mine", asyncRoute(async (req, res) => {
  const rows = await prisma.paymentCheckout.findMany({
    where: { userId: req.user.id }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, purpose: true, referenceId: true, plan: true, amountPaise: true,
      status: true, createdAt: true, fulfilledAt: true },
  });
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ checkouts: rows });
}));

router.post("/start", asyncRoute(async (req, res) => {
  const { purpose, referenceId, idempotencyKey } = req.body || {};
  if (!["RENT", "SUBSCRIPTION"].includes(purpose) ||
      typeof referenceId !== "string" || referenceId.length > 128 || !referenceId ||
      typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: "Valid purpose, reference and idempotency key required" });
  }
  const result = await startCheckout(req.user, purpose, referenceId, idempotencyKey);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.status(201).json(result);
}));

router.post("/confirm", asyncRoute(async (req, res) => {
  const { checkoutId, razorpay_order_id: orderId, razorpay_payment_id: paymentId,
    razorpay_signature: signature } = req.body || {};
  if (![checkoutId, orderId, paymentId, signature].every(v => typeof v === "string" && v.length < 256)) {
    return res.status(400).json({ error: "Missing payment confirmation fields" });
  }
  const checkout = await prisma.paymentCheckout.findFirst({
    where: { id: checkoutId, userId: req.user.id, providerOrderId: orderId },
  });
  if (!checkout) return res.status(404).json({ error: "Checkout not found" });
  if (!signatureMatches(`${orderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET)) {
    return res.status(400).json({ error: "Invalid payment signature" });
  }
  const result = await reconcileCapturedPayment(orderId, paymentId);
  if (result.error) return res.status(result.status || 409).json({ error: result.error });
  return res.json({ message: result.testPayment ? "Test payment captured. No real invoice or plan was activated." : "Payment verified and recorded", ...result });
}));

router.post("/reconcile/:id", asyncRoute(async (req, res) => {
  const checkout = await prisma.paymentCheckout.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!checkout) return res.status(404).json({ error: "Checkout not found" });
  if (!checkout.providerOrderId) return res.status(409).json({ error: "Provider order not created" });
  const result = await reconcileFromOrder(checkout.providerOrderId);
  if (result.error) return res.status(result.status || 409).json({ error: result.error });
  return res.json(result);
}));

export default router;
