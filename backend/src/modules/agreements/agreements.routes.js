import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";
const r = Router();
r.use(authenticate);
r.post(
  "/:tenancyId",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const t = await prisma.tenancy.findUnique({
      where: { id: req.params.tenancyId },
      include: { unit: true },
    });
    required(t, "Tenancy not found", 404);
    await ownerProperty(req.user, t.unit.propertyId);
    required(
      ["GENERATED_TEXT", "UPLOAD_LINK"].includes(req.body.type),
      "Invalid agreement type",
    );
    const content =
      req.body.type === "GENERATED_TEXT"
        ? `Rental agreement for tenancy ${t.id}; monthly rent INR ${t.rent}; start ${t.startDate.toISOString().slice(0, 10)}. Review legally before signing.`
        : String(req.body.content || "");
    res.status(201).json(
      await prisma.agreement.create({
        data: { tenancyId: t.id, type: req.body.type, content },
      }),
    );
  }),
);
r.post(
  "/:id/consent",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const a = await prisma.agreement.findUnique({
      where: { id: req.params.id },
      include: { tenancy: true },
    });
    required(
      a && a.tenancy.tenantId === req.user.id,
      "Agreement inaccessible",
      403,
    );
    required(!a.signedAt, "Agreement already signed", 409);
    required(
      req.body.signerName === req.user.name,
      "Sign with your registered name",
    );

    const result = await prisma.$transaction(async (tx) => {
      const signedAt = new Date();

      const changed = await tx.agreement.updateMany({
        where: {
          id: a.id,
          signedAt: null,
        },
        data: {
          signerName: req.user.name,
          signedAt,
        },
      });

      required(changed.count === 1, "Agreement already signed", 409);

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "AGREEMENT_CONSENT_RECORDED",
          entityType: "Agreement",
          entityId: a.id,
          metadata: {
            tenancyId: a.tenancyId,
            signerName: req.user.name,
            signedAt: signedAt.toISOString(),
          },
        },
      });

      return tx.agreement.findUnique({
        where: { id: a.id },
      });
    });

    res.json(result);
  }),
);
export default r;
