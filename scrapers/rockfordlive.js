import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, loadExistingRowsById } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "rockfordlive.csv");

const HOSTNAME = "rockfordlive.com";
const BASE_URL = "https://rockfordlive.com";
const CALENDAR_IDS = ["1", "2", "3", "4"];

const COLUMNS = [
  "recid", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "latitude", "longitude", "category", "tags", "price",
  "imageUrl", "externalUrl", "url",
];

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(
      { hostname: HOSTNAME, path: urlPath, headers: { "user-agent": "Mozilla/5.0" } },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error(`Bad JSON (${res.statusCode}): ${raw.slice(0, 200)}`)); }
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

async function getToken() {
  const raw = await getText("/plugins/core/get_simple_token/");
  // Response is either a plain token string or JSON
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    return parsed?.data?.token || parsed?.token || null;
  }
  return raw || null;
}

// Returns the UTC offset for America/Chicago in minutes (positive = behind UTC)
function chicagoOffsetMinutes(date) {
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const chi = new Date(date.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return (utc - chi) / 60000;
}

// Returns an ISO string representing midnight in Chicago timezone for the given date offset
function chicagoMidnightISO(daysFromNow = 0) {
  const base = new Date();
  base.setDate(base.getDate() + daysFromNow);
  const dateStr = base.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // "YYYY-MM-DD"
  const midnightUTC = new Date(dateStr + "T00:00:00.000Z");
  const offsetMs = chicagoOffsetMinutes(midnightUTC) * 60000;
  return new Date(midnightUTC.getTime() + offsetMs).toISOString();
}

async function fetchPage(token, skip, limit = 50) {

  const jsonParam = JSON.stringify({
    filter: {
      active: true,
      calendarid: { $in: CALENDAR_IDS },
      date_range: {
        start: { $date: chicagoMidnightISO(0) },
        end: { $date: chicagoMidnightISO(365 * 5) },
      },
    },
    options: {
      limit,
      skip,
      count: true,
      castDocs: false,
      fields: {
        _id: 1,
        recid: 1,
        title: 1,
        date: 1,
        startTime: 1,
        startDate: 1,
        endDate: 1,
        endTime: 1,
        location: 1,
        city: 1,
        region: 1,
        latitude: 1,
        longitude: 1,
        media_raw: 1,
        url: 1,
        categories: 1,
        linkUrl: 1,
        "custom.calendarname": 1,
        udfs_object: 1,
      },
      sort: { date: 1, startTime: 1, rank: 1, title_sort: 1 },
    },
  });

  const apiPath =
    `/includes/rest_v2/plugins_events_events_by_date/find/` +
    `?json=${encodeURIComponent(jsonParam)}&token=${token}`;

  return getJson(apiPath);
}

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

function mapEvent(ev) {
  const imageUrl =
    Array.isArray(ev.media_raw) && ev.media_raw.length > 0
      ? ev.media_raw[0].mediaurl || ""
      : "";

  const categories = Array.isArray(ev.categories) ? ev.categories : [];
  const category = categories[0]?.catName || "";
  const tags = categories.map((c) => c.catName).join("; ");

  const startDate = ev.startDate
    ? ev.startDate.split("T")[0]
    : ev.date
    ? ev.date.split("T")[0]
    : "";
  const endDate = ev.endDate ? ev.endDate.split("T")[0] : "";

  const venue =
    (ev.custom && ev.custom.calendarname) ||
    ev["custom.calendarname"] ||
    ev.location ||
    "";

  const eventUrl = ev.url
    ? ev.url.startsWith("http")
      ? ev.url
      : `${BASE_URL}${ev.url}`
    : `${BASE_URL}/events-tickets/`;

  return {
    recid: String(ev.recid || ev._id || ""),
    title: ev.title || "",
    startDate,
    startTime: formatTime(ev.startTime),
    endDate,
    endTime: formatTime(ev.endTime),
    description: "",
    venue,
    address: "",
    city: ev.city || "Rockford",
    state: ev.region || "IL",
    zip: "",
    latitude: ev.latitude || "",
    longitude: ev.longitude || "",
    category,
    tags,
    price: "",
    imageUrl,
    externalUrl: ev.linkUrl || "",
    url: eventUrl,
  };
}

async function main() {
  const existingRowMap = loadExistingRowsById(OUTPUT_FILE, COLUMNS, "recid");
  if (existingRowMap.size > 0) {
    console.log(`Existing CSV has ${existingRowMap.size} events, will upsert.\n`);
  }

  console.log("Fetching API token...");
  const token = await getToken();
  console.log("Token acquired.\n");

  const limit = 50;
  let skip = 0;
  let total = Infinity;
  const allEvents = [];

  while (skip < total) {
    process.stdout.write(`Fetching events ${skip + 1}–${Math.min(skip + limit, total === Infinity ? skip + limit : total)}...`);
    const result = await fetchPage(token, skip, limit);

    // Response shape: { docs: { count: N, docs: [...] } }
    const inner = result?.docs;
    const docs = Array.isArray(inner?.docs) ? inner.docs : Array.isArray(inner) ? inner : [];
    const count = inner?.count ?? inner?.total;
    if (count !== undefined && total === Infinity) total = count;

    console.log(` got ${docs.length} (total: ${total === Infinity ? "?" : total})`);
    allEvents.push(...docs);
    skip += limit;

    if (docs.length < limit) break;
  }

  console.log(`\n${allEvents.length} events fetched.`);

  let added = 0, updated = 0;

  for (const ev of allEvents) {
    const recid = String(ev.recid || ev._id || "");
    const mapped = mapEvent(ev);
    const row = COLUMNS.map((col) => escapeCsv(mapped[col])).join(",");
    const isNew = !existingRowMap.has(recid);
    existingRowMap.set(recid, row);
    if (isNew) added++; else updated++;
  }

  const allRows = [...existingRowMap.values()];
  const csv = [COLUMNS.join(","), ...allRows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(
    `Done! ${added} new, ${updated} updated. Total: ${allRows.length} events in data/rockfordlive.csv`
  );
}

main().catch(console.error);
