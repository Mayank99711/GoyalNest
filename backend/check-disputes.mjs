import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  console.log("PlatformDispute model:", typeof prisma.platformDispute);
  console.log("Total disputes:", await prisma.platformDispute.count());
} catch (error) {
  console.error("Error Code:", error.code);
  console.error("Error:", error.message);
} finally {
  await prisma.$disconnect();
}
