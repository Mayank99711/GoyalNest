import { Router } from "express";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();
router.use(authenticate);

function tenancyWhere(user, id) {
  if (user.role === "TENANT") {
    return { id, tenantId: user.id };
  }

  if (user.role === "OWNER") {
    return {
      id,
      unit: { property: { ownerId: user.id } },
    };
  }

  if (user.role === "MANAGER") {
    return {
      id,
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

async function getAuthorizedVersion(tx, user, versionId) {
  const version = await tx.agreementDocumentVersion.findUnique({
    where: { id: versionId },
  });

  required(version, "Agreement not found", 404);

  const tenancy = await tx.tenancy.findFirst({
    where: tenancyWhere(user, version.tenancyId),
    select: { id: true },
  });

  required(tenancy, "Agreement not found", 404);
  return version;
}

// GET /api/agreement-evidence
router.get(
  "/",
  roles("OWNER", "TENANT", "MANAGER"),
  asyncRoute(async (req, res) => {
    const where =
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
            };

    const tenancies = await prisma.tenancy.findMany({
      where,
      select: { id: true },
    });

    const evidence = await prisma.agreementConsentEvidence.findMany({
      where: {
        tenancyId: {
          in: tenancies.map((t) => t.id),
        },
      },
      select: {
        id: true,
        versionId: true,
        tenancyId: true,
        versionNumber: true,
        tenantId: true,
        documentSha256: true,
        filename: true,
        acceptedAt: true,
        recordedAt: true,
        source: true,
      },
      orderBy: { acceptedAt: "desc" },
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.json(evidence);
  }),
);

// Reconcile existing accepted versions that predate Phase 29H.
// Does NOT claim a fresh acceptance happened.
router.post(
  "/:versionId/reconcile",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const evidence = await prisma.$transaction(
      async (tx) => {
        const version = await getAuthorizedVersion(
          tx,
          req.user,
          req.params.versionId,
        );

        required(
          ["ACTIVE", "SUPERSEDED"].includes(version.status),
          "Only accepted versions can be reconciled",
          409,
        );

        required(
          version.acceptedAt && version.acceptedById,
          "Existing acceptance evidence is incomplete",
          409,
        );

        const existing = await tx.agreementConsentEvidence.findUnique({
          where: { versionId: version.id },
        });

        required(!existing, "Consent evidence already exists", 409);

        const tenancy = await tx.tenancy.findUnique({
          where: { id: version.tenancyId },
          select: { tenantId: true },
        });

        required(
          tenancy?.tenantId === version.acceptedById,
          "Accepted user does not match tenant",
          409,
        );

        const upload = await tx.agreementUpload.findUnique({
          where: { id: version.uploadId },
        });

        required(
          upload?.tenancyId === version.tenancyId,
          "Document-tenancy mismatch",
          409,
        );

        const hash = createHash("sha256")
          .update(Buffer.from(upload.fileData))
          .digest("hex");

        required(hash === upload.sha256, "PDF integrity check failed", 409);

        const saved = await tx.agreementConsentEvidence.create({
          data: {
            versionId: version.id,
            tenancyId: version.tenancyId,
            uploadId: upload.id,
            versionNumber: version.version,
            tenantId: version.acceptedById,
            documentSha256: hash,
            filename: upload.filename,
            acceptedAt: version.acceptedAt,
            source: "HISTORICAL_RECONCILIATION",
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: req.user.id,
            action: "AGREEMENT_EVIDENCE_RECONCILED",
            entityType: "AgreementConsentEvidence",
            entityId: saved.id,
            metadata: {
              versionId: version.id,
              source: "HISTORICAL_RECONCILIATION",
              originalAcceptedAt: version.acceptedAt.toISOString(),
              sha256: hash,
            },
          },
        });

        return saved;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    res.status(201).json({
      message: "Historical consent record reconciled",
      evidence,
    });
  }),
);

export default router;
