import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, loadExistingRowsById, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "hardrock.csv");

const BASE_URL = "https://casino.hardrock.com";
const LISTING_PATH = "/rockford/entertainment/hard-rock-live";
const VENUE = "Hard Rock Live";
const ADDRESS = "777 Hard Rock Blvd";
const CITY = "Rockford";
const STATE = "IL";
const ZIP = "61109";
const COUNTRY = "US";
const ORGANIZER = "Hard Rock Casino Rockford";
const IMAGE_BASE = "https://casino.hardrock.com";

const COLUMNS = [
  "eventId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip", "country",
  "organizer", "price", "tags", "isOnline", "imageUrl", "externalUrl", "url",
];

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchHtml(urlPath) {
  const fullUrl = urlPath.startsWith("http") ? urlPath : `${BASE_URL}${urlPath}`;
  return new Promise((resolve, reject) => {
    const doGet = (url) => {
      https.get(url, {
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doGet(res.headers.location.startsWith("http") ? res.headers.location : `${BASE_URL}${res.headers.location}`);
        }
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(raw));
      }).on("error", reject);
    };
    doGet(fullUrl);
  });
}

// ── Parsing helpers ────────────────────────────────────────────────────────────

function extractText(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1].replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "").trim() : "";
}

/**
 * Parse "Sunday, April 12 | Doors: 5PM" into { startDate, startTime }.
 * Year is inferred: if the month/day is in the past, use next year.
 */
function parseDateTimeStr(raw) {
  if (!raw) return { startDate: "", startTime: "" };
  const clean = raw.replace(/\s+/g, " ").trim();

  // Extract date part: "Sunday, April 12"
  const datePart = clean.split("|")[0].trim(); // "Sunday, April 12"
  const dateMatch = datePart.match(/([A-Za-z]+)\s+(\d+)/); // month day
  if (!dateMatch) return { startDate: "", startTime: "" };

  const monthName = dateMatch[1];
  const day = parseInt(dateMatch[2], 10);
  const months = { January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
                   July: 6, August: 7, September: 8, October: 9, November: 10, December: 11 };
  const monthIdx = months[monthName];
  if (monthIdx === undefined) return { startDate: "", startTime: "" };

  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, monthIdx, day);
  if (candidate < now) year += 1;

  const pad = (n) => String(n).padStart(2, "0");
  const startDate = `${year}-${pad(monthIdx + 1)}-${pad(day)}`;

  // Extract time part: "Doors: 5PM" or "Showtime: 7:30PM"
  const timeRaw = clean.split("|").slice(1).join("|");
  const timeMatch = timeRaw.match(/(\d{1,2}(?::\d{2})?)\s*(AM|PM)/i);
  let startTime = "";
  if (timeMatch) {
    const [, t, ampm] = timeMatch;
    const [h, min = "00"] = t.split(":");
    startTime = `${parseInt(h, 10)}:${min} ${ampm.toUpperCase()}`;
  }

  return { startDate, startTime };
}

// ── Event list parser ─────────────────────────────────────────────────────────

function parseListingPage(html) {
  const seen = new Set();
  const events = [];

  // Match each event card div — only cards with a non-empty title
  // Cards appear multiple times (template + rendered); deduplicate by data-id
  const cardRe = /<div class="ccard jsCard eventCard[^"]*"[^>]*data-id=([A-F0-9-]+)[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const eventId = m[1].toUpperCase();
    if (seen.has(eventId)) continue;

    const block = m[2];

    const title = extractText(block, /class="ccard--event__title truncate"[^>]*>([^<]+)</);
    if (!title || title.startsWith("$")) continue; // skip template placeholders

    seen.add(eventId);

    const timePlace = extractText(block, /class="ccard--event__time__wrap"[^>]*>([\s\S]*?)<\/div>/);
    const { startDate, startTime } = parseDateTimeStr(timePlace);

    const imageRel = block.match(/data-onethirdimage="([^"]+)"/)?.[1] || "";
    const imageUrl = imageRel ? `${IMAGE_BASE}${imageRel.split("?")[0]}` : "";

    const ticketUrl = block.match(/href="(https:\/\/www\.ticketmaster\.com\/event\/[^"]+)"/)?.[1] || "";
    const detailPath = block.match(/href="(\/rockford\/entertainment\/hard-rock-live\/[^"]+)"/)?.[1] || "";
    const category = extractText(block, /class="ccard--event__categories"[^>]*>([^<]+)</);

    events.push({ eventId, title, startDate, startTime, imageUrl, ticketUrl, detailPath, category });
  }

  return events;
}

// ── Detail page: get description ──────────────────────────────────────────────

function parseDetailPage(html) {
  // Extract main visible text content (strip tags, collapse whitespace)
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  if (!mainMatch) return "";

  // Remove script/style blocks
  const cleaned = mainMatch[1]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Get text between known description area markers
  // The description appears after the date/time block in the main content
  const descSection = cleaned.match(/class="event-detail--disclaimer[^>]*>([\s\S]*)/);
  const textBlock = descSection ? descSection[1] : cleaned;

  return textBlock
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const existingRowMap = loadExistingRowsById(OUTPUT_FILE, COLUMNS, "eventId");
  if (existingRowMap.size > 0) {
    console.log(`Existing CSV has ${existingRowMap.size} events, will upsert.\n`);
  }

  console.log("Fetching Hard Rock Live event listing...");
  const listingHtml = await fetchHtml(LISTING_PATH);
  const events = parseListingPage(listingHtml);
  console.log(`  Found ${events.length} events on listing page\n`);

  const today = new Date().toISOString().split("T")[0];
  let added = 0, updated = 0;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    process.stdout.write(`  [${i + 1}/${events.length}] ${ev.title}...`);

    if (ev.startDate && ev.startDate < today) {
      console.log(` SKIP (past: ${ev.startDate})`);
      continue;
    }

    let description = "";
    if (ev.detailPath) {
      try {
        const detailHtml = await fetchHtml(ev.detailPath);
        description = parseDetailPage(detailHtml);
      } catch (err) {
        console.log(` (detail fetch failed: ${err.message})`);
      }
      await delay(400);
    }

    const row = {
      eventId: ev.eventId,
      title: ev.title,
      startDate: ev.startDate,
      startTime: ev.startTime,
      endDate: "",
      endTime: "",
      description,
      venue: VENUE,
      address: ADDRESS,
      city: CITY,
      state: STATE,
      zip: ZIP,
      country: COUNTRY,
      organizer: ORGANIZER,
      price: "",
      tags: ev.category || "Live Entertainment",
      isOnline: "no",
      imageUrl: ev.imageUrl,
      externalUrl: ev.detailPath ? `${BASE_URL}${ev.detailPath}` : `${BASE_URL}${LISTING_PATH}`,
      url: ev.ticketUrl || (ev.detailPath ? `${BASE_URL}${ev.detailPath}` : `${BASE_URL}${LISTING_PATH}`),
    };

    const isNew = !existingRowMap.has(ev.eventId);
    existingRowMap.set(ev.eventId, COLUMNS.map((col) => escapeCsv(row[col])).join(","));
    if (isNew) added++; else updated++;
    console.log(isNew ? " OK" : " updated");
  }

  const allRows = [...existingRowMap.values()];
  const csv = [COLUMNS.join(","), ...allRows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(
    `\nDone! ${added} new, ${updated} updated. Total: ${allRows.length} events in data/hardrock.csv`
  );
}

main().catch(console.error);
