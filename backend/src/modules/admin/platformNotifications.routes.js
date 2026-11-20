import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();
router.use(authenticate);

const TARGET_ROLES = ["ALL", "OWNER", "TENANT", "MANAGER", "ADMIN"];

const announcementSchema = z.object({
  title: z.string().trim().min(5).max(120),
  message: z.string().trim().min(10).max(2000),
  targetRole: z.enum(["ALL", "OWNER", "TENANT", "MANAGER", "ADMIN"]),
});

// ADMIN — List all announcements
router.get(
  "/admin",
  roles("ADMIN"),
  asyncRoute(async (req, res) => {
    const announcements = await prisma.platformAnnouncement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        message: true,
        targetRole: true,
        createdAt: true,
        expiresAt: true,
        _count: {
          select: { reads: true },
        },
      },
    });

    res.setHeader("Cache-Control", "private, no-store");
    res.json({ announcements });
  }),
);

// ADMIN — Create an announcement
router.post(
  "/admin",
  roles("ADMIN"),
  asyncRoute(async (req, res) => {
    const parsed = announcementSchema.safeParse(req.body);

    required(parsed.success, "Invalid title, message or target role", 400);

    const announcement = await prisma.$transaction(async (tx) => {
      const created = await tx.platformAnnouncement.create({
        data: {
          ...parsed.data,
          createdById: req.user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: "ADMIN_ANNOUNCEMENT_CREATED",
          entityType: "PlatformAnnouncement",
          entityId: created.id,
          metadata: {
            targetRole: created.targetRole,
            title: created.title,
          },
        },
      });

      return created;
    });

    res.status(201).json({
      message: "Announcement published successfully",
      announcement,
    });
  }),
);

// USER — List announcements for current role
router.get(
  "/mine",
  asyncRoute(async (req, res) => {
    const now = new Date();

    const announcements = await prisma.platformAnnouncement.findMany({
      where: {
        targetRole: { in: ["ALL", req.user.role] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        reads: {
          where: { userId: req.user.id },
          select: { readAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const items = announcements.map((a) => ({
      id: a.id,
      title: a.title,
      message: a.message,
      targetRole: a.targetRole,
      createdAt: a.createdAt,
      readAt: a.reads[0]?.readAt || null,
    }));

    res.setHeader("Cache-Control", "private, no-store");

    res.json({
      notifications: items,
      unreadCount: items.filter((a) => !a.readAt).length,
    });
  }),
);

// USER — Mark own visible notification as read
router.post(
  "/:id/read",
  asyncRoute(async (req, res) => {
    const announcement = await prisma.platformAnnouncement.findFirst({
      where: {
        id: req.params.id,
        targetRole: { in: ["ALL", req.user.role] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });

    required(announcement, "Notification not found", 404);

    await prisma.platformAnnouncementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId: announcement.id,
          userId: req.user.id,
        },
      },
      create: {
        announcementId: announcement.id,
        userId: req.user.id,
      },
      update: {},
    });

    res.json({ message: "Notification marked as read" });
  }),
);

export default router;
