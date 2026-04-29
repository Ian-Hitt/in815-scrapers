import cron from "node-cron";
import { runAllScrapers } from "./scrapeAll.js";

// Default: Monday 3:00 AM America/Chicago. Override with SCRAPER_CRON.
// Set SCRAPER_SCHEDULE=off to disable the scheduler entirely.
const DEFAULT_CRON = "0 3 * * 1";
const TZ = "America/Chicago";

export function startScheduler() {
  if (process.env.SCRAPER_SCHEDULE === "off") {
    console.log("[scheduler] disabled via SCRAPER_SCHEDULE=off");
    return;
  }
  const expr = process.env.SCRAPER_CRON || DEFAULT_CRON;
  if (!cron.validate(expr)) {
    console.error(`[scheduler] invalid cron expression: ${expr} — scheduler not started`);
    return;
  }
  cron.schedule(expr, () => runAllScrapers("cron"), { timezone: TZ });
  console.log(`[scheduler] registered weekly scrape (${expr} ${TZ})`);
}
