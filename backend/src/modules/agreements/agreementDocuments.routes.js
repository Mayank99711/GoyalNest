import { Router } from "express";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);

const allowedRoles = new Set(["TENANT", "OWNER", "MANAGER"]);

function accessWhere(user) {
  switch (user.role) {
    case "TENANT":
      return {
        tenancy: { tenantId: user.id },
      };

    case "OWNER":
      return {
        tenancy: {
          unit: {
            property: { ownerId: user.id },
          },
        },
      };

    case "MANAGER":
      return {
        tenancy: {
          unit: {
            property: {
              assignments: {
                some: {
                  managerId: user.id,
                },
              },
            },
          },
        },
      };

    default:
      return { id: "__ACCESS_DENIED__" };
  }
}

const agreementSelect = {
  id: true,
  type: true,
  content: true,
  signedAt: true,
  signerName: true,
  createdAt: true,
  tenancy: {
    select: {
      id: true,
      status: true,
      rent: true,
      tenant: {
        select: {
          name: true,
        },
      },
      unit: {
        select: {
          label: true,
          property: {
            select: {
              title: true,
              address: true,
              city: true,
            },
          },
        },
      },
    },
  },
};

// GET /api/agreement-documents/mine
router.get(
  "/mine",
  asyncRoute(async (req, res) => {
    required(allowedRoles.has(req.user.role), "Access denied", 403);

    const agreements = await prisma.agreement.findMany({
      where: accessWhere(req.user),
      select: agreementSelect,
      orderBy: { createdAt: "desc" },
    });

    res.json(
      agreements.map((a) => ({
        id: a.id,
        type: a.type,
        signedAt: a.signedAt,
        signerName: a.signerName,
        tenancyStatus: a.tenancy.status,
        tenant: a.tenancy.tenant.name,
        property: a.tenancy.unit.property.title,
        room: a.tenancy.unit.label,
        canDownload:
          a.type === "GENERATED_TEXT" &&
          Boolean(a.signedAt) &&
          Boolean(a.content?.trim()),
      })),
    );
  }),
);

// GET /api/agreement-documents/:id/pdf
router.get(
  "/:id/pdf",
  asyncRoute(async (req, res) => {
    required(allowedRoles.has(req.user.role), "Access denied", 403);

    const agreement = await prisma.agreement.findFirst({
      where: {
        id: req.params.id,
        ...accessWhere(req.user),
      },
      select: agreementSelect,
    });

    required(agreement, "Agreement not found", 404);

    required(
      agreement.type === "GENERATED_TEXT",
      "Only generated-text agreements support PDF export",
      409,
    );

    required(
      agreement.signedAt &&
        typeof agreement.content === "string" &&
        agreement.content.trim().length > 0,
      "Signed agreement content is unavailable",
      409,
    );

    const tenancy = agreement.tenancy;
    const property = tenancy.unit.property;

    const doc = new PDFDocument({
      size: "A4",
      margin: 52,
      bufferPages: false,
      info: {
        Title: "GoyalNest Rental Agreement",
        Author: "GoyalNest",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="goyalnest-agreement-${agreement.id}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    doc.on("error", (err) => {
      console.error("[Agreement PDF]", err);
      res.destroy(err);
    });

    doc.pipe(res);

    doc
      .font("Helvetica-Bold")
      .fontSize(19)
      .text("GOYALNEST", { align: "center" });

    doc.moveDown(0.3);

    doc
      .font("Helvetica")
      .fontSize(10)
      .text("Property & Living", { align: "center" });

    doc.moveDown(1.5);

    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("RENTAL AGREEMENT", { align: "center" });

    doc.moveDown(1.5);

    doc.font("Helvetica").fontSize(10);

    const details = [
      ["Property", property.title],
      ["Address", property.address || property.city || "N/A"],
      ["Room", tenancy.unit.label],
      ["Tenant", tenancy.tenant.name],
      ["Monthly Rent", `INR ${tenancy.rent}`],
      ["Agreement ID", agreement.id],
      [
        "Signed At",
        new Date(agreement.signedAt).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
        }),
      ],
    ];

    for (const [label, value] of details) {
      doc
        .font("Helvetica-Bold")
        .text(`${label}: `, { continued: true })
        .font("Helvetica")
        .text(String(value));
      doc.moveDown(0.3);
    }

    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Agreement Terms");

    doc.moveDown(0.7);

    doc.font("Helvetica").fontSize(10).text(agreement.content, {
      align: "left",
      lineGap: 5,
    });

    doc.moveDown(1.5);

    doc.font("Helvetica-Bold").fontSize(10).text("Recorded Tenant Consent");

    doc
      .font("Helvetica")
      .text(`Signer: ${agreement.signerName || tenancy.tenant.name}`)
      .text(`Consent recorded: ${new Date(agreement.signedAt).toISOString()}`);

    doc.moveDown();

    doc
      .fontSize(8)
      .fillColor("#666666")
      .text(
        "This PDF is a representation of an agreement and " +
          "consent recorded in GoyalNest. It is not a " +
          "cryptographically signed document.",
      );

    doc.end();
  }),
);

export default router;
