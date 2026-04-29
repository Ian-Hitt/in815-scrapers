import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "rivets.csv");

const TEAM_ID = 66;
const API_URL = `https://scorebook.northwoodsleague.com/api/schedule/${TEAM_ID}?general=true`;
const SCHEDULE_URL = "https://northwoodsleague.com/rockford-rivets/schedule/";

const COLUMNS = [
  "sourceId", "title", "startDate", "startTime", "endDate", "endTime",
  "description", "venue", "address", "city", "state", "zip",
  "country", "organizer", "price", "isOnline", "tags", "imageUrl", "externalUrl",
];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Bad JSON from ${url}: ${data.slice(0, 200)}`)); }
      });
    }).on("error", reject);
  });
}

/**
 * Convert "MM-DD-YYYY" → "YYYY-MM-DD"
 */
function parseDate(mmddyyyy) {
  const [mm, dd, yyyy] = mmddyyyy.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert "6:35 pm" → "6:35 PM"
 */
function parseTime(t) {
  return (t || "").trim().toUpperCase();
}

async function main() {
  console.log("Rockford Rivets Schedule Scraper");
  console.log("=================================\n");

  const data = await fetchJson(API_URL);
  const { games } = data.schedule;
  console.log(`Fetched ${games.length} total games (season ${data.schedule.info.season})`);

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const rows = [];
  let skipped = 0;

  for (const game of games) {
    // Home games only — away games are in other cities
    if (game.home_team !== TEAM_ID) {
      skipped++;
      continue;
    }

    const startDate = parseDate(game.date);

    // Only upcoming games
    if (startDate < todayStr) {
      skipped++;
      continue;
    }

    // Skip cancelled/postponed games
    if (game.status_code !== 0) {
      skipped++;
      continue;
    }

    const opponent = game.visitor_team_shortname || game.visitor_team_name;
    const title = `Rockford Rivets vs ${opponent}`;
    const description = `${game.season_name}. ${game.visitor_team_name} at Rockford Stadium.`;

    // Parse city/state from address field ("Rockford, IL")
    const [city, state] = (game.address || "Rockford, IL").split(",").map((s) => s.trim());

    const row = {
      sourceId: String(game.id),
      title,
      startDate,
      startTime: parseTime(game.time),
      endDate: "",
      endTime: "150 minutes",
      description,
      venue: game.location || "Rockford Stadium",
      address: "",
      city,
      state,
      zip: "",
      country: "US",
      organizer: "Rockford Rivets",
      price: "Paid",
      isOnline: "no",
      tags: "baseball; semi-pro sports; rivets",
      imageUrl: game.home_team_logo || "",
      externalUrl: game.tickets_url || SCHEDULE_URL,
    };

    rows.push(COLUMNS.map((col) => escapeCsv(row[col])).join(","));
  }

  const csv = [COLUMNS.join(","), ...rows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);
  console.log(`\nDone! ${rows.length} home games written to data/rivets.csv (${skipped} away/past/cancelled skipped)`);
}

main().catch(console.error);
