import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute, fail, required } from "../../lib/errors.js";
import { notifyUsers, activeUserIdsByRole } from "../notifications/notify.service.js";

const router = Router();

router.use(authenticate);

const storageRoot = path.resolve(process.cwd(), "private-storage", "kyc");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
}).single("document");

function uploadMiddleware(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    return next(
      Object.assign(
        new Error(
          error.code === "LIMIT_FILE_SIZE"
            ? "Maximum file size is 5MB"
            : "Unable to upload document",
        ),
        { status: 400 },
      ),
    );
  });
}

async function normalizeFile(file) {
  required(file, "Choose a document");

  const buffer = file.buffer;

  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";

  if (file.mimetype === "application/pdf" && isPdf) {
    return {
      buffer,
      extension: ".pdf",
      mime: "application/pdf",
    };
  }

  required(
    ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
    "Only PDF, JPG, PNG or WebP allowed",
  );

  try {
    const metadata = await sharp(buffer, {
      limitInputPixels: 20000000,
    }).metadata();

    required(
      ["jpeg", "png", "webp"].includes(metadata.format),
      "Invalid image format",
    );

    const safeBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();

    return {
      buffer: safeBuffer,
      extension: ".webp",
      mime: "image/webp",
    };
  } catch {
    fail(400, "Invalid image document");
  }
}

function storedFilename(document) {
  const prefix = "private://kyc/";

  required(
    document.fileUrl.startsWith(prefix),
    "Legacy document has no private uploaded file",
    404,
  );

  const filename = document.fileUrl.slice(prefix.length);

  required(
    /^[a-f0-9-]{36}\.(pdf|webp)$/.test(filename),
    "Invalid stored document",
    404,
  );

  return filename;
}

async function getOwnedBooking(user, bookingId) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { unit: true },
  });

  required(booking, "Booking not found", 404);

  await ownerProperty(user, booking.unit.propertyId);

  return booking;
}

// Tenant uploads a private KYC document.
router.post(
  "/upload",
  roles("TENANT"),
  uploadMiddleware,
  asyncRoute(async (req, res) => {
    const count = await prisma.tenantDocument.count({
      where: { userId: req.user.id, type: "KYC" },
    });

    required(count < 3, "Maximum 3 KYC documents allowed");

    const file = await normalizeFile(req.file);

    const filename = randomUUID() + file.extension;
    const filePath = path.join(storageRoot, filename);

    await fs.mkdir(storageRoot, {
      recursive: true,
      mode: 0o700,
    });

    await fs.writeFile(filePath, file.buffer, {
      mode: 0o600,
      flag: "wx",
    });

    try {
      const document = await prisma.$transaction(async (tx) => {
        const saved = await tx.tenantDocument.create({
          data: {
            userId: req.user.id,
            type: "KYC",
            fileName: path.basename(req.file.originalname).slice(0, 150),
            fileUrl: `private://kyc/${filename}`,
            status: "PENDING",
          },
        });
        const adminIds = await activeUserIdsByRole(tx, "ADMIN");
        await notifyUsers(tx, {
          userIds: adminIds,
          title: "Tenant KYC verification required",
          message: "A tenant submitted an identity document. Review the pending KYC request.",
          type: "KYC_SUBMITTED",
          referenceId: saved.id,
        });
        return saved;
      });

      res.status(201).json({
        id: document.id,
        fileName: document.fileName,
        status: document.status,
        createdAt: document.createdAt,
      });
    } catch (error) {
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
  }),
);

// Tenant sees only own documents and statuses.
router.get(
  "/mine",
  roles("TENANT"),
  asyncRoute(async (req, res) => {
    const documents = await prisma.tenantDocument.findMany({
      where: { userId: req.user.id, type: "KYC" },
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(documents);
  }),
);

// Owner sees KYC only for a booking on their property.
router.get(
  "/bookings/:bookingId",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const booking = await getOwnedBooking(req.user, req.params.bookingId);

    const documents = await prisma.tenantDocument.findMany({
      where: {
        userId: booking.tenantId,
        type: "KYC",
        fileUrl: { startsWith: "private://kyc/" },
      },
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(documents);
  }),
);

// Private download, allowed for tenant or owning property owner.
router.get(
  "/:documentId/download",
  asyncRoute(async (req, res) => {
    const document = await prisma.tenantDocument.findUnique({
      where: { id: req.params.documentId },
    });

    required(document, "Document not found", 404);

    let allowed = req.user.role === "TENANT" && document.userId === req.user.id;

    if (!allowed && req.user.role === "OWNER") {
      const linkedBooking = await prisma.booking.findFirst({
        where: {
          tenantId: document.userId,
          unit: {
            property: { ownerId: req.user.id },
          },
        },
        select: { id: true },
      });

      allowed = Boolean(linkedBooking);
    }

    required(allowed, "Access denied", 403);

    const filename = storedFilename(document);
    const filePath = path.join(storageRoot, filename);

    const content = await fs.readFile(filePath).catch(() => {
      fail(404, "Stored document unavailable");
    });

    res.set({
      "Content-Type": filename.endsWith(".pdf")
        ? "application/pdf"
        : "image/webp",
      "Content-Disposition": `attachment; filename="kyc-document${path.extname(filename)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });

    res.send(content);
  }),
);

// Only Owner can review KYC attached to their booking.
router.patch(
  "/:documentId/review",
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const { bookingId, status } = req.body;

    required(
      ["VERIFIED", "REJECTED"].includes(status),
      "Invalid verification decision",
    );

    const booking = await getOwnedBooking(req.user, bookingId);

    required(
      booking.status === "PENDING",
      "Only pending bookings can be reviewed",
    );

    const document = await prisma.tenantDocument.findUnique({
      where: { id: req.params.documentId },
    });

    required(
      document &&
        document.userId === booking.tenantId &&
        document.type === "KYC" &&
        document.fileUrl.startsWith("private://kyc/"),
      "Document not available for this booking",
      404,
    );

    required(document.status === "PENDING", "Document already reviewed", 409);

    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.tenantDocument.updateMany({
        where: { id: document.id, status: "PENDING" },
        data: { status, reviewedAt: new Date() },
      });
      if (!changed.count) return null;
      await notifyUsers(tx, {
        userIds: [document.userId],
        title: status === "VERIFIED" ? "KYC verified" : "KYC needs attention",
        message: status === "VERIFIED"
          ? "Your identity document has been verified."
          : "Your identity document was rejected. Please review and resubmit if needed.",
        type: "KYC_REVIEWED",
        referenceId: document.id,
      });
      return tx.tenantDocument.findUnique({
        where: { id: document.id }, select: { id: true, status: true, reviewedAt: true },
      });
    });
    required(result, "Document already reviewed", 409);

    res.json(result);
  }),
);

export default router;
