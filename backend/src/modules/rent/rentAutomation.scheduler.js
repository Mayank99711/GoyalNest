import cron from "node-cron";
import { runRentAutomation } from "./rentAutomation.service.js";

export function startRentAutomation() {
  const enabled = process.env.RENT_AUTOMATION_ENABLED === "true";

  if (!enabled) {
    console.log("[Rent Automation] Disabled");
    return;
  }

  // Every day at 9:00 AM India time.
  cron.schedule(
    "0 9 * * *",
    async () => {
      try {
        await runRentAutomation();
      } catch (error) {
        console.error("[Rent Automation] Scheduled run failed:", error);
      }
    },
    {
      timezone: "Asia/Kolkata",
      noOverlap: true,
    },
  );

  console.log("[Rent Automation] Scheduled daily at 09:00 IST");
}
