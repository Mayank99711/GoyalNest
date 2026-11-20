import express, { Router } from "express";
import { signatureMatches, reconcileCapturedPayment, reconcileFromOrder } from "./checkout.service.js";
const router = Router();

// Mount this router with express.raw({type: 'application/json'}) BEFORE express.json().
router.post("/webhook", express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
  const signature = req.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(req.body) ||
      !signatureMatches(req.body, signature, secret)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }
  let event;
  try { event = JSON.parse(req.body.toString("utf8")); }
  catch { return res.status(400).json({ error: "Invalid webhook body" }); }
  if (!["payment.captured", "order.paid"].includes(event.event)) {
    return res.status(200).json({ received: true });
  }
  // ACK valid webhooks quickly on retryable transient failures. Razorpay retries non-2xx responses.
  try {
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id || event.payload?.order?.entity?.id;
    if (!orderId) return res.status(400).json({ error: "Missing order ID" });
    const result = payment?.id
      ? await reconcileCapturedPayment(orderId, payment.id)
      : await reconcileFromOrder(orderId);
    if (result.error) return res.status(result.status === 404 ? 200 : 503).json({ received: true, pendingReconciliation: true });
    return res.json({ received: true });
  } catch (error) {
    return res.status(503).json({ error: "Reconciliation pending" });
  }
});
export default router;
