import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const count = await prisma.platformDispute.count();

  console.log("PlatformDispute table working");
  console.log("Total disputes:", count);
} catch (error) {
  console.error("Error Code:", error.code);
  console.error("Error:", error.message);
} finally {
  await prisma.$disconnect();
}
