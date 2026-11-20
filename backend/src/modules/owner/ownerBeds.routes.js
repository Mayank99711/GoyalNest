import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { authenticate, roles } from '../../middleware/auth.js';
import { asyncRoute } from '../../lib/errors.js';

const router = Router();
router.use(authenticate);
router.use(roles('OWNER'));
const input = z.object({ label: z.string().trim().min(1).max(60) }).strict();
const activeStatuses = ['ACTIVE', 'PENDING_PAYMENT', 'VACATING'];

const unitFor = (ownerId, id) => prisma.unit.findFirst({
  where: { id, property: { ownerId } },
  select: { id: true, active: true, capacity: true, label: true },
});

router.get('/units/:unitId/beds', asyncRoute(async (req, res) => {
  const unit = await unitFor(req.user.id, req.params.unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  const [beds, tenancies] = await Promise.all([
    prisma.unitBed.findMany({
      where: { unitId: unit.id },
      orderBy: { label: 'asc' },
      include: { tenancy: { select: { id: true, status: true, tenant: { select: { id: true, name: true } } } } },
    }),
    prisma.tenancy.findMany({
      where: { unitId: unit.id, status: { in: activeStatuses } },
      select: { id: true, tenant: { select: { id: true, name: true } }, status: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const allocatedIds = new Set(beds.map(b => b.tenancyId).filter(Boolean));
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ unit, beds, unassignedTenancies: tenancies.filter(t => !allocatedIds.has(t.id)), count: beds.length });
}));

router.post('/units/:unitId/beds', asyncRoute(async (req, res) => {
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Enter a bed label (1-60 characters)' });
  const unit = await unitFor(req.user.id, req.params.unitId);
  if (!unit) return res.status(404).json({ error: 'Unit not found' });
  if (!unit.active) return res.status(409).json({ error: 'Activate the unit first' });
  const result = await prisma.$transaction(async tx => {
    const count = await tx.unitBed.count({ where: { unitId: unit.id, active: true } });
    if (count >= unit.capacity) return { code: 409, error: 'Active bed count cannot exceed unit capacity' };
    const bed = await tx.unitBed.create({ data: { unitId: unit.id, label: parsed.data.label } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_BED_CREATED', entityType: 'UnitBed', entityId: bed.id, metadata: { unitId: unit.id } } });
    return { bed };
  }, { isolationLevel: 'Serializable' });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.status(201).json(result);
}));

router.patch('/beds/:bedId', asyncRoute(async (req, res) => {
  const parsed = z.object({ label: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ error: 'Invalid bed update' });
  const bed = await prisma.unitBed.findFirst({ where: { id: req.params.bedId, unit: { property: { ownerId: req.user.id } } } });
  if (!bed) return res.status(404).json({ error: 'Bed not found' });
  if (parsed.data.active === false && bed.tenancyId) return res.status(409).json({ error: 'Unassign tenant before deactivating bed' });
  const updated = await prisma.$transaction(async tx => {
    if (parsed.data.active === true && !bed.active) {
      const activeCount = await tx.unitBed.count({ where: { unitId: bed.unitId, active: true } });
      const unit = await tx.unit.findUnique({ where: { id: bed.unitId } });
      if (!unit.active || activeCount >= unit.capacity) return { code: 409, error: 'Unit capacity reached or inactive' };
    }
    const result = await tx.unitBed.update({ where: { id: bed.id }, data: parsed.data });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_BED_UPDATED', entityType: 'UnitBed', entityId: bed.id, metadata: parsed.data } });
    return { bed: result };
  }, { isolationLevel: 'Serializable' });
  if (updated.error) return res.status(updated.code).json({ error: updated.error });
  res.json(updated);
}));

router.post('/beds/:bedId/assign', asyncRoute(async (req, res) => {
  const parsed = z.object({ tenancyId: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a tenancy' });
  const result = await prisma.$transaction(async tx => {
    const bed = await tx.unitBed.findFirst({ where: { id: req.params.bedId, unit: { property: { ownerId: req.user.id } } } });
    if (!bed) return { code: 404, error: 'Bed not found' };
    if (!bed.active || bed.tenancyId) return { code: 409, error: 'Bed is inactive or already assigned' };
    const tenancy = await tx.tenancy.findFirst({ where: { id: parsed.data.tenancyId, unitId: bed.unitId, status: { in: activeStatuses } } });
    if (!tenancy) return { code: 404, error: 'Active tenancy does not belong to this unit' };
    const changed = await tx.unitBed.updateMany({ where: { id: bed.id, tenancyId: null, active: true }, data: { tenancyId: tenancy.id } });
    if (changed.count !== 1) return { code: 409, error: 'Bed assignment changed; refresh' };
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_BED_ASSIGNED', entityType: 'UnitBed', entityId: bed.id, metadata: { tenancyId: tenancy.id } } });
    return { assigned: true };
  }, { isolationLevel: 'Serializable' });
  if (result.error) return res.status(result.code).json({ error: result.error });
  res.json(result);
}));

router.post('/beds/:bedId/unassign', asyncRoute(async (req, res) => {
  const bed = await prisma.unitBed.findFirst({ where: { id: req.params.bedId, unit: { property: { ownerId: req.user.id } } } });
  if (!bed) return res.status(404).json({ error: 'Bed not found' });
  if (!bed.tenancyId) return res.status(409).json({ error: 'Bed is not assigned' });
  await prisma.$transaction(async tx => {
    await tx.unitBed.update({ where: { id: bed.id }, data: { tenancyId: null } });
    await tx.auditLog.create({ data: { actorId: req.user.id, action: 'OWNER_BED_UNASSIGNED', entityType: 'UnitBed', entityId: bed.id, metadata: { previousTenancyId: bed.tenancyId } } });
  });
  res.json({ unassigned: true });
}));

export default router;
