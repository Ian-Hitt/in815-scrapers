import { parse } from "csv-parse/sync";
import { readFileSync, existsSync } from "fs";
import db, {
  insertEvent,
  updateEvent,
  addEventSource,
  findEventBySourceId,
  findSameSourceEvent,
  createImportLog,
  completeImportLog,
  getEventWithSources,
  upsertChannel,
  assignEventChannel,
  addEventCategory,
  getCategoryBySlug,
} from "../db.js";
import { findDuplicate, mergeFields, mergeFromSource } from "../dedup.js";
import { mapRow as mapRpd } from "./rpd.js";
import { mapRow as mapGorockford } from "./gorockford.js";
import { mapRow as mapEventbrite } from "./eventbrite.js";
import { mapRow as mapRpl } from "./rpl.js";
import { mapRow as mapHarlem } from "./harlem.js";
import { mapRow as mapIntersoccer } from "./intersoccer.js";
import { mapRow as mapHononegah } from "./hononegah.js";
import { mapRow as mapGuilford } from "./guilford.js";
import { mapRow as mapEast } from "./east.js";
import { mapRow as mapAuburn } from "./auburn.js";
import { mapRow as mapJefferson } from "./jefferson.js";
import { mapRow as mapLutheranHs } from "./rl.js";
import { mapRow as mapMarysPlace } from "./marysplace.js";
import { mapRow as mapRockfordLive } from "./rockfordlive.js";
import { mapRow as mapRockbuzz } from "./rockbuzz.js";
import { mapRow as mapHardrock } from "./hardrock.js";
import { mapRow as mapBoylan } from "./boylan.js";
import { mapRow as mapRivets } from "./rivets.js";
import { mapRow as mapTicketmaster } from "./ticketmaster.js";
import { mapRow as mapNorthsuburban } from "./northsuburban.js";

const MAPPERS = {
  rpd: mapRpd,
  gorockford: mapGorockford,
  eventbrite: mapEventbrite,
  rpl: mapRpl,
  harlem: mapHarlem,
  "intersoccer-saturday": mapIntersoccer,
  "intersoccer-sunday": mapIntersoccer,
  hononegah: mapHononegah,
  guilford: mapGuilford,
  east: mapEast,
  auburn: mapAuburn,
  jefferson: mapJefferson,
  "lutheran-hs": mapLutheranHs,
  "marysplace": mapMarysPlace,
  "rockfordlive": mapRockfordLive,
  "rockbuzz": mapRockbuzz,
  "hardrock": mapHardrock,
  "boylan": mapBoylan,
  "rivets": mapRivets,
  "ticketmaster": mapTicketmaster,
  "northsuburban": mapNorthsuburban,
};

const DEFAULT_PATHS = {
  rpd: "../data/rpd.csv",
  gorockford: "../data/gorockford.csv",
  eventbrite: "../data/eventbrite.csv",
  rpl: "../data/rpl.csv",
  harlem: "../data/harlem.csv",
  "intersoccer-saturday": "../data/intersoccer-saturday.csv",
  "intersoccer-sunday": "../data/intersoccer-sunday.csv",
  hononegah: "../data/hononegah.csv",
  guilford: "../data/guilford.csv",
  east: "../data/east.csv",
  auburn: "../data/auburn.csv",
  jefferson: "../data/jefferson.csv",
  "lutheran-hs": "../data/rl.csv",
  "marysplace": "../data/marysplace.csv",
  "rockfordlive": "../data/rockfordlive.csv",
  "rockbuzz": "../data/rockbuzz.csv",
  "hardrock": "../data/hardrock.csv",
  "boylan": "../data/boylan.csv",
  "rivets": "../data/rivets.csv",
  "ticketmaster": "../data/ticketmaster.csv",
  "northsuburban": "../data/northsuburban.csv",
};

export { DEFAULT_PATHS };

function snapLogo(orgId) {
  return `https://manage-control-panel-prod.s3.amazonaws.com/8to18-logos/images/il-${orgId.toLowerCase()}.png`;
}

// Sources that represent a school — every event from these gets tagged with the
// "school" category in addition to whatever keyword rules match.
const SCHOOL_SOURCES = new Set(["harlem", "hononegah", "guilford", "east", "auburn", "jefferson", "lutheran-hs", "boylan"]);
export { SCHOOL_SOURCES };

// Titles that are calendar scaffolding, not actual events. These get dropped
// at import so they don't clutter the DB or get pushed to Realms.
const SNAP_ADMIN_NOISE = /^(Administration(\s+Varsity)?(\s+N)?|School N)\b/i;
const NOISE_TITLE_PATTERNS = {
  rpd: /^(Sapora Playworld|WCRTFB Board Meeting|Dick's Sporting Goods Shopping Days)$/i,
  northsuburban: /Board of Trustees Meeting/i,
  boylan: /^(Main Gym Lighting and Painting|Administration(\s+Varsity)?(\s+N)?|School N)\b/i,
  east: SNAP_ADMIN_NOISE,
  harlem: SNAP_ADMIN_NOISE,
  hononegah: SNAP_ADMIN_NOISE,
  "lutheran-hs": SNAP_ADMIN_NOISE,
  guilford: SNAP_ADMIN_NOISE,
  auburn: SNAP_ADMIN_NOISE,
  jefferson: SNAP_ADMIN_NOISE,
};

function isNoiseTitle(source, title) {
  const pat = NOISE_TITLE_PATTERNS[source];
  return pat ? pat.test(title) : false;
}

export { NOISE_TITLE_PATTERNS, isNoiseTitle };

function resolveChannel(source, event) {
  switch (source) {
    case "rpd":
      return { name: "Rockford Park District", type: "organization", website: "https://rockfordparkdistrict.org" };
    case "rpl":
      return { name: "Rockford Public Library", type: "organization", website: "https://rockfordpubliclibrary.org" };
    case "eventbrite":
      if (event.organizer) {
        return { name: event.organizer, type: "organization", website: event.external_url || null };
      }
      return null;
    case "harlem":
      return { name: "Harlem High School Athletics", type: "organization", website: "https://schools.snap.app/harlem/calendar", image_url: snapLogo("harlem") };
    case "intersoccer-saturday":
    case "intersoccer-sunday":
      return { name: "International Soccer League", type: "organization", website: "https://www.intersoccerleague.com" };
    case "hononegah":
      return { name: "Hononegah High School Athletics", type: "organization", website: "https://schools.snap.app/Hononegah/calendar", image_url: snapLogo("hononegah") };
    case "guilford":
      return { name: "Guilford High School Athletics", type: "organization", website: "https://schools.snap.app/GuilfordHS/calendar", image_url: snapLogo("guilfordhs") };
    case "east":
      return { name: "East High School Athletics", type: "organization", website: "https://schools.snap.app/EastHS/calendar", image_url: snapLogo("easths") };
    case "auburn":
      return { name: "Auburn High School Athletics", type: "organization", website: "https://schools.snap.app/RockfordAuburn/calendar", image_url: snapLogo("rockfordauburn") };
    case "jefferson":
      return { name: "Jefferson High School Athletics", type: "organization", website: "https://schools.snap.app/jeffersonHS/calendar", image_url: snapLogo("jeffersonhs") };
    case "lutheran-hs":
      return { name: "Rockford Lutheran Athletics", type: "organization", website: "https://schools.snap.app/rl/calendar", image_url: snapLogo("rl") };
    case "marysplace":
      return { name: "Mary's Place Bar", type: "venue", website: "https://marysplacebar.com" };
    case "rockfordlive":
      if (event.venue) {
        return { name: event.venue, type: "venue", website: "https://rockfordlive.com" };
      }
      return { name: "Rockford Live", type: "organization", website: "https://rockfordlive.com" };
    case "rockbuzz":
      if (event.organizer) {
        return { name: event.organizer, type: "organization", website: event.external_url || null };
      }
      return null;
    case "hardrock":
      return { name: "Hard Rock Casino Rockford", type: "venue", website: "https://casino.hardrock.com/rockford" };
    case "boylan":
      return { name: "Boylan Catholic High School Athletics", type: "organization", website: "https://boylan.org/athletics/athletics-events-calendar" };
    case "rivets":
      return { name: "Rockford Rivets", type: "organization", website: "https://northwoodsleague.com/rockford-rivets/" };
    case "northsuburban":
      return { name: "North Suburban Library District", type: "organization", website: "https://northsuburban.librarycalendar.com" };
    case "ticketmaster":
      if (event.venue) {
        return { name: event.venue, type: "venue", website: event.external_url || null };
      }
      if (event.organizer) {
        return { name: event.organizer, type: "organization", website: event.external_url || null };
      }
      return null;
    case "gorockford":
      if (event.venue) {
        let website = null;
        if (event.external_url) {
          try { website = new URL(event.external_url).origin; } catch { /* ignore */ }
        }
        return { name: event.venue, type: "venue", website, image_url: event._channelImageUrl || null };
      }
      return null;
    default:
      return null;
  }
}

export function runImport(source, csvContent, fileName, existingLogId = null) {
  const mapper = MAPPERS[source];
  if (!mapper) throw new Error(`Unknown source: ${source}`);

  let logId;
  if (existingLogId) {
    logId = existingLogId;
    db.prepare("UPDATE import_logs SET file_name = ? WHERE id = ?").run(fileName, logId);
  } else {
    const logResult = createImportLog({
      source_name: source,
      file_name: fileName,
      started_at: new Date().toISOString(),
    });
    logId = logResult.lastInsertRowid;
  }

  const rows = parse(csvContent, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

  const stats = {
    total_rows: rows.length,
    new_events: 0,
    updated_events: 0,
    duplicate_events: 0,
    errors: 0,
    errorList: [],
  };

  const schoolCatId = SCHOOL_SOURCES.has(source) ? getCategoryBySlug("school")?.id : null;

  const importTransaction = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      try {
        const { event, sourceId, sourceUrl, channelImageUrl } = mapper(rows[i]);

        if (!event.title || !event.start_date) {
          stats.errors++;
          stats.errorList.push(`Row ${i + 1}: Missing title or start_date`);
          continue;
        }

        if (isNoiseTitle(source, event.title)) continue;

        // Layer 1: Check if this exact source record already exists
        if (sourceId) {
          const existing = findEventBySourceId(source, sourceId);
          if (existing) {
            // Re-import: source-of-truth fields overwrite if changed; enriched
            // fields (category, tags, geo) only fill when empty so curation
            // work survives. See mergeFromSource() in dedup.js for the split.
            const updates = mergeFromSource(existing, event);
            if (Object.keys(updates).length > 0) {
              updateEvent(existing.id, updates, { action: "imported", tool: source });
              stats.updated_events++;
            } else {
              stats.duplicate_events++;
            }
            continue;
          }
        }

        // Layer 1.5: Same-source near-exact dedup
        // Catches sources (e.g. RPL) that assign a unique ID per registration
        // slot for what is actually the same event occurrence.
        if (sourceId) {
          const sameSource = findSameSourceEvent(source, event);
          if (sameSource) {
            addEventSource({
              event_id: sameSource.id,
              source_name: source,
              source_id: sourceId,
              source_url: sourceUrl,
              import_log_id: logId,
            });
            stats.duplicate_events++;
            continue;
          }
        }

        // Layer 2: Cross-source dedup
        const dup = findDuplicate(event);
        if (dup) {
          // Merge: fill empty fields + add source link
          const full = getEventWithSources(dup.event.id);
          const updates = mergeFields(full, event);
          if (Object.keys(updates).length > 0) {
            updateEvent(dup.event.id, updates, { action: "imported", tool: source });
          }
          // Only add source if this source isn't already linked to this event
          const alreadyLinked = db.prepare(
            "SELECT 1 FROM event_sources WHERE event_id = ? AND source_name = ?"
          ).get(dup.event.id, source);
          if (!alreadyLinked) {
            addEventSource({
              event_id: dup.event.id,
              source_name: source,
              source_id: sourceId,
              source_url: sourceUrl,
              import_log_id: logId,
            });
          }
          if (schoolCatId) addEventCategory(dup.event.id, schoolCatId);
          stats.duplicate_events++;
          continue;
        }

        // New event
        const result = insertEvent(event, { action: "imported", tool: source });
        const eventId = result.lastInsertRowid;
        addEventSource({
          event_id: eventId,
          source_name: source,
          source_id: sourceId,
          source_url: sourceUrl,
          import_log_id: logId,
        });

        // Assign channel
        const channelDef = resolveChannel(source, { ...event, _channelImageUrl: channelImageUrl });
        if (channelDef) {
          const channel = upsertChannel(channelDef);
          assignEventChannel(eventId, channel.id);
        }

        if (schoolCatId) addEventCategory(eventId, schoolCatId);

        stats.new_events++;
      } catch (err) {
        stats.errors++;
        stats.errorList.push(`Row ${i + 1}: ${err.message}`);
      }
    }
  });

  importTransaction();

  completeImportLog(logId, {
    completed_at: new Date().toISOString(),
    status: stats.errors > 0 && stats.new_events === 0 ? "failed" : "completed",
    total_rows: stats.total_rows,
    new_events: stats.new_events,
    updated_events: stats.updated_events,
    duplicate_events: stats.duplicate_events,
    errors: stats.errors,
    error_details: JSON.stringify(stats.errorList),
  });

  return {
    import_log_id: logId,
    ...stats,
    error_details: stats.errorList,
  };
}

export function runImportFromFile(source, filePath, existingLogId = null) {
  const resolvedPath = filePath || DEFAULT_PATHS[source];
  if (!resolvedPath) throw new Error(`No file path for source: ${source}`);

  if (!existsSync(resolvedPath)) {
    throw new Error(`CSV file not found: ${resolvedPath} — the scraper may have failed to produce output`);
  }

  const content = readFileSync(resolvedPath, "utf-8");
  const fileName = resolvedPath.split("/").pop();
  return runImport(source, content, fileName, existingLogId);
}

// Backfill channels for events imported before the channels feature existed.
// Reads source from event_sources and assigns channels based on source rules.
export function backfillChannels() {
  const rows = db.prepare(`
    SELECT e.id, e.venue, e.organizer, e.external_url, es.source_name
    FROM events e
    JOIN event_sources es ON es.event_id = e.id
    WHERE e.channel_id IS NULL
  `).all();

  const backfillTx = db.transaction(() => {
    for (const row of rows) {
      const channelDef = resolveChannel(row.source_name, {
        venue: row.venue,
        organizer: row.organizer,
        external_url: row.external_url,
      });
      if (channelDef) {
        const channel = upsertChannel(channelDef);
        assignEventChannel(row.id, channel.id);
      }
    }
  });

  backfillTx();
  return rows.length;
}

// Backfill image_url on channels that have a known logo (e.g. SNAP schools).
// Runs on startup so hardcoded logos get applied without needing a re-import.
export function backfillChannelAvatars() {
  const sources = db.prepare(`
    SELECT DISTINCT es.source_name
    FROM event_sources es
  `).all().map((r) => r.source_name);

  let updated = 0;
  for (const source of sources) {
    const channelDef = resolveChannel(source, {});
    if (channelDef?.image_url) {
      const channel = db.prepare("SELECT id, image_url FROM channels WHERE name = ?").get(channelDef.name);
      if (channel && !channel.image_url) {
        db.prepare("UPDATE channels SET image_url = ?, updated_at = ? WHERE id = ?")
          .run(channelDef.image_url, new Date().toISOString(), channel.id);
        updated++;
      }
    }
  }
  return updated;
}
