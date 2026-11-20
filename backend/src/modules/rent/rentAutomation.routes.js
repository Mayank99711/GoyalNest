import { Router } from "express";
import { prisma } from "../../config/prisma.js";
import { authenticate, roles } from "../../middleware/auth.js";
import { asyncRoute, required } from "../../lib/errors.js";

const router = Router();

router.use(authenticate);
router.use(roles("TENANT"));

// Tenant can see only their own notices.
router.get(
  "/notifications",
  asyncRoute(async (req, res) => {
    const notices = await prisma.rentNotice.findMany({
      where: {
        invoice: {
          tenancy: {
            tenantId: req.user.id,
          },
        },
      },
      include: {
        invoice: {
          select: {
            period: true,
            amount: true,
            penalty: true,
            status: true,
            dueDate: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    res.json(notices);
  }),
);

// Mark one notification as read.
router.patch(
  "/notifications/:id/read",
  asyncRoute(async (req, res) => {
    const result = await prisma.rentNotice.updateMany({
      where: {
        id: req.params.id,
        invoice: {
          tenancy: {
            tenantId: req.user.id,
          },
        },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    required(result.count === 1, "Notification not found or already read", 404);

    res.json({ message: "Notification marked as read" });
  }),
);

export default router;
