import express from "express";
import db from "../db.js";
import { createRealmChannel, createRealmCategory, createRealmHub, createRealmEvent, updateRealmEvent, getRealmCategories, getRealmHubs, toCategorySlug } from "../realms.js";
import { createExportLog, updateExportLogProgress, completeExportLog, getExportLogs, getExportLog, addExportLogEvent, getExportLogEvents, logEventChange } from "../db.js";
import { resolveHubForEvent, HUBS } from "../hubs.js";

const router = express.Router();

let pushReadyAborted = false;
let pushReadyRunning = false;

const PUSH_CONCURRENCY = parseInt(process.env.REALMS_PUSH_CONCURRENCY || "4", 10);

/**
 * Run `worker(item)` over `items` with at most `limit` in flight at a time.
 * Results are returned in input order. The worker must not throw — wrap work
 * in try/catch inside the worker if failures should be recorded rather than
 * aborting the whole run.
 */
async function runLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEnvironment(envId) {
  return db.prepare("SELECT * FROM realms_environments WHERE id = ?").get(envId) || null;
}

function getEnvironments() {
  return db.prepare("SELECT id, name, base_url, slug, sort_order, created_at, updated_at FROM realms_environments ORDER BY sort_order, name").all();
}

function getEvent(id) {
  return db.prepare("SELECT * FROM events WHERE id = ?").get(id) || null;
}

function getChannelForEvent(event) {
  if (!event.channel_id) return null;
  return db.prepare("SELECT * FROM channels WHERE id = ?").get(event.channel_id) || null;
}

function getCategoriesForEvent(eventId, envId) {
  return db.prepare(`
    SELECT c.id, c.name, c.slug, c.parent_id,
           rcp.realms_id,
           p.id as parent_db_id, p.name as parent_name, p.slug as parent_slug,
           prcp.realms_id as parent_realms_id
    FROM event_categories ec
    JOIN categories c ON c.id = ec.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    LEFT JOIN realms_category_pushes rcp ON rcp.category_id = c.id AND rcp.environment_id = ?
    LEFT JOIN realms_category_pushes prcp ON prcp.category_id = p.id AND prcp.environment_id = ?
    WHERE ec.event_id = ?
  `).all(envId, envId, eventId);
}

function saveCategoryRealmsId(categoryId, envId, realmsId) {
  db.prepare(`
    INSERT INTO realms_category_pushes (category_id, environment_id, realms_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(category_id, environment_id) DO UPDATE SET realms_id = excluded.realms_id, updated_at = datetime('now')
  `).run(categoryId, envId, realmsId);
}

async function syncCategoriesForEvent(eventId, env, envId) {
  const cats = getCategoriesForEvent(eventId, envId);
  if (!cats.length) return [];

  const realmsIds = [];

  for (const cat of cats) {
    if (cat.parent_db_id && !cat.parent_realms_id) {
      const parentRow = db.prepare("SELECT * FROM categories WHERE id = ?").get(cat.parent_db_id);
      const created = await createRealmCategory(env, parentRow, null);
      saveCategoryRealmsId(parentRow.id, envId, created.id);
      cat.parent_realms_id = created.id;
    }

    let realmsId = cat.realms_id;
    if (!realmsId) {
      const created = await createRealmCategory(env, cat, cat.parent_realms_id || null);
      saveCategoryRealmsId(cat.id, envId, created.id);
      realmsId = created.id;
    }

    realmsIds.push(realmsId);
  }

  return realmsIds;
}

function getHubRealmsId(hubSlug, envId) {
  const row = db.prepare("SELECT realms_id FROM realms_hub_pushes WHERE hub_slug = ? AND environment_id = ?").get(hubSlug, envId);
  return row?.realms_id || null;
}

function saveHubRealmsId(hubSlug, envId, realmsId) {
  db.prepare(`
    INSERT INTO realms_hub_pushes (hub_slug, environment_id, realms_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(hub_slug, environment_id) DO UPDATE SET realms_id = excluded.realms_id, updated_at = datetime('now')
  `).run(hubSlug, envId, realmsId);
}

/**
 * Resolve the hub for an event and ensure it exists in Realms.
 * Returns an array with a single Realms hub ID (or empty if resolution fails).
 */
async function syncHubForEvent(event, env, envId) {
  const hub = resolveHubForEvent(event);
  if (!hub) return [];

  let realmsId = getHubRealmsId(hub.slug, envId);
  if (!realmsId) {
    const created = await createRealmHub(env, hub);
    saveHubRealmsId(hub.slug, envId, created.id);
    realmsId = created.id;
  }

  return [realmsId];
}

function saveChannelRealmsId(channelId, envId, realmsId, slug) {
  db.prepare(`
    INSERT INTO realms_channel_pushes (channel_id, environment_id, realms_id, realms_slug, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(channel_id, environment_id) DO UPDATE SET realms_id = excluded.realms_id, realms_slug = excluded.realms_slug, updated_at = datetime('now')
  `).run(channelId, envId, realmsId, slug);
}

function saveEventRealmsId(eventId, envId, realmsId, { coverUploadId = null, coverSourceUrl = null } = {}) {
  db.prepare(`
    INSERT INTO realms_event_pushes (event_id, environment_id, realms_id, pushed_at, push_error, cover_upload_id, cover_source_url, updated_at)
    VALUES (?, ?, ?, datetime('now'), NULL, ?, ?, datetime('now'))
    ON CONFLICT(event_id, environment_id) DO UPDATE SET
      realms_id = excluded.realms_id,
      pushed_at = datetime('now'),
      push_error = NULL,
      cover_upload_id = excluded.cover_upload_id,
      cover_source_url = excluded.cover_source_url,
      updated_at = datetime('now')
  `).run(eventId, envId, realmsId, coverUploadId, coverSourceUrl);
}

function saveEventPushError(eventId, envId, error) {
  db.prepare(`
    INSERT INTO realms_event_pushes (event_id, environment_id, push_error, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(event_id, environment_id) DO UPDATE SET push_error = excluded.push_error, updated_at = datetime('now')
  `).run(eventId, envId, error);
}

/**
 * Core push logic for a single event to a specific environment.
 * force=true: update if already pushed, instead of skipping.
 */
async function pushEvent(eventId, envId, { force = false, envOverride = null } = {}) {
  const tTotal = Date.now();
  const env = envOverride || getEnvironment(envId);
  if (!env) throw Object.assign(new Error("Realms environment not found"), { status: 404 });

  const event = getEvent(eventId);
  if (!event) throw Object.assign(new Error("Event not found"), { status: 404 });
  console.log(`[realms:timing] ── event ${eventId} "${event.title?.slice(0, 60)}" start ──`);

  // Look up push status for this environment
  const pushRecord = db.prepare(
    "SELECT * FROM realms_event_pushes WHERE event_id = ? AND environment_id = ?"
  ).get(eventId, envId);

  const existingRealmsId = pushRecord?.realms_id || null;

  if (existingRealmsId && !force) {
    return { ok: true, realms_id: existingRealmsId, already_pushed: true };
  }

  if (existingRealmsId && force) {
    const tCat = Date.now();
    const [categoryRealmsIds, hubRealmsIds] = await Promise.all([
      syncCategoriesForEvent(event.id, env, envId),
      syncHubForEvent(event, env, envId),
    ]);
    console.log(`[realms:timing] sync-categories+hubs ${Date.now() - tCat}ms (${categoryRealmsIds.length} cats, ${hubRealmsIds.length} hubs)`);
    const result = await updateRealmEvent(env, existingRealmsId, event, {
      categoryRealmsIds,
      hubRealmsIds,
      cachedUploadId: pushRecord?.cover_upload_id || null,
      cachedSourceUrl: pushRecord?.cover_source_url || null,
    });
    saveEventRealmsId(event.id, envId, existingRealmsId, {
      coverUploadId: result.uploadId,
      coverSourceUrl: result.sourceUrl,
    });
    logEventChange(event.id, "exported", "realms", null);
    console.log(`[realms:timing] ── event ${eventId} TOTAL ${Date.now() - tTotal}ms (updated) ──`);
    return { ok: true, realms_id: existingRealmsId, updated: true };
  }

  const channel = getChannelForEvent(event);
  if (!channel) throw Object.assign(new Error("Event has no channel assigned — assign a channel before pushing"), { status: 400 });

  // Look up channel push for this environment
  const channelPush = db.prepare(
    "SELECT * FROM realms_channel_pushes WHERE channel_id = ? AND environment_id = ?"
  ).get(channel.id, envId);

  let channelRealmsId = channelPush?.realms_id || null;

  if (!channelRealmsId) {
    const tCh = Date.now();
    const realmChannel = await createRealmChannel(env, channel);
    console.log(`[realms:timing] create-channel ${Date.now() - tCh}ms`);
    saveChannelRealmsId(channel.id, envId, realmChannel.id, realmChannel.slug);
    channelRealmsId = realmChannel.id;
  }

  // Build a channel-like object with the environment-specific realms_id
  const channelForRealms = { ...channel, realms_id: channelRealmsId };

  const tCat = Date.now();
  const [categoryRealmsIds, hubRealmsIds] = await Promise.all([
    syncCategoriesForEvent(event.id, env, envId),
    syncHubForEvent(event, env, envId),
  ]);
  console.log(`[realms:timing] sync-categories+hubs ${Date.now() - tCat}ms (${categoryRealmsIds.length} cats, ${hubRealmsIds.length} hubs)`);
  let realmEvent;
  try {
    realmEvent = await createRealmEvent(env, event, channelForRealms, {
      categoryRealmsIds,
      hubRealmsIds,
      cachedUploadId: pushRecord?.cover_upload_id || null,
      cachedSourceUrl: pushRecord?.cover_source_url || null,
    });
  } catch (err) {
    console.error(`[realms:push] createEvent failed for event ${eventId} "${event.title?.slice(0, 60)}": ${err.message}`);
    throw err;
  }
  saveEventRealmsId(event.id, envId, realmEvent.id, {
    coverUploadId: realmEvent.uploadId,
    coverSourceUrl: realmEvent.sourceUrl,
  });
  logEventChange(event.id, "exported", "realms", null);

  console.log(`[realms:timing] ── event ${eventId} TOTAL ${Date.now() - tTotal}ms (created) ──`);
  return { ok: true, realms_id: realmEvent.id };
}

// ── Environment CRUD routes ─────────────────────────────────────────────────

router.get("/environments", (_req, res) => {
  res.json(getEnvironments());
});

router.post("/environments", (req, res) => {
  const { name, base_url, token, slug } = req.body;
  if (!name || !base_url || !token) return res.status(400).json({ error: "name, base_url, and token are required" });
  try {
    const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM realms_environments").get().m || 0;
    db.prepare("INSERT INTO realms_environments (name, base_url, token, slug, sort_order) VALUES (?, ?, ?, ?, ?)")
      .run(name, base_url, token, slug || null, maxOrder + 1);
    res.json(db.prepare("SELECT id, name, base_url, slug, sort_order, created_at, updated_at FROM realms_environments WHERE name = ?").get(name));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Environment name already exists" });
    res.status(500).json({ error: err.message });
  }
});

router.patch("/environments/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const env = getEnvironment(id);
  if (!env) return res.status(404).json({ error: "Environment not found" });
  const allowed = ["name", "base_url", "token", "slug", "sort_order"];
  const fields = allowed.filter((k) => req.body[k] !== undefined);
  if (!fields.length) return res.json(env);
  const setClause = fields.map((k) => `${k} = @${k}`).join(", ");
  const params = { id };
  for (const k of fields) params[k] = req.body[k];
  db.prepare(`UPDATE realms_environments SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(params);
  res.json(getEnvironment(id));
});

router.delete("/environments/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const result = db.prepare("DELETE FROM realms_environments WHERE id = ?").run(id);
  if (result.changes === 0) return res.status(404).json({ error: "Environment not found" });
  res.json({ ok: true });
});

// ── Push routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/realms/status?environment_id=N
 * Config check + push summary counts for a specific environment.
 */
router.get("/status", (req, res) => {
  const environments = getEnvironments();
  const envId = parseInt(req.query.environment_id);

  if (!envId || isNaN(envId)) {
    return res.json({ environments, config: null, events: null, channels: null, push_in_progress: pushReadyRunning });
  }

  const env = getEnvironment(envId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const total = db.prepare("SELECT COUNT(*) as n FROM events WHERE archived = 0").get().n;
  const pushed = db.prepare(
    "SELECT COUNT(*) as n FROM realms_event_pushes rep JOIN events e ON e.id = rep.event_id WHERE e.archived = 0 AND rep.environment_id = ? AND rep.realms_id IS NOT NULL"
  ).get(envId).n;
  const channels_total = db.prepare("SELECT COUNT(*) as n FROM channels").get().n;
  const channels_mapped = db.prepare(
    "SELECT COUNT(*) as n FROM realms_channel_pushes WHERE environment_id = ? AND realms_id IS NOT NULL"
  ).get(envId).n;

  res.json({
    environments,
    config: {
      token_set: !!env.token,
      base_url: env.base_url,
      slug: env.slug || null,
      name: env.name,
    },
    events: { total, pushed, unpushed: total - pushed },
    channels: { total: channels_total, mapped: channels_mapped },
    push_in_progress: pushReadyRunning,
  });
});

/**
 * POST /api/realms/push/:eventId?environment_id=N
 * Push a single event to Realms (creates channel if needed).
 */
router.post("/push/:eventId", async (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  const envId = parseInt(req.query.environment_id || req.body?.environment_id);
  if (isNaN(eventId)) return res.status(400).json({ error: "Invalid event ID" });
  if (isNaN(envId)) return res.status(400).json({ error: "environment_id is required" });
  const force = req.query.force === "true" || req.body?.force === true;

  try {
    const result = await pushEvent(eventId, envId, { force });
    if (result.already_pushed) {
      return res.status(409).json({ error: "Already pushed to Realms", realms_id: result.realms_id });
    }
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * DELETE /api/realms/disconnect/:eventId?environment_id=N
 * Removes the push record so the event can be pushed fresh.
 */
router.delete("/disconnect/:eventId", (req, res) => {
  const eventId = parseInt(req.params.eventId, 10);
  const envId = parseInt(req.query.environment_id);
  if (isNaN(eventId)) return res.status(400).json({ error: "Invalid event ID" });
  if (isNaN(envId)) return res.status(400).json({ error: "environment_id is required" });
  db.prepare("DELETE FROM realms_event_pushes WHERE event_id = ? AND environment_id = ?").run(eventId, envId);
  res.json({ ok: true });
});

/**
 * Shared push execution: pre-warms category/hub cache, runs a fast first pass
 * with concurrency, then retries failures sequentially with full patience.
 * Supports abort via shouldAbort() callback (for push-ready cancel).
 */
async function executePushBatch(env, envId, ids, { force = false, logId, shouldAbort = () => false } = {}) {
  // Pre-warm: fetch all existing categories and hubs from Realms and cache
  // their IDs locally so individual event pushes skip redundant create mutations.
  let prewarmFailed = false;
  try {
    const [realmsCats, realmsHubs] = await Promise.all([
      getRealmCategories(env),
      getRealmHubs(env),
    ]);
    const localCats = db.prepare("SELECT id, slug FROM categories").all();
    for (const localCat of localCats) {
      const realmsSlug = toCategorySlug(localCat.slug);
      const match = realmsCats.find((c) => c.slug === realmsSlug);
      if (match) saveCategoryRealmsId(localCat.id, envId, match.id);
    }
    for (const hub of HUBS) {
      const match = realmsHubs.find((h) => h.slug === hub.slug);
      if (match) saveHubRealmsId(hub.slug, envId, match.id);
    }
    console.log(`[realms:prewarm] cached ${realmsCats.length} categories, ${realmsHubs.length} hubs`);
  } catch (err) {
    prewarmFailed = true;
    console.warn(`[realms:prewarm] failed (will fall back to create-on-demand): ${err.message}`);
  }

  let created = 0, updated = 0, failed = 0, skipped = 0;
  const errorDetails = [];
  let aborted = false;

  const recordSuccess = (id, result) => {
    if (result.already_pushed) {
      skipped++;
      try { addExportLogEvent(logId, Number(id), "skipped", result.realms_id); } catch {}
    } else if (result.updated) {
      updated++;
      try { addExportLogEvent(logId, Number(id), "updated", result.realms_id); } catch {}
    } else {
      created++;
      try { addExportLogEvent(logId, Number(id), "created", result.realms_id); } catch {}
    }
    const pushed = created + updated;
    try { updateExportLogProgress(logId, { pushed_events: pushed, failed_events: failed, skipped_events: skipped, errors: failed, created_events: created, updated_events: updated }); } catch {}
  };

  const makeWorker = (envOverride) => async (id) => {
    if (shouldAbort()) { aborted = true; return { eventId: id, ok: false, aborted: true }; }
    try {
      const result = await pushEvent(Number(id), envId, { force, envOverride });
      recordSuccess(id, result);
      return { eventId: id, ok: true, realms_id: result.realms_id, already_pushed: result.already_pushed || false, updated: result.updated || false };
    } catch (err) {
      return { eventId: id, ok: false, error: err.message };
    }
  };

  // First pass: fail fast (no retries) so lanes free up immediately for other events
  const fastEnv = { ...env, _gqlRetries: 0 };
  let results = [];
  try {
    results = await runLimit(ids, PUSH_CONCURRENCY, makeWorker(fastEnv));
  } catch (err) {
    console.error("[realms:push] runLimit error:", err);
  }

  // Second pass: retry failures sequentially with full retry patience.
  // Skip if pre-warm failed AND all events failed — server is likely offline.
  const retryIds = results.filter((r) => r && !r.ok && !r.aborted).map((r) => r.eventId);
  const firstPassSucceeded = results.some((r) => r?.ok);
  const serverAppearsDown = prewarmFailed && !firstPassSucceeded && retryIds.length === ids.length;

  if (retryIds.length > 0 && serverAppearsDown) {
    console.warn(`[realms:push] server appears offline (pre-warm failed + all ${retryIds.length} events failed) — skipping retry pass`);
    for (const id of retryIds) {
      failed++;
      const errMsg = "Realms server unreachable";
      errorDetails.push(`Event ${id}: ${errMsg}`);
      try { saveEventPushError(Number(id), envId, errMsg); } catch {}
      try { addExportLogEvent(logId, Number(id), "failed", null, errMsg); } catch {}
    }
    const pushed = created + updated;
    try { updateExportLogProgress(logId, { pushed_events: pushed, failed_events: failed, skipped_events: skipped, errors: failed, created_events: created, updated_events: updated }); } catch {}
  } else if (retryIds.length > 0) {
    console.log(`[realms:push] retrying ${retryIds.length} failed event(s) sequentially`);
    try {
      const retryResults = await runLimit(retryIds, 1, makeWorker(env));
      for (const r of retryResults) {
        if (!r || r.aborted) continue;
        if (r.ok) {
          recordSuccess(r.eventId, r);
        } else {
          failed++;
          errorDetails.push(`Event ${r.eventId}: ${r.error}`);
          try { saveEventPushError(Number(r.eventId), envId, r.error); } catch {}
          try { addExportLogEvent(logId, Number(r.eventId), "failed", null, r.error); } catch {}
          const pushed = created + updated;
          try { updateExportLogProgress(logId, { pushed_events: pushed, failed_events: failed, skipped_events: skipped, errors: failed, created_events: created, updated_events: updated }); } catch {}
        }
      }
    } catch (err) {
      console.error("[realms:push] retry pass error:", err);
    }
  }

  return { created, updated, failed, skipped, aborted, errorDetails };
}

/**
 * POST /api/realms/push-batch
 * Body: { eventIds: number[], environment_id: number, force?: boolean }
 */
router.post("/push-batch", async (req, res) => {
  const { eventIds, force = false, environment_id } = req.body;
  const envId = parseInt(environment_id);
  if (!Array.isArray(eventIds) || eventIds.length === 0) {
    return res.status(400).json({ error: "eventIds must be a non-empty array" });
  }
  if (isNaN(envId)) return res.status(400).json({ error: "environment_id is required" });

  const env = getEnvironment(envId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const logResult = createExportLog({
    environment_id: envId,
    environment_name: env.name,
    export_type: "push-batch",
    total_events: eventIds.length,
    started_at: new Date().toISOString(),
  });
  const logId = logResult.lastInsertRowid;

  const { created, updated, failed, skipped, errorDetails } = await executePushBatch(env, envId, eventIds, { force, logId });

  const pushed = created + updated;
  completeExportLog(logId, {
    completed_at: new Date().toISOString(),
    status: failed > 0 && pushed === 0 ? "failed" : "completed",
    total_events: eventIds.length,
    pushed_events: pushed,
    failed_events: failed,
    skipped_events: skipped,
    errors: failed,
    error_details: JSON.stringify(errorDetails),
    created_events: created,
    updated_events: updated,
  });

  res.json({ created, updated, failed, skipped });
});

/**
 * POST /api/realms/push-ready
 * Body: { environment_id: number, force?: boolean }
 * Push all events that are ready for a specific environment.
 */
router.post("/push-ready", async (req, res) => {
  const envId = parseInt(req.body?.environment_id || req.query.environment_id);
  if (isNaN(envId)) return res.status(400).json({ error: "environment_id is required" });
  const force = req.body?.force === true || req.query.force === "true";

  const env = getEnvironment(envId);
  if (!env) return res.status(404).json({ error: "Environment not found" });

  const rows = force
    ? db.prepare(`
        SELECT e.id FROM events e
        WHERE e.archived = 0 AND e.is_dismissed = 0
          AND e.channel_id IS NOT NULL
          AND e.start_time IS NOT NULL AND e.start_time != ''
        ORDER BY e.start_date ASC
      `).all()
    : db.prepare(`
        SELECT e.id FROM events e
        WHERE e.archived = 0 AND e.is_dismissed = 0
          AND e.channel_id IS NOT NULL
          AND e.start_time IS NOT NULL AND e.start_time != ''
          AND NOT EXISTS (
            SELECT 1 FROM realms_event_pushes rep
            WHERE rep.event_id = e.id AND rep.environment_id = ? AND rep.realms_id IS NOT NULL
          )
        ORDER BY e.start_date ASC
      `).all(envId);

  const logResult = createExportLog({
    environment_id: envId,
    environment_name: env.name,
    export_type: force ? "push-ready-force" : "push-ready",
    total_events: rows.length,
    started_at: new Date().toISOString(),
  });
  const logId = logResult.lastInsertRowid;

  pushReadyAborted = false;
  pushReadyRunning = true;

  const ids = rows.map((r) => r.id);
  const { created, updated, failed, skipped, aborted, errorDetails } = await executePushBatch(
    env, envId, ids, { force, logId, shouldAbort: () => pushReadyAborted }
  );

  pushReadyRunning = false;
  const pushed = created + updated;

  completeExportLog(logId, {
    completed_at: new Date().toISOString(),
    status: aborted ? "aborted" : failed > 0 && pushed === 0 ? "failed" : "completed",
    total_events: rows.length,
    pushed_events: pushed,
    failed_events: failed,
    skipped_events: skipped,
    errors: failed,
    error_details: JSON.stringify(errorDetails),
    created_events: created,
    updated_events: updated,
  });

  res.json({ created, updated, failed, skipped, aborted, pushed, total: rows.length });
});

router.post("/push-ready/cancel", (_req, res) => {
  pushReadyAborted = true;
  res.json({ ok: true });
});

// ── Export logs ─────────────────────────────────────────────────────────────

router.get("/export-logs", (_req, res) => {
  res.json(getExportLogs());
});

router.get("/export-logs/:id", (req, res) => {
  const log = getExportLog(parseInt(req.params.id));
  if (!log) return res.status(404).json({ error: "Export log not found" });
  res.json(log);
});

router.get("/export-logs/:id/events", (req, res) => {
  const log = getExportLog(parseInt(req.params.id));
  if (!log) return res.status(404).json({ error: "Export log not found" });
  const events = getExportLogEvents(parseInt(req.params.id));
  res.json({ log, events });
});

export default router;
