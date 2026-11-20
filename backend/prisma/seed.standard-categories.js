import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const categories = ["PG", "Hostel", "Apartment", "Flat", "Independent House", "Co-living"];
async function main() {
 const url = new URL(process.env.DATABASE_URL || "");
 if (!["localhost", "127.0.0.1"].includes(url.hostname) || process.env.CATEGORY_SEED_CONFIRM !== "YES") {
  throw new Error("Only an explicitly confirmed local development database may be seeded");
 }
 let created = 0, existing = 0;
 for (const name of categories) {
  const old = await prisma.propertyCategory.findUnique({where:{name}});
  if (old) {existing++;continue;}
  await prisma.propertyCategory.create({data:{name,active:true}});created++;
 }
 console.log(`Standard category seed complete: ${created} created, ${existing} already existed. Existing categories unchanged.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>prisma.$disconnect());
