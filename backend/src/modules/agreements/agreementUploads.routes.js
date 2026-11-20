import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
const PUBLIC_AGREEMENT_STATUSES = [
  "PENDING_ACCEPTANCE",
  "ACTIVE",
  "SUPERSEDED",
];
const router = Router();

router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files allowed"));
    }
    cb(null, true);
  },
});

function accessibleTenancy(user, tenancyId) {
  const base = { id: tenancyId };

  if (user.role === "TENANT") {
    return { ...base, tenantId: user.id };
  }

  if (user.role === "OWNER") {
    return {
      ...base,
      unit: {
        property: { ownerId: user.id },
      },
    };
  }

  if (user.role === "MANAGER") {
    return {
      ...base,
      unit: {
        property: {
          owner: { active: true },
          assignments: {
            some: { managerId: user.id },
          },
        },
      },
    };
  }

  return { id: "__DENIED__" };
}

function visibleUploadWhere(user) {
  if (user.role === "OWNER") {
    return {
      tenancy: {
        unit: {
          property: { ownerId: user.id },
        },
      },
    };
  }

  if (user.role === "TENANT") {
    return {
      tenancy: { tenantId: user.id },
    };
  }

  if (user.role === "MANAGER") {
    return {
      tenancy: {
        unit: {
          property: {
            owner: { active: true },
            assignments: {
              some: { managerId: user.id },
            },
          },
        },
      },
    };
  }

  return { id: "__DENIED__" };
}
// Owner: list tenancies available for document upload.
router.get(
  "/eligible-tenancies",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const tenancies = await prisma.tenancy.findMany({
      where: {
        unit: {
          property: { ownerId: req.user.id },
        },
      },
      select: {
        id: true,
        status: true,
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
      orderBy: { createdAt: "desc" },
    });

    res.json(tenancies);
  }),
);

// List accessible uploaded agreement documents.

router.get(
  "/mine",
  asyncRoute(async (req, res) => {
    required(
      ["OWNER", "TENANT", "MANAGER"].includes(req.user.role),
      "Access denied",
      403,
    );

    const tenancies = await prisma.tenancy.findMany({
      where:
        req.user.role === "TENANT"
          ? { tenantId: req.user.id }
          : req.user.role === "OWNER"
            ? {
                unit: {
                  property: { ownerId: req.user.id },
                },
              }
            : {
                unit: {
                  property: {
                    owner: { active: true },
                    assignments: {
                      some: { managerId: req.user.id },
                    },
                  },
                },
              },
      select: {
        id: true,
        tenant: { select: { name: true } },
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

    const tenancyIds = tenancies.map((t) => t.id);

    let allowedUploadIds = null;

    if (req.user.role !== "OWNER") {
      const visibleVersions = await prisma.agreementDocumentVersion.findMany({
        where: {
          tenancyId: { in: tenancyIds },
          status: {
            in: PUBLIC_AGREEMENT_STATUSES,
          },
        },
        select: { uploadId: true },
      });

      allowedUploadIds = visibleVersions.map((v) => v.uploadId);
    }

    const uploads = await prisma.agreementUpload.findMany({
      where: {
        tenancyId: { in: tenancyIds },
        ...(allowedUploadIds !== null ? { id: { in: allowedUploadIds } } : {}),
      },
      select: {
        id: true,
        tenancyId: true,
        filename: true,
        fileSize: true,
        sha256: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

    res.setHeader("Cache-Control", "private, no-store");

    res.json(
      uploads.map((doc) => {
        const tenancy = tenancyMap.get(doc.tenancyId);

        return {
          ...doc,
          tenant: tenancy.tenant.name,
          room: tenancy.unit.label,
          property: tenancy.unit.property.title,
          signatureVerified: false,
        };
      }),
    );
  }),
);

// Owner uploads an immutable PDF document.
router.post(
  "/:tenancyId",
  roles("OWNER"),
  (req, res, next) => {
    upload.single("document")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error:
            err.code === "LIMIT_FILE_SIZE"
              ? "PDF must be 5 MB or smaller"
              : "Invalid PDF upload",
        });
      }
      next();
    });
  },
  asyncRoute(async (req, res) => {
    const tenancy = await prisma.tenancy.findFirst({
      where: accessibleTenancy(req.user, req.params.tenancyId),
      select: { id: true },
    });

    required(tenancy, "Tenancy not found", 404);
    required(req.file, "PDF file required", 400);

    // Basic file signature validation.
    // Full document scanning is needed for production.
    required(
      req.file.buffer.subarray(0, 5).toString() === "%PDF-",
      "Invalid PDF content",
      400,
    );

    const filename = req.file.originalname
      .replace(/[\r\n\\/<>:"|?*\x00-\x1F]/g, "_")
      .slice(0, 150);

    const sha256 = crypto
      .createHash("sha256")
      .update(req.file.buffer)
      .digest("hex");

    const saved = await prisma.$transaction(async (tx) => {
      const document = await tx.agreementUpload.create({
        data: {
          tenancyId: tenancy.id,
          uploadedById: req.user.id,
          filename,
          mimeType: "application/pdf",
          fileSize: req.file.size,
          fileData: req.file.buffer,
          sha256,
        },
        select: {
          id: true,
          tenancyId: true,
          filename: true,
          sha256: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "AGREEMENT_PDF_UPLOADED",
          entityType: "AgreementUpload",
          entityId: document.id,
          metadata: {
            tenancyId: tenancy.id,
            sha256,
          },
        },
      });

      return document;
    });

    res.status(201).json({
      message: "Agreement PDF uploaded successfully",
      document: saved,
    });
  }),
);

// Secure PDF download.

router.get(
  "/:id/download",
  asyncRoute(async (req, res) => {
    required(
      ["OWNER", "TENANT", "MANAGER"].includes(req.user.role),
      "Access denied",
      403,
    );

    const file = await prisma.agreementUpload.findUnique({
      where: { id: req.params.id },
    });

    required(file, "Document not found", 404);

    const tenancy = await prisma.tenancy.findFirst({
      where: accessibleTenancy(req.user, file.tenancyId),
      select: { id: true },
    });

    required(tenancy, "Document not found", 404);

    if (req.user.role !== "OWNER") {
      const visibleVersion = await prisma.agreementDocumentVersion.findFirst({
        where: {
          uploadId: file.id,
          tenancyId: file.tenancyId,
          status: {
            in: PUBLIC_AGREEMENT_STATUSES,
          },
        },
        select: { id: true },
      });

      required(visibleVersion, "Document not found", 404);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="agreement-${file.id}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    res.end(Buffer.from(file.fileData));
  }),
);

export default router;
