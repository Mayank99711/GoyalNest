import { app } from "./app.js";
import { startEmailWorker } from "./modules/notifications/emailOutbox.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { scheduleRentCycle } from "./jobs/rent.scheduler.js";
import { startRentAutomation } from "./modules/rent/rentAutomation.scheduler.js";
async function start() {
  await prisma.$connect();
  const stopJobs = scheduleRentCycle();
  const stopEmail = startEmailWorker();
  const server = app.listen(env.port, () =>
    console.log(`GoyalNest backend running at http://localhost:${env.port}`),
  );
  startRentAutomation();
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () =>
      server.close(async () => {
        stopJobs();
        stopEmail();
        await prisma.$disconnect();
        process.exit(0);
      }),
    );
}
start().catch((err) => {
  console.error(err);
  process.exit(1);
});
