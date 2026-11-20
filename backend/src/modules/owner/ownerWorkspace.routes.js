import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, roles } from '../../middleware/auth.js';
import { asyncRoute } from '../../lib/errors.js';

const router = Router();
router.use(authenticate);
router.use(roles('OWNER'));
const unitSchema = z.object({
  label: z.string().trim().min(1).max(80),
  bhk: z.union([z.number().int().min(0).max(20), z.null()]).optional(),
  capacity: z.number().int().min(1).max(100),
  rent: z.number().int().min(1).max(100000000),
  depositAmount: z.number().int().min(0).max(100000000),
  active: z.boolean(),
}).strict();

const owned = (ownerId) => ({ property: { ownerId } });
const occupiedStatuses = ['ACTIVE', 'VACATING', 'PENDING_PAYMENT'];

router.get('/units', asyncRoute(async (req, res) => {
  const units = await prisma.unit.findMany({
    where: owned(req.user.id),
    select: {
      id: true, propertyId: true, label: true, bhk: true,
      capacity: true, rent: true, depositAmount: true, active: true,
      property: { select: { id: true, title: true, status: true } },
      tenancies: {
        where: { status: { in: occupiedStatuses } },
        select: { id: true, status: true, tenant: { select: { id: true, name: true } } },
      },
      _count: { select: { bookings: true, tenancies: true } },
    },
    orderBy: [{ propertyId: 'asc' }, { label: 'asc' }],
    take: 1000,
  });
  const result = units.map(({ tenancies, ...unit }) => ({
    ...unit,
    occupied: tenancies.length,
    available: unit.active ? Math.max(0, unit.capacity - tenancies.length) : 0,
    occupants: tenancies.map(t => ({ id: t.id, status: t.status, tenant: t.tenant })),
  }));
  res.set('Cache-Control', 'private, no-store');
  res.json({ units: result, totals: {
    units: result.length,
    capacity: result.reduce((n, u) => n + (u.active ? u.capacity : 0), 0),
    occupied: result.reduce((n, u) => n + u.occupied, 0),
    available: result.reduce((n, u) => n + u.available, 0),
  } });
}));

router.patch('/units/:id', asyncRoute(async (req, res) => {
  const parsed = unitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid unit details', details: parsed.error.flatten() });
  const result = await prisma.$transaction(async tx => {
    const unit = await tx.unit.findFirst({ where: { id: req.params.id, ...owned(req.user.id) }, select: { id: true } });
    if (!unit) return { code: 404, error: 'Unit not found' };
    const occupied = await tx.tenancy.count({ where: { unitId: unit.id, status: { in: occupiedStatuses } } });
    if (parsed.data.capacity < occupied) return { code: 409, error: 'Capacity cannot be below active occupancy' };
    const configuredBeds = await tx.unitBed.count({ where: { unitId: unit.id, active: true } });
    if (parsed.data.capacity < configuredBeds) return { code: 409, error: 'Capacity cannot be below configured active beds' };
    if (!parsed.data.active && occupied) return { code: 409, error: 'Cannot deactivate a unit with active tenancy' };
    const pendingBookings = await tx.booking.count({ where: { unitId: unit.id, status: 'PENDING' } });
    if (!parsed.data.active && pendingBookings) return { code: 409, error: 'Resolve pending bookings before deactivating the unit' };
    const updated = await tx.unit.update({ where: { id: unit.id }, data: parsed.data });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_UNIT_UPDATED', entityType: 'Unit', entityId: unit.id, metadata: { changes: parsed.data } } });
    return { unit: updated };
  });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.json(result);
}));

router.delete('/units/:id', asyncRoute(async (req, res) => {
  const result = await prisma.$transaction(async tx => {
    const unit = await tx.unit.findFirst({ where: { id: req.params.id, ...owned(req.user.id) }, select: { id: true } });
    if (!unit) return { code: 404, error: 'Unit not found' };
    const [bookingCount, tenancyCount] = await Promise.all([
      tx.booking.count({ where: { unitId: unit.id } }),
      tx.tenancy.count({ where: { unitId: unit.id } }),
    ]);
    const bedCount = await tx.unitBed.count({ where: { unitId: unit.id } });
    if (bookingCount || tenancyCount || bedCount) return { code: 409, error: 'Unit has bookings, tenancies or beds. Mark inactive instead of deleting.' };
    await tx.unit.delete({ where: { id: unit.id } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_UNIT_DELETED', entityType: 'Unit', entityId: unit.id, metadata: {} } });
    return { deleted: true };
  });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.json(result);
}));

router.get('/tenants', asyncRoute(async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const status = String(req.query.status || '').toUpperCase();
  const allowed = ['PENDING_PAYMENT', 'ACTIVE', 'VACATING', 'VACATED', 'CANCELLED'];
  const where = { unit: { property: { ownerId: req.user.id } }, ...(allowed.includes(status) ? { status } : {}) };
  const [total, tenancies] = await Promise.all([
    prisma.tenancy.count({ where }),
    prisma.tenancy.findMany({
      where, take: 25, skip: (page - 1) * 25, orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, startDate: true, rent: true, depositPaid: true,
        depositRequired: true, createdAt: true,
        tenant: { select: { id: true, name: true, email: true, phone: true } },
        unit: { select: { id: true, label: true, property: { select: { id: true, title: true } } } },
        invoices: { select: { id: true, status: true, amount: true, penalty: true, period: true, dueDate: true }, orderBy: { dueDate: 'desc' }, take: 12 },
      },
    }),
  ]);
  res.set('Cache-Control', 'private, no-store');
  res.json({ total, page, totalPages: Math.max(1, Math.ceil(total / 25)), tenancies });
}));

router.get('/subscription', asyncRoute(async (req, res) => {
  const [subscriptions, propertyCounts] = await Promise.all([
    prisma.subscription.findMany({ where: { ownerId: req.user.id }, orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }], take: 30,
      select: { id: true, plan: true, price: true, listingLimit: true, expiresAt: true, createdAt: true } }),
    prisma.property.groupBy({ by: ['status'], where: { ownerId: req.user.id }, _count: { _all: true } }),
  ]);
  const now = new Date();
  const active = subscriptions.find(s => s.expiresAt > now) || null;
  const counted = Object.fromEntries(propertyCounts.map(x => [x.status, x._count._all]));
  const usedListings = (counted.PENDING || 0) + (counted.PUBLISHED || 0);
  res.set('Cache-Control', 'private, no-store');
  res.json({
    active,
    latest: subscriptions[0] || null,
    history: subscriptions,
    status: active ? 'ACTIVE' : 'EXPIRED',
    usedListings,
    availableListings: active ? Math.max(0, active.listingLimit - usedListings) : 0,
    isDemoBilling: process.env.NODE_ENV !== 'production',
  });
}));

export default router;
