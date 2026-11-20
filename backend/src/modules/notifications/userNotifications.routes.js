import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncRoute } from '../../lib/errors.js';
const router = Router();
router.use(authenticate);
router.get('/', asyncRoute(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.userNotification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.userNotification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ notifications, unreadCount });
}));
router.post('/:id/read', asyncRoute(async (req, res) => {
  const changed = await prisma.userNotification.updateMany({ where: { id: req.params.id, userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  if (!changed.count) {
    const exists = await prisma.userNotification.count({ where: { id: req.params.id, userId: req.user.id } });
    if (!exists) return res.status(404).json({ error: 'Notification not found' });
  }
  res.json({ read: true });
}));
export default router;
