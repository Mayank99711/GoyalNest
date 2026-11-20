import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("TENANT"));

function indiaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function publicIntent(intent) {
  return {
    id: intent.id,
    invoiceId: intent.invoiceId,
    amount: intent.amount,
    currency: intent.currency,
    status: intent.status,
    provider: intent.provider,
    createdAt: intent.createdAt,
  };
}

// Create or retrieve payment intent.
// This route does not charge money.
router.post(
  "/intents",
  asyncRoute(async (req, res) => {
    const { invoiceId, idempotencyKey } = req.body || {};

    required(
      typeof invoiceId === "string" && invoiceId.length > 0,
      "Invoice ID is required",
      400,
    );

    required(
      typeof idempotencyKey === "string" &&
        /^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey),
      "Valid idempotency key is required",
      400,
    );

    const invoice = await prisma.rentInvoice.findFirst({
      where: {
        id: invoiceId,
        tenancy: {
          tenantId: req.user.id,
        },
      },
    });

    required(invoice, "Invoice not found", 404);

    required(
      ["PENDING", "OVERDUE"].includes(invoice.status),
      "Invoice is already settled or unavailable",
      409,
    );

    required(
      indiaToday() >= `${invoice.period}-01`,
      "Payment opens on the first day of the billing month",
      400,
    );

    const amount = invoice.amount + invoice.penalty;

    required(
      Number.isSafeInteger(amount) && amount > 0,
      "Invalid invoice amount",
      400,
    );

    const existing = await prisma.gatewayPaymentIntent.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: req.user.id,
          idempotencyKey,
        },
      },
    });

    if (existing) {
      required(
        existing.invoiceId === invoice.id && existing.amount === amount,
        "Idempotency key belongs to a different payment",
        409,
      );

      return res.json({
        message: "Existing payment intent",
        intent: publicIntent(existing),
        paymentEnabled: false,
      });
    }

    // Prevent another intent for the same invoice.
    const invoiceIntent = await prisma.gatewayPaymentIntent.findUnique({
      where: { invoiceId: invoice.id },
    });

    required(
      !invoiceIntent,
      "Payment intent already exists for this invoice",
      409,
    );

    let intent;

    try {
      intent = await prisma.gatewayPaymentIntent.create({
        data: {
          tenantId: req.user.id,
          invoiceId: invoice.id,
          idempotencyKey,
          amount,
          currency: "INR",
          provider: "UNCONFIGURED",
          status: "CREATED",
          attempts: {
            create: {
              status: "CREATED",
            },
          },
        },
      });
    } catch (error) {
      // Concurrent requests can race at the unique constraint.
      if (error.code === "P2002") {
        const sameKey = await prisma.gatewayPaymentIntent.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: req.user.id,
              idempotencyKey,
            },
          },
        });

        if (
          sameKey &&
          sameKey.invoiceId === invoice.id &&
          sameKey.amount === amount
        ) {
          return res.json({
            message: "Existing payment intent",
            intent: publicIntent(sameKey),
            paymentEnabled: false,
          });
        }

        return res.status(409).json({
          error: "Payment intent already exists",
        });
      }

      throw error;
    }

    res.status(201).json({
      message: "Payment intent created",
      intent: publicIntent(intent),
      paymentEnabled: false,
      nextStep: "Gateway integration is not configured. No money was charged.",
    });
  }),
);

// Tenant can view only their own payment intents.
router.get(
  "/intents/mine",
  asyncRoute(async (req, res) => {
    const intents = await prisma.gatewayPaymentIntent.findMany({
      where: {
        tenantId: req.user.id,
      },
      select: {
        id: true,
        invoiceId: true,
        amount: true,
        currency: true,
        status: true,
        provider: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(intents);
  }),
);

export default router;
