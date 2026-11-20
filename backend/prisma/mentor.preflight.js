/** GoyalNest mentor QA: read-only database integrity preflight. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, status: ok ? 'PASS' : 'FAIL', detail });
}
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const [users, properties, units, tenancies, beds, notifications, disputes] = await Promise.all([
    prisma.user.count(), prisma.property.count(), prisma.unit.count(),
    prisma.tenancy.count(), prisma.unitBed.count(),
    prisma.userNotification.count(), prisma.platformDispute.count(),
  ]);
  check('Schema and DB connectivity', true, `${users} users, ${properties} properties, ${units} units`);
  const assignedBeds = await prisma.unitBed.findMany({
    where: { tenancyId: { not: null } },
    select: { id: true, unitId: true, tenancyId: true, active: true,
      tenancy: { select: { status: true, unitId: true, checkInAt: true, checkOutAt: true } } },
  });
  const inconsistent = assignedBeds.filter(b =>
    !b.active || !b.tenancy || b.tenancy.unitId !== b.unitId ||
    ['VACATED', 'CANCELLED'].includes(b.tenancy.status) &&
      (!b.tenancy.checkInAt || b.tenancy.checkOutAt)
  );
  check('Assigned bed consistency', inconsistent.length === 0,
    `${assignedBeds.length} assigned; ${inconsistent.length} inconsistent`);
  const capacity = await prisma.unit.findMany({
    select: { id: true, capacity: true,
      beds: { where: { active: true }, select: { id: true } } },
  });
  const overCapacity = capacity.filter(u => u.beds.length > u.capacity);
  check('Active beds fit unit capacity', overCapacity.length === 0,
    `${overCapacity.length} units exceed capacity`);
  check('Read-only fixture overview', true,
    `${tenancies} tenancies, ${beds} beds, ${notifications} notifications, ${disputes} disputes`);
  console.table(checks);
  if (inconsistent.length) console.log('Inconsistent bed IDs:', inconsistent.slice(0, 10).map(x=>x.id));
  if (overCapacity.length) console.log('Overcapacity unit IDs:', overCapacity.slice(0,10).map(x=>x.id));
  if (checks.some(c=>c.status==='FAIL')) process.exitCode=1;
} catch (error) {
  console.error('PREFLIGHT ERROR:', error.message);
  process.exitCode=1;
} finally {
  await prisma.$disconnect();
}
