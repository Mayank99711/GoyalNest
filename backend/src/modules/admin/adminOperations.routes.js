import { z } from "zod";
import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";
import { notifyUsers } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);
router.use(roles("ADMIN"));

// GET /api/admin-operations/overview
router.get(
  "/overview",
  asyncRoute(async (req, res) => {
    const [
      totalUsers,
      owners,
      tenants,
      managers,
      totalProperties,
      pendingProperties,
      publishedProperties,
      totalBookings,
      totalTenancies,
      activeTenancies,
      totalInvoices,
      paidInvoices,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "OWNER" } }),
      prisma.user.count({ where: { role: "TENANT" } }),
      prisma.user.count({ where: { role: "MANAGER" } }),

      prisma.property.count(),
      prisma.property.count({ where: { status: "PENDING" } }),
      prisma.property.count({ where: { status: "PUBLISHED" } }),

      prisma.booking.count(),

      prisma.tenancy.count(),
      prisma.tenancy.count({ where: { status: "ACTIVE" } }),

      prisma.rentInvoice.count({
        where: { status: { not: "CANCELLED" } },
      }),
      prisma.rentInvoice.count({
        where: { status: "PAID" },
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      users: {
        total: totalUsers,
        owners,
        tenants,
        managers,
      },
      properties: {
        total: totalProperties,
        pending: pendingProperties,
        published: publishedProperties,
      },
      bookings: {
        total: totalBookings,
      },
      tenancies: {
        total: totalTenancies,
        active: activeTenancies,
      },
      invoices: {
        total: totalInvoices,
        paid: paidInvoices,
      },
    });
  }),
);

// GET /api/admin-operations/users
router.get(
  "/users",
  asyncRoute(async (req, res) => {
    const page = Math.min(
      10000,
      Math.max(1, Number.parseInt(req.query.page, 10) || 1),
    );

    const limit = 20;

    const role = String(req.query.role || "").toUpperCase();

    const allowedRoles = ["OWNER", "TENANT", "MANAGER", "ADMIN"];

    const where = allowedRoles.includes(role) ? { role } : {};

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          active: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

// Ensure this import appears only once in the file.
const userStatusSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(10).max(500),
});

// PATCH /api/admin-operations/users/:id/status
router.patch(
  "/users/:id/status",
  asyncRoute(async (req, res) => {
    const parsed = userStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "Valid active status and reason required (10-500 characters)",
      });
    }

    const { active, reason } = parsed.data;

    if (req.params.id === req.user.id) {
      return res.status(409).json({
        error: "You cannot change your own account status",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          name: true,
          role: true,
          active: true,
        },
      });

      if (!target) {
        return { error: "User not found", code: 404 };
      }

      if (target.role === "ADMIN") {
        return {
          error: "Admin accounts cannot be modified here",
          code: 403,
        };
      }

      if (target.active === active) {
        return {
          error: "User already has this status",
          code: 409,
        };
      }

      const changed = await tx.user.updateMany({
        where: {
          id: target.id,
          active: target.active,
          role: { not: "ADMIN" },
        },
        data: { active },
      });

      if (changed.count !== 1) {
        return {
          error: "Account status changed. Refresh and retry.",
          code: 409,
        };
      }

      const updated = {
        ...target,
        active,
      };

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: active ? "ADMIN_USER_REACTIVATED" : "ADMIN_USER_SUSPENDED",
          entityType: "User",
          entityId: target.id,
          metadata: {
            previousActive: target.active,
            newActive: active,
            reason,
          },
        },
      });

      return { user: updated };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: result.user.active ? "User reactivated" : "User suspended",
      user: result.user,
    });
  }),
);

// GET /api/admin-operations/finance
router.get(
  "/finance",
  asyncRoute(async (req, res) => {
    const invoices = await prisma.rentInvoice.findMany({
      where: {
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        period: true,
        amount: true,
        penalty: true,
        status: true,
        dueDate: true,
        tenancy: {
          select: {
            tenant: {
              select: { name: true },
            },
            unit: {
              select: {
                label: true,
                property: {
                  select: { title: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = invoices.reduce(
      (acc, invoice) => {
        const total = invoice.amount + invoice.penalty;

        acc.billed += total;
        acc.invoiceCount += 1;

        if (invoice.status === "PAID") {
          acc.paidInvoiceCount += 1;
        } else {
          acc.unsettledInvoiceCount += 1;
          acc.unsettledFaceValue += total;
        }

        if (invoice.status === "OVERDUE") {
          acc.overdueInvoiceCount += 1;
        }

        return acc;
      },
      {
        billed: 0,
        invoiceCount: 0,
        paidInvoiceCount: 0,
        unsettledInvoiceCount: 0,
        unsettledFaceValue: 0,
        overdueInvoiceCount: 0,
      },
    );

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      summary,
      invoices: invoices.slice(0, 100).map((i) => ({
        id: i.id,
        period: i.period,
        amount: i.amount,
        penalty: i.penalty,
        status: i.status,
        dueDate: i.dueDate,
        tenant: i.tenancy.tenant.name,
        property: i.tenancy.unit.property.title,
        room: i.tenancy.unit.label,
      })),
    });
  }),
);

// GET /api/admin-operations/audit
router.get(
  "/audit",
  asyncRoute(async (req, res) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      logs: logs.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt,
      })),
    });
  }),
);

const VALID_PLANS = ["STARTER", "PRO", "BUSINESS"];

// GET /api/admin-operations/subscriptions
router.get(
  "/subscriptions",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );
    const limit = 20;

    const plan = String(req.query.plan || "").toUpperCase();
    const where = VALID_PLANS.includes(plan) ? { plan } : {};

    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const userIds = [
      ...new Set(
        subscriptions.map((s) => s.userId || s.ownerId).filter(Boolean),
      ),
    ];

    const owners = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      subscriptions: subscriptions.map((s) => {
        const ownerId = s.userId || s.ownerId;
        const owner = ownerMap.get(ownerId);

        return {
          id: s.id,
          ownerId,
          ownerName: owner?.name || "Unknown",
          ownerEmail: owner?.email || "",
          plan: s.plan,
          status: s.status ?? null,
          listingLimit: s.listingLimit ?? null,
          startDate: s.startDate ?? s.startsAt ?? null,
          endDate: s.endDate ?? s.expiresAt ?? null,
          createdAt: s.createdAt ?? null,
        };
      }),
    });
  }),
);

// GET /api/admin-operations/settings
// Read-only operational configuration. No secrets exposed.
router.get(
  "/settings",
  asyncRoute(async (req, res) => {
    const [users, properties, pendingApprovals] = await Promise.all([
      prisma.user.count(),
      prisma.property.count(),
      prisma.property.count({
        where: { status: "PENDING" },
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      application: {
        name: "GoyalNest",
        environment: "Configured on server",
        settingsMode: "READ_ONLY",
      },
      supportedRoles: ["ADMIN", "OWNER", "MANAGER", "TENANT"],
      subscriptionPlans: VALID_PLANS,
      platform: {
        users,
        properties,
        pendingApprovals,
      },
      security: {
        authentication: "Session-based JWT",
        accountSuspensionCheck: "Database-backed",
      },
      message:
        "Operational overview only. " +
        "Production configuration changes are disabled.",
    });
  }),
);
// ADMIN — Supported role capabilities
router.get(
  "/permissions",
  asyncRoute(async (req, res) => {
    res.json({
      roles: [
        {
          role: "ADMIN",
          description: "Platform administration",
          permissions: [
            "View platform overview",
            "Review property approvals",
            "View user accounts",
            "Suspend/reactivate non-admin users",
            "View finance and audit records",
            "Publish platform announcements",
          ],
        },
        {
          role: "OWNER",
          description: "Own properties and rentals",
          permissions: [
            "Manage owned properties",
            "Manage units and bookings",
            "Assign property managers",
            "Review rental payments",
            "Manage agreements and settlements",
          ],
        },
        {
          role: "MANAGER",
          description: "Operate assigned properties",
          permissions: [
            "View assigned properties",
            "Manage daily operations",
            "Confirm tenant check-in",
            "Record checkout inspections",
            "View authorized agreements",
          ],
        },
        {
          role: "TENANT",
          description: "Manage own tenancy",
          permissions: [
            "Explore properties",
            "Request bookings",
            "Manage rent and agreements",
            "Submit maintenance requests",
            "Request move-out",
          ],
        },
      ],
      editable: false,
      message:
        "Role permissions are enforced by backend authorization. " +
        "Direct role editing is disabled.",
    });
  }),
);

router.get(
  "/properties",
  asyncRoute(async (req, res) => {
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const limit = 20;

    const search = String(req.query.search || "")
      .trim()
      .slice(0, 100);

    const validStatuses = [
      "DRAFT",
      "PENDING",
      "PUBLISHED",
      "REJECTED",
      "SUSPENDED",
    ];

    const status = String(req.query.status || "").toUpperCase();

    const where = {
      ...(validStatuses.includes(status) ? { status } : {}),
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                city: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                locality: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const [total, properties] = await Promise.all([
      prisma.property.count({ where }),
      prisma.property.findMany({
        where,
        select: {
          id: true,
          ownerId: true,
          title: true,
          city: true,
          locality: true,
          address: true,
          type: true,
          status: true,
        },
        orderBy: { id: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const propertyIds = properties.map((p) => p.id);
    const ownerIds = [...new Set(properties.map((p) => p.ownerId))];

    const [owners, unitCounts] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
        },
      }),
      prisma.unit.groupBy({
        by: ["propertyId"],
        where: {
          propertyId: { in: propertyIds },
        },
        _count: { _all: true },
      }),
    ]);

    const ownerMap = new Map(owners.map((owner) => [owner.id, owner]));

    const unitMap = new Map(
      unitCounts.map((item) => [item.propertyId, item._count._all]),
    );

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      properties: properties.map((p) => ({
        ...p,
        owner: ownerMap.get(p.ownerId) || null,
        unitCount: unitMap.get(p.id) || 0,
      })),
    });
  }),
);

router.get(
  "/transactions",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );
    const limit = 20;

    const [total, payments, invoices] = await Promise.all([
      prisma.payment.count(),

      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),

      prisma.rentInvoice.findMany({
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          tenancyId: true,
          period: true,
          amount: true,
          penalty: true,
          status: true,
          dueDate: true,
        },
      }),
    ]);

    const tenancyIds = [
      ...new Set(
        [
          ...payments.map((p) => p.tenancyId),
          ...invoices.map((i) => i.tenancyId),
        ].filter(Boolean),
      ),
    ];

    const tenancies = await prisma.tenancy.findMany({
      where: { id: { in: tenancyIds } },
      select: {
        id: true,
        tenant: {
          select: { name: true },
        },
        unit: {
          select: {
            label: true,
            property: {
              select: { title: true },
            },
          },
        },
      },
    });

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

    const decorate = (tenancyId) => {
      const t = tenancyMap.get(tenancyId);
      return {
        tenant: t?.tenant?.name || "Unknown",
        property: t?.unit?.property?.title || "Unknown",
        room: t?.unit?.label || "N/A",
      };
    };

    // Explicit allowlist: never expose raw gateway
    // responses, tokens, bank or card details.
    const safePayments = payments.map((p) => ({
      id: p.id,
      tenancyId: p.tenancyId || null,
      amount: p.amount ?? 0,
      status: p.status ?? "UNKNOWN",
      provider: p.provider ?? null,
      method: p.method ?? null,
      createdAt: p.createdAt,
      ...decorate(p.tenancyId),
    }));

    const safeInvoices = invoices.map((i) => ({
      id: i.id,
      tenancyId: i.tenancyId,
      period: i.period,
      amount: i.amount,
      penalty: i.penalty,
      total: i.amount + i.penalty,
      status: i.status,
      dueDate: i.dueDate,
      ...decorate(i.tenancyId),
    }));

    // Existing Payment.status is authoritative.
    // DEMO_PAID is not a real bank settlement.
    const demoPayments = safePayments.filter((p) => p.status === "DEMO_PAID");

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      summary: {
        totalPaymentRecords: total,
        returnedPaymentRecords: safePayments.length,
        demoPaymentRecordsOnPage: demoPayments.length,
        demoAmountOnPage: demoPayments.reduce((sum, p) => sum + p.amount, 0),
        invoiceRecordsInSnapshot: safeInvoices.length,
      },
      payments: safePayments,
      invoices: safeInvoices,
      page,
      totalPages: Math.ceil(total / limit),
      notice:
        "Demo payments are not real cash collections. " +
        "Payment totals are not bank reconciliation.",
    });
  }),
);

router.get(
  "/refunds",
  asyncRoute(async (req, res) => {
    // Reuse the existing refund model if named
    // RefundRequest in Prisma.
    const refundDelegate = prisma.paymentRefundRequest;

    if (!refundDelegate) {
      return res.status(501).json({
        error:
          "RefundRequest Prisma model not found. " +
          "Connect the existing refund model.",
      });
    }

    const refunds = await refundDelegate.findMany({
      take: 100,
    });

    const safeRefunds = refunds.map((r) => ({
      id: r.id,
      status: r.status ?? "UNKNOWN",
      amount: r.amount ?? r.requestedAmount ?? null,
      reason: r.reason ?? null,
      createdAt: r.createdAt ?? null,
      approvedAt: r.approvedAt ?? null,
    }));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      refunds: safeRefunds,
      count: safeRefunds.length,
      notice: "Refund approval does not prove money was transferred.",
    });
  }),
);

router.get(
  "/agreements",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );
    const limit = 20;

    const [total, versions] = await Promise.all([
      prisma.agreementDocumentVersion.count(),

      prisma.agreementDocumentVersion.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          tenancyId: true,
          uploadId: true,
          version: true,
          status: true,
          publishedAt: true,
          acceptedAt: true,
          cancelledAt: true,
          createdAt: true,
        },
      }),
    ]);

    const tenancyIds = [...new Set(versions.map((v) => v.tenancyId))];

    const uploadIds = [...new Set(versions.map((v) => v.uploadId))];

    const [tenancies, uploads, evidence] = await Promise.all([
      prisma.tenancy.findMany({
        where: { id: { in: tenancyIds } },
        select: {
          id: true,
          status: true,
          tenant: {
            select: {
              name: true,
              email: true,
            },
          },
          unit: {
            select: {
              label: true,
              property: {
                select: { title: true },
              },
            },
          },
        },
      }),

      prisma.agreementUpload.findMany({
        where: { id: { in: uploadIds } },
        select: {
          id: true,
          filename: true,
          sha256: true,
        },
      }),

      prisma.agreementConsentEvidence.findMany({
        where: {
          versionId: {
            in: versions.map((v) => v.id),
          },
        },
        select: {
          versionId: true,
          source: true,
          acceptedAt: true,
          documentSha256: true,
        },
      }),
    ]);

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

    const uploadMap = new Map(uploads.map((u) => [u.id, u]));

    const evidenceMap = new Map(evidence.map((e) => [e.versionId, e]));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      agreements: versions.map((v) => {
        const t = tenancyMap.get(v.tenancyId);
        const u = uploadMap.get(v.uploadId);
        const e = evidenceMap.get(v.id);

        return {
          id: v.id,
          tenancyId: v.tenancyId,
          version: v.version,
          status: v.status,
          tenant: t?.tenant?.name || "Unknown",
          tenantEmail: t?.tenant?.email || "",
          property: t?.unit?.property?.title || "Unknown",
          room: t?.unit?.label || "",
          tenancyStatus: t?.status || "",
          filename: u?.filename || "Unknown",
          sha256: u?.sha256 || null,
          publishedAt: v.publishedAt,
          acceptedAt: v.acceptedAt,
          cancelledAt: v.cancelledAt,
          consentEvidence: e
            ? {
                source: e.source,
                acceptedAt: e.acceptedAt,
                hashRecorded: Boolean(e.documentSha256),
              }
            : null,
        };
      }),
    });
  }),
);

// Authoritative KYC queue count; includes documents uploaded before notifications existed.
router.get(
  "/kyc/pending-summary",
  asyncRoute(async (req, res) => {
    const pending = await prisma.tenantDocument.count({
      where: { type: "KYC", status: "PENDING" },
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ pending });
  }),
);

router.get(
  "/kyc",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, parseInt(req.query.page, 10) || 1),
    );
    const limit = 20;

    const [total, documents] = await Promise.all([
      prisma.tenantDocument.count(),
      prisma.tenantDocument.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          type: true,
          fileName: true,
          status: true,
          reviewedAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
    ]);

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      documents,
    });
  }),
);

router.patch(
  "/kyc/:id/review",
  asyncRoute(async (req, res) => {
    const status = req.body?.status;
    const reason = String(req.body?.reason || "").trim();

    if (!["VERIFIED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        error: "Status must be APPROVED or REJECTED",
      });
    }

    if (status === "REJECTED" && (reason.length < 10 || reason.length > 500)) {
      return res.status(400).json({
        error: "Rejection reason must be 10-500 characters",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.tenantDocument.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          userId: true,
          status: true,
        },
      });

      if (!document) {
        return { error: "Document not found", code: 404 };
      }

      if (document.status !== "PENDING") {
        return {
          error: "Only pending KYC documents can be reviewed",
          code: 409,
        };
      }

      const updated = await tx.tenantDocument.updateMany({
        where: {
          id: document.id,
          status: "PENDING",
        },
        data: {
          status,
          reviewedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Document already reviewed",
          code: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: `ADMIN_KYC_${status}`,
          entityType: "TenantDocument",
          entityId: document.id,
          metadata: {
            userId: document.userId,
            previousStatus: document.status,
            newStatus: status,
            reason: reason || null,
          },
        },
      });

      await notifyUsers(tx, {
        userIds: [document.userId],
        title: status === "VERIFIED" ? "KYC verified" : "KYC needs attention",
        message: status === "VERIFIED"
          ? "Your identity document was verified by the platform."
          : `Your identity document was rejected. Reason: ${reason}`,
        type: "KYC_REVIEWED",
        referenceId: document.id,
      });

      return {
        id: document.id,
        status,
      };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: `KYC document ${status.toLowerCase()}`,
      document: result,
    });
  }),
);

const complaintPageSize = 20;

// GET /api/admin-operations/complaints
router.get(
  "/complaints",
  asyncRoute(async (req, res) => {
    const page = Math.max(
      1,
      Math.min(10000, Number.parseInt(req.query.page, 10) || 1),
    );

    const [total, tickets] = await Promise.all([
      prisma.maintenanceTicket.count(),
      prisma.maintenanceTicket.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * complaintPageSize,
        take: complaintPageSize,
      }),
    ]);

    const tenancyIds = [
      ...new Set(tickets.map((t) => t.tenancyId).filter(Boolean)),
    ];

    const tenancies = await prisma.tenancy.findMany({
      where: { id: { in: tenancyIds } },
      select: {
        id: true,
        tenant: {
          select: {
            name: true,
            email: true,
          },
        },
        unit: {
          select: {
            label: true,
            property: {
              select: {
                title: true,
                ownerId: true,
              },
            },
          },
        },
      },
    });

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      total,
      page,
      totalPages: Math.ceil(total / complaintPageSize),
      complaints: tickets.map((t) => {
        const tenancy = tenancyMap.get(t.tenancyId);

        return {
          id: t.id,
          tenancyId: t.tenancyId || null,
          title: t.title || t.subject || "Maintenance Request",
          description: t.description || "",
          category: t.category || t.type || "MAINTENANCE",
          priority: t.priority || "NOT_SPECIFIED",
          status: t.status || "UNKNOWN",
          createdAt: t.createdAt || null,
          updatedAt: t.updatedAt || null,
          tenant: tenancy?.tenant?.name || "Unknown",
          tenantEmail: tenancy?.tenant?.email || "",
          property: tenancy?.unit?.property?.title || "Unknown",
          room: tenancy?.unit?.label || "",
        };
      }),
    });
  }),
);

// PATCH /api/admin-operations/complaints/:id/resolve
router.patch(
  "/complaints/:id/resolve",
  asyncRoute(async (req, res) => {
    const notes = String(req.body?.notes || "").trim();

    if (notes.length < 10 || notes.length > 1000) {
      return res.status(400).json({
        error: "Resolution notes must be 10-1000 characters",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.maintenanceTicket.findUnique({
        where: { id: req.params.id },
      });

      if (!ticket) {
        return { error: "Complaint not found", code: 404 };
      }

      if (ticket.status === "RESOLVED") {
        return {
          error: "Complaint already resolved",
          code: 409,
        };
      }

      // Preserve current-state consistency during updates.
      const updated = await tx.maintenanceTicket.updateMany({
        where: {
          id: ticket.id,
          status: ticket.status,
        },
        data: {
          status: "RESOLVED",
        },
      });

      if (updated.count !== 1) {
        return {
          error: "Complaint status changed. Refresh and retry.",
          code: 409,
        };
      }

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_COMPLAINT_RESOLVED",
          entityType: "MaintenanceTicket",
          entityId: ticket.id,
          metadata: {
            previousStatus: ticket.status,
            newStatus: "RESOLVED",
            resolutionNotes: notes,
          },
        },
      });

      return {
        id: ticket.id,
        status: "RESOLVED",
      };
    });

    if (result.error) {
      return res.status(result.code).json({
        error: result.error,
      });
    }

    res.json({
      message: "Complaint resolved successfully",
      complaint: result,
    });
  }),
);

export default router;
