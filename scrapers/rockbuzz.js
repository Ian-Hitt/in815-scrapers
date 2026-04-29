import puppeteer from "puppeteer";
import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, loadExistingRowsById, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "rockbuzz.csv");

const BASE_URL = "https://rockbuzz.com";
const SUPABASE_STORAGE = "https://vnofwotiydfyzfefvces.supabase.co/storage/v1/object/public/page-media";

const COLUMNS = [
  "postId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "latitude", "longitude", "organizer", "tags", "price",
  "imageUrl", "externalUrl", "url",
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchHtml(urlPath) {
  return new Promise((resolve, reject) => {
    https.get(
      `${BASE_URL}${urlPath}`,
      { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" } },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(raw));
      }
    ).on("error", reject);
  });
}

// ── RSC payload parser ────────────────────────────────────────────────────────

/**
 * Extracts the `initialEvent` object from a Next.js RSC payload embedded in HTML.
 * The payload is stored as: self.__next_f.push([1, "ESCAPED_JSON_STRING"])
 */
function parseRscEvent(html) {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/gs;
  let m;
  while ((m = re.exec(html)) !== null) {
    let decoded;
    try {
      // The inner value is a JSON-escaped string — parse it to unescape
      decoded = JSON.parse('"' + m[1] + '"');
    } catch {
      continue;
    }
    if (!decoded.includes("initialEvent")) continue;

    // Find "initialEvent": followed by a JSON object
    const idx = decoded.indexOf('"initialEvent":');
    if (idx === -1) continue;

    const objStart = decoded.indexOf('{', idx);
    if (objStart === -1) continue;

    // Walk forward counting braces to find the end of the object
    let depth = 0;
    let i = objStart;
    for (; i < decoded.length; i++) {
      if (decoded[i] === '{') depth++;
      else if (decoded[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }

    try {
      return JSON.parse(decoded.slice(objStart, i + 1));
    } catch {
      return null;
    }
  }
  return null;
}

// ── Date / time helpers ───────────────────────────────────────────────────────

function formatDateTime(isoStr) {
  if (!isoStr) return { date: "", time: "" };
  // Dates come as "2026-03-31T00:00:00+00:00" (UTC)
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return { date: isoStr, time: "" };
  const date = d.toISOString().split("T")[0];
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Chicago",
  });
  return { date, time };
}

// ── Event mapper ─────────────────────────────────────────────────────────────

function mapEvent(ev) {
  const loc = ev.events_title_location || {};
  const tickets = ev.events_tickets || {};
  const contact = ev.events_contact || {};
  const times = ev.events_times || [];
  const categories = (ev.events_category_relations || [])
    .map((r) => r.events_categories?.name)
    .filter(Boolean);

  // Use the first occurrence's times
  const firstTime = times[0] || {};
  const start = formatDateTime(firstTime.event_start);
  const end = formatDateTime(firstTime.event_end);

  const organizer = ev.pages?.name || contact.contact_name || "";

  // Image: first media item or organizer logo
  let imageUrl = "";
  const media = ev.posts_media || [];
  if (media.length > 0) {
    imageUrl = `${SUPABASE_STORAGE}/${ev.page_id}/${media[0].media_path}`;
  }

  const price = tickets.price != null ? String(tickets.price) : "Free";

  return {
    postId: ev.post_id || "",
    title: loc.title || "",
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    description: ev.description || "",
    venue: loc.title || organizer,
    address: [loc.street, loc.street2].filter(Boolean).join(", "),
    city: (loc.city || "").trim(),
    state: loc.state || "IL",
    zip: loc.zipcode || "",
    latitude: loc.lat || "",
    longitude: loc.lon || "",
    organizer,
    tags: categories.join("; "),
    price,
    imageUrl,
    externalUrl: tickets.ticket_url || "",
    url: `${BASE_URL}/event/${ev.post_id}`,
  };
}

// ── Step 1: collect all event URLs via Puppeteer scroll ───────────────────────

async function collectEventUrls() {
  console.log("Launching browser to collect event URLs...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${BASE_URL}/events`, { waitUntil: "networkidle2", timeout: 30000 });
  await delay(2000);

  const getUrls = () =>
    page.evaluate(() =>
      [...new Set(
        Array.from(document.querySelectorAll('a[href^="/event/"]'))
          .map((a) => a.getAttribute("href"))
      )]
    );

  let urls = await getUrls();
  let prevCount = 0;

  while (true) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await delay(2500);
    urls = await getUrls();
    if (urls.length === prevCount) break;
    process.stdout.write(`\r  ${urls.length} events found`);
    prevCount = urls.length;
  }
  console.log(`\n  Done: ${urls.length} event URLs collected`);

  await browser.close();
  return urls;
}

// ── Step 2: fetch each event detail page ─────────────────────────────────────

async function fetchEventDetail(urlPath, index, total) {
  const html = await fetchHtml(urlPath);
  const ev = parseRscEvent(html);
  return ev;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const existingRowMap = loadExistingRowsById(OUTPUT_FILE, COLUMNS, "postId");
  if (existingRowMap.size > 0) {
    console.log(`Existing CSV has ${existingRowMap.size} events, will upsert.\n`);
  }

  const eventUrls = await collectEventUrls();

  console.log(`\n${eventUrls.length} event URLs to fetch\n`);

  const today = new Date().toISOString().split("T")[0];
  let added = 0, updated = 0, errors = 0;

  for (let i = 0; i < eventUrls.length; i++) {
    const urlPath = eventUrls[i];
    const postId = urlPath.replace("/event/", "");
    process.stdout.write(`  [${i + 1}/${eventUrls.length}] ${postId}...`);

    try {
      const ev = await fetchEventDetail(urlPath, i, eventUrls.length);
      if (!ev) {
        console.log(" SKIP (no data)");
        errors++;
        continue;
      }

      const mapped = mapEvent(ev);

      // Filter out past events
      if (mapped.startDate && mapped.startDate < today) {
        console.log(` SKIP (past: ${mapped.startDate})`);
        continue;
      }

      const row = COLUMNS.map((col) => escapeCsv(mapped[col])).join(",");
      const isNew = !existingRowMap.has(String(postId));
      existingRowMap.set(String(postId), row);
      if (isNew) added++; else updated++;
      console.log(`${isNew ? " OK" : " updated"} — ${mapped.title}`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      errors++;
    }

    if (i < eventUrls.length - 1) await delay(300);
  }

  const allRows = [...existingRowMap.values()];
  const csv = [COLUMNS.join(","), ...allRows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(
    `\nDone! ${added} new, ${updated} updated` +
    (errors ? ` (${errors} errors/skipped)` : "") +
    `. Total: ${allRows.length} events in data/rockbuzz.csv`
  );
}

main().catch(console.error);
