import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, loadExistingRowsById, decodeHtmlEntities, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "gorockford.csv");

const HOSTNAME = "www.gorockford.com";
const BASE_URL = "https://www.gorockford.com";

// SimpleView account TZ — gorockford's API rejects date_range inputs that
// aren't at 00:00 in this zone (discovered by probing: Chicago/UTC both fail,
// New_York succeeds). Keep aligned with whatever the tenant is configured for.
const ACCOUNT_TZ = "America/New_York";

const COLUMNS = [
  "recid", "title", "link", "startDate", "startTime", "endDate", "endTime",
  "description", "imageUrl", "location", "address", "city", "state", "zip",
  "latitude", "longitude", "price", "externalUrl",
  "recurring", "recurrenceFrequency", "recurrenceEndDate",
];

class MaxSizeError extends Error {}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: HOSTNAME, path: urlPath, headers: { "user-agent": "Mozilla/5.0" } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch {
            if (raw.includes("Max size of result set"))
              reject(new MaxSizeError(raw.slice(0, 200)));
            else
              reject(new Error(`Bad JSON (${res.statusCode}): ${raw.slice(0, 200)}`));
          }
        });
      }
    ).on("error", reject);
  });
}

function getText(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: HOSTNAME, path: urlPath, headers: { "user-agent": "Mozilla/5.0" } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => resolve(raw.trim()));
      }
    ).on("error", reject);
  });
}

function fetchMetaDescription(url) {
  return new Promise((resolve) => {
    const { hostname, pathname } = new URL(url);
    const req = https.request(
      { hostname, path: pathname, method: "GET", headers: { "user-agent": "Mozilla/5.0" } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          const m = raw.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
            || raw.match(/<meta\s+content="([^"]+)"\s+name="description"/i);
          resolve(m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim() : null);
        });
      }
    );
    req.on("error", () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function getToken() {
  const raw = await getText("/plugins/core/get_simple_token/");
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    return parsed?.data?.token || parsed?.token || null;
  }
  return raw || null;
}

// Returns an ISO string for midnight in ACCOUNT_TZ on the given date offset.
function accountMidnightISO(daysFromNow = 0) {
  const base = new Date();
  base.setDate(base.getDate() + daysFromNow);
  const dateStr = base.toLocaleDateString("en-CA", { timeZone: ACCOUNT_TZ });
  const midnightUTC = new Date(dateStr + "T00:00:00.000Z");
  const utc = new Date(midnightUTC.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(midnightUTC.toLocaleString("en-US", { timeZone: ACCOUNT_TZ }));
  const offsetMs = utc - local;
  return new Date(midnightUTC.getTime() + offsetMs).toISOString();
}

// Returns YYYY-MM-DD in ACCOUNT_TZ for a given ISO UTC string.
function accountDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: ACCOUNT_TZ });
}

// "17:00:00" → "5:00 PM"
function formatTime(timeStr) {
  if (!timeStr) return "";
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = parseInt(match[1], 10);
  const min = match[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${min} ${ampm}`;
}

function cleanText(str) {
  if (!str) return "";
  const noTags = String(str).replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(noTags).replace(/\s+/g, " ").trim();
}

function parseRecurrence(ev) {
  const raw = (ev.recurrence || "").trim();
  if (!raw || !raw.toLowerCase().startsWith("recurring")) {
    return { recurring: "no", recurrenceFrequency: "", recurrenceEndDate: "" };
  }
  const freq = raw.replace(/^Recurring\s+/i, "").trim();
  const endDate = accountDate(ev.endDate);
  return { recurring: "yes", recurrenceFrequency: freq, recurrenceEndDate: endDate };
}

async function fetchPage(token, startISO, endISO, skip, limit = 50) {
  // The API returns one row per *occurrence* of a recurring event. A
  // date_range wider than ~30 days (or limit > 50) blows past a server-side
  // 200k result-set cap because of pre-page recurrence expansion. So we
  // window month-by-month and dedup by recid on our side.
  const jsonParam = JSON.stringify({
    filter: {
      active: true,
      date_range: {
        start: { $date: startISO },
        end: { $date: endISO },
      },
    },
    options: {
      limit,
      skip,
      count: true,
      castDocs: false,
      sort: { date: 1, startTime: 1, rank: 1, title_sort: 1 },
    },
  });

  const apiPath =
    `/includes/rest_v2/plugins_events_events_by_date/find/` +
    `?json=${encodeURIComponent(jsonParam)}&token=${token}`;

  return getJson(apiPath);
}

function buildEventLink(ev) {
  const slug = (ev.title_sort || ev.title || "")
    .toLowerCase()
    .replace(/&[^;]+;/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${BASE_URL}/event/${slug}/${ev.recid}/`;
}

function mapEvent(ev) {
  const imageUrl =
    Array.isArray(ev.media_raw) && ev.media_raw.length > 0
      ? ev.media_raw[0].mediaurl || ""
      : Array.isArray(ev._media) && ev._media.length > 0
      ? ev._media[0].mediaurl || ""
      : "";

  const coords = ev.loc?.coordinates || [];
  const latitude = coords[1] != null ? String(coords[1]) : "";
  const longitude = coords[0] != null ? String(coords[0]) : "";

  const startDate = accountDate(ev.startDate || ev.date);
  const endDate = accountDate(ev.endDate);

  const recur = parseRecurrence(ev);

  const address = ev.address1 || "";
  const venue = cleanText(ev.hostname) || cleanText(ev.location) || address;

  return {
    recid: String(ev.recid || ev._id || ""),
    title: cleanText(ev.title),
    link: buildEventLink(ev),
    startDate,
    startTime: formatTime(ev.startTime),
    endDate,
    endTime: formatTime(ev.endTime),
    description: cleanText(ev.description),
    imageUrl,
    location: venue,
    address,
    city: ev.city || "",
    state: ev.state || "",
    zip: ev.zip || "",
    latitude,
    longitude,
    price: cleanText(ev.admission),
    externalUrl: ev.linkUrl || "",
    recurring: recur.recurring,
    recurrenceFrequency: recur.recurrenceFrequency,
    recurrenceEndDate: recur.recurrenceEndDate,
  };
}

async function main() {
  const existingRowMap = loadExistingRowsById(OUTPUT_FILE, COLUMNS, "recid");
  if (existingRowMap.size > 0) {
    console.log(`Existing CSV has ${existingRowMap.size} events, will upsert.\n`);
  }

  console.log("Fetching API token...");
  const token = await getToken();
  if (!token) throw new Error("Could not acquire API token");
  console.log("Token acquired.\n");

  // 12 rolling 30-day windows covering ~1 year ahead.
  const windows = [];
  for (let i = 0; i < 12; i++) {
    windows.push({ start: accountMidnightISO(i * 30), end: accountMidnightISO((i + 1) * 30) });
  }

  const limit = 50;
  const byRecid = new Map();
  let totalFetched = 0;

  // Fetch all pages for one date window. If the window is too large for the
  // API's 200k result-set cap, split it in half and recurse.
  async function processWindow(startISO, endISO) {
    const winLabel = `${startISO.slice(0, 10)}…${endISO.slice(0, 10)}`;
    let skip = 0;
    let total = Infinity;
    try {
      while (skip < total) {
        process.stdout.write(`[${winLabel}] ${skip + 1}-${total === Infinity ? "?" : Math.min(skip + limit, total)}...`);
        const result = await fetchPage(token, startISO, endISO, skip, limit);
        const inner = result?.docs;
        const docs = Array.isArray(inner?.docs) ? inner.docs : Array.isArray(inner) ? inner : [];
        const count = inner?.count ?? inner?.total;
        if (count !== undefined && total === Infinity) total = count;

        let added = 0;
        for (const ev of docs) {
          const recid = String(ev.recid || ev._id || "");
          if (!recid) continue;
          const sd = accountDate(ev.startDate || ev.date);
          const existing = byRecid.get(recid);
          // Keep the earliest-dated occurrence as the canonical row.
          if (!existing || (sd && accountDate(existing.startDate || existing.date) > sd)) {
            if (!existing) added++;
            byRecid.set(recid, ev);
          }
        }
        totalFetched += docs.length;
        console.log(` got ${docs.length} (+${added} new, win total: ${total === Infinity ? "?" : total})`);
        skip += limit;
        if (docs.length < limit) break;
      }
    } catch (err) {
      if (err instanceof MaxSizeError) {
        const midMs = (new Date(startISO).getTime() + new Date(endISO).getTime()) / 2;
        // Snap to midnight in ACCOUNT_TZ — the API rejects non-00:00 dates.
        const midDate = new Date(midMs).toLocaleDateString("en-CA", { timeZone: ACCOUNT_TZ });
        const midMidnightUTC = new Date(midDate + "T00:00:00.000Z");
        const utc = new Date(midMidnightUTC.toLocaleString("en-US", { timeZone: "UTC" }));
        const local = new Date(midMidnightUTC.toLocaleString("en-US", { timeZone: ACCOUNT_TZ }));
        const midISO = new Date(midMidnightUTC.getTime() + (utc - local)).toISOString();
        console.log(`\n[${winLabel}] result-set too large, splitting at ${midISO.slice(0, 10)}`);
        await processWindow(startISO, midISO);
        await processWindow(midISO, endISO);
      } else {
        throw err;
      }
    }
  }

  for (const win of windows) {
    await processWindow(win.start, win.end);
  }

  // Filter to upcoming (today or later) only. Multi-day events whose end_date
  // is still ahead are considered upcoming even if they started earlier.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: ACCOUNT_TZ });
  const upcoming = [...byRecid.values()].filter((ev) => {
    const sd = accountDate(ev.startDate || ev.date);
    const ed = accountDate(ev.endDate);
    return (sd && sd >= today) || (ed && ed >= today);
  });

  console.log(`\n${totalFetched} total occurrences fetched, ${byRecid.size} unique events, ${upcoming.length} upcoming.`);

  let added = 0, updated = 0;
  let descFetched = 0;

  for (let i = 0; i < upcoming.length; i++) {
    const ev = upcoming[i];
    const recid = String(ev.recid || ev._id || "");
    const mapped = mapEvent(ev);
    if (!mapped.startDate) continue;

    if (!mapped.description || mapped.description.endsWith("...")) {
      process.stdout.write(`  [${i + 1}/${upcoming.length}] Fetching description for: ${mapped.title}...`);
      const full = await fetchMetaDescription(mapped.link);
      if (full && full.length > (mapped.description || "").length) {
        mapped.description = full;
        process.stdout.write(" OK\n");
      } else {
        process.stdout.write(" (none)\n");
      }
      descFetched++;
      if (descFetched % 5 === 0) await delay(200);
    }

    const row = COLUMNS.map((col) => escapeCsv(mapped[col])).join(",");
    const isNew = !existingRowMap.has(recid);
    existingRowMap.set(recid, row);
    if (isNew) added++; else updated++;
  }

  const allRows = [...existingRowMap.values()];
  const csv = [COLUMNS.join(","), ...allRows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(
    `Done! ${added} new, ${updated} updated. Total: ${allRows.length} events in data/gorockford.csv`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
