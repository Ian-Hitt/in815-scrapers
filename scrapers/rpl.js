import puppeteer from "puppeteer";
import https from "https";
import http from "http";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, delay, decodeHtmlEntities } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "rpl.csv");

const EVENTS_URL = "https://services.rockfordpubliclibrary.org/events?r=range";
const MONTHS_TO_SCRAPE = 12;

const COLUMNS = [
  "title", "eventId", "link", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "imageUrl", "tags",
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (url, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      const mod = url.startsWith("https") ? https : http;
      mod.get(url, { headers: { "User-Agent": "RPL-Scraper/1.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }).on("error", reject);
    };
    get(url);
  });
}

function extractEventId(link) {
  const match = link?.match(/\/event\/(\d+)/);
  return match ? match[1] : null;
}

function parseJsonLd(html) {
  const match = html.match(/<script\s+type=['"]application\/ld\+json['"]>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    return JSON.parse(decodeHtmlEntities(match[1]));
  } catch {
    return null;
  }
}

function parseDateTime(isoStr) {
  if (!isoStr) return { date: null, time: null };
  const match = isoStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return { date: isoStr, time: null };
  const [, date, h, m] = match;
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { date, time: `${h12}:${m} ${ampm}` };
}

function extractTags(html) {
  const tags = [];
  for (const m of html.matchAll(/href="\/events\?[^"]*t=([^"&]+)"/gi)) {
    const tag = decodeURIComponent(m[1]).trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  for (const m of html.matchAll(/href="\/events\?[^"]*a=([^"&]+)"/gi)) {
    const tag = decodeURIComponent(m[1]).trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.join("; ");
}

function extractVenueFromPage(html) {
  const addressMatch = html.match(
    /(\d+\s+[\w\s.]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Boulevard|Blvd|Lane|Ln|Way|Place|Pl|Court|Ct)[^,]*),\s*([\w\s]+),\s*([A-Z]{2})\s+(\d{5})/i
  );
  if (addressMatch) {
    return {
      address: addressMatch[1].trim(),
      city: addressMatch[2].trim(),
      state: addressMatch[3].trim(),
      zip: addressMatch[4].trim(),
    };
  }
  return null;
}

function loadExistingRowMap() {
  if (!existsSync(OUTPUT_FILE)) return new Map();
  const content = readFileSync(OUTPUT_FILE, "utf-8");
  const map = new Map();
  const lines = content.split("\n").slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^[^,]*,(\d+)/);
    if (match) map.set(match[1], line);
  }
  return map;
}

async function enrichEvent(event) {
  try {
    const html = await fetchUrl(event.link);
    const jsonLd = parseJsonLd(html);

    if (jsonLd) {
      const start = parseDateTime(jsonLd.startDate);
      const end = parseDateTime(jsonLd.endDate);
      event.startDate = start.date;
      event.startTime = start.time;
      event.endDate = end.date;
      event.endTime = end.time;
      event.description = jsonLd.description || event.description || "";
      event.imageUrl = jsonLd.image || "";

      const loc = jsonLd.location;
      if (loc) {
        event.venue = loc.name || "";
        const addr = loc.address;
        if (addr && typeof addr === "object") {
          event.address = addr.streetAddress || "";
          event.city = addr.addressLocality || "";
          event.state = addr.addressRegion || "";
          event.zip = addr.postalCode || "";
        }
      }
    }

    if (!event.address || event.address.toLowerCase().includes("see event description")) {
      const extracted = extractVenueFromPage(html);
      if (extracted) {
        event.address = extracted.address;
        event.city = event.city || extracted.city;
        event.state = event.state || extracted.state;
        event.zip = event.zip || extracted.zip;
      }
    }

    event.tags = extractTags(html);
  } catch (err) {
    console.log(`    Warning: Could not enrich ${event.eventId}: ${err.message}`);
  }

  return event;
}

async function waitForEvents(page) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('a[href*="/event/"]').length > 0,
      { timeout: 10000 }
    );
  } catch {
    // May be a month with no events
  }
  await delay(1000);
}

async function extractEventsFromPage(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const links = document.querySelectorAll('a[href*="/event/"]');
    for (const link of links) {
      const href = link.href || "";
      const match = href.match(/\/event\/(\d+)/);
      const title = link.textContent.trim();
      if (match && !seen.has(match[1]) && !/private/i.test(title)) {
        seen.add(match[1]);
        results.push({ title, link: href, eventId: match[1] });
      }
    }
    return results;
  });
}

function getMonthUrl(monthOffset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  const months = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  return {
    url: `${EVENTS_URL}&start=${startStr}&end=${endStr}`,
    label: `${months[start.getMonth()]} ${start.getFullYear()}`,
  };
}

async function scrapeAllMonths(page) {
  const allEvents = new Map();

  for (let month = 0; month < MONTHS_TO_SCRAPE; month++) {
    const { url, label } = getMonthUrl(month);
    console.log(`\n  ${label}: loading...`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await delay(3000);
    await waitForEvents(page);

    const events = await extractEventsFromPage(page);
    const newCount = events.filter((e) => !allEvents.has(e.eventId)).length;
    console.log(`  ${label}: ${events.length} events (${newCount} new)`);

    for (const event of events) {
      if (!allEvents.has(event.eventId)) {
        allEvents.set(event.eventId, event);
      }
    }

    let hasMore = true;
    while (hasMore) {
      const clicked = await page.evaluate(() => {
        const links = document.querySelectorAll("a");
        for (const a of links) {
          if (a.textContent.trim() === "Next week") { a.click(); return true; }
        }
        return false;
      });

      if (!clicked) {
        hasMore = false;
      } else {
        await delay(2000);
        await waitForEvents(page);

        const moreEvents = await extractEventsFromPage(page);
        const moreNew = moreEvents.filter((e) => !allEvents.has(e.eventId)).length;
        if (moreNew === 0) {
          hasMore = false;
        } else {
          console.log(`    +${moreNew} more events`);
          for (const event of moreEvents) {
            if (!allEvents.has(event.eventId)) {
              allEvents.set(event.eventId, event);
            }
          }
        }
      }
    }
  }

  return allEvents;
}

function saveEvents(rowMap) {
  const allRows = [...rowMap.values()];
  const csv = [COLUMNS.join(","), ...allRows].join("\n") + "\n";
  writeFileSync(OUTPUT_FILE, csv);
  return allRows.length;
}

async function main() {
  console.log("Rockford Public Library Event Scraper");
  console.log("======================================\n");

  const existingRowMap = loadExistingRowMap();
  console.log(`Found ${existingRowMap.size} existing events in CSV\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  let allEvents;
  try {
    allEvents = await scrapeAllMonths(page);
  } finally {
    await browser.close();
  }

  console.log(`\nTotal unique events from page: ${allEvents.size}`);
  console.log(`Enriching all ${allEvents.size} events...\n`);

  const eventList = [...allEvents.values()];
  let added = 0, updated = 0;

  for (let i = 0; i < eventList.length; i++) {
    const event = eventList[i];
    console.log(`  [${i + 1}/${eventList.length}] ${event.title}`);
    await enrichEvent(event);

    const isNew = !existingRowMap.has(event.eventId);
    const row = COLUMNS.map((col) => escapeCsv(event[col])).join(",");
    existingRowMap.set(event.eventId, row);
    if (isNew) added++; else updated++;

    if ((i + 1) % 50 === 0) {
      const total = saveEvents(existingRowMap);
      console.log(`    (progress saved: ${total} total events in CSV)`);
    }

    await delay(500);
  }

  const total = saveEvents(existingRowMap);
  console.log(`\nDone! ${added} new, ${updated} updated. Total: ${total} events in data/rpl.csv`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
