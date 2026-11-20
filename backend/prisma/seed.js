import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const name = process.env.ADMIN_NAME || 'Platform Administrator';
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 12 || password.startsWith('REPLACE_')) {
    throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ characters) in backend/.env');
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== 'ADMIN') throw new Error('Email already belongs to another role');
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN', verified: true, active: true }
  });
  console.log(`Admin exists: ${admin.email}. Existing passwords are not overwritten.`);
} catch (error) {
  console.error('Admin seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
