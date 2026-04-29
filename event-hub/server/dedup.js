import { compareTwoStrings } from "string-similarity";
import { getAllEvents, findSameSourceEvent } from "./db.js";

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTime(t) {
  if (!t) return "";
  return t.replace(/\s+/g, "").toLowerCase();
}

/**
 * Find a matching event in the database for cross-source dedup.
 * Returns { event, score } or null.
 */
export function findDuplicate(incoming) {
  const existing = getAllEvents();
  const inTitle = normalize(incoming.title);
  const inDate = incoming.start_date || "";
  const inTime = normalizeTime(incoming.start_time);
  const inVenue = normalize(incoming.venue);

  let bestMatch = null;
  let bestScore = 0;

  for (const ev of existing) {
    let score = 0;
    const exTitle = normalize(ev.title);
    const exDate = ev.start_date || "";
    const exTime = normalizeTime(ev.start_time);
    const exVenue = normalize(ev.venue);

    // Title matching
    if (inTitle && exTitle) {
      if (inTitle === exTitle) {
        score += 50;
      } else {
        const sim = compareTwoStrings(inTitle, exTitle);
        if (sim > 0.85) score += 35;
      }
    }

    // Date matching
    if (inDate && exDate && inDate === exDate) score += 25;

    // Time matching
    if (inTime && exTime && inTime === exTime) score += 10;

    // Venue matching
    if (inVenue && exVenue) {
      if (inVenue === exVenue) {
        score += 15;
      } else {
        const venueSim = compareTwoStrings(inVenue, exVenue);
        if (venueSim > 0.8) score += 10;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ev;
    }
  }

  if (bestScore >= 75) {
    return { event: bestMatch, score: bestScore };
  }
  return null;
}

// Fields owned by the source: a re-scrape with a new value should overwrite
// the stored value (facts change — times shift, venues correct, descriptions
// get rewritten upstream). `title` / `start_date` aren't listed because the
// record is located by sourceId — if those drift, we still want to update.
const SOURCE_OF_TRUTH_FIELDS = [
  "title", "start_date", "start_time", "end_date", "end_time",
  "description", "venue", "address", "city", "state", "zip",
  "price", "image_url", "external_url", "url", "organizer", "is_online",
];

// Fields enriched after import (category by auto-categorize, lat/lng by
// geocoding, tags sometimes hand-curated). A re-scrape should only fill these
// when empty — never stomp curation work.
const ENRICHED_FIELDS = [
  "latitude", "longitude", "category", "tags", "contact",
  "recurring", "recurrence_frequency", "recurrence_end_date",
];

function hasValue(v) {
  return v !== null && v !== undefined && v !== "";
}

/**
 * Cross-source merge (used when a second source matches an existing event):
 * fill empty fields, prefer the longer description. Never overwrites data
 * already present — the first source to populate a field wins.
 */
export function mergeFields(existing, incoming) {
  const updates = {};
  const fieldKeys = [...SOURCE_OF_TRUTH_FIELDS, ...ENRICHED_FIELDS];

  for (const key of fieldKeys) {
    const exVal = existing[key];
    const inVal = incoming[key];
    if (key === "description" && hasValue(inVal)) {
      if (exVal !== inVal) updates[key] = inVal;
    } else if (!hasValue(exVal) && hasValue(inVal)) {
      updates[key] = inVal;
    }
  }

  return updates;
}

/**
 * Same-source re-import merge: authoritative source-of-truth fields overwrite
 * whenever the incoming value differs, so upstream edits (time shifts, venue
 * corrections, description rewrites) flow through on the next scrape.
 * Enriched fields still only fill when empty, so curation work is preserved.
 */
export function mergeFromSource(existing, incoming) {
  const updates = {};

  for (const key of SOURCE_OF_TRUTH_FIELDS) {
    const exVal = existing[key];
    const inVal = incoming[key];
    // Don't wipe a populated field if the source briefly returned nothing.
    if (!hasValue(inVal)) continue;
    if (exVal !== inVal) updates[key] = inVal;
  }

  for (const key of ENRICHED_FIELDS) {
    const exVal = existing[key];
    const inVal = incoming[key];
    if (!hasValue(exVal) && hasValue(inVal)) updates[key] = inVal;
  }

  return updates;
}
