import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "boylan.csv");

const CALENDAR_ID = "boylan.org_9vbm7gkfkjpe168btjnd85m2j4%40group.calendar.google.com";
const ICAL_URL = `https://calendar.google.com/calendar/ical/${CALENDAR_ID}/public/basic.ics`;
const CALENDAR_URL = "https://boylan.org/athletics/athletics-events-calendar";
const HOME_ADDRESS = { address: "4000 Saint Francis Drive", city: "Rockford", state: "IL", zip: "61103" };

const COLUMNS = [
  "sourceId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "country", "organizer", "price", "isOnline", "tags", "imageUrl", "externalUrl",
];

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

/**
 * Unfold iCal line continuations (RFC 5545 §3.1).
 * A CRLF followed by a space/tab means the next line is a continuation.
 */
function unfoldLines(raw) {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/**
 * Parse the raw iCal text into an array of VEVENT property maps.
 */
function parseIcal(raw) {
  const lines = unfoldLines(raw).split(/\r\n|\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyWithParams = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1);
      const key = keyWithParams.split(";")[0];
      current[key] = value;
      // Preserve full key (with params) for DTSTART/DTEND to detect timezone/all-day
      if (key === "DTSTART" || key === "DTEND") {
        current[`${key}_RAW`] = keyWithParams;
      }
    }
  }

  return events;
}

/**
 * Parse an iCal date/time value into { date: "YYYY-MM-DD", time: "H:MM AM/PM" }.
 * Handles: all-day (YYYYMMDD), local datetime (YYYYMMDDTHHmmss), UTC (YYYYMMDDTHHmmssZ).
 */
function parseIcalDateTime(value) {
  if (!value) return { date: "", time: "" };

  // All-day event: YYYYMMDD
  if (/^\d{8}$/.test(value)) {
    return {
      date: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
      time: "",
    };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return { date: "", time: "" };

  const [, year, month, day, hh, mm, , isUtc] = match;

  if (isUtc) {
    // Convert UTC → America/Chicago
    const d = new Date(`${year}-${month}-${day}T${hh}:${mm}:00Z`);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "numeric", minute: "2-digit", hour12: true,
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map(({ type, value: v }) => [type, v]));
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}`,
    };
  }

  // Local time (TZID=America/Chicago or floating)
  const h = parseInt(hh, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return {
    date: `${year}-${month}-${day}`,
    time: `${h12}:${mm} ${ampm}`,
  };
}

/**
 * Decode iCal text escapes (\n → space, \, → ,, \; → ;, \\ → \).
 */
function decodeIcalText(value) {
  return (value || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Parse a LOCATION value into { venue, address, city, state, zip }.
 *
 * Boylan's calendar uses an internal format for home venues:
 *   "(ATH)-Boylan Catholic-Titan Stadium"
 * These become "Boylan Catholic High School: Titan Stadium" with the home address.
 *
 * Away events have no LOCATION field at all (caller passes empty string).
 */
function parseLocation(location, isAway) {
  // Away game: no address data available
  if (isAway) {
    return { venue: "", address: "", city: "", state: "", zip: "" };
  }

  // No location set: plain home event
  if (!location) {
    return { venue: "Boylan Catholic High School", ...HOME_ADDRESS };
  }

  // Internal Boylan format: "(ATH)-Boylan Catholic-Specific Venue"
  const athMatch = location.match(/^\(ATH\)-Boylan Catholic-(.+)$/);
  if (athMatch) {
    // Handle comma-separated multi-venue entries like "Field A\, Field B"
    const specific = athMatch[1].split(/,\s*|\\\,\s*/)[0].trim();
    return {
      venue: `Boylan Catholic High School: ${specific}`,
      ...HOME_ADDRESS,
    };
  }

  // Generic Boylan mention → home address, no specific sub-venue
  const lower = location.toLowerCase();
  if (lower.includes("boylan") || lower.includes("saint francis")) {
    return { venue: "Boylan Catholic High School", ...HOME_ADDRESS };
  }

  // Unknown location format — use as-is for venue, default to home city/state/zip
  return {
    venue: location,
    address: "",
    city: HOME_ADDRESS.city,
    state: HOME_ADDRESS.state,
    zip: HOME_ADDRESS.zip,
  };
}

async function main() {
  console.log("Boylan Catholic High School Athletics Scraper");
  console.log("=============================================\n");

  console.log("Fetching iCal feed...");
  const raw = await fetchUrl(ICAL_URL);
  const events = parseIcal(raw);
  console.log(`  ${events.length} total events in feed`);

  const today = new Date().toISOString().split("T")[0];
  const rows = [];
  let skipped = 0;

  for (const ev of events) {
    const start = parseIcalDateTime(ev.DTSTART || "");
    if (!start.date || start.date < today) {
      skipped++;
      continue;
    }

    const end = parseIcalDateTime(ev.DTEND || "");
    const title = decodeIcalText(ev.SUMMARY || "");
    if (!title) { skipped++; continue; }

    const description = decodeIcalText(ev.DESCRIPTION || "");
    const location = decodeIcalText(ev.LOCATION || "");
    const uid = ev.UID || `${start.date}-${title}`;

    // Away games are indicated by "@ Opponent" in the title and have no LOCATION field
    const isAway = / @ /i.test(title) && !location;
    const { venue, address, city, state, zip } = parseLocation(location, isAway);

    const row = {
      sourceId: uid,
      title,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
      description,
      venue,
      address,
      city,
      state,
      zip,
      country: "US",
      organizer: "Boylan Catholic High School",
      price: "Free",
      isOnline: "no",
      tags: "athletics; high school",
      imageUrl: "",
      externalUrl: ev.URL ? decodeIcalText(ev.URL) : CALENDAR_URL,
    };

    rows.push(COLUMNS.map((col) => escapeCsv(row[col])).join(","));
  }

  const csv = [COLUMNS.join(","), ...rows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);
  console.log(`\nDone! ${rows.length} upcoming events written to data/boylan.csv (${skipped} past/empty skipped)`);
}

main().catch(console.error);
