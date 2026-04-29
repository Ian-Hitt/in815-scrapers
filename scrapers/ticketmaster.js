import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "ticketmaster.csv");

const API_KEY = process.env.TICKETMASTER_API_KEY;
if (!API_KEY) {
  console.error("Missing TICKETMASTER_API_KEY environment variable.");
  console.error("Get a free key at https://developer.ticketmaster.com/");
  process.exit(1);
}

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

// Same allowed cities as Eventbrite scraper
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

// Search regions to cover all allowed cities
const SEARCH_REGIONS = [
  { lat: 42.2711, lon: -89.094, radius: 50, label: "Rockford" },
  { lat: 41.525, lon: -88.082, radius: 30, label: "Joliet" },
  { lat: 41.934, lon: -88.751, radius: 30, label: "DeKalb" },
];

const COLUMNS = [
  "sourceId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "country", "organizer", "price", "isOnline", "tags",
  "imageUrl", "externalUrl", "latitude", "longitude",
];

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Bad JSON: ${data.slice(0, 200)}`)); }
      });
    }).on("error", reject);
  });
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function formatTime(localTime) {
  if (!localTime) return "";
  const [h, m] = localTime.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${ampm}`;
}

function getBestImage(images) {
  if (!images || !images.length) return "";
  // Prefer 16:9 ratio, largest width, non-fallback
  const sorted = [...images].sort((a, b) => {
    if (a.fallback !== b.fallback) return a.fallback ? 1 : -1;
    const ratioScore = (img) => img.ratio === "16_9" ? 2 : img.ratio === "3_2" ? 1 : 0;
    const rDiff = ratioScore(b) - ratioScore(a);
    if (rDiff !== 0) return rDiff;
    return (b.width || 0) - (a.width || 0);
  });
  return sorted[0].url || "";
}

function formatPrice(priceRanges) {
  if (!priceRanges || !priceRanges.length) return "";
  const range = priceRanges[0];
  if (range.min === 0 && range.max === 0) return "Free";
  if (range.min === range.max) return `$${range.min}`;
  if (range.min != null && range.max != null) return `$${range.min} - $${range.max}`;
  if (range.min != null) return `$${range.min}`;
  return "";
}

function extractTags(classifications) {
  if (!classifications || !classifications.length) return "";
  const tags = new Set();
  for (const c of classifications) {
    if (c.segment?.name && c.segment.name !== "Undefined") tags.add(c.segment.name);
    if (c.genre?.name && c.genre.name !== "Undefined") tags.add(c.genre.name);
    if (c.subGenre?.name && c.subGenre.name !== "Undefined") tags.add(c.subGenre.name);
  }
  return [...tags].join("; ");
}

function parseEvent(ev) {
  const venue = ev._embedded?.venues?.[0];
  const startDate = ev.dates?.start?.localDate || "";
  const startTime = formatTime(ev.dates?.start?.localTime);
  const endDate = ev.dates?.end?.localDate || "";
  const endTime = formatTime(ev.dates?.end?.localTime);

  let organizer = "";
  if (ev._embedded?.attractions?.length) {
    organizer = ev._embedded.attractions[0].name || "";
  } else if (ev.promoter?.name) {
    organizer = ev.promoter.name;
  }

  const lat = venue?.location?.latitude;
  const lon = venue?.location?.longitude;

  return {
    sourceId: ev.id,
    title: ev.name || "",
    startDate,
    startTime,
    endDate,
    endTime,
    description: (ev.info || ev.pleaseNote || "").replace(/\n/g, " ").trim(),
    venue: venue?.name || "",
    address: venue?.address?.line1 || "",
    city: venue?.city?.name || "",
    state: venue?.state?.stateCode || "",
    zip: venue?.postalCode || "",
    country: "US",
    organizer,
    price: formatPrice(ev.priceRanges),
    isOnline: "no",
    tags: extractTags(ev.classifications),
    imageUrl: getBestImage(ev.images),
    externalUrl: ev.url || "",
    latitude: lat || "",
    longitude: lon || "",
  };
}

// ── API search ───────────────────────────────────────────────────────────────

async function searchRegion(region, startDate, endDate) {
  const events = [];
  // Deep paging limit: size × page < 1000 → max 5 pages of 200
  const maxPages = 5;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      apikey: API_KEY,
      latlong: `${region.lat},${region.lon}`,
      radius: String(region.radius),
      unit: "miles",
      startDateTime: `${startDate}T00:00:00Z`,
      endDateTime: `${endDate}T23:59:59Z`,
      size: "200",
      page: String(page),
      sort: "date,asc",
      countryCode: "US",
      includeTBA: "no",
      includeTBD: "no",
    });

    const url = `${BASE_URL}/events.json?${params}`;
    process.stdout.write(`  ${region.label} page ${page + 1}...`);

    let data;
    try {
      data = await fetchJson(url);
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      break;
    }

    if (data.fault) {
      console.log(` API error: ${data.fault.faultstring || JSON.stringify(data.fault)}`);
      break;
    }

    if (data.errors) {
      console.log(` API error: ${data.errors.map((e) => e.detail).join("; ")}`);
      break;
    }

    const pageEvents = data._embedded?.events || [];
    console.log(` ${pageEvents.length} events`);
    events.push(...pageEvents);

    const totalPages = data.page?.totalPages || 0;
    if (page + 1 >= totalPages) break;

    await delay(250); // Stay under 5 req/sec rate limit
  }

  return events;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Ticketmaster Discovery API Scraper");
  console.log("===================================\n");

  const today = new Date();
  const startDate = today.toISOString().split("T")[0];
  const endMs = today.getTime() + 180 * 24 * 60 * 60 * 1000;
  const endDate = new Date(endMs).toISOString().split("T")[0];

  console.log(`Date range: ${startDate} → ${endDate}\n`);

  const seenIds = new Set();
  const allEvents = [];

  for (const region of SEARCH_REGIONS) {
    console.log(`\nSearching: ${region.label} (${region.radius}mi radius)`);
    const raw = await searchRegion(region, startDate, endDate);

    let regionNew = 0;
    for (const ev of raw) {
      if (seenIds.has(ev.id)) continue;

      // Skip cancelled / postponed / rescheduled
      const status = ev.dates?.status?.code;
      if (status === "cancelled" || status === "postponed") continue;

      seenIds.add(ev.id);
      const parsed = parseEvent(ev);

      // Filter by allowed cities
      const cityLower = parsed.city.toLowerCase().trim();
      if (!cityLower || !ALLOWED_CITIES.has(cityLower)) continue;

      allEvents.push(parsed);
      regionNew++;
    }

    console.log(`  ${region.label}: ${regionNew} events in allowed cities`);
    await delay(500);
  }

  console.log(`\nTotal: ${allEvents.length} events across all regions\n`);

  const rows = allEvents.map((ev) =>
    COLUMNS.map((col) => escapeCsv(ev[col])).join(",")
  );
  const csv = [COLUMNS.join(","), ...rows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(`Done! ${allEvents.length} events written to data/ticketmaster.csv`);
}

main().catch(console.error);
