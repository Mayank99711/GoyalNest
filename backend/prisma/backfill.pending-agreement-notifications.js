// One-time recovery for already-published agreements without a Tenant alert.
// DRY RUN by default. Requires --apply and explicit confirmation environment variable.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
if (apply && process.env.AGREEMENT_BACKFILL_CONFIRM !== "YES") {
  console.error("To apply, set AGREEMENT_BACKFILL_CONFIRM=YES. Otherwise this is a read-only dry run.");
  process.exit(2);
}
if (apply && process.env.NODE_ENV === "production") {
  console.error("Production backfill requires a separate reviewed deployment. Refusing.");
  process.exit(2);
}
try {
  const versions = await prisma.agreementDocumentVersion.findMany({
    where: { status: "PENDING_ACCEPTANCE" },
    select: { id: true, version: true, tenancyId: true },
  });
  let missing = 0;
  let created = 0;
  for (const v of versions) {
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: v.tenancyId }, select: { tenantId: true },
    });
    if (!tenancy?.tenantId) continue;
    const where = { userId: tenancy.tenantId, type: "AGREEMENT_PUBLISHED", referenceId: v.id };
    const exists = await prisma.userNotification.count({ where });
    if (exists) continue;
    missing++;
    if (apply) {
      // Multiple concurrent runs should not be used. No unique constraint exists on notification dedupe keys.
      await prisma.userNotification.create({
        data: {
          ...where,
          title: "Rental agreement ready for your review",
          message: `Agreement V${v.version} is ready. Open Agreements, review the PDF, then accept or contact your Owner.`,
        },
      });
      created++;
    }
  }
  console.log(JSON.stringify({mode:apply?"APPLIED":"DRY_RUN",pendingAgreementVersions:versions.length,missingAlerts:missing,created},null,2));
} catch (error) { console.error(error.message);process.exitCode=1; }
finally { await prisma.$disconnect(); }
