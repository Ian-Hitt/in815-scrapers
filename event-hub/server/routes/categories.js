import { Router } from "express";
import db from "../db.js";
import { getCategories, addEventCategory, removeEventCategory, getEventCategories } from "../db.js";

const router = Router();

// GET /api/categories — full category tree
router.get("/", (_req, res) => {
  res.json(getCategories());
});

// GET /api/categories/event/:eventId — categories assigned to an event
router.get("/event/:eventId", (req, res) => {
  res.json(getEventCategories(parseInt(req.params.eventId)));
});

// POST /api/categories/event/:eventId — assign a category to an event
router.post("/event/:eventId", (req, res) => {
  const { category_id } = req.body;
  if (!category_id) return res.status(400).json({ error: "category_id required" });
  addEventCategory(parseInt(req.params.eventId), parseInt(category_id));
  res.json(getEventCategories(parseInt(req.params.eventId)));
});

// DELETE /api/categories/event/:eventId/:categoryId — remove a category from an event
router.delete("/event/:eventId/:categoryId", (req, res) => {
  removeEventCategory(parseInt(req.params.eventId), parseInt(req.params.categoryId));
  res.json(getEventCategories(parseInt(req.params.eventId)));
});

// POST /api/categories/events/bulk-add — add a category to many events
router.post("/events/bulk-add", (req, res) => {
  try {
    const { event_ids, category_id } = req.body;
    if (!Array.isArray(event_ids) || event_ids.length === 0 || !category_id) {
      return res.status(400).json({ error: "event_ids and category_id required" });
    }
    const stmt = db.prepare("INSERT OR IGNORE INTO event_categories (event_id, category_id) VALUES (?, ?)");
    const addMany = db.transaction((ids) => ids.forEach((id) => stmt.run(id, parseInt(category_id))));
    addMany(event_ids);
    res.json({ added: event_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/categories/events/bulk-remove — remove a category from many events
router.post("/events/bulk-remove", (req, res) => {
  try {
    const { event_ids, category_id } = req.body;
    if (!Array.isArray(event_ids) || event_ids.length === 0 || !category_id) {
      return res.status(400).json({ error: "event_ids and category_id required" });
    }
    const placeholders = event_ids.map(() => "?").join(", ");
    db.prepare(`DELETE FROM event_categories WHERE category_id = ? AND event_id IN (${placeholders})`).run(parseInt(category_id), ...event_ids);
    res.json({ removed: event_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
