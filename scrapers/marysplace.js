/**
 * Mary's Place Bar scraper
 * Source: https://marysplacebar.com/calendar/
 * Method: Native HTTPS — parses the ai1ec (All-in-One Event Calendar) month grid HTML
 * Output: data/marysplace.csv
 */

import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "marysplace.csv");
const BASE_URL = "https://marysplacebar.com";
const CALENDAR_URL = `${BASE_URL}/calendar/action~month/`;

const HOME_ADDRESS = { address: "602 N Madison St", city: "Rockford", state: "IL", zip: "61107" };
const MONTHS_AHEAD = 3;

const COLUMNS = [
  "eventId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip", "country",
  "organizer", "price", "isOnline", "tags", "imageUrl", "externalUrl",
];

const AGENT = new https.Agent({ rejectUnauthorized: false });

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: AGENT, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => resolve(raw));
    }).on("error", reject);
  });
}

// Build a Unix timestamp for the first of a given month (local midnight)
function monthTimestamp(year, month) {
  return Math.floor(new Date(year, month, 1).getTime() / 1000);
}

// Parse the month/year from the calendar page navigation
function parseMonthYear(html) {
  const m = html.match(/data-date="(\d+)\/(\d+)\/(\d{4})"/);
  if (m) return { month: parseInt(m[1]) - 1, year: parseInt(m[3]) }; // 0-indexed month
  return null;
}

// Parse all events from the month grid HTML.
// Returns an array of { instanceId, title, startDate, startTime, url }
function parseMonthGrid(html, year, month) {
  const events = [];

  // Find all <td> cells — each represents a calendar day
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let cellMatch;

  while ((cellMatch = cellRe.exec(html)) !== null) {
    const cell = cellMatch[1];

    // Extract the day number from <div class="ai1ec-date"><a ...>DAY</a>
    const dayMatch = cell.match(/ai1ec-date[\s\S]*?<a[^>]*>(\d+)<\/a>/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1]);
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Extract all events in this cell
    const eventRe = /ai1ec-event-container[^"]*"[^>]*href="([^"]+)"[^>]*data-instance-id="(\d+)"[\s\S]*?ai1ec-event-title">\s*([\s\S]*?)\s*<\/span>(?:[\s\S]*?ai1ec-event-time">\s*([\s\S]*?)\s*<\/span>)?/g;
    let evMatch;
    while ((evMatch = eventRe.exec(cell)) !== null) {
      const url = evMatch[1].replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      const instanceId = evMatch[2];
      const title = evMatch[3].replace(/\s+/g, " ").trim();
      const rawTime = (evMatch[4] || "").replace(/\s+/g, " ").trim();

      events.push({ instanceId, title, startDate: dateStr, rawTime, url });
    }
  }

  return events;
}

// Normalize a time string like "7:00 pm" → "7:00 PM"
function normalizeTime(raw) {
  if (!raw) return "";
  const m = raw.match(/(\d+):?(\d{0,2})\s*(am|pm)/i);
  if (!m) return "";
  const h = m[1];
  const min = m[2] || "00";
  const ampm = m[3].toUpperCase();
  return `${h}:${min.padStart(2, "0")} ${ampm}`;
}

// Fetch an individual event page and extract og: tags
async function fetchEventDetails(url) {
  try {
    const html = await get(url);

    const og = (prop) => {
      const m = html.match(new RegExp(`property="${prop}"[^>]+content="([^"]+)"`));
      return m ? m[1] : "";
    };

    const rawDesc = og("og:description");
    // Format: "When:  March 13, 2026 @ 8:00 pm   Actual description here"
    const descClean = rawDesc
      .replace(/^When:\s+[A-Za-z]+ \d+, \d{4} @ [\d:]+ [apm]+\s*/i, "")
      .replace(/&#\d+;/g, (e) => { try { return String.fromCharCode(parseInt(e.slice(2,-1))); } catch { return ""; }})
      .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#8217;/g, "'").replace(/&#8211;/g, "–")
      .trim();

    // Try to extract end time from description "When: ... @ 8:00 pm - 10:00 pm"
    const timeRange = rawDesc.match(/@\s*(\d+:\d+\s*[apm]+)\s*[-–]\s*(\d+:\d+\s*[apm]+)/i);

    return {
      description: descClean,
      imageUrl: og("og:image"),
      endTime: timeRange ? normalizeTime(timeRange[2]) : "",
    };
  } catch {
    return { description: "", imageUrl: "", endTime: "" };
  }
}

async function scrapeMonth(year, month) {
  const ts = monthTimestamp(year, month);
  const url = `${CALENDAR_URL}exact_date~${ts}/`;
  console.log(`  Fetching ${year}-${String(month + 1).padStart(2, "0")} → ${url}`);
  const html = await get(url);
  return parseMonthGrid(html, year, month);
}

async function main() {
  console.log("Mary's Place Bar Scraper");
  console.log("========================\n");

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Collect events across current month + MONTHS_AHEAD
  const allEvents = [];
  const seenIds = new Set();

  for (let i = 0; i <= MONTHS_AHEAD; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const events = await scrapeMonth(d.getFullYear(), d.getMonth());
    for (const ev of events) {
      if (!seenIds.has(ev.instanceId)) {
        seenIds.add(ev.instanceId);
        allEvents.push(ev);
      }
    }
    await delay(500);
  }

  // Filter to upcoming only
  const upcoming = allEvents.filter((ev) => ev.startDate >= todayStr);
  console.log(`\n  ${allEvents.length} total events found, ${upcoming.length} upcoming`);

  // Fetch detail pages
  const rows = [];
  for (const ev of upcoming) {
    process.stdout.write(`  Fetching details: ${ev.title} (${ev.startDate})...`);
    const details = await fetchEventDetails(ev.url);
    process.stdout.write(" done\n");

    rows.push({
      eventId: ev.instanceId,
      title: ev.title,
      startDate: ev.startDate,
      startTime: normalizeTime(ev.rawTime),
      endDate: "",
      endTime: details.endTime,
      description: details.description,
      venue: "Mary's Place",
      address: HOME_ADDRESS.address,
      city: HOME_ADDRESS.city,
      state: HOME_ADDRESS.state,
      zip: HOME_ADDRESS.zip,
      country: "US",
      organizer: "Mary's Place Bar",
      price: "Free",
      isOnline: "no",
      tags: "live music; bar",
      imageUrl: details.imageUrl,
      externalUrl: ev.url,
    });

    await delay(300);
  }

  const csvRows = rows.map((r) => COLUMNS.map((col) => escapeCsv(r[col])).join(","));
  const csv = [COLUMNS.join(","), ...csvRows].join("\n") + "\n";
  writeFileSync(OUTPUT_FILE, csv);

  console.log(`\nDone! ${rows.length} events written to data/marysplace.csv`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
