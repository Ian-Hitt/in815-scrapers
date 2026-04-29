import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, decodeHtmlEntities, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "northsuburban.csv");

const BASE_URL = "https://northsuburban.librarycalendar.com";
const LISTING_PATH = "/events/upcoming";
const ORGANIZER = "North Suburban Library District";
const MAX_PAGES = 50;

// NSLD has two branches. When JSON-LD lacks a real location (e.g. multi-day
// Take & Make programs), the listing card's badge tells us which one — or
// "Both Libraries" / "Off Site" / "Virtual" for the non-branch cases.
const BRANCHES = {
  "NSLD/Loves Park": {
    venue: "NSLD/Loves Park",
    address: "6340 N. 2nd St",
    city: "Loves Park",
    state: "IL",
    zip: "61111",
    country: "US",
  },
  "NSLD/Roscoe": {
    venue: "NSLD/Roscoe",
    address: "5562 Clayton Cir",
    city: "Roscoe",
    state: "IL",
    zip: "61073",
    country: "US",
  },
  "Both Libraries": {
    venue: "NSLD (Both Libraries)",
    address: "6340 N. 2nd St",
    city: "Loves Park",
    state: "IL",
    zip: "61111",
    country: "US",
  },
};

const COLUMNS = [
  "sourceId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip", "country",
  "organizer", "price", "tags", "isOnline", "imageUrl", "externalUrl",
];

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchHtml(urlPath) {
  const fullUrl = urlPath.startsWith("http") ? urlPath : `${BASE_URL}${urlPath}`;
  return new Promise((resolve, reject) => {
    const doGet = (url, redirects = 0) => {
      if (redirects > 5) return reject(new Error("Too many redirects"));
      https.get(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 in815-scraper",
          accept: "text/html,application/xhtml+xml",
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http")
            ? res.headers.location
            : `${BASE_URL}${res.headers.location}`;
          return doGet(next, redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(raw));
      }).on("error", reject);
    };
    doGet(fullUrl);
  });
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

function extractListingEntries(html) {
  // Walk each event card (`<article ...>...</article>`) on a listing page,
  // capturing the detail href plus the branch badge rendered on the card.
  // The badge isn't present on the detail page, so we have to grab it here.
  const entries = new Map();
  for (const artMatch of html.matchAll(/<article\b[\s\S]*?<\/article>/gi)) {
    const card = artMatch[0];
    const hrefMatch = card.match(/href="(?:\/index\.php)?(\/event\/[a-z0-9][a-z0-9-]*-\d+)"/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const badgeMatch = card.match(/lc-event-info__item--categories"[^>]*>\s*([^<]+?)\s*</i);
    const branch = badgeMatch ? decodeHtmlEntities(badgeMatch[1]).trim() : "";
    if (!entries.has(href)) entries.set(href, branch);
  }
  return entries;
}

function extractEventId(href) {
  const m = href.match(/-(\d+)$/);
  return m ? m[1] : null;
}

function parseJsonLd(html) {
  const m = html.match(/<script\s+type=['"]application\/ld\+json['"]>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  try {
    return JSON.parse(decodeHtmlEntities(m[1]));
  } catch {
    return null;
  }
}

// Pull the HH:MM and timezone-local wall-clock time out of an ISO string like
// "2026-04-24T11:00:00-05:00". Using `new Date()` would convert to the host's
// timezone, which is wrong — the event's local time is what the library shows.
function parseLocalDateTime(iso) {
  if (!iso) return { date: "", time: "" };
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return { date: iso.slice(0, 10), time: "" };
  const [, date, h, min] = m;
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return { date, time: `${h12}:${min} ${ampm}` };
}

function stripHtml(html) {
  return decodeHtmlEntities(
    (html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
  ).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Extract a taxonomy value (e.g. Program Type, Age Group) by scanning the
// "lc-event-label" heading then grabbing the anchors that follow.
function extractTaxonomy(html, label) {
  const re = new RegExp(
    `class="lc-event-label[^"]*"[^>]*>\\s*${label}\\s*:?\\s*</h3>([\\s\\S]*?)</div>`,
    "i",
  );
  const m = html.match(re);
  if (!m) return [];
  const values = [];
  for (const a of m[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gi)) {
    const text = decodeHtmlEntities(a[1]).trim();
    if (text && !values.includes(text)) values.push(text);
  }
  return values;
}

function buildTags(programTypes, ageGroups) {
  const parts = [];
  for (const t of programTypes) parts.push(t.toLowerCase());
  for (const a of ageGroups) parts.push(`age: ${a.toLowerCase()}`);
  if (parts.length === 0) parts.push("library");
  return parts.join("; ");
}

// ── Event extraction ──────────────────────────────────────────────────────────

async function fetchEvent(href, branchBadge) {
  const url = `${BASE_URL}${href}`;
  const html = await fetchHtml(href);

  const ld = parseJsonLd(html);
  if (!ld) throw new Error("No JSON-LD on detail page");

  const start = parseLocalDateTime(ld.startDate);
  const end = parseLocalDateTime(ld.endDate);

  const loc = ld.location || {};
  const addr = loc.address || {};
  const jsonLdOnline = /OnlineEventAttendanceMode/i.test(ld.eventAttendanceMode || "");
  const isOnline = jsonLdOnline || branchBadge === "Virtual" ? "yes" : "no";

  // Detect the source's "no real location" pattern: location.name equals the
  // event title and the address has no street. Fall back to the branch badge
  // captured from the listing card; if that's "Off Site" or "Virtual" we have
  // no branch to fall back on, so leave the fields empty.
  const titleAsLocation = loc.name && loc.name.trim() === (ld.name || "").trim() && !addr.streetAddress;
  const branchFallback = BRANCHES[branchBadge] || null;
  const venueInfo = titleAsLocation && branchFallback
    ? branchFallback
    : titleAsLocation
    ? { venue: "", address: "", city: "", state: "", zip: "", country: "US" }
    : {
        venue: loc.name || "",
        address: addr.streetAddress || "",
        city: addr.addressLocality || "",
        state: addr.addressRegion || "",
        zip: addr.postalCode || "",
        country: addr.addressCountry || "US",
      };

  const programTypes = extractTaxonomy(html, "Program Type");
  const ageGroups = extractTaxonomy(html, "Age Group");

  return {
    sourceId: extractEventId(href),
    title: (ld.name || "").trim(),
    startDate: start.date,
    startTime: start.time,
    endDate: end.date || start.date,
    endTime: end.time,
    description: stripHtml(ld.description || ""),
    venue: venueInfo.venue,
    address: venueInfo.address,
    city: venueInfo.city,
    state: venueInfo.state,
    zip: venueInfo.zip,
    country: venueInfo.country,
    organizer: ld.organizer?.name || ORGANIZER,
    price: "Free",
    tags: buildTags(programTypes, ageGroups),
    isOnline,
    imageUrl: typeof ld.image === "string" ? ld.image : (ld.image?.url || ""),
    externalUrl: url,
  };
}

// ── Listing traversal ─────────────────────────────────────────────────────────

async function collectListingEntries() {
  // Returns a Map of href → branch badge ("NSLD/Loves Park", "NSLD/Roscoe",
  // "Both Libraries", "Off Site", "Virtual", or "" if none).
  const all = new Map();
  for (let page = 0; page < MAX_PAGES; page++) {
    const html = await fetchHtml(`${LISTING_PATH}?page=${page}`);
    const entries = extractListingEntries(html);
    console.log(`  page ${page}: ${entries.size} events`);
    if (entries.size === 0) break;
    const before = all.size;
    for (const [href, branch] of entries) {
      if (!all.has(href)) all.set(href, branch);
    }
    if (all.size === before) break; // only saw already-known events
    await delay(500);
  }
  return all;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("North Suburban Library District Event Scraper");
  console.log("=============================================\n");

  console.log("Collecting event links from listing...");
  const entries = await collectListingEntries();
  const hrefs = [...entries.keys()];
  console.log(`\nFound ${hrefs.length} unique events.\n`);

  const today = new Date().toISOString().slice(0, 10);
  const events = [];
  for (let i = 0; i < hrefs.length; i++) {
    const href = hrefs[i];
    try {
      const ev = await fetchEvent(href, entries.get(href));
      if (!ev.startDate) {
        console.log(`  [${i + 1}/${hrefs.length}] (no date) ${ev.title}`);
        continue;
      }
      if (ev.startDate < today) {
        console.log(`  [${i + 1}/${hrefs.length}] (past, skip) ${ev.title}`);
        continue;
      }
      console.log(`  [${i + 1}/${hrefs.length}] ${ev.startDate} — ${ev.title}`);
      events.push(ev);
    } catch (err) {
      console.log(`  [${i + 1}/${hrefs.length}] WARN ${href}: ${err.message}`);
    }
    await delay(300);
  }

  events.sort((a, b) => (a.startDate + a.startTime).localeCompare(b.startDate + b.startTime));

  const header = COLUMNS.join(",");
  const body = events.map((ev) => COLUMNS.map((c) => escapeCsv(ev[c])).join(",")).join("\n");
  writeFileSync(OUTPUT_FILE, header + "\n" + body + "\n");

  console.log(`\nDone. Wrote ${events.length} events to data/northsuburban.csv`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
