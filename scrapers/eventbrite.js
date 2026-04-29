import puppeteer from "puppeteer";
import fs, { writeFileSync, appendFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, delay, randomDelay, parseDateTime, loadExistingIds } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "eventbrite.csv");
const STUBS_FILE = path.join(__dirname, "..", "data", "eventbrite-stubs.json");

const BASE_URL = "https://www.eventbrite.com";
const MAX_PAGES = 50;

const SEARCH_REGIONS = [
  { url: `${BASE_URL}/d/il--rockford/all-events/?distance=mi25`, label: "Rockford" },
  { url: `${BASE_URL}/d/il--freeport/all-events/?distance=mi25`, label: "Freeport" },
  { url: `${BASE_URL}/d/il--dekalb/all-events/?distance=mi25`, label: "DeKalb" },
  { url: `${BASE_URL}/d/il--dixon/all-events/?distance=mi25`, label: "Dixon" },
  { url: `${BASE_URL}/d/il--joliet/all-events/?distance=mi25`, label: "Joliet" },
  { url: `${BASE_URL}/d/wi--beloit/all-events/?distance=mi15`, label: "Beloit WI" },
];

const ALLOWED_CITIES = new Set([
  // Rockford hub
  "rockford", "cherry valley", "new milford", "machesney park", "loves park",
  // Stateline hub
  "roscoe", "rockton", "south beloit", "beloit",
  // Belvidere hub
  "belvidere", "poplar grove",
  // Nearby Towns hub
  "pecatonica", "winnebago", "durand", "byron", "rochelle", "oregon", "freeport",
  // Northern Illinois hub
  "dixon", "sterling", "dekalb", "galena", "ottawa", "lasalle", "peru", "janesville", "monroe",
  // Chicago Collar hub
  "mchenry", "woodstock", "crystal lake", "joliet", "kankakee", "lake geneva",
]);

const COLUMNS = [
  "title", "url", "eventId", "startDate", "startTime", "endDate", "endTime",
  "description", "imageUrl", "venue", "address", "city", "state", "zip",
  "isOnline", "price", "organizer", "organizerUrl", "category", "tags",
];

// ── Stubs file (Phase 1 persistence) ────────────────────────────────────────

function loadStubs() {
  if (!existsSync(STUBS_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(STUBS_FILE, "utf-8"));
    if (Array.isArray(data.stubs) && data.stubs.length > 0) return data;
  } catch {}
  return null;
}

function saveStubs(stubs, completedRegions) {
  writeFileSync(STUBS_FILE, JSON.stringify({ stubs, completedRegions }, null, 2));
}

function deleteStubs() {
  if (existsSync(STUBS_FILE)) fs.unlinkSync(STUBS_FILE);
}

// ── CSV append (Phase 2 persistence) ────────────────────────────────────────

function ensureCsvHeader() {
  if (!existsSync(OUTPUT_FILE) || fs.statSync(OUTPUT_FILE).size === 0) {
    writeFileSync(OUTPUT_FILE, COLUMNS.join(",") + "\n");
  }
}

function appendEventToCsv(event) {
  const row = COLUMNS.map((col) => escapeCsv(event[col])).join(",");
  appendFileSync(OUTPUT_FILE, row + "\n");
}

// ── Browser helpers ─────────────────────────────────────────────────────────

async function withRetry(fn, maxRetries = 3, delayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.log(`  Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      await delay(delayMs * attempt);
    }
  }
}

async function handleCaptcha(page) {
  const hasCaptcha = await page.evaluate(() =>
    !!document.querySelector("#captcha-container, [class*='captcha']")
  );
  if (hasCaptcha) {
    console.log("\n  CAPTCHA detected! Please solve it in the browser window...");
    await page.waitForFunction(
      () => !document.querySelector("#captcha-container, [class*='captcha']"),
      { timeout: 120000 }
    );
    console.log("  CAPTCHA solved, waiting for page to reload...\n");
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/e/"]').length > 0,
      { timeout: 15000 }
    ).catch(() => {});
    await delay(2000);
  }
}

function extractEventId(url) {
  const match = url.match(/-(\d+)(?:\?|$)/);
  return match ? match[1] : url;
}

function createStealthPage(browser) {
  return browser.newPage().then(async (page) => {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      window.chrome = { runtime: {} };
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
    return page;
  });
}

function launchBrowser() {
  return puppeteer.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
}

// ── Phase 1: Collect event listing stubs ────────────────────────────────────

async function scrapeListingPage(page, searchUrl, pageNum) {
  const sep = searchUrl.includes("?") ? "&" : "?";
  const url = `${searchUrl}${sep}page=${pageNum}`;
  process.stdout.write(`  Page ${pageNum}...`);

  await withRetry(() =>
    page.goto(url, { waitUntil: "networkidle2", timeout: 30000 })
  );

  await handleCaptcha(page);
  await delay(2000);

  const events = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/e/"]'));
    const seen = new Set();
    const results = [];

    for (const link of links) {
      const href = link.getAttribute("href");
      if (!href || seen.has(href)) continue;
      if (!href.match(/-\d+(\?|$)/)) continue;
      seen.add(href);

      const card = link.closest("[class*='event-card']") ||
        link.closest("[data-testid*='event']") ||
        link.closest("article") ||
        link.parentElement?.parentElement;

      const title = card?.querySelector("h2, h3, [class*='title']")?.textContent?.trim() ||
        link.textContent?.trim() || "";
      const dateEl = card?.querySelector("[class*='date'], time, [datetime]");
      const dateSummary = dateEl?.textContent?.trim() || "";
      const locationEl = card?.querySelector("[class*='location'], [class*='venue']");
      const venue = locationEl?.textContent?.trim() || "";
      const priceEl = card?.querySelector("[class*='price'], [class*='ticket']");
      const price = priceEl?.textContent?.trim() || "";
      const img = card?.querySelector("img");
      const image = img?.getAttribute("src") || img?.getAttribute("data-src") || "";

      results.push({
        url: href.startsWith("http") ? href : `https://www.eventbrite.com${href}`,
        title,
        dateSummary,
        venue,
        price,
        image,
      });
    }

    return results;
  });

  console.log(` ${events.length} events`);
  return events;
}

async function scrapeAllListings(page, existingIds, completedRegions = []) {
  const allStubs = [];
  const seenIds = new Set(existingIds);
  const skipRegions = new Set(completedRegions);

  for (const region of SEARCH_REGIONS) {
    if (skipRegions.has(region.label)) {
      console.log(`\nSkipping ${region.label} (already scraped)`);
      continue;
    }

    console.log(`\nSearching: ${region.label}`);
    let emptyPageStreak = 0;
    let regionNew = 0;

    for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
      const events = await scrapeListingPage(page, region.url, pageNum);

      if (events.length === 0) {
        emptyPageStreak++;
        if (emptyPageStreak >= 3) {
          console.log(`  3 consecutive empty pages, done with ${region.label}.`);
          break;
        }
        console.log(`  Empty page ${pageNum} (streak: ${emptyPageStreak}), retrying next...`);
        await delay(3000);
        continue;
      }
      emptyPageStreak = 0;

      for (const ev of events) {
        ev.eventId = extractEventId(ev.url);
        if (!seenIds.has(ev.eventId)) {
          seenIds.add(ev.eventId);
          allStubs.push(ev);
          regionNew++;
        }
      }

      // Save stubs after every page so progress survives crashes
      saveStubs(allStubs, [...completedRegions]);
      await delay(2000);
    }

    // Mark region complete and save
    completedRegions.push(region.label);
    saveStubs(allStubs, completedRegions);
    console.log(`  ${region.label}: ${regionNew} new events`);
  }

  return allStubs;
}

// ── Phase 2: Fetch event details ────────────────────────────────────────────

async function extractJsonLd(page) {
  return page.evaluate(() => {
    const isEventType = (type) =>
      type && (type === "Event" || type.endsWith("Event"));
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (isEventType(data["@type"])) return data;
        if (Array.isArray(data)) {
          const event = data.find((d) => isEventType(d["@type"]));
          if (event) return event;
        }
      } catch {}
    }
    return null;
  });
}

async function scrapeDetailPage(page, stub) {
  const event = {
    title: stub.title,
    url: stub.url,
    eventId: stub.eventId,
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    description: "",
    imageUrl: stub.image || "",
    venue: stub.venue || "",
    address: "",
    city: "",
    state: "",
    zip: "",
    isOnline: "",
    price: stub.price || "",
    organizer: "",
    organizerUrl: "",
    category: "",
    tags: "",
  };

  await withRetry(() =>
    page.goto(stub.url, { waitUntil: "networkidle2", timeout: 30000 })
  );
  await handleCaptcha(page);
  await delay(1500);

  const ld = await extractJsonLd(page);

  if (ld) {
    const start = parseDateTime(ld.startDate);
    const end = parseDateTime(ld.endDate);
    event.title = ld.name || event.title;
    event.startDate = start.date;
    event.startTime = start.time;
    event.endDate = end.date;
    event.endTime = end.time;
    event.description = (ld.description || "").replace(/\n/g, " ").trim();
    event.imageUrl = ld.image || event.imageUrl;

    if (ld.location) {
      if (typeof ld.location === "string") {
        event.venue = ld.location;
      } else {
        event.venue = ld.location.name || event.venue;
        const addr = ld.location.address;
        if (addr) {
          if (typeof addr === "string") {
            event.address = addr;
          } else {
            event.address = addr.streetAddress || "";
            event.city = addr.addressLocality || "";
            event.state = addr.addressRegion || "";
            event.zip = addr.postalCode || "";
          }
        }
      }
      event.isOnline = ld.location["@type"] === "VirtualLocation" ? "yes" : "no";
    }

    if (ld.eventAttendanceMode) {
      if (ld.eventAttendanceMode.includes("Online")) event.isOnline = "yes";
      else if (ld.eventAttendanceMode.includes("Mixed")) event.isOnline = "mixed";
    }

    if (ld.offers) {
      const offers = Array.isArray(ld.offers) ? ld.offers : [ld.offers];
      const prices = offers
        .map((o) => o.price || o.lowPrice)
        .filter((p) => p !== undefined && p !== null);
      if (prices.length > 0) {
        const numPrices = prices.map(Number).filter((n) => !isNaN(n));
        if (numPrices.length > 0 && numPrices.every((n) => n === 0)) {
          event.price = "Free";
        } else if (numPrices.length > 0) {
          const min = Math.min(...numPrices);
          const max = Math.max(...numPrices);
          event.price = min === max ? `$${min}` : `$${min} - $${max}`;
        }
      }
    }

    if (ld.organizer) {
      const org = Array.isArray(ld.organizer) ? ld.organizer[0] : ld.organizer;
      event.organizer = org.name || "";
      event.organizerUrl = org.url || "";
    }
  }

  const domData = await page.evaluate(() => {
    const desc = document.querySelector("[class*='structured-content'], [class*='description'], [data-testid*='description']");
    const cat = document.querySelector("[class*='category'], [data-testid*='category']");
    const tags = Array.from(document.querySelectorAll("[class*='tag'], [data-testid*='tag']"))
      .map((t) => t.textContent?.trim())
      .filter(Boolean);
    const org = document.querySelector("[class*='organizer-name'], [data-testid*='organizer']");
    return {
      description: desc?.textContent?.trim()?.substring(0, 5000) || "",
      category: cat?.textContent?.trim() || "",
      tags: tags.join("; "),
      organizer: org?.textContent?.trim() || "",
    };
  });

  if (!event.description && domData.description) {
    event.description = domData.description.replace(/\n/g, " ").trim();
  }
  if (!event.category) event.category = domData.category;
  if (!event.tags) event.tags = domData.tags;
  if (!event.organizer && domData.organizer) event.organizer = domData.organizer;

  return event;
}

async function enrichAndSave(browser, page, stubs) {
  ensureCsvHeader();
  let saved = 0;
  let skippedCity = 0;
  let failed = 0;
  let currentBrowser = browser;
  let currentPage = page;

  for (let i = 0; i < stubs.length; i++) {
    const stub = stubs[i];
    process.stdout.write(`  [${i + 1}/${stubs.length}] ${stub.title.substring(0, 60)}...`);

    let event = null;
    try {
      event = await scrapeDetailPage(currentPage, stub);
      console.log(" OK");
    } catch (err) {
      const isDisconnect = err.message.includes("detached") ||
        err.message.includes("Connection closed") ||
        err.message.includes("Target closed") ||
        err.message.includes("Protocol error");

      if (isDisconnect) {
        console.log(" browser disconnected, relaunching...");
        try { await currentBrowser.close(); } catch {}
        currentBrowser = await launchBrowser();
        currentPage = await createStealthPage(currentBrowser);
        try {
          event = await scrapeDetailPage(currentPage, stub);
          console.log(`  [${i + 1}/${stubs.length}] ${stub.title.substring(0, 60)}... OK (recovered)`);
        } catch (retryErr) {
          console.log(`  [${i + 1}/${stubs.length}] ${stub.title.substring(0, 60)}... FAILED: ${retryErr.message}`);
          failed++;
        }
      } else {
        console.log(` FAILED: ${err.message}`);
        failed++;
      }
    }

    if (event) {
      const city = (event.city || "").toLowerCase().split(",")[0].trim();
      if (city && ALLOWED_CITIES.has(city)) {
        appendEventToCsv(event);
        saved++;
      } else {
        console.log(`    Skipped (city: "${event.city || "unknown"}")`);
        skippedCity++;
      }
    }

    await randomDelay(1500, 1000);
  }

  try { await currentBrowser.close(); } catch {}
  return { saved, skippedCity, failed };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const existingIds = loadExistingIds(OUTPUT_FILE, COLUMNS, "eventId");
  if (existingIds.size > 0) {
    console.log(`Existing CSV has ${existingIds.size} events, will skip duplicates.\n`);
  }

  let stubs;
  let browser;
  let page;

  // Check for saved stubs from a previous interrupted run
  const saved = loadStubs();
  if (saved) {
    // Filter out events already in the CSV (enriched in a previous partial Phase 2)
    stubs = saved.stubs.filter((s) => !existingIds.has(s.eventId));
    const alreadyDone = saved.stubs.length - stubs.length;
    console.log(`Resuming from saved stubs: ${saved.stubs.length} total, ${alreadyDone} already enriched, ${stubs.length} remaining.`);

    if (stubs.length === 0) {
      console.log("All stubs already enriched. Cleaning up and exiting.");
      deleteStubs();
      return;
    }

    // Check if there are more regions to scrape
    const completedRegions = saved.completedRegions || [];
    const allRegionsDone = completedRegions.length >= SEARCH_REGIONS.length;

    if (!allRegionsDone) {
      console.log(`\nPhase 1 was incomplete (${completedRegions.length}/${SEARCH_REGIONS.length} regions). Continuing listing collection...\n`);
      browser = await launchBrowser();
      page = await createStealthPage(browser);
      // Pass existing stubs' IDs + CSV IDs to avoid re-collecting
      const allKnownIds = new Set([...existingIds, ...saved.stubs.map((s) => s.eventId)]);
      const moreStubs = await scrapeAllListings(page, allKnownIds, completedRegions);
      stubs = [...stubs, ...moreStubs];
      console.log(`\nTotal stubs to enrich: ${stubs.length}`);
    } else {
      browser = await launchBrowser();
      page = await createStealthPage(browser);
    }
  } else {
    // Fresh run — Phase 1 from scratch
    browser = await launchBrowser();
    page = await createStealthPage(browser);

    console.log("Phase 1: Collecting event listings...\n");
    stubs = await scrapeAllListings(page, existingIds);
    console.log(`\nFound ${stubs.length} new events to scrape.`);

    if (stubs.length === 0) {
      await browser.close();
      console.log("No new events to process.");
      return;
    }
  }

  console.log(`\nPhase 2: Fetching event details (${stubs.length} events)...\n`);
  const result = await enrichAndSave(browser, page, stubs);

  // All done — clean up stubs file
  deleteStubs();

  const total = existingIds.size + result.saved;
  console.log(`\nDone! Saved ${result.saved} new events (${result.skippedCity} skipped by city, ${result.failed} failed). Total: ${total} in CSV.`);
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  // Don't delete stubs — next run will resume
  process.exit(1);
});
