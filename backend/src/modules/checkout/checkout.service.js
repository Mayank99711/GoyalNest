import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { PLANS } from "../subscriptions/subscriptions.routes.js";

export const gatewayReady = () =>
  Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    (process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_") ||
      (process.env.RAZORPAY_KEY_ID.startsWith("rzp_live_") &&
        process.env.GOYALNEST_ENABLE_LIVE_PAYMENTS === "true")),
  );
export const gatewayKeyId = () => process.env.RAZORPAY_KEY_ID || null;

export function signatureMatches(payload, signature, secret) {
  if (
    !secret ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{64}$/i.test(signature)
  )
    return false;
  const actual = createHmac("sha256", secret).update(payload).digest();
  return timingSafeEqual(actual, Buffer.from(signature, "hex"));
}

async function razorpay(path, { method = "GET", body } = {}) {
  if (!gatewayReady())
    throw Object.assign(new Error("Payment gateway is not configured"), {
      status: 503,
    });
  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      "Payment provider request failed. Please try again or contact support.",
    );
    error.status = 502;
    throw error;
  }
  return data;
}

function istMonthStart(period) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const today = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${today.year}-${today.month}-${today.day}` >= `${period}-01`;
}

export async function getCheckoutDetails(user, purpose, referenceId) {
  if (purpose === "RENT" && user.role === "TENANT") {
    const invoice = await prisma.rentInvoice.findFirst({
      where: { id: referenceId, tenancy: { tenantId: user.id } },
      select: {
        id: true,
        period: true,
        status: true,
        amount: true,
        penalty: true,
        tenancyId: true,
        tenancy: { select: { status: true } },
      },
    });
    if (!invoice) return { error: "Invoice not found", status: 404 };
    if (
      !["PENDING", "OVERDUE"].includes(invoice.status) ||
      !["ACTIVE", "PENDING_PAYMENT", "VACATING"].includes(
        invoice.tenancy.status,
      )
    ) {
      return { error: "This invoice is not payable", status: 409 };
    }
    if (!istMonthStart(invoice.period))
      return { error: "Payment opens with the billing month", status: 409 };
    // Never mix existing demo receipts with a real charge. They require manual reconciliation first.
    const recorded = await prisma.payment.findFirst({
      where: { invoiceId: referenceId, kind: "RENT" },
    });
    if (recorded)
      return {
        error:
          "Invoice already has payment records. Contact support to reconcile before online payment.",
        status: 409,
      };
    const amountRupees = invoice.amount + invoice.penalty;
    if (
      !Number.isSafeInteger(amountRupees) ||
      amountRupees <= 0 ||
      amountRupees > 1000000
    ) {
      return { error: "Invalid invoice amount", status: 409 };
    }
    return {
      purpose,
      referenceId,
      amountPaise: amountRupees * 100,
      amountRupees,
      tenancyId: invoice.tenancyId,
      label: `Rent · ${invoice.period}`,
    };
  }
  if (purpose === "SUBSCRIPTION" && user.role === "OWNER") {
    const plan = PLANS[referenceId];
    if (!plan || !Number.isSafeInteger(plan.price) || plan.price <= 0)
      return { error: "Invalid subscription plan", status: 400 };
    return {
      purpose,
      referenceId,
      amountPaise: plan.price * 100,
      amountRupees: plan.price,
      plan: referenceId,
      planLimit: plan.limit,
      label: `${referenceId} · 1 month`,
    };
  }
  return { error: "This payment is not available for your role", status: 403 };
}

export async function startCheckout(
  user,
  purpose,
  referenceId,
  idempotencyKey,
) {
  if (!gatewayReady())
    return {
      error:
        "Online checkout is unavailable until the merchant configures Razorpay test/live credentials.",
      status: 503,
    };
  const details = await getCheckoutDetails(user, purpose, referenceId);
  if (details.error) return details;
  const reservation = await prisma.$transaction(async (tx) => {
    // Different owners can buy the same plan independently. Rent remains locked by invoice.
    const lockScope = purpose === "SUBSCRIPTION"
      ? `${purpose}:${referenceId}:${user.id}`
      : `${purpose}:${referenceId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${lockScope}))::text AS lock_result`;
    const duplicate = await tx.paymentCheckout.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
    });
    if (duplicate) {
      if (
        duplicate.purpose !== purpose ||
        duplicate.referenceId !== referenceId ||
        duplicate.amountPaise !== details.amountPaise
      ) {
        return {
          error: "Idempotency key already used for another checkout",
          status: 409,
        };
      }
      return { record: duplicate, reuse: true };
    }
    const prior = await tx.paymentCheckout.findFirst({
      where: {
        userId: user.id,
        purpose,
        referenceId,
        status: {
          in:
            purpose === "SUBSCRIPTION"
              ? ["CREATING", "CREATED", "REVIEW_REQUIRED"]
              : process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_")
                ? ["CREATING", "CREATED", "PAID", "REVIEW_REQUIRED"]
                : [
                    "CREATING",
                    "CREATED",
                    "PAID",
                    "TEST_PAID",
                    "REVIEW_REQUIRED",
                  ],
        },
      },
      orderBy: { createdAt: "desc" },
    });
    if (prior) {
      return { record: prior, reuse: true };
    }
    return {
      record: await tx.paymentCheckout.create({
        data: {
          userId: user.id,
          purpose,
          referenceId,
          amountPaise: details.amountPaise,
          plan: details.plan || null,
          idempotencyKey,
          status: "CREATING",
        },
      }),
      reuse: false,
    };
  });
  if (reservation.error) return reservation;
  let checkout = reservation.record;
  if (reservation.reuse) {
    if (!checkout.providerOrderId)
      return {
        error: "Checkout is being prepared. Retry shortly.",
        status: 409,
      };
    if (checkout.status !== "CREATED")
      return { error: `Checkout is already ${checkout.status}`, status: 409 };
  } else {
    try {
      const order = await razorpay("/orders", {
        method: "POST",
        body: {
          amount: checkout.amountPaise,
          currency: "INR",
          receipt: checkout.id,
          notes: { purpose, checkoutId: checkout.id },
        },
      });
      if (
        !order?.id ||
        order.amount !== checkout.amountPaise ||
        order.currency !== "INR"
      )
        throw new Error("Unexpected payment provider order response");
      checkout = await prisma.paymentCheckout.update({
        where: { id: checkout.id },
        data: { providerOrderId: order.id, status: "CREATED" },
      });
    } catch (error) {
      await prisma.paymentCheckout.updateMany({
        where: { id: checkout.id, status: "CREATING" },
        data: { status: "FAILED" },
      });
      return { error: error.message, status: error.status || 502 };
    }
  }
  return {
    checkout: {
      id: checkout.id,
      providerOrderId: checkout.providerOrderId,
      keyId: gatewayKeyId(),
      amount: checkout.amountPaise,
      currency: "INR",
      label: details.label,
    },
  };
}

// Always re-fetch from the provider: a client callback or webhook alone cannot settle a bill.
export async function reconcileCapturedPayment(orderId, paymentId) {
  const checkout = await prisma.paymentCheckout.findUnique({
    where: { providerOrderId: orderId },
  });
  if (!checkout) return { error: "Checkout not found", status: 404 };
  if (["PAID", "TEST_PAID"].includes(checkout.status))
    return {
      paid: checkout.status === "PAID",
      testPayment: checkout.status === "TEST_PAID",
      checkoutId: checkout.id,
    };
  const payment = await razorpay(`/payments/${encodeURIComponent(paymentId)}`);
  if (
    payment.id !== paymentId ||
    payment.order_id !== orderId ||
    payment.status !== "captured" ||
    payment.currency !== "INR" ||
    payment.amount !== checkout.amountPaise
  ) {
    return {
      error: "Payment is not captured or amount/order verification failed",
      status: 409,
    };
  }
  return prisma.$transaction(
    async (tx) => {
      const locked =
        await tx.$queryRaw`SELECT id FROM "PaymentCheckout" WHERE id = ${checkout.id} FOR UPDATE`;
      if (!locked.length) return { error: "Checkout not found", status: 404 };
      const current = await tx.paymentCheckout.findUnique({
        where: { id: checkout.id },
      });
      if (["PAID", "TEST_PAID"].includes(current.status))
        return {
          paid: current.status === "PAID",
          testPayment: current.status === "TEST_PAID",
          checkoutId: current.id,
        };
      if (
        current.providerPaymentId &&
        current.providerPaymentId !== paymentId
      ) {
        return {
          error: "Different payment already associated with checkout",
          status: 409,
        };
      }
      if (process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_")) {
        await tx.paymentCheckout.update({
          where: { id: current.id },
          data: {
            status: "TEST_PAID",
            providerPaymentId: paymentId,
            fulfilledAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: current.userId,
            action: "CHECKOUT_TEST_CAPTURED_NO_ENTITLEMENT",
            entityType: "PaymentCheckout",
            entityId: current.id,
            metadata: {
              providerOrderId: orderId,
              providerPaymentId: paymentId,
              amountPaise: current.amountPaise,
            },
          },
        });
        const recipient=await tx.user.findUnique({where:{id:current.userId},select:{email:true}});
        if(recipient?.email)await tx.emailOutbox.upsert({where:{eventKey:`checkout-test:${current.id}`},create:{eventKey:`checkout-test:${current.id}`,toEmail:recipient.email,subject:"GoyalNest test payment notice",body:`TEST PAYMENT ONLY: INR ${(current.amountPaise/100).toFixed(2)} simulated for ${current.purpose} reference ${current.referenceId}. No real money collected; no invoice or plan was activated.`},update:{}});
        return { paid: false, testPayment: true, checkoutId: current.id };
      }
      if (current.purpose === "RENT") {
        const invoice = await tx.rentInvoice.findUnique({
          where: { id: current.referenceId },
        });
        const existing = await tx.payment.findFirst({
          where: { invoiceId: current.referenceId, kind: "RENT" },
        });
        if (
          !invoice ||
          !["PENDING", "OVERDUE"].includes(invoice.status) ||
          existing ||
          invoice.amount + invoice.penalty !== current.amountPaise / 100
        ) {
          await tx.paymentCheckout.update({
            where: { id: current.id },
            data: { status: "REVIEW_REQUIRED", providerPaymentId: paymentId },
          });
          return {
            error:
              "Captured payment needs manual reconciliation; invoice was changed",
            status: 409,
          };
        }
        await tx.payment.create({
          data: {
            tenancyId: invoice.tenancyId,
            invoiceId: invoice.id,
            kind: "RENT",
            amount: current.amountPaise / 100,
            status: "REAL_PAID",
          },
        });
        await tx.rentInvoice.update({
          where: { id: invoice.id },
          data: { status: "PAID" },
        });
      } else if (current.purpose === "SUBSCRIPTION") {
        const plan = PLANS[current.plan];
        if (!plan || plan.price * 100 !== current.amountPaise) {
          await tx.paymentCheckout.update({
            where: { id: current.id },
            data: { status: "REVIEW_REQUIRED", providerPaymentId: paymentId },
          });
          return {
            error: "Subscription requires manual reconciliation",
            status: 409,
          };
        }
        const latest = await tx.subscription.findFirst({
          where: { ownerId: current.userId, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "desc" },
        });
        const expiry = new Date(
          Math.max(Date.now(), latest?.expiresAt?.getTime() || 0),
        );
        expiry.setUTCMonth(expiry.getUTCMonth() + 1);
        await tx.subscription.create({
          data: {
            ownerId: current.userId,
            plan: current.plan,
            price: plan.price,
            listingLimit: plan.limit,
            expiresAt: expiry,
          },
        });
      }
      await tx.paymentCheckout.update({
        where: { id: current.id },
        data: {
          status: "PAID",
          providerPaymentId: paymentId,
          fulfilledAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: current.userId,
          action:
            current.purpose === "RENT"
              ? "RENT_PAID_VERIFIED"
              : "SUBSCRIPTION_PAID_VERIFIED",
          entityType: "PaymentCheckout",
          entityId: current.id,
          metadata: {
            providerOrderId: orderId,
            providerPaymentId: paymentId,
            amountPaise: current.amountPaise,
          },
        },
      });
      const recipient=await tx.user.findUnique({where:{id:current.userId},select:{name:true,email:true}});
      const invoiceDetail=current.purpose === "RENT" ? await tx.rentInvoice.findUnique({where:{id:current.referenceId},include:{tenancy:{include:{unit:{include:{property:true}}}}}}) : null;
      if(recipient?.email)await tx.emailOutbox.upsert({where:{eventKey:`checkout-live:${current.id}`},create:{eventKey:`checkout-live:${current.id}`,toEmail:recipient.email,subject:"GoyalNest | Verified payment confirmation",body:`Your verified GoyalNest payment has been recorded.\nAccount: ${recipient.name}\nProperty: ${invoiceDetail?.tenancy?.unit?.property?.title || "Not applicable"}\nPurpose: ${current.purpose}\nInvoice/reference: ${current.referenceId}\nGateway order: ${orderId}\nGateway payment: ${paymentId}\nPayment amount: INR ${(current.amountPaise/100).toFixed(2)}\nMethod: Razorpay\nStatus: PAID\nPrevious outstanding: INR ${(current.amountPaise/100).toFixed(2)}\nRemaining invoice outstanding: ${invoiceDetail ? "INR 0.00" : "Not applicable"}\nVerified at: ${new Date().toISOString()}\nReview your account for an updated receipt and payment history.`},update:{}});
      return { paid: true, checkoutId: current.id };
    },
    { timeout: 10000 },
  );
}

export async function reconcileFromOrder(orderId) {
  const order = await razorpay(`/orders/${encodeURIComponent(orderId)}`);
  if (order.status !== "paid")
    return { error: "Order not yet paid", status: 409 };
  const payments = await razorpay(
    `/orders/${encodeURIComponent(orderId)}/payments`,
  );
  const captured = payments.items?.find(
    (p) => p.order_id === orderId && p.status === "captured",
  );
  if (!captured) return { error: "Captured payment not found", status: 409 };
  return reconcileCapturedPayment(orderId, captured.id);
}
