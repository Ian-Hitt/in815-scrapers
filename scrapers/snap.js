/**
 * Shared scraper utility for schools using the SNAP.app athletics platform.
 * Each school scraper just calls runSnapScraper() with its own config.
 *
 * Usage:
 *   import { runSnapScraper } from "./snap.js";
 *   runSnapScraper({
 *     schoolName: "Guilford High School",
 *     organizationId: "GuilfordHS",          // from schools.snap.app/<organizationId>/calendar
 *     homeAddress: { address: "...", city: "...", state: "IL", zip: "..." },
 *     outputFile: "../data/guilford.csv",
 *   });
 */

import https from "https";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv } from "./utils.js";

const COLUMNS = [
  "title", "eventId", "startDate", "startTime", "endTime",
  "venue", "address", "city", "state", "zip",
  "description", "sport", "gender", "level", "opponent", "homeAway",
];

const GRAPHQL_QUERY = `query GetMainCalendar($filter: ManageEventListFilter) {
  manageOrganization {
    eventsForOrganization(filter: $filter) {
      count
      list {
        eventId
        place
        eventDate
        location
        opponent
        confirmed
        startTime
        endTime
        busTime
        departureLocation
        transportComments
        cancellationStatus
        eventStory
        eventDateTime
        level
        programForEvent {
          sportName
          gender
          level
        }
      }
    }
  }
}`;

function post(organizationId, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: "manage-api.snap.app",
      path: "/",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(data),
        "manage_organization_id": organizationId,
        "ad_assist_version": "v1",
        "origin": "https://schools.snap.app",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Bad JSON response: ${raw.slice(0, 300)}`)); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function toTitleCase(str) {
  return (str || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const LEVEL_LABELS = { V: "Varsity", JV: "JV", F: "Freshman", "F/S": "Freshman/Sophomore" };

function buildTitle(ev) {
  const sport = toTitleCase(ev.programForEvent?.sportName || "");
  const gender = ev.programForEvent?.gender === "G" ? "Girls" : ev.programForEvent?.gender === "B" ? "Boys" : "";
  const level = LEVEL_LABELS[ev.level] || ev.level || "";
  const opponent = (ev.opponent || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim();
  let title = [sport, gender, level].filter(Boolean).join(" ");
  if (opponent) title += ` vs ${toTitleCase(opponent)}`;
  return title;
}

function buildDescription(ev) {
  const parts = [];
  if (ev.place === "A") parts.push(`Away at ${ev.location}`);
  if (ev.confirmed === "N") parts.push("Unconfirmed");
  if (ev.busTime) parts.push(`Bus: ${ev.busTime}`);
  if (ev.departureLocation) parts.push(`Departs from: ${ev.departureLocation}`);
  if (ev.transportComments) parts.push(ev.transportComments);
  if (ev.eventStory) parts.push(ev.eventStory);
  return parts.join(". ");
}

async function fetchEvents(organizationId) {
  const today = new Date();
  const startDate = today.toISOString().split("T")[0];
  const endDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
    .toISOString().split("T")[0];

  console.log(`Fetching events from ${startDate} to ${endDate}...`);

  const result = await post(organizationId, {
    operationName: "GetMainCalendar",
    variables: {
      filter: {
        where: { startDate, endDate },
        orderBy: { event_date: "asc" },
      },
    },
    query: GRAPHQL_QUERY,
  });

  const list = result?.data?.manageOrganization?.eventsForOrganization?.list || [];
  console.log(`  ${list.length} events returned`);
  return list;
}

export async function runSnapScraper({ schoolName, organizationId, homeAddress, outputFile }) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const resolvedOutput = path.join(__dirname, outputFile);

  console.log(`${schoolName} Athletics Scraper`);
  console.log("=".repeat(schoolName.length + 18) + "\n");

  const events = await fetchEvents(organizationId);

  const rows = [];
  let skipped = 0;

  for (const ev of events) {
    if (ev.cancellationStatus && ev.cancellationStatus !== "0") {
      skipped++;
      continue;
    }

    const isHome = ev.place === "H";
    const startDate = ev.eventDateTime ? ev.eventDateTime.split("T")[0] : "";

    const row = {
      title: buildTitle(ev),
      eventId: String(ev.eventId),
      startDate,
      startTime: ev.startTime || "",
      endTime: ev.endTime || "",
      venue: ev.location || "",
      address: isHome ? homeAddress.address : "",
      city: isHome ? homeAddress.city : "",
      state: isHome ? homeAddress.state : "",
      zip: isHome ? homeAddress.zip : "",
      description: buildDescription(ev),
      sport: toTitleCase(ev.programForEvent?.sportName || ""),
      gender: ev.programForEvent?.gender === "G" ? "Girls" : ev.programForEvent?.gender === "B" ? "Boys" : "",
      level: LEVEL_LABELS[ev.level] || ev.level || "",
      opponent: (ev.opponent || "").replace(/\r/g, " ").replace(/\s+/g, " ").trim(),
      homeAway: ev.place === "H" ? "Home" : ev.place === "A" ? "Away" : "",
    };

    rows.push(COLUMNS.map((col) => escapeCsv(row[col])).join(","));
  }

  const csv = [COLUMNS.join(","), ...rows].join("\n");
  writeFileSync(resolvedOutput, csv);

  console.log(`\nDone! ${rows.length} events written to ${path.basename(resolvedOutput)} (${skipped} cancelled skipped)`);
}
