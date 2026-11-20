import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("ADMIN"));

const storageRoot = path.resolve(process.cwd(), "private-storage", "kyc");

const MIME = {
  ".pdf": "application/pdf",
  ".webp": "image/webp",
};

// GET /api/admin-kyc/:id/preview
router.get(
  "/:id/preview",
  asyncRoute(async (req, res) => {
    const document = await prisma.tenantDocument.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        fileUrl: true,
      },
    });

    required(document, "KYC document not found", 404);

    const prefix = "private://kyc/";

    required(
      typeof document.fileUrl === "string" &&
        document.fileUrl.startsWith(prefix),
      "Private document unavailable",
      404,
    );

    const filename = document.fileUrl.slice(prefix.length);

    // Match the existing private KYC filename convention.
    required(
      /^[a-f0-9-]{36}\.(pdf|webp)$/.test(filename),
      "Invalid stored document",
      404,
    );

    const filePath = path.join(storageRoot, filename);
    const extension = path.extname(filename).toLowerCase();

    required(MIME[extension], "Unsupported document format", 415);

    const bytes = await fs.readFile(filePath).catch(() => null);

    required(bytes, "Private KYC file not found", 404);

    required(
      bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
      "Invalid document size",
      413,
    );

    const validContent =
      extension === ".pdf"
        ? bytes.subarray(0, 5).toString("ascii") === "%PDF-"
        : bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP";

    required(validContent, "Stored document has invalid content", 415);

    res.setHeader("Content-Type", MIME[extension]);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="kyc-document${extension}"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

    res.send(bytes);
  }),
);

export default router;
