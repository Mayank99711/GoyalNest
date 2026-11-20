import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";

const r = Router();
r.use(authenticate, roles("TENANT", "OWNER"));
const moneyStatus = ["PENDING", "OVERDUE"];
const statuses = ["ACTIVE", "PENDING_PAYMENT", "VACATING"];

function invoiceOpen(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = key => parts.find(p => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}` >= `${period}-01`;
}

async function rowsFor(user) {
  const tenant = user.role === "TENANT";
  const where = tenant
    ? { tenancy: { tenantId: user.id } }
    : { tenancy: { unit: { property: { ownerId: user.id } } } };

  const invoices = await prisma.rentInvoice.findMany({
    where,
    select: {
      id: true, period: true, status: true, amount: true, penalty: true,
      dueDate: true, createdAt: true, tenancyId: true,
      tenancy: {
        select: { status: true, tenant: { select: { name: true } },
          unit: { select: { label: true, property: { select: { title: true, city: true } } } } },
      },
    },
    orderBy: [{ dueDate: "desc" }, { createdAt: "desc" }], take: 250,
  });

  const tenancyIds = [...new Set(invoices.map(i => i.tenancyId))];
  // Also show deposit records for tenancies without a rent invoice.
  const ownedTenancies = await prisma.tenancy.findMany({
    where: tenant ? { tenantId: user.id } : { unit: { property: { ownerId: user.id } } },
    select: { id: true }, take: 500,
  });
  const allTenancyIds = [...new Set([...tenancyIds, ...ownedTenancies.map(t => t.id)])];
  const payments = allTenancyIds.length ? await prisma.payment.findMany({
    where: { tenancyId: { in: allTenancyIds } },
    select: { id: true, invoiceId: true, amount: true, kind: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 500,
  }) : [];
  const paidMap = new Map();
  for (const p of payments) {
    if (["DEMO_PAID", "REAL_PAID"].includes(p.status) && ["RENT", "CASH", "CHEQUE"].includes(p.kind) && p.invoiceId) {
      const current = paidMap.get(p.invoiceId) || { demo: 0, real: 0 };
      if (p.status === "DEMO_PAID") current.demo += p.amount;
      else current.real += p.amount;
      paidMap.set(p.invoiceId, current);
    }
  }

  return { invoices: invoices.map(i => {
    const total = i.amount + i.penalty;
    const { demo: demoPaid = 0, real: realPaid = 0 } = paidMap.get(i.id) || {};
    return {
      id: i.id, tenancyId: i.tenancyId, period: i.period, status: i.status,
      amount: i.amount, penalty: i.penalty, total,
      demoPaid, realPaid, outstanding: i.status === "PAID" || i.status === "CANCELLED" ? 0 : Math.max(0, total - demoPaid - realPaid),
      dueDate: i.dueDate, createdAt: i.createdAt,
      tenancyStatus: i.tenancy.status,
      tenantName: i.tenancy.tenant.name,
      property: i.tenancy.unit.property.title,
      city: i.tenancy.unit.property.city,
      unit: i.tenancy.unit.label,
    };
  }), payments };
}

r.get("/overview", asyncRoute(async (req, res) => {
  const tenant = req.user.role === "TENANT";
  const [{ invoices, payments }, intents, subscriptions] = await Promise.all([
    rowsFor(req.user),
    tenant ? prisma.gatewayPaymentIntent.findMany({
      where: { tenantId: req.user.id },
      select: { id: true, invoiceId: true, status: true, amount: true, currency: true, provider: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" }, take: 100,
    }) : Promise.resolve([]),
    tenant ? Promise.resolve([]) : prisma.subscription.findMany({
      where: { ownerId: req.user.id },
      select: { id: true, plan: true, price: true, listingLimit: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 40,
    }),
  ]);
  const outstanding = invoices.reduce((s, i) => s + i.outstanding, 0);
  const demoCollected = payments.filter(p => p.kind === "RENT" && p.status === "DEMO_PAID").reduce((s, p) => s + p.amount, 0);
  res.set("Cache-Control", "private, no-store");
  res.json({
    mode: "GATEWAY_NOT_CONFIGURED", paymentEnabled: false,
    currency: "INR", role: req.user.role,
    summary: { invoices: invoices.length, outstanding, demoCollected,
      overdue: invoices.filter(i => i.status === "OVERDUE").length,
      openInvoices: invoices.filter(i => moneyStatus.includes(i.status) && i.outstanding > 0).length },
    invoices, payments, intents, subscriptions,
  });
}));

r.post("/intents", roles("TENANT"), asyncRoute(async (req, res) => {
  const { invoiceId, idempotencyKey } = req.body || {};
  if (typeof invoiceId !== "string" || !invoiceId.trim() ||
      typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({ error: "Valid invoiceId and idempotencyKey required" });
  }

  const result = await prisma.$transaction(async tx => {
    // Serialize requests for the same invoice, avoiding duplicate in-flight intents.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${invoiceId}))`;
    const existingKey = await tx.gatewayPaymentIntent.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: req.user.id, idempotencyKey } },
    });
    if (existingKey) return existingKey.invoiceId === invoiceId
      ? { code: 200, intent: existingKey }
      : { code: 409, error: "Idempotency key reused for another invoice" };

    const invoice = await tx.rentInvoice.findFirst({
      where: { id: invoiceId, tenancy: { tenantId: req.user.id } },
      select: { id: true, amount: true, penalty: true, status: true, period: true,
        tenancy: { select: { status: true } } },
    });
    if (!invoice) return { code: 404, error: "Invoice not found" };
    if (!moneyStatus.includes(invoice.status) || !statuses.includes(invoice.tenancy.status)) {
      return { code: 409, error: "Invoice is not available for payment" };
    }
    if (!invoiceOpen(invoice.period)) return { code: 400, error: "Payment opens with the billing month" };
    const paid = await tx.payment.aggregate({
      where: { invoiceId, status: { in: ["DEMO_PAID", "REAL_PAID"] }, kind: { in: ["RENT", "CASH", "CHEQUE"] } }, _sum: { amount: true },
    });
    const amount = invoice.amount + invoice.penalty - (paid._sum.amount || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) return { code: 409, error: "Invoice balance already settled" };

    const prior = await tx.gatewayPaymentIntent.findFirst({
      where: { invoiceId, status: { in: ["CREATED", "PROCESSING", "SUCCEEDED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (prior) return { code: 200, intent: prior };

    const intent = await tx.gatewayPaymentIntent.create({
      data: {
        tenantId: req.user.id, invoiceId, idempotencyKey, amount,
        currency: "INR", provider: "UNCONFIGURED", status: "CREATED",
        attempts: { create: { status: "CREATED" } },
      },
    });
    await tx.auditLog.create({
      data: { actorId: req.user.id, action: "PAYMENT_INTENT_REQUESTED",
        entityType: "RentInvoice", entityId: invoiceId,
        metadata: { intentId: intent.id, amount, currency: "INR", realCharge: false } },
    });
    return { code: 201, intent };
  }, { timeout: 10000 });

  if (result.error) return res.status(result.code).json({ error: result.error });
  res.status(result.code).json({
    intent: { id: result.intent.id, invoiceId: result.intent.invoiceId,
      amount: result.intent.amount, currency: result.intent.currency,
      status: result.intent.status, provider: result.intent.provider,
      createdAt: result.intent.createdAt },
    paymentEnabled: false,
    message: "Request recorded. Payment gateway is not configured; no money was charged.",
  });
}));

r.post("/intents/:id/cancel", roles("TENANT"), asyncRoute(async (req, res) => {
  const changed = await prisma.$transaction(async tx => {
    const row = await tx.gatewayPaymentIntent.findFirst({
      where: { id: req.params.id, tenantId: req.user.id }, select: { id: true, status: true },
    });
    if (!row) return { code: 404, error: "Request not found" };
    if (row.status !== "CREATED") return { code: 409, error: "Only unprocessed requests can be cancelled" };
    const updated = await tx.gatewayPaymentIntent.updateMany({
      where: { id: row.id, tenantId: req.user.id, status: "CREATED" },
      data: { status: "CANCELLED" },
    });
    if (!updated.count) return { code: 409, error: "Request was already updated" };
    await tx.gatewayPaymentAttempt.create({ data: { intentId: row.id, status: "CANCELLED" } });
    await tx.auditLog.create({ data: { actorId: req.user.id,
      action: "PAYMENT_INTENT_CANCELLED", entityType: "GatewayPaymentIntent", entityId: row.id } });
    return { cancelled: true };
  });
  if (changed.error) return res.status(changed.code).json({ error: changed.error });
  res.json(changed);
}));

export default r;
