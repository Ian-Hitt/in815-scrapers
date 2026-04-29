import { Router } from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { runImportFromFile, DEFAULT_PATHS } from "../importers/base.js";
import { getImportLogs, getImportLog, getScrapeStatuses, getScrapeStatus, updateScrapeStatus, createImportLog, completeImportLog } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");

const SCRAPER_SCRIPTS = {
  rpd: path.join(PROJECT_ROOT, "scrapers", "rpd.js"),
  gorockford: path.join(PROJECT_ROOT, "scrapers", "gorockford.js"),
  eventbrite: path.join(PROJECT_ROOT, "scrapers", "eventbrite.js"),
  rpl: path.join(PROJECT_ROOT, "scrapers", "rpl.js"),
  harlem: path.join(PROJECT_ROOT, "scrapers", "harlem.js"),
  "intersoccer-saturday": path.join(PROJECT_ROOT, "scrapers", "intersoccer.js"),
  "intersoccer-sunday": path.join(PROJECT_ROOT, "scrapers", "intersoccer.js"),
  hononegah: path.join(PROJECT_ROOT, "scrapers", "hononegah.js"),
  guilford: path.join(PROJECT_ROOT, "scrapers", "guilford.js"),
  east: path.join(PROJECT_ROOT, "scrapers", "east.js"),
  auburn: path.join(PROJECT_ROOT, "scrapers", "auburn.js"),
  jefferson: path.join(PROJECT_ROOT, "scrapers", "jefferson.js"),
  "lutheran-hs": path.join(PROJECT_ROOT, "scrapers", "rl.js"),
  marysplace: path.join(PROJECT_ROOT, "scrapers", "marysplace.js"),
  rockfordlive: path.join(PROJECT_ROOT, "scrapers", "rockfordlive.js"),
  rockbuzz: path.join(PROJECT_ROOT, "scrapers", "rockbuzz.js"),
  hardrock: path.join(PROJECT_ROOT, "scrapers", "hardrock.js"),
  boylan: path.join(PROJECT_ROOT, "scrapers", "boylan.js"),
  rivets: path.join(PROJECT_ROOT, "scrapers", "rivets.js"),
  ticketmaster: path.join(PROJECT_ROOT, "scrapers", "ticketmaster.js"),
  northsuburban: path.join(PROJECT_ROOT, "scrapers", "northsuburban.js"),
};

export const SCRAPER_SOURCES = Object.keys(SCRAPER_SCRIPTS);

// Hard cap so a hung Puppeteer scraper (e.g. Eventbrite stuck at a CAPTCHA) can't
// block the scrape-all loop forever. Override with SCRAPE_TIMEOUT_MS.
const SCRAPE_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS) || 15 * 60 * 1000;

const router = Router();

// Track running scraper child processes by source name
const runningScrapers = new Map();

// Core scrape-and-import runner. Resolves when the child process exits and
// the import attempt (successful or not) is recorded. Never rejects — all
// outcomes are recorded to the DB and surfaced via the result object.
export function startScrape(source) {
  return new Promise((resolve) => {
    const scraperScript = SCRAPER_SCRIPTS[source];
    if (!scraperScript) {
      return resolve({ source, failed: true, error: `Unknown source: ${source}` });
    }

    const current = getScrapeStatus(source);
    if (current?.status === "scraping") {
      return resolve({ source, skipped: true, error: "already in progress" });
    }

    updateScrapeStatus(source, { status: "scraping", error: null });

    const logResult = createImportLog({ source_name: source, file_name: "scrape.js", started_at: new Date().toISOString() });
    const logId = logResult.lastInsertRowid;

    const child = spawn(process.execPath, [scraperScript], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    runningScrapers.set(source, child);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error(`[${source}] timed out after ${SCRAPE_TIMEOUT_MS / 1000}s — killing`);
      try { child.kill("SIGKILL"); } catch {}
    }, SCRAPE_TIMEOUT_MS);

    child.on("close", (code, signal) => {
      clearTimeout(timeoutId);
      runningScrapers.delete(source);
      const scraperFailed = code !== 0;

      if (scraperFailed) {
        const reason = timedOut ? ` (timed out after ${SCRAPE_TIMEOUT_MS / 1000}s)` : "";
        const output = (stderr || stdout).slice(-2000);
        console.error(`[${source}] scraper failed${reason} (code=${code} signal=${signal})\n${output}`);
      }

      try {
        const result = runImportFromFile(source, null, logId);
        const imported = result.new_events + result.updated_events;

        if (scraperFailed && imported > 0) {
          console.log(`[${source}] Scraper failed but imported ${imported} events from partial CSV`);
          updateScrapeStatus(source, { status: "idle", last_scraped: new Date().toISOString(), error: `Scraper crashed but imported ${imported} events` });
          resolve({ source, result, partial: true });
        } else if (scraperFailed) {
          const output = (stderr || stdout).slice(-2000);
          const errMsg = timedOut
            ? `Timed out after ${SCRAPE_TIMEOUT_MS / 1000}s — killed`
            : output || `Scraper exited with code ${code} signal=${signal}`;
          completeImportLog(logId, {
            completed_at: new Date().toISOString(),
            status: "failed",
            total_rows: 0, new_events: 0, updated_events: 0, duplicate_events: 0, errors: 1,
            error_details: JSON.stringify([errMsg]),
          });
          updateScrapeStatus(source, { status: "error", error: errMsg });
          resolve({ source, failed: true, error: errMsg });
        } else {
          updateScrapeStatus(source, { status: "idle", last_scraped: new Date().toISOString(), error: null });
          console.log(`[${source}] Scrape + import complete: ${result.new_events} new, ${result.updated_events} updated, ${result.duplicate_events} dupes`);
          resolve({ source, result });
        }
      } catch (err) {
        if (scraperFailed) {
          const output = (stderr || stdout).slice(-2000);
          const errMsg = timedOut
            ? `Timed out after ${SCRAPE_TIMEOUT_MS / 1000}s — killed`
            : output || `Scraper exited with code ${code} signal=${signal}`;
          completeImportLog(logId, {
            completed_at: new Date().toISOString(),
            status: "failed",
            total_rows: 0, new_events: 0, updated_events: 0, duplicate_events: 0, errors: 1,
            error_details: JSON.stringify([errMsg]),
          });
          updateScrapeStatus(source, { status: "error", error: errMsg });
          resolve({ source, failed: true, error: errMsg });
        } else {
          completeImportLog(logId, {
            completed_at: new Date().toISOString(),
            status: "failed",
            total_rows: 0, new_events: 0, updated_events: 0, duplicate_events: 0, errors: 1,
            error_details: JSON.stringify([err.message]),
          });
          updateScrapeStatus(source, { status: "error", error: `Import failed: ${err.message}` });
          resolve({ source, failed: true, error: err.message });
        }
      }
    });

    child.on("error", (err) => {
      runningScrapers.delete(source);
      const errMsg = `Failed to start scraper: ${err.message}`;
      completeImportLog(logId, {
        completed_at: new Date().toISOString(),
        status: "failed",
        total_rows: 0, new_events: 0, updated_events: 0, duplicate_events: 0, errors: 1,
        error_details: JSON.stringify([errMsg]),
      });
      updateScrapeStatus(source, { status: "error", error: errMsg });
      resolve({ source, failed: true, error: errMsg });
    });
  });
}

// Get scrape status for all sources
router.get("/sources", (_req, res) => {
  const statuses = getScrapeStatuses();
  res.json(statuses);
});

// Trigger a scrape + import for a source
router.post("/scrape/:source", (req, res) => {
  console.log(`[scrape] POST /scrape/${req.params.source} from ${req.headers.origin || req.ip}`);
  const { source } = req.params;
  if (!SCRAPER_SCRIPTS[source]) return res.status(400).json({ error: `Unknown source: ${source}` });

  const current = getScrapeStatus(source);
  if (current?.status === "scraping") {
    return res.status(409).json({ error: `${source} scrape already in progress` });
  }

  res.json({ message: `Scrape started for ${source}` });
  startScrape(source);
});

// Cancel a running scrape
router.delete("/scrape/:source", (req, res) => {
  const { source } = req.params;
  const child = runningScrapers.get(source);
  if (!child) return res.status(404).json({ error: `No running scrape for ${source}` });

  child.kill("SIGTERM");
  runningScrapers.delete(source);
  updateScrapeStatus(source, { status: "idle", error: "Cancelled by user" });
  res.json({ ok: true });
});

// Trigger a full sequential scrape of every source
router.post("/scrape-all", async (_req, res) => {
  const { runAllScrapers, isScrapeAllRunning } = await import("../scrapeAll.js");
  if (isScrapeAllRunning()) {
    return res.status(409).json({ error: "scrape-all already running" });
  }
  res.json({ started: true, total: SCRAPER_SOURCES.length });
  runAllScrapers("manual").catch((err) => {
    console.error("[scrape-all] unexpected error:", err);
  });
});

// Status of a scrape-all run
router.get("/scrape-all/status", async (_req, res) => {
  const { isScrapeAllRunning } = await import("../scrapeAll.js");
  res.json({ running: isScrapeAllRunning() });
});

// Import logs
router.get("/", (_req, res) => {
  res.json(getImportLogs());
});

router.get("/:id", (req, res) => {
  const log = getImportLog(parseInt(req.params.id));
  if (!log) return res.status(404).json({ error: "Import log not found" });
  res.json(log);
});

export default router;
