import { Router } from "express";
import db from "../db.js";
import { searchEvents, getEventWithSources, getEventPushes, insertEvent, updateEvent, deleteEventById, addEventSource, logEventChange, getEventChangelog } from "../db.js";

const EVENT_FIELDS = [
  "title", "start_date", "start_time", "end_date", "end_time", "description",
  "venue", "address", "city", "state", "zip", "latitude", "longitude",
  "category", "tags", "price", "image_url", "url", "external_url",
  "contact", "organizer", "is_online", "recurring", "recurrence_frequency",
  "recurrence_end_date", "rrule", "channel_id", "featured", "ticket_url",
];

function pickEventFields(body) {
  const data = {};
  for (const k of EVENT_FIELDS) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  return data;
}

const router = Router();

router.get("/", (req, res) => {
  try {
    const result = searchEvents({
      search: req.query.search,
      source: req.query.source,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      category: req.query.category,
      taxonomy: req.query.taxonomy,
      recurring: req.query.recurring,
      channel: req.query.channel,
      completeness: req.query.completeness,
      missingField: req.query.missing_field,
      realmsPushed: req.query.realms_pushed,
      realmsEnvironment: req.query.realms_environment,
      pricing: req.query.pricing,
      excludeTaxonomy: req.query.excludeTaxonomy,
      hasTickets: req.query.has_tickets,
      minScore: req.query.min_score,
      includeArchived: req.query.include_archived === "1",
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      sort: req.query.sort,
    });

    // Augment events with push status for the requested environment
    const envId = parseInt(req.query.realms_environment);
    if (envId && result.events) {
      const pushStmt = db.prepare(
        "SELECT realms_id, pushed_at as realms_pushed_at, push_error as realms_push_error FROM realms_event_pushes WHERE event_id = ? AND environment_id = ?"
      );
      for (const ev of result.events) {
        const push = pushStmt.get(ev.id, envId);
        ev.realms_id = push?.realms_id || null;
        ev.realms_pushed_at = push?.realms_pushed_at || null;
        ev.realms_push_error = push?.realms_push_error || null;
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/ids", (req, res) => {
  try {
    const ids = searchEvents({
      search: req.query.search,
      source: req.query.source,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      category: req.query.category,
      taxonomy: req.query.taxonomy,
      recurring: req.query.recurring,
      channel: req.query.channel,
      completeness: req.query.completeness,
      missingField: req.query.missing_field,
      realmsPushed: req.query.realms_pushed,
      realmsEnvironment: req.query.realms_environment,
      pricing: req.query.pricing,
      excludeTaxonomy: req.query.excludeTaxonomy,
      hasTickets: req.query.has_tickets,
      minScore: req.query.min_score,
      includeArchived: req.query.include_archived === "1",
      sort: req.query.sort,
      idsOnly: true,
    });
    res.json({ ids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", (req, res) => {
  try {
    const data = pickEventFields(req.body);
    if (!data.title || !data.start_date) {
      return res.status(400).json({ error: "title and start_date are required" });
    }

    const full = {
      title: data.title,
      start_date: data.start_date,
      start_time: data.start_time ?? null,
      end_date: data.end_date ?? null,
      end_time: data.end_time ?? null,
      description: data.description ?? null,
      venue: data.venue ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      zip: data.zip ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      category: data.category ?? null,
      tags: data.tags ?? null,
      price: data.price ?? null,
      image_url: data.image_url ?? null,
      url: data.url ?? null,
      external_url: data.external_url ?? null,
      contact: data.contact ?? null,
      organizer: data.organizer ?? null,
      is_online: data.is_online ? 1 : 0,
      recurring: data.recurring ? 1 : 0,
      recurrence_frequency: data.recurrence_frequency ?? null,
      recurrence_end_date: data.recurrence_end_date ?? null,
    };

    const result = insertEvent(full, { action: "edited", tool: null });
    const id = result.lastInsertRowid;

    const extras = {};
    if (data.channel_id !== undefined) extras.channel_id = data.channel_id || null;
    if (data.rrule !== undefined) extras.rrule = data.rrule || null;
    if (Object.keys(extras).length) updateEvent(id, extras, { action: "edited", tool: null });

    addEventSource({
      event_id: id,
      source_name: "manual",
      source_id: `manual-${id}`,
      source_url: null,
      import_log_id: null,
    });

    res.status(201).json(getEventWithSources(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bulk-delete", (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }
    const placeholders = ids.map(() => "?").join(", ");
    const result = db.prepare(`DELETE FROM events WHERE id IN (${placeholders})`).run(...ids);
    res.json({ deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/bulk", (req, res) => {
  try {
    const { ids, ...fields } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array required" });
    }
    const data = pickEventFields(fields);
    if ("is_online" in data) data.is_online = data.is_online ? 1 : 0;
    if ("recurring" in data) data.recurring = data.recurring ? 1 : 0;
    if ("channel_id" in data && data.channel_id === "") data.channel_id = null;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const setClauses = Object.keys(data).map((k) => `${k} = ?`).join(", ");
    const idPlaceholders = ids.map(() => "?").join(", ");
    db.prepare(`UPDATE events SET ${setClauses}, updated_at = datetime('now') WHERE id IN (${idPlaceholders})`).run(...Object.values(data), ...ids);
    const changes = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, { from: null, to: v }]));
    for (const id of ids) logEventChange(id, "edited", null, changes);
    res.json({ updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", (req, res) => {
  const event = getEventWithSources(parseInt(req.params.id));
  if (!event) return res.status(404).json({ error: "Event not found" });
  event.realms_pushes = getEventPushes(event.id);
  res.json(event);
});

router.patch("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = getEventWithSources(id);
    if (!existing) return res.status(404).json({ error: "Event not found" });
    const data = pickEventFields(req.body);
    if ("is_online" in data) data.is_online = data.is_online ? 1 : 0;
    if ("recurring" in data) data.recurring = data.recurring ? 1 : 0;
    if ("channel_id" in data && data.channel_id === "") data.channel_id = null;
    updateEvent(id, data, { action: "edited", tool: null });
    res.json(getEventWithSources(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id/changelog", (req, res) => {
  const id = parseInt(req.params.id);
  const log = getEventChangelog(id);
  res.json(log.map((entry) => ({ ...entry, changes: entry.changes ? JSON.parse(entry.changes) : null })));
});

router.delete("/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const result = deleteEventById(id);
  if (result.changes === 0) return res.status(404).json({ error: "Event not found" });
  res.json({ success: true });
});

export default router;
