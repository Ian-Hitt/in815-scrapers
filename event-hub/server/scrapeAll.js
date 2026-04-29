import { startScrape, SCRAPER_SOURCES } from "./routes/imports.js";
import { getScrapeStatus } from "./db.js";
import { runEnrichmentPipeline } from "./enrichPipeline.js";

// Scrapers that consistently hang or need manual intervention (CAPTCHA).
// We run them LAST so a single stuck source can't block the healthy ones.
const DEFER_LAST = ["eventbrite"];

function orderedSources() {
  const deferred = SCRAPER_SOURCES.filter((s) => DEFER_LAST.includes(s));
  const normal = SCRAPER_SOURCES.filter((s) => !DEFER_LAST.includes(s));
  return [...normal, ...deferred];
}

let isRunning = false;

// Runs every scraper sequentially, then chains the enrichment pipeline.
// Puppeteer-based scrapers are too heavy to run in parallel — Eventbrite
// specifically needs a visible browser for CAPTCHAs, so we stagger the whole set.
export async function runAllScrapers(trigger = "manual") {
  if (isRunning) {
    console.log("[scrape-all] run already in progress, skipping");
    return;
  }
  isRunning = true;
  const startedAt = new Date().toISOString();
  const sources = orderedSources();
  console.log(`[scrape-all] ${trigger} run starting at ${startedAt} (${sources.length} sources)`);

  const summary = { ok: 0, partial: 0, failed: 0, skipped: 0 };

  for (const source of sources) {
    const current = getScrapeStatus(source);
    if (current?.status === "scraping") {
      console.log(`[scrape-all] skipping ${source} — scrape already in progress`);
      summary.skipped++;
      continue;
    }
    const result = await startScrape(source);
    if (result.skipped) summary.skipped++;
    else if (result.partial) summary.partial++;
    else if (result.failed) summary.failed++;
    else summary.ok++;
  }

  console.log(`[scrape-all] ${trigger} scrape pass complete — ok=${summary.ok} partial=${summary.partial} failed=${summary.failed} skipped=${summary.skipped}`);

  // Chain enrichment pipeline after scrapes finish. Opt out with SCRAPER_ENRICH=off.
  if (process.env.SCRAPER_ENRICH === "off") {
    console.log("[scrape-all] enrichment pipeline skipped (SCRAPER_ENRICH=off)");
  } else {
    try {
      await runEnrichmentPipeline();
    } catch (err) {
      console.error("[scrape-all] enrichment pipeline failed:", err.message);
    }
  }

  isRunning = false;
  console.log(`[scrape-all] ${trigger} run complete`);
  return summary;
}

export function isScrapeAllRunning() {
  return isRunning;
}
