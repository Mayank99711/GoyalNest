/**
 * Photos for synthetic GoyalNest NCR DEMO properties only.
 * Safe, idempotent backfill: skips properties with ANY existing photo.
 * Does not modify the user's real property records, units or category mappings.
 * Requires NCR_DEMO_PHOTOS_CONFIRM=YES, isolated local development DB.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_OWNER_EMAIL = 'ncr.demo.owner@goyalnest-demo.invalid';
const DEMO_PREFIX = '[GoyalNest NCR DEMO]';
const PHOTO_URLS = [
  '/gn-demo-photos/interior.webp',
  '/gn-demo-photos/kitchen.webp',
];

async function main() {
  if (process.env.NCR_DEMO_PHOTOS_CONFIRM !== 'YES') {
    throw new Error('Set NCR_DEMO_PHOTOS_CONFIRM=YES explicitly');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo photo seeding is blocked in production');
  }
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl) throw new Error('DATABASE_URL is missing');
  let dbUrl;
  try { dbUrl = new URL(databaseUrl); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (!['localhost', '127.0.0.1', '::1'].includes(dbUrl.hostname)) {
    throw new Error('Database must be on localhost; remote databases are not allowed');
  }

  const owner = await prisma.user.findUnique({
    where: { email: DEMO_OWNER_EMAIL }, select: { id: true, role: true },
  });
  if (!owner || owner.role !== 'OWNER') {
    throw new Error('NCR demo Owner not found; run the original NCR demo property seeder first');
  }
  const properties = await prisma.property.findMany({
    where: { ownerId: owner.id, title: { startsWith: DEMO_PREFIX } },
    select: { id: true, title: true, imageUrl: true,
      images: { select: { id: true }, take: 1 },
    },
    orderBy: { title: 'asc' },
  });
  let added = 0, skipped = 0;
  for (let index = 0; index < properties.length; index++) {
    const property = properties[index];
    if (property.imageUrl || property.images.length) { skipped++; continue; }
    const photos = index % 2 === 0 ? PHOTO_URLS : [...PHOTO_URLS].reverse();
    await prisma.$transaction(async (tx) => {
      // CAS: never replace a cover image set by the owner since query time.
      const updated = await tx.property.updateMany({
        where: { id: property.id, imageUrl: null },
        data: { imageUrl: photos[0] },
      });
      if (updated.count !== 1) return;
      const existing = await tx.propertyImage.count({ where: { propertyId: property.id } });
      if (existing > 0) {
        // An existing gallery takes precedence; revert our cover assignment.
        await tx.property.update({ where: { id: property.id }, data: { imageUrl: null } });
        return;
      }
      await tx.propertyImage.createMany({
        data: photos.map((imageUrl) => ({ propertyId: property.id, imageUrl })),
      });
      added++;
    });
  }
  console.log(`NCR DEMO PHOTOS: ${added} properties updated; ${skipped} already had images; ${properties.length} synthetic demo properties found.`);
  console.log('Each updated property gets 1 cover + 2 gallery photos (illustrative, reused across demo listings).');
  console.log('These photos do NOT depict the listed properties.');
}

try { await main(); }
catch (error) { console.error('NCR demo photo seed failed:', error.message); process.exitCode = 1; }
finally { await prisma.$disconnect(); }
