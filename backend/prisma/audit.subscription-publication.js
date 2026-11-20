/** Read-only report: published property owners without unexpired subscriptions.
 * Usage (backend directory): node prisma/audit.subscription-publication.js
 * No update/delete/migration is performed. Never print confidential customer data.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
try {
  const now = new Date();
  const published = await db.property.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, ownerId: true, title: true },
  });
  const ownerIds = [...new Set(published.map(p => p.ownerId))];
  const subscriptions = await db.subscription.findMany({
    where: { ownerId: { in: ownerIds }, expiresAt: { gt: now } },
    select: { ownerId: true },
  });
  const eligibleOwners = new Set(subscriptions.map(s => s.ownerId));
  const exceptions = published.filter(p => !eligibleOwners.has(p.ownerId));
  const demo = exceptions.filter(p => p.title.startsWith("[GoyalNest NCR DEMO]"));
  console.log(JSON.stringify({
    report: "READ_ONLY_SUBSCRIPTION_PUBLICATION_AUDIT",
    publishedCount: published.length,
    publishedWithoutUnexpiredSubscription: exceptions.length,
    labeledSyntheticDemoExceptions: demo.length,
    otherExceptions: exceptions.length - demo.length,
    // IDs only (not personal names, addresses or emails). Inspect admin UI for review.
    exceptionPropertyIds: exceptions.map(p => p.id),
  }, null, 2));
} catch (e) {
  console.error("Audit failed:", e.message);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
