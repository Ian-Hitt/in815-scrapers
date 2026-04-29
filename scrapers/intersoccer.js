import puppeteer from "puppeteer";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, delay } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCES = [
  {
    label: "Saturday",
    url: "https://www.intersoccerleague.com/saturday/schedule",
    outputFile: path.join(__dirname, "..", "data", "intersoccer-saturday.csv"),
  },
  {
    label: "Sunday",
    url: "https://www.intersoccerleague.com/sunday/schedule",
    outputFile: path.join(__dirname, "..", "data", "intersoccer-sunday.csv"),
  },
];

const COLUMNS = [
  "matchId", "title", "homeTeam", "awayTeam", "division",
  "startDate", "startTime", "endTime",
  "venue", "address", "city", "state", "zip", "country",
  "description", "organizer", "isOnline", "price", "tags",
  "externalUrl",
];

const DEFAULTS = {
  endTime: "90 minutes", // soccer games are ~90 min; no end time on schedule pages
  country: "US",
  organizer: "International Soccer League",
  isOnline: "no",
  price: "Free",
  tags: "soccer",
  externalUrl: "https://www.intersoccerleague.com",
};

const TODAY = new Date().toISOString().split("T")[0];

// Attempt to extract schedule data from __NEXT_DATA__ embedded JSON.
// Next.js apps often include initial page props here even for client-rendered pages.
function extractFromNextData(nextData) {
  // Walk the props tree looking for arrays that look like game/match records.
  // Common shapes: props.pageProps.games, props.pageProps.schedule, etc.
  const candidates = [];

  function walk(obj, depth = 0) {
    if (depth > 8 || !obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      if (obj.length > 0 && typeof obj[0] === "object" && obj[0] !== null) {
        // Check if this looks like a games array
        const keys = Object.keys(obj[0]);
        const looksLikeGame =
          keys.some((k) => /team|home|away|opponent/i.test(k)) ||
          keys.some((k) => /date|time|start/i.test(k));
        if (looksLikeGame) {
          candidates.push(obj);
          return;
        }
      }
      for (const item of obj) walk(item, depth + 1);
    } else {
      for (const val of Object.values(obj)) walk(val, depth + 1);
    }
  }

  walk(nextData);

  if (candidates.length === 0) return null;

  // Pick the largest candidate array
  const games = candidates.sort((a, b) => b.length - a.length)[0];
  console.log(`  Found ${games.length} records in __NEXT_DATA__`);
  console.log("  Sample record keys:", Object.keys(games[0]).join(", "));
  return games;
}

// Known venue addresses (InterSoccer games are primarily at MercyHealth Sportscore Two)
const VENUE_ADDRESSES = {
  "MERCYHEALTH SPORTSCORE 2": {
    address: "8800 E Riverside Blvd",
    city: "Loves Park",
    state: "IL",
    zip: "61111",
  },
};

function resolveVenueAddress(gameLocation) {
  if (!gameLocation) return {};
  const upper = gameLocation.toUpperCase();
  for (const [key, addr] of Object.entries(VENUE_ADDRESSES)) {
    if (upper.includes(key)) return addr;
  }
  return {};
}

// Convert HH:MM:SS to H:MM AM/PM
function formatTime(hhmm) {
  if (!hhmm) return "";
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return hhmm;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${min} ${ampm}`;
}

// Normalize a Supabase fixtures record into our column shape.
// Shape: { id, game_date, game_time, game_location, fixture_status,
//          home_team: { team_name }, away_team: { team_name },
//          leagues: { division, league_name, day_of_week } }
function normalizeRecord(raw, index) {
  const homeTeam = (raw.home_team?.team_name || "").trim();
  const awayTeam = (raw.away_team?.team_name || "").trim();
  const division = (raw.leagues?.division || "").trim();
  const leagueName = (raw.leagues?.league_name || "").trim();

  const title =
    homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : `Match ${index + 1}`;

  const startDate = raw.game_date || "";
  const startTime = formatTime(raw.game_time);
  const matchId = raw.id || `${startDate}-${homeTeam}-${awayTeam}`.toLowerCase().replace(/\s+/g, "-");
  const venue = (raw.game_location || "").trim();
  const venueAddr = resolveVenueAddress(venue);

  const descParts = [];
  if (homeTeam && awayTeam) descParts.push(`${homeTeam} vs ${awayTeam}`);
  if (division) descParts.push(`Division: ${division}`);
  if (leagueName) descParts.push(`League: ${leagueName}`);
  if (venue) descParts.push(`Location: ${venue}`);
  const description = descParts.join(". ");

  return {
    matchId,
    title,
    homeTeam,
    awayTeam,
    division,
    startDate,
    startTime,
    endTime: DEFAULTS.endTime,
    venue,
    address: venueAddr.address || "",
    city: venueAddr.city || "",
    state: venueAddr.state || "",
    zip: venueAddr.zip || "",
    country: DEFAULTS.country,
    description,
    organizer: DEFAULTS.organizer,
    isOnline: DEFAULTS.isOnline,
    price: DEFAULTS.price,
    tags: DEFAULTS.tags,
    externalUrl: DEFAULTS.externalUrl,
  };
}

// Extract schedule data by evaluating the rendered DOM.
// Returns an array of raw objects from table rows or game cards.
async function extractFromDom(page) {
  return page.evaluate(() => {
    const results = [];

    // --- Strategy 1: look for table rows ---
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const headerRow = table.querySelector("tr");
      if (!headerRow) continue;
      const headers = [...headerRow.querySelectorAll("th, td")].map((el) =>
        el.textContent.trim().toLowerCase()
      );
      if (headers.length < 2) continue;

      const rows = [...table.querySelectorAll("tr")].slice(1); // skip header
      for (const row of rows) {
        const cells = [...row.querySelectorAll("td")].map((el) =>
          el.textContent.trim()
        );
        if (cells.length === 0) continue;
        const obj = {};
        headers.forEach((h, i) => {
          if (h) obj[h] = cells[i] || "";
        });
        // Also grab a raw "status" hint — if a cell has "final" or a score pattern it's complete
        obj.__rawText = cells.join(" | ");
        results.push(obj);
      }
    }

    if (results.length > 0) return { source: "table", records: results };

    // --- Strategy 2: look for game/match card divs ---
    // Try common class name patterns
    const cardSelectors = [
      "[class*='game']",
      "[class*='match']",
      "[class*='schedule']",
      "[class*='fixture']",
    ];
    for (const sel of cardSelectors) {
      const cards = document.querySelectorAll(sel);
      if (cards.length > 2) {
        for (const card of cards) {
          const text = card.textContent.trim();
          if (text.length < 5) continue;
          // Try to extract date, time, teams from text content
          results.push({ __rawText: text, __html: card.innerHTML });
        }
        if (results.length > 0) return { source: "cards:" + sel, records: results };
      }
    }

    // --- Strategy 3: dump page text for debugging ---
    return {
      source: "debug",
      records: [],
      pageText: document.body.innerText.slice(0, 3000),
    };
  });
}

// Filter raw Supabase fixture records to only upcoming games.
// Prefer fixture_status field when present; fall back to date comparison.
function isUpcomingRaw(raw) {
  if (raw.fixture_status) return raw.fixture_status !== "COMPLETED";
  if (raw.game_date) return raw.game_date >= TODAY;
  return true;
}

// Filter normalized DOM-extracted records (no fixture_status available).
function isUpcomingNormalized(record) {
  if (record.startDate) return record.startDate >= TODAY;
  return true;
}

function isCompleted(record, rawText) {
  if (!rawText) return false;
  // Completed games typically show a score like "2 - 1" or "Final"
  return /\bfinal\b/i.test(rawText) || /\b\d+\s*-\s*\d+\b/.test(rawText);
}

function saveEvents(events, outputFile) {
  const rows = events.map((e) => COLUMNS.map((col) => escapeCsv(e[col])).join(","));
  const csv = [COLUMNS.join(","), ...rows].join("\n") + "\n";
  writeFileSync(outputFile, csv);
  return rows.length;
}

async function scrapeSource(page, source) {
  console.log(`\n${source.label} Schedule`);
  console.log("=".repeat(source.label.length + 9));
  console.log(`  URL: ${source.url}`);

  // Intercept API responses before navigation — Next.js SPAs fetch data
  // after hydration so we capture it here rather than parsing the DOM.
  const capturedApiData = [];
  const responseHandler = async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (!ct.includes("application/json")) return;
    // Skip Next.js internal build manifests
    if (url.includes("/_next/") || url.includes("__nextjs")) return;
    try {
      const json = await response.json();
      capturedApiData.push({ url, json });
    } catch {
      // non-JSON or already consumed
    }
  };
  page.on("response", responseHandler);

  // domcontentloaded is reliable; networkidle2 hangs on SPAs that keep polling
  await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Give client-side fetches time to fire and complete
  await delay(4000);
  page.off("response", responseHandler);

  console.log(`  Captured ${capturedApiData.length} API response(s)`);
  for (const { url } of capturedApiData) {
    console.log(`    ${url}`);
  }

  let events = [];

  // --- Strategy 1: look for schedule data in captured API responses ---
  for (const { url, json } of capturedApiData) {
    const records = extractFromNextData(json);
    if (records && records.length > 0) {
      console.log(`  Using API response: ${url}`);
      const upcomingRaw = records.filter(isUpcomingRaw);
      const normalized = upcomingRaw.map((r, i) => normalizeRecord(r, i));
      console.log(`  ${records.length} total records → ${upcomingRaw.length} upcoming`);
      events = normalized;
      break;
    }
  }

  // --- Strategy 2: __NEXT_DATA__ embedded JSON ---
  if (events.length === 0) {
    const nextDataRaw = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      return el ? el.textContent : null;
    });
    if (nextDataRaw) {
      try {
        const nextData = JSON.parse(nextDataRaw);
        const records = extractFromNextData(nextData);
        if (records && records.length > 0) {
          const upcomingRaw = records.filter(isUpcomingRaw);
          const normalized = upcomingRaw.map((r, i) => normalizeRecord(r, i));
          console.log(`  __NEXT_DATA__: ${records.length} total records → ${upcomingRaw.length} upcoming`);
          events = normalized;
        }
      } catch (err) {
        console.log(`  __NEXT_DATA__ parse error: ${err.message}`);
      }
    }
  }

  // --- Strategy 3: DOM table / card extraction ---
  if (events.length === 0) {
    console.log("  Falling back to DOM extraction...");
    const domResult = await extractFromDom(page);
    console.log(`  DOM strategy: ${domResult.source}, ${domResult.records.length} records`);

    if (domResult.source === "debug") {
      console.log("\n  ---- PAGE TEXT SAMPLE (for debugging) ----");
      console.log(domResult.pageText);
      console.log("  ------------------------------------------");
      console.log("  Could not find schedule data. Paste the above output so the");
      console.log("  scraper selectors can be updated to match the actual page structure.\n");
      saveEvents([], source.outputFile);
      return 0;
    }

    const normalized = domResult.records.map((r, i) => normalizeRecord(r, i));
    const upcoming = normalized.filter(
      (r) => isUpcomingNormalized(r) && !isCompleted(r, r.__rawText)
    );
    console.log(`  ${domResult.records.length} total records → ${upcoming.length} upcoming`);
    if (upcoming.length > 0) {
      console.log("  Sample event:", JSON.stringify(upcoming[0], null, 2));
    }
    events = upcoming;
  }

  if (events.length === 0) {
    console.log("  No upcoming events found.");
    saveEvents([], source.outputFile);
    return 0;
  }

  const total = saveEvents(events, source.outputFile);
  console.log(`  Saved ${total} upcoming events → ${path.basename(source.outputFile)}`);
  return total;
}

async function main() {
  console.log("Inter Soccer League Scraper");
  console.log("===========================\n");
  console.log(`Filtering for upcoming events (on or after ${TODAY})\n`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  try {
    let totalSaved = 0;
    for (const source of SOURCES) {
      totalSaved += await scrapeSource(page, source);
    }
    console.log(`\nDone! ${totalSaved} total upcoming events saved across both schedule files.`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
