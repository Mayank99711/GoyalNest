/**
 * Isolated GoyalNest mentor demonstration fixture.
 * Never run against a production or important shared database.
 * Does not reset, delete or update existing business records.
 * Run from backend: $env:DEMO_SEED_CONFIRM='YES'; $env:DEMO_SEED_PASSWORD='strong unique test password'; node prisma/seed.mentor-demo.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const prefix = 'GOYALNEST_MENTOR_DEMO_2026';

async function main() {
  if (process.env.DEMO_SEED_CONFIRM !== 'YES') throw new Error('Set DEMO_SEED_CONFIRM=YES explicitly');
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing');
  const password = process.env.DEMO_SEED_PASSWORD || '';
  if (password.length < 12) throw new Error('DEMO_SEED_PASSWORD must be at least 12 characters');
  const hash = await bcrypt.hash(password, 12);

  async function user(role, slug) {
    const email = `${slug}@goyalnest-demo.invalid`;
    const found = await prisma.user.findUnique({ where: { email } });
    if (found) {
      if (found.role !== role) throw new Error(`Role mismatch for ${email}`);
      return found;
    }
    return prisma.user.create({ data: {
      name: `${prefix} ${slug}`,
      email, passwordHash: hash, role,
      verified: true, active: true,
    } });
  }

  const [owner, tenant, manager, secondTenant] = await Promise.all([
    user('OWNER', 'owner'), user('TENANT', 'tenant'),
    user('MANAGER', 'manager'), user('TENANT', 'tenant2'),
  ]);

  let property = await prisma.property.findFirst({ where: { ownerId: owner.id, title: prefix } });
  if (!property) property = await prisma.property.create({ data: {
    ownerId: owner.id, title: prefix,
    description: 'Synthetic demo listing used for mentor testing only.',
    city: 'Delhi', locality: 'Demo Locality', address: 'Demo-only non-real address',
    type: 'PG', status: 'PUBLISHED',
  } });

  let unit = await prisma.unit.findFirst({ where: { propertyId: property.id, label: 'DEMO-101' } });
  if (!unit) unit = await prisma.unit.create({ data: {
    propertyId: property.id, label: 'DEMO-101', capacity: 3,
    rent: 12000, depositAmount: 12000, active: true,
  } });

  await prisma.managerAssignment.upsert({
    where: { managerId_propertyId: { managerId: manager.id, propertyId: property.id } },
    update: {}, create: { managerId: manager.id, propertyId: property.id },
  });

  if (!(await prisma.subscription.findFirst({ where: { ownerId: owner.id, plan: 'DEMO_MENTOR' } }))) {
    await prisma.subscription.create({ data: {
      ownerId: owner.id, plan: 'DEMO_MENTOR', price: 0, listingLimit: 4,
      expiresAt: new Date('2028-01-01T00:00:00Z'),
    } });
  }

  let approvedBooking = await prisma.booking.findFirst({ where: {
    tenantId: tenant.id, unitId: unit.id, emergencyPhone: '0000000000',
  } });
  if (!approvedBooking) approvedBooking = await prisma.booking.create({ data: {
    tenantId: tenant.id, unitId: unit.id,
    emergencyPhone: '0000000000', moveIn: new Date('2026-12-01T00:00:00Z'),
    wantsDeposit: true, status: 'APPROVED',
  } });

  let tenancy = await prisma.tenancy.findUnique({ where: { bookingId: approvedBooking.id } });
  if (!tenancy) tenancy = await prisma.tenancy.create({ data: {
    bookingId: approvedBooking.id, tenantId: tenant.id, unitId: unit.id,
    startDate: new Date('2026-12-01T00:00:00Z'), status: 'ACTIVE',
    rent: 12000, depositRequired: 12000, depositPaid: 0,
  } });

  await prisma.rentInvoice.upsert({
    where: { tenancyId_period: { tenancyId: tenancy.id, period: '2026-12' } },
    update: {}, create: {
      tenancyId: tenancy.id, period: '2026-12', amount: 12000,
      dueDate: new Date('2026-12-05T00:00:00Z'), status: 'PENDING',
    },
  });

  if (!(await prisma.maintenanceTicket.findFirst({ where: { tenancyId: tenancy.id, title: `${prefix} water leak` } }))) {
    await prisma.maintenanceTicket.create({ data: {
      tenantId: tenant.id, tenancyId: tenancy.id,
      title: `${prefix} water leak`,
      description: 'Synthetic maintenance case for Admin, Manager and Owner workflow testing.',
      status: 'OPEN',
    } });
  }

  if (!(await prisma.platformDispute.findFirst({ where: { bookingId: approvedBooking.id, subject: `${prefix} rent query` } }))) {
    await prisma.platformDispute.create({ data: {
      type: 'BOOKING', subject: `${prefix} rent query`,
      description: 'Synthetic shared dispute. Owner and tenant should both have access.',
      bookingId: approvedBooking.id, openedById: tenant.id,
      status: 'OPEN', priority: 'MEDIUM',
    } });
  }

  if (!(await prisma.booking.findFirst({ where: { tenantId: secondTenant.id, unitId: unit.id, emergencyPhone: '0000000001' } }))) {
    await prisma.booking.create({ data: {
      tenantId: secondTenant.id, unitId: unit.id,
      emergencyPhone: '0000000001',
      moveIn: new Date('2026-12-10T00:00:00Z'), status: 'PENDING',
    } });
  }

  console.log('MENTOR DEMO FIXTURE READY - synthetic records only');
  console.log('Login emails: owner, tenant, tenant2, manager @goyalnest-demo.invalid');
  console.log('Password: DEMO_SEED_PASSWORD value (not printed)');
  console.log('Property:', property.id, 'Unit:', unit.id);
  console.log('Important: This fixture does not simulate verified KYC or real payment settlement.');
}

try { await main(); }
catch (error) { console.error('Demo seed failed:', error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
