import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
import { queueEmail } from "../notifications/emailOutbox.js";
import { notifyUsers } from "../notifications/notify.service.js";

const r = Router();
r.use(authenticate);
const openStatuses = ["PENDING", "OVERDUE"];
const activeRequests = ["SUBMITTED", "UNDER_REVIEW", "DEPOSITED", "BANK_PENDING"];
const checklistKeys = ["dateValid", "signatureVerifiedByBank", "amountMatches", "balanceConfirmedByBank", "accountActiveByBank", "chequeNumberVerified", "bankDetailsChecked", "noOverwriting", "payeeMatches", "withinValidity", "notStoppedByBank", "notDuplicate"];
const createSchema = z.object({
  invoiceId: z.string().min(5), method: z.enum(["CASH", "CHEQUE"]),
  amount: z.number().int().positive(),
  chequeNumber: z.string().min(4).max(30).optional(), chequeDate: z.string().optional(),
  bankName: z.string().max(100).optional(), branch: z.string().max(100).optional(),
  ifsc: z.string().max(20).optional(), payeeName: z.string().max(120).optional(),
  amountWords: z.string().max(200).optional(),
}).strict();
const reviewSchema = z.object({
  status: z.enum(["UNDER_REVIEW", "DEPOSITED", "BANK_PENDING", "CLEARED", "BOUNCED", "REJECTED"]),
  reviewNote: z.string().max(1000).optional(), bankReference: z.string().max(120).optional(),
  checklist: z.record(z.boolean()).optional(),
}).strict();
function parse(schema, input) {
  const result = schema.safeParse(input);
  required(result.success, "Invalid request data", 400);
  return result.data;
}
function validDate(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
async function recordedAmount(tx, invoiceId) {
  const paid = await tx.payment.groupBy({
    by: ["status"], where: { invoiceId, kind: { in: ["RENT", "CASH", "CHEQUE"] }, status: { in: ["REAL_PAID", "DEMO_PAID"] } },
    _sum: { amount: true },
  });
  const demo = paid.filter(p => p.status === "DEMO_PAID").reduce((v, p) => v + (p._sum.amount || 0), 0);
  const real = paid.filter(p => p.status === "REAL_PAID").reduce((v, p) => v + (p._sum.amount || 0), 0);
  return { demo, real };
}
async function lockInvoice(tx, id) {
  const rows = await tx.$queryRaw`SELECT id FROM "RentInvoice" WHERE id = ${id} FOR UPDATE`;
  required(rows.length === 1, "Invoice not found", 404);
}

r.get("/mine", roles("TENANT", "OWNER"), asyncRoute(async (req, res) => {
  const rows = await prisma.offlinePaymentRequest.findMany({
    where: req.user.role === "TENANT" ? { tenantId: req.user.id } : { ownerId: req.user.id },
    orderBy: { createdAt: "desc" }, take: 150,
  });
  res.json(rows);
}));

r.post("/", roles("TENANT"), asyncRoute(async (req, res) => {
  const data = parse(createSchema, req.body);
  if (data.method === "CHEQUE") {
    required(data.chequeNumber && data.bankName && data.payeeName && validDate(data.chequeDate), "Valid cheque number, date, payee and bank required", 400);
    const issue = new Date(`${data.chequeDate}T00:00:00Z`);
    const limit = new Date(issue); limit.setUTCMonth(limit.getUTCMonth() + 3);
    required(issue.getTime() <= Date.now() && limit.getTime() >= Date.now(), "Cheque must be current and within 3 months", 400);
  }
  const row = await prisma.$transaction(async tx => {
    await lockInvoice(tx, data.invoiceId);
    const invoice = await tx.rentInvoice.findFirst({
      where: { id: data.invoiceId, tenancy: { tenantId: req.user.id } },
      include: { tenancy: { include: { unit: { include: { property: true } } } } },
    });
    required(invoice && openStatuses.includes(invoice.status), "Open invoice not found", 409);
    const pending = await tx.offlinePaymentRequest.findFirst({ where: { invoiceId: invoice.id, status: { in: activeRequests } } });
    required(!pending, "An offline payment request is already pending for this invoice", 409);
    const { real, demo } = await recordedAmount(tx, invoice.id);
    required(demo === 0, "Demo payments exist on this invoice. Reconciliation is required before recording real funds", 409);
    const balance = Math.max(0, invoice.amount + invoice.penalty - real);
    required(balance > 0 && data.amount <= balance, `Payment must not exceed the outstanding amount of INR ${balance}`, 400);
    const created = await tx.offlinePaymentRequest.create({ data: {
      invoiceId: invoice.id, tenantId: req.user.id, ownerId: invoice.tenancy.unit.property.ownerId,
      method: data.method, amount: data.amount, chequeNumber: data.chequeNumber,
      chequeDate: data.chequeDate ? new Date(`${data.chequeDate}T00:00:00Z`) : null,
      bankName: data.bankName, branch: data.branch, ifsc: data.ifsc,
      payeeName: data.payeeName, amountWords: data.amountWords,
    } });
    await notifyUsers(tx, {
      userIds: [created.ownerId], type: 'OFFLINE_PAYMENT_REVIEW', referenceId: created.id,
      title: `${created.method} payment reported - verify receipt`,
      message: `${req.user.name || 'A tenant'} reported INR ${created.amount} for ${invoice.tenancy.unit.property.title}. No payment is confirmed until you verify receipt.`,
    });
    return created;
  }, { timeout: 10000 });
  res.status(201).json(row);
}));

r.patch("/:id/review", roles("OWNER"), asyncRoute(async (req, res) => {
  const data = parse(reviewSchema, req.body);
  const result = await prisma.$transaction(async tx => {
    // Lock the request first, then its invoice: parallel approval cannot double-count funds.
    const locked = await tx.$queryRaw`SELECT id FROM "OfflinePaymentRequest" WHERE id = ${req.params.id} FOR UPDATE`;
    required(locked.length === 1, "Payment request not found", 404);
    const current = await tx.offlinePaymentRequest.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    required(current, "Payment request not found", 404);
    required(!["CLEARED", "BOUNCED", "REJECTED"].includes(current.status), "Payment request already closed", 409);
    if (data.status === "CLEARED") {
      required(data.bankReference?.trim(), "Bank/receipt reference required", 400);
      if (current.method === "CHEQUE") {
        required(data.checklist && checklistKeys.every(key => data.checklist[key] === true), "All 12 bank/owner verification checks are required", 400);
        required(["DEPOSITED", "BANK_PENDING"].includes(current.status), "Cheque must be deposited before clearance", 409);
      }
    }
    let remaining = null;
    if (data.status === "CLEARED") {
      await lockInvoice(tx, current.invoiceId);
      const invoice = await tx.rentInvoice.findUnique({ where: { id: current.invoiceId } });
      required(invoice && openStatuses.includes(invoice.status), "Invoice is not open", 409);
      const { real, demo } = await recordedAmount(tx, invoice.id);
      required(demo === 0, "Demo receipts exist; reconcile before confirming real funds", 409);
      const balance = invoice.amount + invoice.penalty - real;
      required(balance >= current.amount && current.amount > 0, "Outstanding balance changed; cannot overpay", 409);
      await tx.payment.create({ data: { tenancyId: invoice.tenancyId, invoiceId: invoice.id, kind: current.method, amount: current.amount, status: "REAL_PAID" } });
      remaining = balance - current.amount;
      if (remaining === 0) await tx.rentInvoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    }
    const updated = await tx.offlinePaymentRequest.update({
      where: { id: current.id },
      data: { status: data.status, reviewNote: data.reviewNote || "", reviewChecklist: data.checklist || undefined,
        bankReference: data.bankReference, reviewedAt: new Date() },
    });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: "OFFLINE_PAYMENT_REVIEWED", entityType: "OfflinePaymentRequest", entityId: current.id,
      metadata: { status: data.status, method: current.method, amount: current.amount, remaining } } });
    await notifyUsers(tx, {
      userIds: [current.tenantId], type: 'OFFLINE_PAYMENT_STATUS', referenceId: current.id,
      title: data.status === 'CLEARED' ? 'Offline rent payment verified' : data.status === 'REJECTED' || data.status === 'BOUNCED' ? 'Offline payment issue - review required' : 'Offline payment review updated',
      message: `${current.method} payment INR ${current.amount}: ${data.status}. ${remaining === null ? 'No rent ledger settlement has been recorded by this review.' : `Remaining balance: INR ${remaining}.`}`,
    });
    return { updated, remaining, previousOutstanding: remaining === null ? null : remaining + current.amount, recipientId: current.tenantId, invoiceId: current.invoiceId, method: current.method, amount: current.amount };
  }, { timeout: 10000 });
  if (data.status === "CLEARED") {
    const tenant = await prisma.user.findUnique({ where: { id: result.recipientId } });
    if (tenant) {
      const invoice = await prisma.rentInvoice.findUnique({where:{id:result.invoiceId},include:{tenancy:{include:{unit:{include:{property:true}}}}}});
      await queueEmail({ key: `offline-cleared:${req.params.id}`, to: tenant.email,
        subject: result.remaining === 0 ? "GoyalNest | Payment completed" : "GoyalNest | Partial payment confirmed",
        body: `Payment verified and recorded in GoyalNest.\nTenant: ${tenant.name}\nProperty: ${invoice?.tenancy?.unit?.property?.title || "Not specified"}\nInvoice: ${result.invoiceId}\nReceipt/request: ${req.params.id}\nBank/reference: ${data.bankReference}\nPayment method: ${result.method}\nPayment amount: INR ${result.amount}\nPrevious outstanding: INR ${result.previousOutstanding}\nRemaining outstanding: INR ${result.remaining}\nPayment status: CLEARED\nVerified at: ${new Date().toISOString()}\nYou can review the invoice and payment history in your tenant portal.` });
    }
  }
  res.json({ ...result.updated, remaining: result.remaining });
}));
export default r;
