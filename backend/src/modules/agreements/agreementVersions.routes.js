import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
import { createHash } from "node:crypto";
import { notifyUsers } from "../notifications/notify.service.js";
const router = Router();
router.use(authenticate);

function tenancyScope(user) {
  if (user.role === "TENANT") {
    return { tenantId: user.id };
  }

  if (user.role === "OWNER") {
    return {
      unit: { property: { ownerId: user.id } },
    };
  }

  if (user.role === "MANAGER") {
    return {
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

async function checkTenancy(tx, user, tenancyId) {
  const tenancy = await tx.tenancy.findFirst({
    where: {
      id: tenancyId,
      ...tenancyScope(user),
    },
    select: { id: true, tenantId: true, unitId: true, status: true },
  });

  required(tenancy, "Tenancy not accessible", 404);
  return tenancy;
}

// GET /api/agreement-versions
router.get(
  "/",
  roles("OWNER", "TENANT", "MANAGER"),
  asyncRoute(async (req, res) => {
    const tenancies = await prisma.tenancy.findMany({
      where: tenancyScope(req.user),
      select: {
        id: true,
        tenant: { select: { name: true } },
        unit: {
          select: {
            label: true,
            property: { select: { title: true } },
          },
        },
      },
    });

    const versions = await prisma.agreementDocumentVersion.findMany({
      where: {
        tenancyId: { in: tenancies.map((t) => t.id) },
      },
      orderBy: [{ tenancyId: "asc" }, { version: "desc" }],
    });

    const uploads = await prisma.agreementUpload.findMany({
      where: { id: { in: versions.map((v) => v.uploadId) } },
      select: {
        id: true,
        filename: true,
        sha256: true,
        createdAt: true,
      },
    });

    const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));
    const uploadMap = new Map(uploads.map((u) => [u.id, u]));

    const visibleVersions = versions.filter(
      (v) =>
        req.user.role === "OWNER" || !["DRAFT", "CANCELLED"].includes(v.status),
    );

    res.json(
      visibleVersions.map((v) => {
        const t = tenancyMap.get(v.tenancyId);
        const upload = uploadMap.get(v.uploadId);

        return {
          ...v,
          filename: upload?.filename || "Agreement PDF",
          sha256: upload?.sha256 || null,
          tenant: t.tenant.name,
          property: t.unit.property.title,
          room: t.unit.label,
        };
      }),
    );
  }),
);

// Owner creates a draft version from an existing PDF.
router.post(
  "/from-upload",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const uploadId = String(req.body?.uploadId || "");

    required(uploadId, "Upload ID required", 400);

    const result = await prisma.$transaction(
      async (tx) => {
        const upload = await tx.agreementUpload.findUnique({
          where: { id: uploadId },
          select: {
            id: true,
            tenancyId: true,
            uploadedById: true,
          },
        });

        required(upload, "Uploaded PDF not found", 404);
        await checkTenancy(tx, req.user, upload.tenancyId);

        required(
          upload.uploadedById === req.user.id,
          "Only the uploading Owner can register this PDF version",
          403,
        );

        const existing = await tx.agreementDocumentVersion.findUnique({
          where: { uploadId },
        });

        required(!existing, "This PDF already has a version", 409);

        const last = await tx.agreementDocumentVersion.findFirst({
          where: { tenancyId: upload.tenancyId },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        const version = await tx.agreementDocumentVersion.create({
          data: {
            tenancyId: upload.tenancyId,
            uploadId,
            version: (last?.version || 0) + 1,
            status: "DRAFT",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "AGREEMENT_VERSION_CREATED",
            entityType: "AgreementDocumentVersion",
            entityId: version.id,
            metadata: {
              uploadId,
              version: version.version,
            },
          },
        });

        return version;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.status(201).json({
      message: `Agreement V${result.version} created as draft`,
      version: result,
    });
  }),
);

// Owner publishes a draft for tenant acceptance.

router.post(
  "/:id/publish",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const { confirmed, expectedSha256, expectedFilename } = req.body || {};

    required(confirmed === true, "Owner document approval is required", 400);

    required(
      typeof expectedSha256 === "string" &&
        /^[a-f0-9]{64}$/i.test(expectedSha256),
      "Valid document SHA-256 is required",
      400,
    );

    required(
      typeof expectedFilename === "string" && expectedFilename.length > 0,
      "Expected filename is required",
      400,
    );

    const result = await prisma.$transaction(
      async (tx) => {
        const version = await tx.agreementDocumentVersion.findUnique({
          where: { id: req.params.id },
        });

        required(version, "Agreement version not found", 404);

        const tenancy = await checkTenancy(tx, req.user, version.tenancyId);

        required(
          tenancy.status !== "VACATED",
          "Cannot publish for a closed tenancy",
          409,
        );

        required(
          version.status === "DRAFT",
          "Only draft versions can be published",
          409,
        );

        const upload = await tx.agreementUpload.findUnique({
          where: { id: version.uploadId },
        });

        required(upload, "Agreement PDF not found", 404);

        required(
          upload.tenancyId === version.tenancyId,
          "Document-tenancy mismatch",
          409,
        );

        required(
          upload.uploadedById === req.user.id,
          "Document must be uploaded by the publishing Owner",
          403,
        );

        required(
          upload.mimeType === "application/pdf" &&
            upload.fileSize > 0 &&
            upload.fileSize <= 5 * 1024 * 1024,
          "Invalid PDF metadata",
          409,
        );

        const bytes = Buffer.from(upload.fileData);

        required(
          bytes.length === upload.fileSize &&
            bytes.subarray(0, 5).toString() === "%PDF-",
          "PDF file validation failed",
          409,
        );

        const calculatedSha256 = createHash("sha256")
          .update(bytes)
          .digest("hex");

        required(
          calculatedSha256 === upload.sha256 &&
            calculatedSha256.toLowerCase() === expectedSha256.toLowerCase() &&
            upload.filename === expectedFilename,
          "PDF changed or selected document does not match",
          409,
        );

        const pending = await tx.agreementDocumentVersion.count({
          where: {
            tenancyId: version.tenancyId,
            status: "PENDING_ACCEPTANCE",
          },
        });

        required(
          pending === 0,
          "Another agreement awaits tenant acceptance",
          409,
        );

        const updated = await tx.agreementDocumentVersion.updateMany({
          where: {
            id: version.id,
            status: "DRAFT",
          },
          data: {
            status: "PENDING_ACCEPTANCE",
            publishedAt: new Date(),
            publishedById: req.user.id,
          },
        });

        required(
          updated.count === 1,
          "Version changed during publication",
          409,
        );

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "AGREEMENT_VERSION_PUBLISHED",
            entityType: "AgreementDocumentVersion",
            entityId: version.id,
            metadata: {
              tenancyId: version.tenancyId,
              version: version.version,
              uploadId: upload.id,
              filename: upload.filename,
              sha256: calculatedSha256,
              ownerConfirmed: true,
              tenantAcceptanceRequired: true,
            },
          },
        });

        await notifyUsers(tx, {
          userIds: [tenancy.tenantId],
          title: "Rental agreement ready for your review",
          message: `Agreement V${version.version} is ready. Open Agreements, review the PDF, then accept or contact your Owner.`,
          type: "AGREEMENT_PUBLISHED",
          referenceId: version.id,
        });

        return version.version;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.json({
      message: `Agreement V${result} published for tenant acceptance`,
      status: "PENDING_ACCEPTANCE",
    });
  }),
);

// Tenant accepts only their own published version.

router.post(
  "/:id/accept",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    required(req.body?.accepted === true, "Explicit acceptance required", 400);

    const result = await prisma.$transaction(
      async (tx) => {
        const version = await tx.agreementDocumentVersion.findUnique({
          where: { id: req.params.id },
        });

        required(version, "Version not found", 404);

        const tenancy = await checkTenancy(tx, req.user, version.tenancyId);

        required(
          tenancy.status !== "VACATED",
          "Cannot accept agreement for closed tenancy",
          409,
        );

        required(
          version.status === "PENDING_ACCEPTANCE",
          "Agreement is not awaiting acceptance",
          409,
        );

        const upload = await tx.agreementUpload.findUnique({
          where: { id: version.uploadId },
        });

        required(
          upload && upload.tenancyId === tenancy.id,
          "Agreement PDF mismatch",
          409,
        );

        const actualHash = createHash("sha256")
          .update(Buffer.from(upload.fileData))
          .digest("hex");

        required(
          actualHash === upload.sha256,
          "Agreement document integrity check failed",
          409,
        );

        const now = new Date();

        await tx.agreementDocumentVersion.updateMany({
          where: {
            tenancyId: tenancy.id,
            status: "ACTIVE",
          },
          data: { status: "SUPERSEDED" },
        });

        const updated = await tx.agreementDocumentVersion.updateMany({
          where: {
            id: version.id,
            status: "PENDING_ACCEPTANCE",
          },
          data: {
            status: "ACTIVE",
            acceptedAt: now,
            acceptedById: req.user.id,
          },
        });

        required(updated.count === 1, "Agreement already processed", 409);

        const evidence = await tx.agreementConsentEvidence.create({
          data: {
            versionId: version.id,
            tenancyId: tenancy.id,
            uploadId: upload.id,
            versionNumber: version.version,
            tenantId: req.user.id,
            documentSha256: actualHash,
            filename: upload.filename,
            acceptedAt: now,
            source: "LIVE_ACCEPTANCE",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "AGREEMENT_CONSENT_RECORDED",
            entityType: "AgreementConsentEvidence",
            entityId: evidence.id,
            metadata: {
              versionId: version.id,
              tenancyId: tenancy.id,
              version: version.version,
              sha256: actualHash,
              acceptedAt: now.toISOString(),
              source: "LIVE_ACCEPTANCE",
            },
          },
        });

        const property = await tx.unit.findUnique({
          where: { id: tenancy.unitId },
          select: { property: { select: { ownerId: true } } },
        });
        await notifyUsers(tx, {
          userIds: [property?.property?.ownerId],
          title: "Tenant accepted rental agreement",
          message: `The tenant accepted agreement V${version.version}. Acceptance evidence is recorded in Agreements.`,
          type: "AGREEMENT_ACCEPTED",
          referenceId: version.id,
        });

        return {
          version: version.version,
          evidenceId: evidence.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.json({
      message: `Agreement V${result.version} accepted`,
      status: "ACTIVE",
      evidenceId: result.evidenceId,
    });
  }),
);

router.post(
  "/:id/cancel-draft",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const result = await prisma.$transaction(
      async (tx) => {
        const version = await tx.agreementDocumentVersion.findUnique({
          where: { id: req.params.id },
        });

        required(version, "Agreement not found", 404);

        await checkTenancy(tx, req.user, version.tenancyId);

        required(
          version.status === "DRAFT",
          "Only draft agreements can be cancelled",
          409,
        );

        const updated = await tx.agreementDocumentVersion.updateMany({
          where: {
            id: version.id,
            status: "DRAFT",
          },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledById: req.user.id,
          },
        });

        required(updated.count === 1, "Draft has already changed", 409);

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "AGREEMENT_DRAFT_CANCELLED",
            entityType: "AgreementDocumentVersion",
            entityId: version.id,
            metadata: {
              tenancyId: version.tenancyId,
              uploadId: version.uploadId,
              version: version.version,
              cancellationType: "SOFT_CANCEL",
            },
          },
        });

        return version.version;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.json({
      message: `Agreement V${result} cancelled and archived`,
    });
  }),
);

export default router;
