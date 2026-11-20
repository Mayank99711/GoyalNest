import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prisma } from "../../config/prisma.js";
import { authenticate, roles, ownerProperty } from "../../middleware/auth.js";
import { asyncRoute } from "../../lib/errors.js";

const router = Router();

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../uploads/properties",
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single("image");

const badRequest = (message, status = 400) =>
  Object.assign(new Error(message), { status });

router.post(
  "/:id/images",
  authenticate,
  roles("OWNER"),
  (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();
      next(
        badRequest(
          err.code === "LIMIT_FILE_SIZE"
            ? "Maximum image size is 5MB"
            : "Invalid image upload",
        ),
      );
    });
  },
  asyncRoute(async (req, res) => {
    const propertyId = req.params.id;

    await ownerProperty(req.user, propertyId);

    if (!req.file) {
      throw badRequest("Image is required");
    }

    const count = await prisma.propertyImage.count({
      where: { propertyId },
    });

    if (count >= 8) {
      throw badRequest("Maximum 8 images allowed");
    }

    let imageBuffer;

    try {
      imageBuffer = await sharp(req.file.buffer, {
        limitInputPixels: 40000000,
      })
        .rotate()
        .resize({
          width: 1600,
          height: 1200,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      throw badRequest("Invalid or unsupported image");
    }

    await fs.mkdir(root, { recursive: true });

    const filename = `${randomUUID()}.webp`;
    const filepath = path.join(root, filename);
    const imageUrl = `/uploads/properties/${filename}`;

    await fs.writeFile(filepath, imageBuffer);

    try {
      const image = await prisma.$transaction(async (tx) => {
        const created = await tx.propertyImage.create({
          data: { propertyId, imageUrl },
        });

        const property = await tx.property.findUnique({
          where: { id: propertyId },
          select: { imageUrl: true },
        });

        if (!property.imageUrl) {
          await tx.property.update({
            where: { id: propertyId },
            data: { imageUrl },
          });
        }

        return created;
      });

      res.status(201).json(image);
    } catch (error) {
      await fs.unlink(filepath).catch(() => {});
      throw error;
    }
  }),
);

router.patch(
  "/:id/cover-image",
  authenticate,
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const propertyId = req.params.id;
    const { imageId } = req.body;

    await ownerProperty(req.user, propertyId);

    if (!imageId || typeof imageId !== "string") {
      throw badRequest("Valid imageId is required");
    }

    const image = await prisma.propertyImage.findFirst({
      where: {
        id: imageId,
        propertyId,
      },
    });

    if (!image) {
      throw badRequest("Image not found for this property", 404);
    }

    const property = await prisma.property.update({
      where: { id: propertyId },
      data: { imageUrl: image.imageUrl },
    });

    res.json({
      success: true,
      imageUrl: property.imageUrl,
      message: "Cover photo updated successfully",
    });
  }),
);

router.delete(
  "/:id/images/:imageId",
  authenticate,
  roles("OWNER"),
  asyncRoute(async (req, res) => {
    const propertyId = req.params.id;

    await ownerProperty(req.user, propertyId);

    const image = await prisma.propertyImage.findFirst({
      where: {
        id: req.params.imageId,
        propertyId,
      },
    });

    if (!image) {
      throw badRequest("Image not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.propertyImage.delete({
        where: { id: image.id },
      });

      const property = await tx.property.findUnique({
        where: { id: propertyId },
        select: { imageUrl: true },
      });

      if (property.imageUrl === image.imageUrl) {
        const replacement = await tx.propertyImage.findFirst({
          where: { propertyId },
          orderBy: { createdAt: "asc" },
        });

        await tx.property.update({
          where: { id: propertyId },
          data: {
            imageUrl: replacement?.imageUrl || null,
          },
        });
      }
    });

    // Keep the uploaded file until storage cleanup is handled
    // by a separate maintenance process.
    res.json({ success: true });
  }),
);

export default router;
