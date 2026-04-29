import { Router } from "express";
import { getRulesForDisplay, suggestCategorySlugs, suggestCategoriesWithConfidence } from "../categorize.js";
import {
  addEventCategory,
  archivePastEvents,
  clearMultipleDatesEvents,
  createEnrichmentLog,
  completeEnrichmentLog,
  addEnrichmentChange,
  dismissDuplicate,
  dismissEvent,
  getAllEvents,
  getArchivedCount,
  getCategories,
  getCategoryBySlug,
  getDismissedEvents,
  getDismissedPairs,
  getEventsWithoutZip,
  getEventsMissingAddress,
  getAddressStats,
  getMissingPriceEvents,
  getMissingTimeEvents,
  getPossibleAttractions,
  getRecurringEvents,
  getUncategorizedCount,
  getUncategorizedEvents,
  getChannelCategories,
  mergeEvents,
  mergeChannels,
  dismissChannelDuplicate,
  getDismissedChannelPairs,
  getEmptyChannels,
  deleteEmptyChannels,
  deleteChannel,
  setRrule,
  undismissEvent,
  updateEvent,
  logEventChange,
} from "../db.js";
import db from "../db.js";
import { toRrule } from "../rrule.js";
import { extractTimes } from "../extractTime.js";
import { extractPrice } from "../extractPrice.js";
import { lookupZip, lookupAddress, geocodeDelay } from "../geocode.js";
import { detectFallbackSlug, FALLBACK_DIR, FALLBACK_URL_PREFIX } from "../fallbackImages.js";
import { runEnrichmentPipeline, isPipelineRunning } from "../enrichPipeline.js";
import fs from "fs";
import path from "path";

const router = Router();

// Server-side state for the long-running geocode-preview job.
// Suggestions are stored here so they survive HTTP timeouts on the client.
const geocodePreviewStatus = { running: false, total: 0, done: 0, found: 0 };
let geocodePreviewResults = [];

// POST /api/curate/run-all — runs all bulk-auto enrichers in order
router.post("/run-all", (_req, res) => {
  if (isPipelineRunning()) {
    return res.status(409).json({ error: "pipeline already running" });
  }
  // Respond immediately; pipeline runs in background (can take several minutes
  // because of Nominatim rate limits and avatar fetches).
  res.json({ started: true });
  runEnrichmentPipeline().catch((err) => {
    console.error("[pipeline] unexpected error:", err);
  });
});

// GET /api/curate/run-all/status — whether a pipeline run is in flight
router.get("/run-all/status", (_req, res) => {
  res.json({ running: isPipelineRunning() });
});

// Small helper for single-item curator actions — creates a completed log
// containing one change entry, so individual clicks show up in /logs/enrichment.
function logSingle(functionName, change) {
  const logResult = createEnrichmentLog({
    function_name: functionName,
    started_at: new Date().toISOString(),
    total_events: 1,
  });
  const logId = logResult.lastInsertRowid;
  addEnrichmentChange(logId, change);
  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: 1,
    changed_events: 1,
    skipped_events: 0,
    errors: 0,
    error_details: "[]",
  });
  return logId;
}

// GET /api/curate/recurring — list all recurring events with rrule status
router.get("/recurring", (_req, res) => {
  const events = getRecurringEvents();
  const rows = events.map((ev) => ({
    ...ev,
    suggested_rrule: ev.rrule ? null : toRrule(ev.recurrence_frequency),
  }));
  res.json(rows);
});

// POST /api/curate/rrules — auto-convert all recurring events that can be converted
router.post("/rrules", (_req, res) => {
  const events = getRecurringEvents();
  const logResult = createEnrichmentLog({ function_name: "rrule-convert", started_at: new Date().toISOString(), total_events: events.length });
  const logId = logResult.lastInsertRowid;

  let converted = 0;
  let skipped = 0;
  const needsReview = [];

  for (const ev of events) {
    if (ev.rrule) {
      skipped++;
      continue;
    }
    const rrule = toRrule(ev.recurrence_frequency);
    if (rrule) {
      setRrule(ev.id, rrule);
      addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "rrule", old_value: null, new_value: rrule });
      logEventChange(ev.id, "enriched", "rrule", { rrule: { from: null, to: rrule } });
      converted++;
    } else {
      needsReview.push({
        id: ev.id,
        title: ev.title,
        frequency: ev.recurrence_frequency,
      });
    }
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: "completed", total_events: events.length, changed_events: converted, skipped_events: skipped, errors: 0, error_details: "[]" });

  res.json({
    converted,
    skipped,
    needs_review: needsReview.length,
    needs_review_list: needsReview,
  });
});

// POST /api/curate/clear-multiple-dates — mark "Multiple dates" events as non-recurring
router.post("/clear-multiple-dates", (_req, res) => {
  const affected = db.prepare("SELECT id, title FROM events WHERE recurrence_frequency = 'Multiple dates'").all();
  const logResult = createEnrichmentLog({ function_name: "clear-multiple-dates", started_at: new Date().toISOString(), total_events: affected.length });
  const logId = logResult.lastInsertRowid;

  const result = clearMultipleDatesEvents();

  for (const ev of affected) {
    addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "recurring", old_value: "1", new_value: "0" });
    logEventChange(ev.id, "enriched", "clear-multiple-dates", { recurring: { from: 1, to: 0 } });
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: "completed", total_events: affected.length, changed_events: result.changes, skipped_events: 0, errors: 0, error_details: "[]" });
  res.json({ cleared: result.changes });
});

// PATCH /api/curate/rrules/:id — manually set rrule for one event
router.patch("/rrules/:id", (req, res) => {
  const { rrule } = req.body;
  if (rrule === undefined)
    return res.status(400).json({ error: "rrule required" });
  const id = parseInt(req.params.id);
  const before = db.prepare("SELECT rrule FROM events WHERE id = ?").get(id);
  setRrule(id, rrule || null);
  logEventChange(id, "approved", "rrule", { rrule: { from: before?.rrule ?? null, to: rrule || null } });
  res.json({ ok: true });
});

// GET /api/curate/category-rules — keyword rules for display
router.get("/category-rules", (_req, res) => {
  const rules = getRulesForDisplay();
  const categories = getCategories();

  // Flatten category tree for slug → name lookup
  const bySlug = Object.fromEntries(
    categories.flatMap((p) => [
      [p.slug, { name: p.name, parentName: null }],
      ...p.subcategories.map((s) => [
        s.slug,
        { name: s.name, parentName: p.name },
      ]),
    ]),
  );

  // Group rules by category slug
  const grouped = {};
  for (const rule of rules) {
    for (const slug of rule.slugs) {
      if (!grouped[slug])
        grouped[slug] = { slug, ...bySlug[slug], keywords: [] };
      grouped[slug].keywords.push(...rule.keywords);
    }
  }

  res.json(Object.values(grouped));
});

// GET /api/curate/category-stats — counts for the category curation card
router.get("/category-stats", (_req, res) => {
  res.json({ uncategorized: getUncategorizedCount() });
});

// GET /api/curate/category-suggestions — events with suggested categories they don't already have (paginated)
router.get("/category-suggestions", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

  const events = getAllEvents();
  const categories = getCategories();
  const bySlug = Object.fromEntries(
    categories.flatMap((p) => [
      [p.slug, { id: p.id, name: p.name, slug: p.slug, parent_name: null }],
      ...p.subcategories.map((s) => [s.slug, { id: s.id, name: s.name, slug: s.slug, parent_name: p.name }]),
    ])
  );

  // Pre-load existing category assignments so we only show NEW suggestions
  const existingStmt = db.prepare("SELECT category_id FROM event_categories WHERE event_id = ?");

  const all = [];
  for (const ev of events) {
    const matches = suggestCategoriesWithConfidence(ev);
    if (matches.length === 0) continue;

    const existingIds = new Set(existingStmt.all(ev.id).map((r) => r.category_id));

    // Only keep suggestions for categories the event doesn't already have
    const newMatches = matches
      .map((m) => ({ ...m, cat: bySlug[m.slug] }))
      .filter((m) => m.cat?.id && !existingIds.has(m.cat.id));
    if (newMatches.length === 0) continue;

    const PRIORITY = { high: 3, medium: 2, low: 1 };
    const topConfidence = newMatches.reduce((best, m) =>
      PRIORITY[m.confidence] > PRIORITY[best] ? m.confidence : best, "low");
    all.push({
      id: ev.id,
      title: ev.title,
      start_date: ev.start_date,
      raw_category: ev.category,
      confidence: topConfidence,
      suggested_categories: newMatches
        .map((m) => ({ ...m.cat, confidence: m.confidence })),
    });
  }

  // Sort: high confidence first, then by date
  const PRIORITY = { high: 3, medium: 2, low: 1 };
  all.sort((a, b) => PRIORITY[b.confidence] - PRIORITY[a.confidence] || a.start_date?.localeCompare(b.start_date));

  const total = all.length;
  const pages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  res.json({ suggestions: all.slice(offset, offset + limit), total, page, pages });
});

// POST /api/curate/auto-categorize — run keyword rules against all events
router.post("/auto-categorize", (_req, res) => {
  const events = getAllEvents();
  const logResult = createEnrichmentLog({ function_name: "auto-categorize", started_at: new Date().toISOString(), total_events: events.length });
  const logId = logResult.lastInsertRowid;

  let categorized = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  for (const ev of events) {
    try {
      const matches = suggestCategoriesWithConfidence(ev).filter((m) => m.confidence !== "low");
      if (matches.length > 0) {
        for (const m of matches) {
          const cat = getCategoryBySlug(m.slug);
          if (cat) addEventCategory(ev.id, cat.id);
        }
        const rule = matches.map((m) => `"${m.matched}" → ${m.slug}`).join("; ");
        addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "categories", old_value: rule, new_value: matches.map((m) => m.slug).join(", ") });
        logEventChange(ev.id, "enriched", "auto-categorize", { categories: { from: null, to: matches.map((m) => m.slug).join(", ") } });
        categorized++;
        continue;
      }
      // Fallback: inherit channel default categories when no keyword rule matched.
      const defaults = ev.channel_id ? getChannelCategories(ev.channel_id) : [];
      if (defaults.length === 0) {
        skipped++;
        continue;
      }
      for (const cat of defaults) addEventCategory(ev.id, cat.id);
      addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "categories", old_value: "channel default", new_value: defaults.map((c) => c.slug).join(", ") });
      logEventChange(ev.id, "enriched", "auto-categorize", { categories: { from: null, to: defaults.map((c) => c.slug).join(", ") } });
      categorized++;
    } catch (err) {
      errors++;
      errorDetails.push(`Event ${ev.id}: ${err.message}`);
    }
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: errors > 0 && categorized === 0 ? "failed" : "completed", total_events: events.length, changed_events: categorized, skipped_events: skipped, errors, error_details: JSON.stringify(errorDetails) });
  res.json({ categorized, skipped, uncategorized: getUncategorizedCount() });
});

// POST /api/curate/auto-categorize/:id — apply suggestions to a single event (all confidence levels)
router.post("/auto-categorize/:id", (req, res) => {
  const events = getAllEvents();
  const ev = events.find((e) => e.id === parseInt(req.params.id));
  if (!ev) return res.status(404).json({ error: "Event not found" });
  const matches = suggestCategoriesWithConfidence(ev);
  if (matches.length > 0) {
    for (const m of matches) {
      const cat = getCategoryBySlug(m.slug);
      if (cat) addEventCategory(ev.id, cat.id);
    }
    const rule = matches.map((m) => `"${m.matched}" → ${m.slug}`).join("; ");
    logSingle("auto-categorize", {
      event_id: ev.id,
      event_title: ev.title,
      field_name: "categories",
      old_value: rule,
      new_value: matches.map((m) => m.slug).join(", "),
    });
    logEventChange(ev.id, "approved", "auto-categorize", { categories: { from: null, to: matches.map((m) => m.slug).join(", ") } });
    return res.json({ ok: true, applied: matches.length });
  }
  const defaults = ev.channel_id ? getChannelCategories(ev.channel_id) : [];
  for (const cat of defaults) addEventCategory(ev.id, cat.id);
  if (defaults.length > 0) {
    logSingle("auto-categorize", {
      event_id: ev.id,
      event_title: ev.title,
      field_name: "categories",
      old_value: "channel default",
      new_value: defaults.map((c) => c.slug).join(", "),
    });
    logEventChange(ev.id, "approved", "auto-categorize", { categories: { from: null, to: defaults.map((c) => c.slug).join(", ") } });
  }
  res.json({ ok: true, applied: defaults.length });
});

// GET /api/curate/archive-stats
router.get("/archive-stats", (_req, res) => {
  res.json({ archived: getArchivedCount() });
});

// GET /api/curate/archive-candidates — past events that would be archived
router.get("/archive-candidates", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT id, title, start_date, start_time, end_date, venue, recurring, recurrence_end_date
    FROM events
    WHERE archived = 0 AND is_dismissed = 0 AND (
      (recurring = 0 AND start_date < :today) OR
      (recurring = 1 AND recurrence_end_date IS NOT NULL AND recurrence_end_date < :today)
    )
    ORDER BY start_date DESC
  `).all({ today });
  res.json(rows);
});

// POST /api/curate/archive-past — archive all past completed events
router.post("/archive-past", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const before = db.prepare(`
    SELECT id, title FROM events
    WHERE archived = 0 AND (
      (recurring = 0 AND start_date < :today) OR
      (recurring = 1 AND recurrence_end_date IS NOT NULL AND recurrence_end_date < :today)
    )
  `).all({ today });
  const logResult = createEnrichmentLog({ function_name: "archive-past", started_at: new Date().toISOString(), total_events: before.length });
  const logId = logResult.lastInsertRowid;

  const count = archivePastEvents();

  for (const ev of before) {
    addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "archived", old_value: "0", new_value: "1" });
    logEventChange(ev.id, "enriched", "archive-past", { archived: { from: 0, to: 1 } });
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: "completed", total_events: before.length, changed_events: count, skipped_events: 0, errors: 0, error_details: "[]" });
  res.json({ archived: count, total: getArchivedCount() });
});

// POST /api/curate/archive/:id — archive a single event
router.post("/archive/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title FROM events WHERE id = ?").get(id);
  if (!ev) return res.status(404).json({ error: "Event not found" });
  const result = db.prepare("UPDATE events SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("archive-past", { event_id: ev.id, event_title: ev.title, field_name: "archived", old_value: "0", new_value: "1" });
  logEventChange(id, "approved", "archive", { archived: { from: 0, to: 1 } });
  res.json({ ok: true });
});

// POST /api/curate/archive-batch — archive multiple events at once (with logging)
router.post("/archive-batch", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids must be a non-empty array" });

  const events = ids.map((id) => db.prepare("SELECT id, title FROM events WHERE id = ? AND archived = 0").get(parseInt(id))).filter(Boolean);
  const logResult = createEnrichmentLog({ function_name: "archive-past", started_at: new Date().toISOString(), total_events: events.length });
  const logId = logResult.lastInsertRowid;

  let changed = 0;
  for (const ev of events) {
    const r = db.prepare("UPDATE events SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(ev.id);
    if (r.changes > 0) {
      addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "archived", old_value: "0", new_value: "1" });
      logEventChange(ev.id, "batch-approved", "archive", { archived: { from: 0, to: 1 } });
      changed++;
    }
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: "completed", total_events: events.length, changed_events: changed, skipped_events: 0, errors: 0, error_details: "[]" });
  res.json({ archived: changed, total: getArchivedCount() });
});

// POST /api/curate/unarchive/:id — unarchive (keep) a single event
router.post("/unarchive/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title FROM events WHERE id = ?").get(id);
  if (!ev) return res.status(404).json({ error: "Event not found" });
  const result = db.prepare("UPDATE events SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("unarchive", { event_id: ev.id, event_title: ev.title, field_name: "archived", old_value: "1", new_value: "0" });
  logEventChange(id, "approved", "archive", { archived: { from: 1, to: 0 } });
  res.json({ ok: true });
});

// GET /api/curate/time-suggestions — events missing start_time with a time extractable from description
router.get("/time-suggestions", (_req, res) => {
  const events = getMissingTimeEvents();
  const rows = events.map((ev) => {
    const extracted = extractTimes(ev.description);
    return {
      id: ev.id,
      title: ev.title,
      start_date: ev.start_date,
      description: ev.description,
      suggested_start_time: extracted.startTime,
      suggested_end_time: extracted.endTime,
      complex: extracted.complex,
    };
  });
  res.json(rows);
});

// PATCH /api/curate/times/:id — set start_time and/or end_time on an event
router.patch("/times/:id", (req, res) => {
  const { start_time, end_time } = req.body;
  if (start_time === undefined && end_time === undefined)
    return res.status(400).json({ error: "start_time or end_time required" });
  const updates = {};
  if (start_time !== undefined) updates.start_time = start_time || null;
  if (end_time !== undefined) updates.end_time = end_time || null;
  updateEvent(parseInt(req.params.id), updates, { action: "approved", tool: "time-extraction" });
  res.json({ ok: true });
});

// GET /api/curate/price-suggestions — events missing price with a price extractable from description
router.get("/price-suggestions", (_req, res) => {
  const events = getMissingPriceEvents();
  const rows = events.map((ev) => {
    const extracted = extractPrice(ev.description);
    return {
      id: ev.id,
      title: ev.title,
      start_date: ev.start_date,
      description: ev.description,
      suggested_price: extracted.price,
      confidence: extracted.confidence,
    };
  });
  res.json(rows);
});

// PATCH /api/curate/prices/:id — set price on an event
router.patch("/prices/:id", (req, res) => {
  const { price } = req.body;
  if (price === undefined) return res.status(400).json({ error: "price required" });
  updateEvent(parseInt(req.params.id), { price: price || null }, { action: "approved", tool: "price-extraction" });
  res.json({ ok: true });
});

// GET /api/curate/duplicates — candidate duplicate pairs with confidence scores
router.get("/duplicates", (_req, res) => {
  const events = getAllEvents();
  const dismissed = new Set(getDismissedPairs().map(({ id_a, id_b }) => `${id_a}:${id_b}`));

  function normalize(s) {
    return (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
  }
  function titleSim(a, b) {
    // Dice coefficient
    if (a === b) return 1;
    const bigrams = (s) => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
    const sa = bigrams(a); const sb = bigrams(b);
    let inter = 0; for (const g of sa) if (sb.has(g)) inter++;
    return (2 * inter) / (sa.size + sb.size);
  }

  // Group by date for efficiency — only compare events on the same or adjacent date
  const byDate = {};
  for (const ev of events) {
    const d = ev.start_date || "none";
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(ev);
  }

  const pairs = [];
  const seen = new Set();

  for (const evs of Object.values(byDate)) {
    for (let i = 0; i < evs.length; i++) {
      for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i]; const b = evs[j];
        const [idA, idB] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        const key = `${idA}:${idB}`;
        if (seen.has(key) || dismissed.has(key)) continue;
        seen.add(key);

        const tA = normalize(a.title); const tB = normalize(b.title);
        const sim = titleSim(tA, tB);
        if (sim < 0.6) continue;

        // JV, Varsity, and Freshman versions of the same game are not duplicates
        const isJV = (s) => /\bjv\b/.test(s) || /\bjunior varsity\b/.test(s);
        const isVarsity = (s) => /\bvarsity\b/.test(s) && !isJV(s);
        const isFreshman = (s) => /\bfreshman\b/.test(s) || /\bfrosh\b/.test(s);
        const levels = [isJV, isVarsity, isFreshman];
        const levelOf = (s) => levels.findIndex((fn) => fn(s));
        const lA = levelOf(tA); const lB = levelOf(tB);
        if (lA !== -1 && lB !== -1 && lA !== lB) continue;

        // Boys and girls versions of the same event are not duplicates
        const isBoys = (s) => /\bboys\b/.test(s);
        const isGirls = (s) => /\bgirls\b/.test(s);
        if ((isBoys(tA) && isGirls(tB)) || (isGirls(tA) && isBoys(tB))) continue;

        let score = 0;
        if (sim === 1) score += 50; else if (sim >= 0.85) score += 35; else if (sim >= 0.6) score += 20;
        if (a.start_date && a.start_date === b.start_date) score += 25;
        const tNorm = (t) => (t || "").replace(/\s/g, "").toLowerCase();
        if (a.start_time && tNorm(a.start_time) === tNorm(b.start_time)) score += 10;
        const vA = normalize(a.venue); const vB = normalize(b.venue);
        if (vA && vB) {
          if (vA === vB) score += 15;
          else if (titleSim(vA, vB) > 0.8) score += 10;
        }

        if (score < 45) continue;
        pairs.push({ id_a: idA, id_b: idB, score, sim: Math.round(sim * 100), a, b });
      }
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  res.json(pairs.slice(0, 200)); // cap at 200 pairs
});

// POST /api/curate/duplicates/merge — merge b into a
router.post("/duplicates/merge", (req, res) => {
  const { keep_id, remove_id } = req.body;
  if (!keep_id || !remove_id) return res.status(400).json({ error: "keep_id and remove_id required" });
  const keepId = parseInt(keep_id);
  const removeId = parseInt(remove_id);
  const keep = db.prepare("SELECT id, title FROM events WHERE id = ?").get(keepId);
  const remove = db.prepare("SELECT id, title FROM events WHERE id = ?").get(removeId);
  try {
    mergeEvents(keepId, removeId);
    logSingle("merge-duplicates", {
      event_id: keepId,
      event_title: keep?.title || `Event ${keepId}`,
      field_name: "merged_from",
      old_value: remove ? `#${removeId} "${remove.title}"` : `#${removeId}`,
      new_value: `#${keepId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/curate/duplicates/dismiss — mark pair as not a duplicate
router.post("/duplicates/dismiss", (req, res) => {
  const { id_a, id_b } = req.body;
  if (!id_a || !id_b) return res.status(400).json({ error: "id_a and id_b required" });
  const a = parseInt(id_a);
  const b = parseInt(id_b);
  dismissDuplicate(a, b);
  const evA = db.prepare("SELECT id, title FROM events WHERE id = ?").get(a);
  logSingle("dismiss-duplicate", {
    event_id: a,
    event_title: evA?.title || `Event ${a}`,
    field_name: "dismissed_duplicate",
    old_value: null,
    new_value: `paired with #${b}`,
  });
  res.json({ ok: true });
});

// POST /api/curate/duplicates/dismiss-batch — dismiss many pairs at once
router.post("/duplicates/dismiss-batch", (req, res) => {
  const { pairs } = req.body;
  if (!Array.isArray(pairs)) return res.status(400).json({ error: "pairs must be an array" });

  const logResult = createEnrichmentLog({
    function_name: "dismiss-duplicate",
    started_at: new Date().toISOString(),
    total_events: pairs.length,
  });
  const logId = logResult.lastInsertRowid;

  const stmt = db.prepare("INSERT OR IGNORE INTO duplicate_dismissals (id_a, id_b) VALUES (?, ?)");
  const titleStmt = db.prepare("SELECT id, title FROM events WHERE id = ?");
  let dismissed = 0;

  const tx = db.transaction((items) => {
    for (const { id_a, id_b } of items) {
      if (!id_a || !id_b) continue;
      const [a, b] = id_a < id_b ? [id_a, id_b] : [id_b, id_a];
      const result = stmt.run(parseInt(a), parseInt(b));
      if (result.changes > 0) {
        const evA = titleStmt.get(parseInt(a));
        addEnrichmentChange(logId, {
          event_id: parseInt(a),
          event_title: evA?.title || `Event ${a}`,
          field_name: "dismissed_duplicate",
          old_value: null,
          new_value: `paired with #${b}`,
        });
        dismissed++;
      }
    }
  });
  tx(pairs);

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: pairs.length,
    changed_events: dismissed,
    skipped_events: pairs.length - dismissed,
    errors: 0,
    error_details: "[]",
  });
  res.json({ dismissed: pairs.length });
});

// POST /api/curate/duplicates/merge-batch — merge many pairs at once
router.post("/duplicates/merge-batch", (req, res) => {
  const { pairs } = req.body;
  if (!Array.isArray(pairs)) return res.status(400).json({ error: "pairs must be an array" });

  const logResult = createEnrichmentLog({
    function_name: "merge-duplicates",
    started_at: new Date().toISOString(),
    total_events: pairs.length,
  });
  const logId = logResult.lastInsertRowid;

  const titleStmt = db.prepare("SELECT id, title FROM events WHERE id = ?");
  const remap = new Map();
  const resolve = (id) => {
    let curr = id;
    while (remap.has(curr)) curr = remap.get(curr);
    return curr;
  };

  let merged = 0;
  let skipped = 0;
  const errors = [];
  const errorDetails = [];
  for (const { keep_id, remove_id } of pairs) {
    if (!keep_id || !remove_id) { skipped++; continue; }
    const keep = resolve(parseInt(keep_id));
    const remove = resolve(parseInt(remove_id));
    if (keep === remove) { skipped++; continue; }
    const keepEv = titleStmt.get(keep);
    const removeEv = titleStmt.get(remove);
    try {
      mergeEvents(keep, remove);
      remap.set(remove, keep);
      addEnrichmentChange(logId, {
        event_id: keep,
        event_title: keepEv?.title || `Event ${keep}`,
        field_name: "merged_from",
        old_value: removeEv ? `#${remove} "${removeEv.title}"` : `#${remove}`,
        new_value: `#${keep}`,
      });
      merged++;
    } catch (err) {
      errors.push({ keep_id: keep, remove_id: remove, error: err.message });
      errorDetails.push(`Events ${keep}↔${remove}: ${err.message}`);
    }
  }

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: errors.length > 0 && merged === 0 ? "failed" : "completed",
    total_events: pairs.length,
    changed_events: merged,
    skipped_events: skipped,
    errors: errors.length,
    error_details: JSON.stringify(errorDetails),
  });
  res.json({ merged, skipped, errors });
});

// ── Channel duplicate detection ─────────────────────────────────────────────

function normalizeChannelName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(the|a|an|inc|llc|ltd|co|corp|company)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Expand common US street-address abbreviations so "7801 E. State St." and
// "7801 East State Street" normalize to the same key.
const ADDRESS_EXPANSIONS = {
  st: "street", str: "street",
  ave: "avenue", av: "avenue",
  blvd: "boulevard",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  pl: "place",
  pkwy: "parkway",
  hwy: "highway",
  ter: "terrace",
  cir: "circle",
  sq: "square",
  e: "east", w: "west", n: "north", s: "south",
  ne: "northeast", nw: "northwest", se: "southeast", sw: "southwest",
};

function normalizeAddress(address, city, zip) {
  const street = (address || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\bste\s+\w+/g, " ")      // strip "ste 100"
    .replace(/\bsuite\s+\w+/g, " ")
    .replace(/\bunit\s+\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((tok) => ADDRESS_EXPANSIONS[tok] || tok)
    .join(" ");
  if (!street) return "";
  const place = (city || "").toLowerCase().trim();
  const z = (zip || "").toString().trim().slice(0, 5);
  // Include city so "100 Main Street" in two cities doesn't match
  return `${street}|${place}|${z}`;
}

function normalizeDomain(url) {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Every Eventbrite organizer's `website` is an eventbrite.com URL, so domain
// equality between two Eventbrite orgs is meaningless. Same for other platforms
// where many distinct orgs share one host.
const GENERIC_DOMAINS = new Set([
  "eventbrite.com",
  "ticketmaster.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "meetup.com",
  "rockfordlive.com",
  "gorockford.com",
  "rockbuzz.com",
]);

function diceSim(a, b) {
  if (a === b) return 1;
  if (!a || !b || a.length < 2 || b.length < 2) return 0;
  const bigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const sa = bigrams(a);
  const sb = bigrams(b);
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Common civic coordinates we should ignore when computing centroids — geocoding
// sometimes snaps to a city hall / zip centroid rather than the actual venue.
// (Not exhaustive; just protects against the obvious "everything at Rockford city hall" bucket.)
const GENERIC_COORDS = [
  [42.2711, -89.0937], // Rockford city center
];

function isGenericCoord(lat, lng) {
  for (const [glat, glng] of GENERIC_COORDS) {
    if (Math.abs(lat - glat) < 0.002 && Math.abs(lng - glng) < 0.002) return true;
  }
  return false;
}

// GET /api/curate/channel-duplicates — candidate duplicate channel pairs with scores
router.get("/channel-duplicates", (_req, res) => {
  const channels = db.prepare(`
    SELECT c.id, c.name, c.type, c.website, c.image_url, c.description,
           (SELECT COUNT(*) FROM events e WHERE e.channel_id = c.id) AS event_count
    FROM channels c
  `).all();

  // Build per-channel location fingerprints from events
  const eventLocs = db.prepare(`
    SELECT channel_id, address, city, zip, latitude, longitude
    FROM events
    WHERE channel_id IS NOT NULL
  `).all();

  const byChannel = new Map();
  for (const ev of eventLocs) {
    let entry = byChannel.get(ev.channel_id);
    if (!entry) {
      entry = { addressCounts: new Map(), lats: [], lngs: [] };
      byChannel.set(ev.channel_id, entry);
    }
    const key = normalizeAddress(ev.address, ev.city, ev.zip);
    if (key) entry.addressCounts.set(key, (entry.addressCounts.get(key) || 0) + 1);
    const lat = Number(ev.latitude);
    const lng = Number(ev.longitude);
    // lat/lng can be reasonable values — reject nulls, zeros, and obvious noise
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 && !isGenericCoord(lat, lng)) {
      entry.lats.push(lat);
      entry.lngs.push(lng);
    }
  }

  // Collapse address counts → primary (modal) address + the full set
  for (const entry of byChannel.values()) {
    let primary = null;
    let primaryCount = 0;
    for (const [addr, count] of entry.addressCounts) {
      if (count > primaryCount) { primary = addr; primaryCount = count; }
    }
    entry.primary = primary;
    entry.addresses = new Set(entry.addressCounts.keys());
  }

  const dismissed = new Set(
    getDismissedChannelPairs().map(({ id_a, id_b }) => `${id_a}:${id_b}`)
  );

  // Pre-compute normalized fields once
  for (const ch of channels) {
    ch._norm = normalizeChannelName(ch.name);
    ch._domain = normalizeDomain(ch.website);
    const loc = byChannel.get(ch.id);
    ch._addresses = loc ? loc.addresses : new Set();
    ch._primaryAddress = loc ? loc.primary : null;
    ch._centroid = loc && loc.lats.length
      ? { lat: median(loc.lats), lng: median(loc.lngs) }
      : null;
  }

  const pairs = [];
  for (let i = 0; i < channels.length; i++) {
    for (let j = i + 1; j < channels.length; j++) {
      const a = channels[i];
      const b = channels[j];
      const [idA, idB] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      if (dismissed.has(`${idA}:${idB}`)) continue;

      const sim = diceSim(a._norm, b._norm);
      const sameDomain =
        a._domain && b._domain && a._domain === b._domain && !GENERIC_DOMAINS.has(a._domain);

      // Token-subset: shorter name's tokens are all present in longer name.
      // Catches "Burpee Museum" ⊂ "Burpee Museum of Natural History" and similar
      // variants where the detector's char-bigram similarity dips below threshold.
      let subsetMatch = false;
      const aTokens = new Set(a._norm.split(" ").filter(Boolean));
      const bTokens = new Set(b._norm.split(" ").filter(Boolean));
      if (aTokens.size >= 2 && bTokens.size >= 2 && aTokens.size !== bTokens.size) {
        const [shorter, longer] = aTokens.size < bTokens.size ? [aTokens, bTokens] : [bTokens, aTokens];
        subsetMatch = [...shorter].every((t) => longer.has(t));
      }

      // Primary address = most common event address per channel.
      // Two different organizations can share a venue address for a single event,
      // so only a *primary* address match is a strong "same place" signal.
      const primaryAddressMatch = a._primaryAddress && a._primaryAddress === b._primaryAddress;
      let anyAddressOverlap = primaryAddressMatch;
      if (!anyAddressOverlap && a._addresses.size && b._addresses.size) {
        for (const addr of a._addresses) {
          if (b._addresses.has(addr)) { anyAddressOverlap = true; break; }
        }
      }

      // Same-address is a strong venue↔venue signal; weaker for organizations
      // (which can share rented venues without being the same entity).
      const bothVenues = a.type === "venue" && b.type === "venue";

      // Centroid proximity
      let distM = null;
      if (a._centroid && b._centroid) {
        distM = haversineMeters(a._centroid.lat, a._centroid.lng, b._centroid.lat, b._centroid.lng);
      }
      const closeProximity = distM != null && distM < 300;
      const moderateProximity = distM != null && distM < 1000;

      // Need at least one signal to consider the pair
      const hasLocationSignal = bothVenues && (primaryAddressMatch || closeProximity);
      if (sim < 0.55 && !sameDomain && !hasLocationSignal && !subsetMatch) continue;

      let score = 0;
      if (a._norm && a._norm === b._norm) score += 60;
      else if (sim >= 0.85) score += 40;
      else if (sim >= 0.7) score += 25;
      else if (sim >= 0.55) score += 15;

      if (subsetMatch) score += 30;
      if (sameDomain) score += 30;

      // Location signals — weighted by whether both are venues
      if (primaryAddressMatch) {
        score += bothVenues ? 40 : 10;
      } else if (anyAddressOverlap) {
        score += bothVenues ? 10 : 0;
      }
      if (!primaryAddressMatch) {
        if (closeProximity) score += bothVenues ? 25 : 5;
        else if (moderateProximity) score += bothVenues ? 5 : 0;
      }

      if (a.type && b.type && a.type === b.type) score += 5;

      if (score < 45) continue;

      // Order: higher event_count first (better default "keep")
      const [aa, bb] = a.event_count >= b.event_count ? [a, b] : [b, a];

      // Parse the composite "street|city|zip" address key back into a display string
      let matchedAddress = null;
      if (primaryAddressMatch) {
        const [street, city, zip] = a._primaryAddress.split("|");
        matchedAddress = [street, city, zip].filter(Boolean).join(", ");
      }

      pairs.push({
        id_a: aa.id,
        id_b: bb.id,
        score,
        sim: Math.round(sim * 100),
        same_domain: !!sameDomain,
        matched_domain: sameDomain ? a._domain : null,
        shared_address: !!primaryAddressMatch,
        matched_address: matchedAddress,
        subset_match: !!subsetMatch,
        proximity_m: distM != null ? Math.round(distM) : null,
        a: {
          id: aa.id, name: aa.name, type: aa.type, website: aa.website,
          image_url: aa.image_url, event_count: aa.event_count,
        },
        b: {
          id: bb.id, name: bb.name, type: bb.type, website: bb.website,
          image_url: bb.image_url, event_count: bb.event_count,
        },
      });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  res.json(pairs.slice(0, 500));
});

// POST /api/curate/channel-duplicates/merge — merge one channel into another
router.post("/channel-duplicates/merge", (req, res) => {
  const { keep_id, remove_id } = req.body;
  if (!keep_id || !remove_id) return res.status(400).json({ error: "keep_id and remove_id required" });
  const keepId = parseInt(keep_id);
  const removeId = parseInt(remove_id);
  const keep = db.prepare("SELECT id, name FROM channels WHERE id = ?").get(keepId);
  const remove = db.prepare("SELECT id, name FROM channels WHERE id = ?").get(removeId);
  try {
    mergeChannels(keepId, removeId);
    logSingle("merge-channel-duplicates", {
      event_id: null,
      event_title: keep?.name || `Channel ${keepId}`,
      field_name: "channel_merged_from",
      old_value: remove ? `#${removeId} "${remove.name}"` : `#${removeId}`,
      new_value: `#${keepId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/curate/channel-duplicates/dismiss — mark channel pair as not a duplicate
router.post("/channel-duplicates/dismiss", (req, res) => {
  const { id_a, id_b } = req.body;
  if (!id_a || !id_b) return res.status(400).json({ error: "id_a and id_b required" });
  const a = parseInt(id_a);
  const b = parseInt(id_b);
  dismissChannelDuplicate(a, b);
  const chA = db.prepare("SELECT id, name FROM channels WHERE id = ?").get(a);
  logSingle("dismiss-channel-duplicate", {
    event_id: null,
    event_title: chA?.name || `Channel ${a}`,
    field_name: "dismissed_channel_duplicate",
    old_value: null,
    new_value: `paired with #${b}`,
  });
  res.json({ ok: true });
});

// GET /api/curate/empty-channels — channels with no events
router.get("/empty-channels", (_req, res) => {
  res.json(getEmptyChannels());
});

// POST /api/curate/empty-channels/delete — bulk delete empty channels
// If body includes `ids: [...]`, only delete those (after verifying they're empty).
router.post("/empty-channels/delete", (req, res) => {
  const { ids } = req.body || {};
  const emptyChannels = getEmptyChannels();
  const emptyMap = new Map(emptyChannels.map((c) => [c.id, c]));
  const targets = Array.isArray(ids) && ids.length
    ? ids.map((raw) => emptyMap.get(parseInt(raw))).filter(Boolean)
    : emptyChannels;

  const logResult = createEnrichmentLog({
    function_name: "delete-empty-channels",
    started_at: new Date().toISOString(),
    total_events: targets.length,
  });
  const logId = logResult.lastInsertRowid;

  let deleted = 0;
  const tx = db.transaction(() => {
    for (const ch of targets) {
      deleteChannel(ch.id);
      addEnrichmentChange(logId, {
        event_id: null,
        event_title: ch.name,
        field_name: "channel_deleted",
        old_value: `#${ch.id}`,
        new_value: null,
      });
      deleted++;
    }
  });
  tx();

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: targets.length,
    changed_events: deleted,
    skipped_events: 0,
    errors: 0,
    error_details: "[]",
  });

  res.json({ deleted });
});

// POST /api/curate/channel-duplicates/dismiss-batch
router.post("/channel-duplicates/dismiss-batch", (req, res) => {
  const { pairs } = req.body;
  if (!Array.isArray(pairs)) return res.status(400).json({ error: "pairs must be an array" });

  const logResult = createEnrichmentLog({
    function_name: "dismiss-channel-duplicate",
    started_at: new Date().toISOString(),
    total_events: pairs.length,
  });
  const logId = logResult.lastInsertRowid;

  const stmt = db.prepare("INSERT OR IGNORE INTO channel_duplicate_dismissals (id_a, id_b) VALUES (?, ?)");
  const nameStmt = db.prepare("SELECT id, name FROM channels WHERE id = ?");
  let dismissed = 0;

  const tx = db.transaction((items) => {
    for (const { id_a, id_b } of items) {
      if (!id_a || !id_b) continue;
      const [a, b] = id_a < id_b ? [id_a, id_b] : [id_b, id_a];
      const result = stmt.run(parseInt(a), parseInt(b));
      if (result.changes > 0) {
        const chA = nameStmt.get(parseInt(a));
        addEnrichmentChange(logId, {
          event_id: null,
          event_title: chA?.name || `Channel ${a}`,
          field_name: "dismissed_channel_duplicate",
          old_value: null,
          new_value: `paired with #${b}`,
        });
        dismissed++;
      }
    }
  });
  tx(pairs);

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: pairs.length,
    changed_events: dismissed,
    skipped_events: pairs.length - dismissed,
    errors: 0,
    error_details: "[]",
  });
  res.json({ dismissed: pairs.length });
});

// POST /api/curate/channel-duplicates/merge-batch
router.post("/channel-duplicates/merge-batch", (req, res) => {
  const { pairs } = req.body;
  if (!Array.isArray(pairs)) return res.status(400).json({ error: "pairs must be an array" });

  const logResult = createEnrichmentLog({
    function_name: "merge-channel-duplicates",
    started_at: new Date().toISOString(),
    total_events: pairs.length,
  });
  const logId = logResult.lastInsertRowid;

  const nameStmt = db.prepare("SELECT id, name FROM channels WHERE id = ?");
  const remap = new Map();
  const resolve = (id) => {
    let curr = id;
    while (remap.has(curr)) curr = remap.get(curr);
    return curr;
  };

  let merged = 0;
  let skipped = 0;
  const errors = [];
  const errorDetails = [];
  for (const { keep_id, remove_id } of pairs) {
    if (!keep_id || !remove_id) { skipped++; continue; }
    const keep = resolve(parseInt(keep_id));
    const remove = resolve(parseInt(remove_id));
    if (keep === remove) { skipped++; continue; }
    const keepCh = nameStmt.get(keep);
    const removeCh = nameStmt.get(remove);
    try {
      mergeChannels(keep, remove);
      remap.set(remove, keep);
      addEnrichmentChange(logId, {
        event_id: null,
        event_title: keepCh?.name || `Channel ${keep}`,
        field_name: "channel_merged_from",
        old_value: removeCh ? `#${remove} "${removeCh.name}"` : `#${remove}`,
        new_value: `#${keep}`,
      });
      merged++;
    } catch (err) {
      errors.push({ keep_id: keep, remove_id: remove, error: err.message });
      errorDetails.push(`Channels ${keep}↔${remove}: ${err.message}`);
    }
  }

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: errors.length > 0 && merged === 0 ? "failed" : "completed",
    total_events: pairs.length,
    changed_events: merged,
    skipped_events: skipped,
    errors: errors.length,
    error_details: JSON.stringify(errorDetails),
  });
  res.json({ merged, skipped, errors });
});

// GET /api/curate/zip-stats — count events missing zip that can be geocoded
router.get("/zip-stats", (_req, res) => {
  const events = getEventsWithoutZip();
  res.json({ missing: events.length });
});

// POST /api/curate/geocode-zips — fill missing zips via Nominatim (rate-limited)
router.post("/geocode-zips", async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const events = getEventsWithoutZip().slice(0, limit);
  const logResult = createEnrichmentLog({ function_name: "geocode-zips", started_at: new Date().toISOString(), total_events: events.length });
  const logId = logResult.lastInsertRowid;

  let filled = 0;
  let failed = 0;
  const errorDetails = [];

  for (const ev of events) {
    try {
      const zip = await lookupZip(ev);
      if (zip) {
        updateEvent(ev.id, { zip }, { action: "enriched", tool: "geocode" });
        addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.venue || `Event ${ev.id}`, field_name: "zip", old_value: null, new_value: zip });
        filled++;
      } else {
        console.log(`[geocode] no zip found for event ${ev.id} (${ev.city}, ${ev.state})`);
        failed++;
      }
    } catch (err) {
      console.error(`[geocode] error for event ${ev.id}:`, err.message);
      errorDetails.push(`Event ${ev.id}: ${err.message}`);
      failed++;
    }
    await geocodeDelay();
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: failed === events.length && events.length > 0 ? "failed" : "completed", total_events: events.length, changed_events: filled, skipped_events: 0, errors: errorDetails.length, error_details: JSON.stringify(errorDetails) });
  const remaining = getEventsWithoutZip().length;
  res.json({ filled, failed, remaining });
});

// GET /api/curate/address-stats — breakdown of events missing address fields
router.get("/address-stats", (_req, res) => {
  res.json(getAddressStats());
});

// POST /api/curate/geocode-addresses — fill missing address fields via Nominatim (bulk, no review)
router.post("/geocode-addresses", async (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
  const events = getEventsMissingAddress().slice(0, limit);
  const logResult = createEnrichmentLog({ function_name: "geocode-addresses", started_at: new Date().toISOString(), total_events: events.length });
  const logId = logResult.lastInsertRowid;

  let filled = 0;
  let failed = 0;
  const errorDetails = [];

  for (const ev of events) {
    try {
      const result = await lookupAddress(ev);
      if (result) {
        const updates = {};
        if (result.address && !ev.address) updates.address = result.address;
        if (result.city && !ev.city) updates.city = result.city;
        if (result.state && !ev.state) updates.state = result.state;
        if (result.zip && !ev.zip) updates.zip = result.zip;
        if (result.latitude && !ev.latitude) updates.latitude = result.latitude;
        if (result.longitude && !ev.longitude) updates.longitude = result.longitude;

        if (Object.keys(updates).length > 0) {
          updateEvent(ev.id, updates, { action: "enriched", tool: "geocode" });
          for (const [field, value] of Object.entries(updates)) {
            addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.venue || `Event ${ev.id}`, field_name: field, old_value: null, new_value: String(value) });
          }
          filled++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[geocode] error for event ${ev.id}:`, err.message);
      errorDetails.push(`Event ${ev.id}: ${err.message}`);
      failed++;
    }
    await geocodeDelay();
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: failed === events.length && events.length > 0 ? "failed" : "completed", total_events: events.length, changed_events: filled, skipped_events: 0, errors: errorDetails.length, error_details: JSON.stringify(errorDetails) });
  const remaining = getEventsMissingAddress().length;
  res.json({ filled, failed, remaining });
});

// GET /api/curate/address-candidates — list events missing address fields (for review page)
router.get("/address-candidates", (_req, res) => {
  const events = getEventsMissingAddress();
  // Return with title for display
  const rows = db.prepare(`
    SELECT id, title, start_date, venue, address, city, state, zip, latitude, longitude
    FROM events
    WHERE id IN (${events.map(() => "?").join(",")})
    ORDER BY title ASC
  `).all(...events.map((e) => e.id));
  res.json(rows);
});

// GET /api/curate/geocode-preview/status — poll while a preview job is running
router.get("/geocode-preview/status", (_req, res) => {
  res.json(geocodePreviewStatus);
});

// GET /api/curate/geocode-preview/results — fetch stored suggestions after job completes
router.get("/geocode-preview/results", (_req, res) => {
  res.json({ suggestions: geocodePreviewResults, remaining: 0 });
});

// POST /api/curate/geocode-preview — look up addresses and return suggestions without writing
router.post("/geocode-preview", async (req, res) => {
  const events = getEventsMissingAddress();
  const suggestions = [];

  Object.assign(geocodePreviewStatus, { running: true, total: events.length, done: 0, found: 0 });
  geocodePreviewResults = [];

  for (const ev of events) {
    try {
      const result = await lookupAddress(ev);
      if (result) {
        const updates = {};
        if (result.address && !ev.address) updates.address = result.address;
        if (result.city && !ev.city) updates.city = result.city;
        if (result.state && !ev.state) updates.state = result.state;
        if (result.zip && !ev.zip) updates.zip = result.zip;
        if (result.latitude && !ev.latitude) updates.latitude = result.latitude;
        if (result.longitude && !ev.longitude) updates.longitude = result.longitude;

        if (Object.keys(updates).length > 0) {
          const full = db.prepare("SELECT title, venue, address, city, state, zip FROM events WHERE id = ?").get(ev.id);
          const suggestion = { id: ev.id, title: full.title, venue: full.venue, current: { address: full.address, city: full.city, state: full.state, zip: full.zip }, suggested: updates };
          suggestions.push(suggestion);
          geocodePreviewResults.push(suggestion);
          geocodePreviewStatus.found++;
        }
      }
    } catch (err) {
      console.error(`[geocode-preview] error for event ${ev.id}:`, err.message);
    }
    geocodePreviewStatus.done++;
    await geocodeDelay();
  }

  geocodePreviewStatus.running = false;
  res.json({ suggestions, remaining: 0 });
});

// POST /api/curate/geocode-apply — apply geocoded address to a single event
router.post("/geocode-apply/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;
  if (!updates || Object.keys(updates).length === 0) return res.status(400).json({ error: "No fields to update" });

  // Only allow address-related fields
  const allowed = ["address", "city", "state", "zip", "latitude", "longitude"];
  const safe = {};
  for (const k of allowed) {
    if (updates[k] !== undefined) safe[k] = updates[k];
  }
  if (Object.keys(safe).length === 0) return res.status(400).json({ error: "No valid fields" });

  const ev = db.prepare("SELECT id, title, venue FROM events WHERE id = ?").get(id);
  updateEvent(id, safe, { action: "approved", tool: "geocode" });

  const logResult = createEnrichmentLog({
    function_name: "geocode-apply",
    started_at: new Date().toISOString(),
    total_events: 1,
  });
  const logId = logResult.lastInsertRowid;
  for (const [field, value] of Object.entries(safe)) {
    addEnrichmentChange(logId, {
      event_id: id,
      event_title: ev?.title || ev?.venue || `Event ${id}`,
      field_name: field,
      old_value: null,
      new_value: String(value),
    });
  }
  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: 1,
    changed_events: 1,
    skipped_events: 0,
    errors: 0,
    error_details: "[]",
  });

  res.json({ ok: true });
});

// POST /api/curate/geocode-apply-batch — apply geocoded addresses to multiple events
router.post("/geocode-apply-batch", (req, res) => {
  const { items } = req.body; // [{ id, updates: { address, city, ... } }]
  if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

  const logResult = createEnrichmentLog({
    function_name: "geocode-apply",
    started_at: new Date().toISOString(),
    total_events: items.length,
  });
  const logId = logResult.lastInsertRowid;

  const allowed = ["address", "city", "state", "zip", "latitude", "longitude"];
  const titleStmt = db.prepare("SELECT id, title, venue FROM events WHERE id = ?");
  let applied = 0;
  let skipped = 0;

  for (const { id, updates } of items) {
    const safe = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) safe[k] = updates[k];
    }
    if (Object.keys(safe).length > 0) {
      updateEvent(id, safe, { action: "batch-approved", tool: "geocode" });
      const ev = titleStmt.get(id);
      for (const [field, value] of Object.entries(safe)) {
        addEnrichmentChange(logId, {
          event_id: id,
          event_title: ev?.title || ev?.venue || `Event ${id}`,
          field_name: field,
          old_value: null,
          new_value: String(value),
        });
      }
      applied++;
    } else {
      skipped++;
    }
  }

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: items.length,
    changed_events: applied,
    skipped_events: skipped,
    errors: 0,
    error_details: "[]",
  });

  res.json({ applied });
});

// GET /api/curate/attractions — candidate events that may be attractions rather than events
router.get("/attractions", (_req, res) => {
  res.json(getPossibleAttractions());
});

// GET /api/curate/dismissed — all dismissed events
router.get("/dismissed", (_req, res) => {
  res.json(getDismissedEvents());
});

// POST /api/curate/attractions/dismiss/:id — mark event as dismissed (not a real event)
router.post("/attractions/dismiss/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title FROM events WHERE id = ?").get(id);
  const result = dismissEvent(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("dismiss-attraction", {
    event_id: id,
    event_title: ev?.title || `Event ${id}`,
    field_name: "is_dismissed",
    old_value: "0",
    new_value: "1",
  });
  logEventChange(id, "approved", "dismiss", { is_dismissed: { from: 0, to: 1 } });
  res.json({ ok: true });
});

// POST /api/curate/attractions/undismiss/:id — restore a dismissed event
router.post("/attractions/undismiss/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title FROM events WHERE id = ?").get(id);
  const result = undismissEvent(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("undismiss-attraction", {
    event_id: id,
    event_title: ev?.title || `Event ${id}`,
    field_name: "is_dismissed",
    old_value: "1",
    new_value: "0",
  });
  logEventChange(id, "approved", "dismiss", { is_dismissed: { from: 1, to: 0 } });
  res.json({ ok: true });
});

// POST /api/curate/backfill-avatars — fetch logos for channels missing avatars
router.post("/backfill-avatars", async (req, res) => {
  const https = await import("https");

  function fetchPage(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchPage(r.headers.location).then(resolve, reject);
        }
        let data = "";
        r.on("data", (chunk) => (data += chunk));
        r.on("end", () => resolve(data));
        r.on("error", reject);
      });
    });
  }

  function checkUrl(url) {
    return new Promise((resolve) => {
      https.get(url, (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      }).on("error", () => resolve(false));
    });
  }

  try {
    // Get channels missing avatars from gorockford and rockbuzz
    const rows = db.prepare(`
      SELECT c.id, c.name, es.source_url, es.source_name
      FROM channels c
      JOIN events e ON e.channel_id = c.id
      JOIN event_sources es ON es.event_id = e.id AND es.source_name IN ('gorockford', 'rockbuzz')
      WHERE (c.image_url IS NULL OR c.image_url = '')
      GROUP BY c.id
    `).all();

    const logResult = createEnrichmentLog({
      function_name: "backfill-avatars",
      started_at: new Date().toISOString(),
      total_events: rows.length,
    });
    const logId = logResult.lastInsertRowid;

    res.json({ started: true, total: rows.length, log_id: logId });

    let updated = 0;
    let failed = 0;
    const errorDetails = [];
    const cache = new Map();

    for (const row of rows) {
      try {
        let logo = "";

        if (row.source_name === "gorockford") {
          const eventHtml = await fetchPage(row.source_url);
          const listingMatch = eventHtml.match(/\/listing\/[^"]+/);
          if (!listingMatch) { failed++; continue; }

          const listingPath = listingMatch[0];
          if (!cache.has(listingPath)) {
            const listingHtml = await fetchPage(`https://www.gorockford.com${listingPath}`);
            const ldMatch = listingHtml.match(/<script type="application\/ld\+json">([^<]*)<\/script>/);
            if (ldMatch) {
              try {
                const ld = JSON.parse(ldMatch[1]);
                cache.set(listingPath, ld.logo || ld.image || "");
              } catch { cache.set(listingPath, ""); }
            } else {
              cache.set(listingPath, "");
            }
          }
          logo = cache.get(listingPath);

        } else if (row.source_name === "rockbuzz") {
          const eventHtml = await fetchPage(row.source_url);
          const pageMatch = eventHtml.match(/\/page\/([a-f0-9-]+)/);
          if (!pageMatch) { failed++; continue; }

          const pageId = pageMatch[1];
          if (!cache.has(pageId)) {
            // Try logo.jpeg, then logo.png
            const base = `https://vnofwotiydfyzfefvces.supabase.co/storage/v1/object/public/page-media/${pageId}`;
            if (await checkUrl(`${base}/logo.jpeg`)) {
              cache.set(pageId, `${base}/logo.jpeg`);
            } else if (await checkUrl(`${base}/logo.png`)) {
              cache.set(pageId, `${base}/logo.png`);
            } else {
              cache.set(pageId, "");
            }
          }
          logo = cache.get(pageId);
        }

        if (logo) {
          db.prepare("UPDATE channels SET image_url = ?, updated_at = ? WHERE id = ?")
            .run(logo, new Date().toISOString(), row.id);
          addEnrichmentChange(logId, {
            event_id: null,
            event_title: row.name,
            field_name: "image_url",
            old_value: null,
            new_value: logo,
          });
          updated++;
          console.log(`  [avatar] ${row.name} ✓`);
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        errorDetails.push(`${row.name}: ${err.message}`);
        console.log(`  [avatar] ${row.name} ✗ ${err.message}`);
      }
    }

    completeEnrichmentLog(logId, {
      completed_at: new Date().toISOString(),
      status: failed === rows.length && rows.length > 0 ? "failed" : "completed",
      total_events: rows.length,
      changed_events: updated,
      skipped_events: failed,
      errors: errorDetails.length,
      error_details: JSON.stringify(errorDetails),
    });
    console.log(`Avatar backfill done: ${updated} updated, ${failed} failed out of ${rows.length}`);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── City audit ──────────────────────────────────────────────────────────────

const WHITELISTED_CITIES = [
  // Rockford hub
  "rockford", "cherry valley", "new milford", "machesney park", "loves park",
  // Stateline hub
  "roscoe", "rockton", "south beloit", "beloit",
  // Belvidere hub
  "belvidere", "poplar grove",
  // Nearby Towns hub
  "pecatonica", "winnebago", "durand", "byron", "rochelle", "oregon", "freeport",
  // Northern Illinois hub
  "dixon", "sterling", "dekalb", "galena", "ottawa", "lasalle-peru", "lasalle", "peru", "janesville", "monroe",
  // Chicago Collar hub
  "mchenry", "woodstock", "crystal lake", "joliet", "kankakee", "lake geneva",
];

function isCityWhitelisted(city) {
  if (!city || !city.trim()) return true; // empty cities are a separate problem
  return WHITELISTED_CITIES.includes(city.trim().toLowerCase());
}

// GET /api/curate/city-audit — events with non-whitelisted cities
router.get("/city-audit", (_req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.title, e.start_date, e.start_time, e.city, e.venue, e.state, e.zip
    FROM events e
    WHERE e.archived = 0 AND e.is_dismissed = 0 AND e.city_reviewed = 0
      AND e.city IS NOT NULL AND e.city != ''
    ORDER BY e.city, e.start_date
  `).all();
  const flagged = rows.filter((r) => !isCityWhitelisted(r.city));
  res.json(flagged);
});

// GET /api/curate/city-audit/stats
router.get("/city-audit/stats", (_req, res) => {
  const rows = db.prepare(`
    SELECT e.city, COUNT(*) as count
    FROM events e
    WHERE e.archived = 0 AND e.is_dismissed = 0 AND e.city_reviewed = 0
      AND e.city IS NOT NULL AND e.city != ''
    GROUP BY e.city
  `).all();
  const flagged = rows.filter((r) => !isCityWhitelisted(r.city));
  const total = flagged.reduce((sum, r) => sum + r.count, 0);
  res.json({ total, cities: flagged });
});

// POST /api/curate/city-audit/accept/:id — mark event city as reviewed/OK
router.post("/city-audit/accept/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title, city FROM events WHERE id = ?").get(id);
  const result = db.prepare("UPDATE events SET city_reviewed = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("city-audit-accept", {
    event_id: id,
    event_title: ev?.title || `Event ${id}`,
    field_name: "city_reviewed",
    old_value: ev?.city || null,
    new_value: "1",
  });
  logEventChange(id, "approved", "city-audit", { city_reviewed: { from: 0, to: 1 } });
  res.json({ ok: true });
});

// POST /api/curate/city-audit/accept-all — accept all flagged events
router.post("/city-audit/accept-all", (_req, res) => {
  const rows = db.prepare(`
    SELECT e.id, e.title, e.city
    FROM events e
    WHERE e.archived = 0 AND e.is_dismissed = 0 AND e.city_reviewed = 0
      AND e.city IS NOT NULL AND e.city != ''
  `).all();
  const flagged = rows.filter((r) => !isCityWhitelisted(r.city));
  const ids = flagged.map((r) => r.id);

  const logResult = createEnrichmentLog({
    function_name: "city-audit-accept",
    started_at: new Date().toISOString(),
    total_events: flagged.length,
  });
  const logId = logResult.lastInsertRowid;

  if (ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`UPDATE events SET city_reviewed = 1, updated_at = datetime('now') WHERE id IN (${placeholders})`).run(...ids);
    for (const ev of flagged) {
      addEnrichmentChange(logId, {
        event_id: ev.id,
        event_title: ev.title || `Event ${ev.id}`,
        field_name: "city_reviewed",
        old_value: ev.city,
        new_value: "1",
      });
      logEventChange(ev.id, "batch-approved", "city-audit", { city_reviewed: { from: 0, to: 1 } });
    }
  }

  completeEnrichmentLog(logId, {
    completed_at: new Date().toISOString(),
    status: "completed",
    total_events: flagged.length,
    changed_events: ids.length,
    skipped_events: 0,
    errors: 0,
    error_details: "[]",
  });

  res.json({ accepted: ids.length });
});

// POST /api/curate/city-audit/dismiss/:id — dismiss (archive) event
router.post("/city-audit/dismiss/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ev = db.prepare("SELECT id, title FROM events WHERE id = ?").get(id);
  const result = db.prepare("UPDATE events SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  logSingle("city-audit-dismiss", {
    event_id: id,
    event_title: ev?.title || `Event ${id}`,
    field_name: "archived",
    old_value: "0",
    new_value: "1",
  });
  logEventChange(id, "approved", "city-audit", { archived: { from: 0, to: 1 } });
  res.json({ ok: true });
});

// ── Sports fallback images ──────────────────────────────────────────────────

// Get all events that match a sport — used to compute "needs fallback" stats.
function getSportEventsMissingImage() {
  const rows = db.prepare(`
    SELECT e.id, e.title, e.tags, e.category, e.image_url
    FROM events e
    WHERE e.archived = 0 AND e.is_dismissed = 0
      AND (e.image_url IS NULL OR e.image_url = '' OR e.image_url LIKE :prefix)
  `).all({ prefix: `${FALLBACK_URL_PREFIX}%` });

  // Attach taxonomy so detection can prefer category assignments over keyword guesses.
  const taxStmt = db.prepare(`
    SELECT c.slug, c.parent_id, p.slug as parent_slug
    FROM event_categories ec
    JOIN categories c ON c.id = ec.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE ec.event_id = ?
  `);
  for (const ev of rows) {
    ev.taxonomy = taxStmt.all(ev.id);
  }
  return rows;
}

// GET /api/curate/sports-fallback-stats — counts for the curation card
router.get("/sports-fallback-stats", (_req, res) => {
  const candidates = getSportEventsMissingImage();
  const counts = {}; // slug → { matched, applied }
  let matched = 0;
  let applied = 0;

  for (const ev of candidates) {
    const slug = detectFallbackSlug(ev);
    if (!slug) continue;
    matched++;
    counts[slug] ??= { matched: 0, applied: 0 };
    counts[slug].matched++;
    if (ev.image_url && ev.image_url.startsWith(FALLBACK_URL_PREFIX)) {
      applied++;
      counts[slug].applied++;
    }
  }

  res.json({ matched, applied, pending: matched - applied, by_slug: counts });
});

// POST /api/curate/sports-fallback-images — assign fallback images to sports events
router.post("/sports-fallback-images", (_req, res) => {
  const candidates = getSportEventsMissingImage();
  const logResult = createEnrichmentLog({ function_name: "sports-fallback-images", started_at: new Date().toISOString(), total_events: candidates.length });
  const logId = logResult.lastInsertRowid;

  let applied = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  for (const ev of candidates) {
    try {
      const slug = detectFallbackSlug(ev);
      if (!slug) { skipped++; continue; }

      const filename = `${slug}.png`;
      if (!fs.existsSync(path.join(FALLBACK_DIR, filename))) {
        skipped++;
        errorDetails.push(`Event ${ev.id}: fallback image ${filename} missing on disk`);
        continue;
      }

      const newUrl = `${FALLBACK_URL_PREFIX}${filename}`;
      if (ev.image_url === newUrl) { skipped++; continue; }

      updateEvent(ev.id, { image_url: newUrl }, { action: "enriched", tool: "fallback-images" });
      addEnrichmentChange(logId, { event_id: ev.id, event_title: ev.title, field_name: "image_url", old_value: ev.image_url || null, new_value: newUrl });
      applied++;
    } catch (err) {
      errors++;
      errorDetails.push(`Event ${ev.id}: ${err.message}`);
    }
  }

  completeEnrichmentLog(logId, { completed_at: new Date().toISOString(), status: errors > 0 && applied === 0 ? "failed" : "completed", total_events: candidates.length, changed_events: applied, skipped_events: skipped, errors, error_details: JSON.stringify(errorDetails) });
  res.json({ applied, skipped, errors });
});

// ── Featured candidates ───────────────────────────────────────────────────────

const FEATURED_SOURCES = ["ticketmaster", "hardrock", "rivets", "rockfordlive"];

router.get("/featured-stats", (_req, res) => {
  const featuredCat = db.prepare("SELECT id FROM categories WHERE slug = 'featured'").get();
  if (!featuredCat) return res.json({ featured: 0, candidates: 0 });
  const featured = db.prepare(`
    SELECT COUNT(DISTINCT e.id) as count FROM events e
    JOIN event_categories ec ON ec.event_id = e.id
    WHERE ec.category_id = ? AND e.archived = 0 AND e.is_dismissed = 0
  `).get(featuredCat.id).count;
  const candidates = db.prepare(`
    SELECT COUNT(DISTINCT e.id) as count FROM events e
    LEFT JOIN event_sources es ON es.event_id = e.id
    WHERE e.archived = 0 AND e.is_dismissed = 0
    AND NOT EXISTS (SELECT 1 FROM event_categories ec WHERE ec.event_id = e.id AND ec.category_id = ?)
    AND (
      es.source_name IN (${FEATURED_SOURCES.map(() => "?").join(",")})
      OR e.ticket_url IS NOT NULL
    )
  `).get(featuredCat.id, ...FEATURED_SOURCES).count;
  res.json({ featured, candidates });
});

router.get("/featured-candidates", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 50);
  const offset = (page - 1) * limit;
  const showFeatured = req.query.showFeatured === "1";
  const sourceFilter = req.query.source;
  const channelFilter = req.query.channel_id ? parseInt(req.query.channel_id) : null;
  const ticketsOnly = req.query.has_tickets === "1";

  const featuredCat = db.prepare("SELECT id FROM categories WHERE slug = 'featured'").get();
  if (!featuredCat) return res.json([]);

  const isFeaturedExpr = `EXISTS (SELECT 1 FROM event_categories ec WHERE ec.event_id = e.id AND ec.category_id = ${featuredCat.id})`;
  const conditions = ["e.archived = 0", "e.is_dismissed = 0", "NOT EXISTS (SELECT 1 FROM featured_dismissals fd WHERE fd.event_id = e.id)"];
  if (!showFeatured) conditions.push(`NOT (${isFeaturedExpr})`);
  if (sourceFilter) conditions.push(`EXISTS (SELECT 1 FROM event_sources es2 WHERE es2.event_id = e.id AND es2.source_name = '${sourceFilter.replace(/'/g, "''")}')`);
  if (channelFilter) conditions.push(`e.channel_id = ${channelFilter}`);
  if (ticketsOnly) conditions.push("e.ticket_url IS NOT NULL");

  const where = `WHERE ${conditions.join(" AND ")}
    AND EXISTS (SELECT 1 FROM event_sources es2 WHERE es2.event_id = e.id AND es2.source_name IN (${FEATURED_SOURCES.map(() => "?").join(",")}))`;

  const events = db.prepare(`
    SELECT DISTINCT e.*, GROUP_CONCAT(es.source_name) as sources,
      (SELECT es2.source_name FROM event_sources es2 WHERE es2.event_id = e.id AND es2.source_name IN (${FEATURED_SOURCES.map(() => "?").join(",")}) LIMIT 1) as featured_source_match,
      CASE WHEN e.ticket_url IS NOT NULL THEN 1 ELSE 0 END as has_ticket_url,
      ${isFeaturedExpr} as featured
    FROM events e
    LEFT JOIN event_sources es ON es.event_id = e.id
    ${where}
    GROUP BY e.id
    ORDER BY e.start_date ASC
    LIMIT ? OFFSET ?
  `).all(...FEATURED_SOURCES, ...FEATURED_SOURCES, limit, offset);

  const totalRow = db.prepare(`
    SELECT COUNT(DISTINCT e.id) as count FROM events e
    LEFT JOIN event_sources es ON es.event_id = e.id
    ${where}
  `).get(...FEATURED_SOURCES);

  res.json({ events, total: totalRow.count });
});

router.post("/feature/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { featured } = req.body;
  const featuredCat = db.prepare("SELECT id FROM categories WHERE slug = 'featured'").get();
  if (!featuredCat) return res.status(500).json({ error: "Featured category not found" });
  if (featured) {
    db.prepare("INSERT OR IGNORE INTO event_categories (event_id, category_id) VALUES (?, ?)").run(id, featuredCat.id);
  } else {
    db.prepare("DELETE FROM event_categories WHERE event_id = ? AND category_id = ?").run(id, featuredCat.id);
  }
  res.json({ success: true });
});

router.post("/featured-candidates/dismiss/:id", (req, res) => {
  const id = parseInt(req.params.id);
  db.prepare("INSERT OR IGNORE INTO featured_dismissals (event_id) VALUES (?)").run(id);
  res.json({ ok: true });
});

router.post("/featured-candidates/dismiss-batch", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: "ids required" });
  const stmt = db.prepare("INSERT OR IGNORE INTO featured_dismissals (event_id) VALUES (?)");
  const tx = db.transaction((items) => { for (const id of items) stmt.run(parseInt(id)); });
  tx(ids);
  res.json({ dismissed: ids.length });
});

// ── Enrichment logs ─────────────────────────────────────────────────────────

import { getEnrichmentLogs, getEnrichmentChanges } from "../db.js";

router.get("/enrichment-logs", (_req, res) => {
  res.json(getEnrichmentLogs());
});

router.get("/enrichment-logs/:id/changes", (req, res) => {
  const changes = getEnrichmentChanges(parseInt(req.params.id));
  res.json(changes);
});


export default router;
