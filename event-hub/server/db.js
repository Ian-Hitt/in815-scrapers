import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "events.db");

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Migrations ──────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    start_date      TEXT NOT NULL,
    start_time      TEXT,
    end_date        TEXT,
    end_time        TEXT,
    description     TEXT,
    venue           TEXT,
    address         TEXT,
    city            TEXT,
    state           TEXT,
    zip             TEXT,
    latitude        REAL,
    longitude       REAL,
    category        TEXT,
    tags            TEXT,
    price           TEXT,
    image_url       TEXT,
    url             TEXT,
    external_url    TEXT,
    contact         TEXT,
    organizer       TEXT,
    is_online       INTEGER DEFAULT 0,
    recurring       INTEGER DEFAULT 0,
    recurrence_frequency TEXT,
    recurrence_end_date  TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    source_name   TEXT NOT NULL,
    source_id     TEXT,
    source_url    TEXT,
    imported_at   TEXT DEFAULT (datetime('now')),
    import_log_id INTEGER REFERENCES import_logs(id),
    UNIQUE(source_name, source_id)
  );

  CREATE TABLE IF NOT EXISTS import_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name      TEXT NOT NULL,
    file_name        TEXT,
    started_at       TEXT,
    completed_at     TEXT,
    status           TEXT DEFAULT 'running',
    total_rows       INTEGER DEFAULT 0,
    new_events       INTEGER DEFAULT 0,
    updated_events   INTEGER DEFAULT 0,
    duplicate_events INTEGER DEFAULT 0,
    errors           INTEGER DEFAULT 0,
    error_details    TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS export_logs (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    environment_id      INTEGER REFERENCES realms_environments(id) ON DELETE SET NULL,
    environment_name    TEXT NOT NULL,
    export_type         TEXT NOT NULL DEFAULT 'push-ready',
    started_at          TEXT,
    completed_at        TEXT,
    status              TEXT DEFAULT 'running',
    total_events        INTEGER DEFAULT 0,
    pushed_events       INTEGER DEFAULT 0,
    failed_events       INTEGER DEFAULT 0,
    skipped_events      INTEGER DEFAULT 0,
    errors              INTEGER DEFAULT 0,
    error_details       TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS export_log_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    export_log_id   INTEGER NOT NULL REFERENCES export_logs(id) ON DELETE CASCADE,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pushed', 'failed', 'skipped'
    realms_id       TEXT,
    error           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_export_log_events_log ON export_log_events(export_log_id);

  CREATE TABLE IF NOT EXISTS enrichment_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    function_name   TEXT NOT NULL,
    started_at      TEXT,
    completed_at    TEXT,
    status          TEXT DEFAULT 'running',
    total_events    INTEGER DEFAULT 0,
    changed_events  INTEGER DEFAULT 0,
    skipped_events  INTEGER DEFAULT 0,
    errors          INTEGER DEFAULT 0,
    error_details   TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS enrichment_changes (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    enrichment_log_id   INTEGER NOT NULL REFERENCES enrichment_logs(id) ON DELETE CASCADE,
    event_id            INTEGER REFERENCES events(id) ON DELETE SET NULL,
    event_title         TEXT,
    field_name          TEXT NOT NULL,
    old_value           TEXT,
    new_value           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_enrichment_changes_log ON enrichment_changes(enrichment_log_id);

  CREATE TABLE IF NOT EXISTS scrape_status (
    source_name   TEXT PRIMARY KEY,
    last_scraped  TEXT,
    status        TEXT DEFAULT 'idle',
    error         TEXT
  );

  -- Seed scrape_status rows
  INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('rpd'), ('gorockford'), ('eventbrite'), ('rpl'), ('harlem');

  CREATE TABLE IF NOT EXISTS channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    website     TEXT,
    image_url   TEXT,
    type        TEXT DEFAULT 'organization',
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_start_date ON events(start_date);
  CREATE INDEX IF NOT EXISTS idx_events_title ON events(title);
  CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue);
  CREATE INDEX IF NOT EXISTS idx_event_sources_source ON event_sources(source_name, source_id);
  CREATE INDEX IF NOT EXISTS idx_event_sources_event ON event_sources(event_id);
  CREATE INDEX IF NOT EXISTS idx_channels_name ON channels(name);

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    sort_order  INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS event_categories (
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, category_id)
  );

  CREATE INDEX IF NOT EXISTS idx_event_categories_event ON event_categories(event_id);
  CREATE INDEX IF NOT EXISTS idx_event_categories_cat ON event_categories(category_id);
  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
`);

// Seed master categories (safe to run repeatedly via INSERT OR IGNORE)
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  const getIdBySlug = (slug) => db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug)?.id ?? null;

  const parents = [
    { name: "Music",        slug: "music",        sort_order: 1 },
    { name: "Sports",       slug: "sports",       sort_order: 2 },
    { name: "Performances", slug: "performances", sort_order: 3 },
    { name: "Festivals",    slug: "festivals",    sort_order: 4 },
    { name: "Classes",      slug: "classes",      sort_order: 5 },
  ];
  for (const p of parents) insertCat.run({ ...p, parent_id: null });

  const sportsId = getIdBySlug("sports");
  const sportsSubs = [
    "Baseball & Softball", "Basketball", "Cross Country", "Football",
    "Golf", "Soccer", "Swimming & Diving", "Tennis", "Track & Field",
    "Volleyball", "Wrestling", "Cheerleading",
  ];
  sportsSubs.forEach((name, i) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    insertCat.run({ name, slug, parent_id: sportsId, sort_order: i + 1 });
  });
}

// Migration: add channel_id to events (safe to run repeatedly)
try {
  db.exec("ALTER TABLE events ADD COLUMN channel_id INTEGER REFERENCES channels(id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel_id)");
} catch { /* column already exists */ }

// Migration: add rrule column for structured recurrence rules
try {
  db.exec("ALTER TABLE events ADD COLUMN rrule TEXT");
} catch { /* column already exists */ }

// Migration: add archived column (soft-delete for past events)
try {
  db.exec("ALTER TABLE events ADD COLUMN archived INTEGER DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_archived ON events(archived)");
} catch { /* column already exists */ }

// Migration: duplicate dismissals table
db.exec(`
  CREATE TABLE IF NOT EXISTS duplicate_dismissals (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_a      INTEGER NOT NULL,
    id_b      INTEGER NOT NULL,
    dismissed_at TEXT DEFAULT (datetime('now')),
    CHECK (id_a < id_b),
    UNIQUE (id_a, id_b)
  )
`);

// Migration: channel duplicate dismissals table
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_duplicate_dismissals (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_a      INTEGER NOT NULL,
    id_b      INTEGER NOT NULL,
    dismissed_at TEXT DEFAULT (datetime('now')),
    CHECK (id_a < id_b),
    UNIQUE (id_a, id_b)
  )
`);

// Migration: default categories assigned to a channel (events inherit these
// when auto-categorize finds no keyword matches).
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_categories (
    channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (channel_id, category_id)
  );
  CREATE INDEX IF NOT EXISTS idx_channel_categories_channel ON channel_categories(channel_id);
`);

// Migration: seed any new sources into scrape_status
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('harlem')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('intersoccer-saturday'), ('intersoccer-sunday')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('hononegah')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('guilford')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('east')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('auburn')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('jefferson')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('lutheran-hs')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('marysplace')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('rockfordlive')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('rockbuzz')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('hardrock')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('boylan')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('rivets')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('ticketmaster')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('northsuburban')");
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('manual')");
// Migration: rename legacy 'rl' source key to 'lutheran-hs'
try {
  db.exec("UPDATE event_sources SET source_name = 'lutheran-hs' WHERE source_name = 'rl'");
  db.exec("UPDATE import_logs SET source_name = 'lutheran-hs' WHERE source_name = 'rl'");
  db.exec("UPDATE scrape_status SET source_name = 'lutheran-hs' WHERE source_name = 'rl'");
} catch { /* ignore */ }

// Migration: add is_dismissed flag for attraction/non-event dismissals
try {
  db.exec("ALTER TABLE events ADD COLUMN is_dismissed INTEGER DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_dismissed ON events(is_dismissed)");
} catch { /* already exists */ }

// Migration: featured candidate dismissals (not a real event dismissal — just "don't suggest for featured")
db.exec(`
  CREATE TABLE IF NOT EXISTS featured_dismissals (
    event_id     INTEGER PRIMARY KEY,
    dismissed_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: add new sports subcategories and Outdoors top-level category
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  const getIdBySlug = (slug) => db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug)?.id ?? null;

  // New top-level category
  insertCat.run({ name: "Outdoors", slug: "outdoors", parent_id: null, sort_order: 6 });

  // New sports subcategories
  const sportsId = getIdBySlug("sports");
  if (sportsId) {
    const newSubs = [
      { name: "Bowling",    slug: "bowling" },
      { name: "Hockey",     slug: "hockey" },
      { name: "Lacrosse",   slug: "lacrosse" },
      { name: "Pickleball", slug: "pickleball" },
    ];
    newSubs.forEach(({ name, slug }) => {
      insertCat.run({ name, slug, parent_id: sportsId, sort_order: 99 });
    });
  }
}

// Migration: add Nightlife and Date Night top-level categories
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  insertCat.run({ name: "Nightlife",        slug: "nightlife",        parent_id: null, sort_order: 7 });
  insertCat.run({ name: "Date Night",       slug: "date-night",       parent_id: null, sort_order: 8 });
  insertCat.run({ name: "Friends & Groups", slug: "friends-groups",   parent_id: null, sort_order: 9 });
  insertCat.run({ name: "Family & Kids",    slug: "family-kids",      parent_id: null, sort_order: 10 });
}

// Migration: group the "for-who" categories (Date Night, Family & Kids,
// Friends & Groups, Nightlife) under a new top-level "Audience" category.
// These are orthogonal to the "what is this event" categories (Music, Sports,
// Classes, etc.) — they describe who the event is for.
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  insertCat.run({ name: "Audience", slug: "audience", parent_id: null, sort_order: 12 });
  const audienceId = db.prepare("SELECT id FROM categories WHERE slug = 'audience'").get()?.id;
  if (audienceId) {
    const reparent = db.prepare("UPDATE categories SET parent_id = ? WHERE slug = ? AND (parent_id IS NULL OR parent_id != ?)");
    reparent.run(audienceId, "date-night", audienceId);
    reparent.run(audienceId, "family-kids", audienceId);
    reparent.run(audienceId, "friends-groups", audienceId);
    reparent.run(audienceId, "nightlife", audienceId);
  }
}

// Migration: add Motorsports subcategory under Sports
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  const sportsId = db.prepare("SELECT id FROM categories WHERE slug = 'sports'").get()?.id;
  if (sportsId) insertCat.run({ name: "Motorsports", slug: "motorsports", parent_id: sportsId, sort_order: 99 });
}

// Migration: add School top-level category (auto-tagged for events from the 8 school scrapers)
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  insertCat.run({ name: "School", slug: "school", parent_id: null, sort_order: 11 });
}

// Migration: add Professional top-level category (certification courses, networking, career events)
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  insertCat.run({ name: "Professional", slug: "professional", parent_id: null, sort_order: 13 });
}

// Migration: add Comedy subcategory under Performances
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  const performancesId = db.prepare("SELECT id FROM categories WHERE slug = 'performances'").get()?.id ?? null;
  insertCat.run({ name: "Comedy", slug: "comedy", parent_id: performancesId, sort_order: 1 });
}

// Migration: add featured flag (boolean column kept for legacy/export use)
try { db.exec("ALTER TABLE events ADD COLUMN featured INTEGER DEFAULT 0"); } catch { /* already exists */ }
// Migration: add Featured as a proper taxonomy category (starts empty — curated manually)
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  insertCat.run({ name: "Featured", slug: "featured", parent_id: null, sort_order: 99 });
}
try { db.exec("ALTER TABLE events ADD COLUMN ticket_url TEXT"); } catch { /* already exists */ }
// Backfill ticket_url from external_url for sources where external_url is the ticket purchase link
{
  const urlSources = ["ticketmaster", "rivets", "rockfordlive"];
  db.prepare(`
    UPDATE events SET ticket_url = external_url
    WHERE ticket_url IS NULL AND external_url IS NOT NULL
    AND id IN (
      SELECT DISTINCT event_id FROM event_sources WHERE source_name IN (${urlSources.map(() => "?").join(",")})
    )
  `).run(...urlSources);
}
// Eventbrite: ticket URL is the event page (url), not external_url (which is the organizer profile)
{
  db.prepare(`
    UPDATE events SET ticket_url = url
    WHERE url IS NOT NULL AND url LIKE '%eventbrite.com/e/%'
    AND id IN (
      SELECT DISTINCT event_id FROM event_sources WHERE source_name = 'eventbrite'
    )
  `).run();
}

// Migration: add Youth Sports, Adult Leagues, Live Sports subcategories under Sports
{
  const insertCat = db.prepare("INSERT OR IGNORE INTO categories (name, slug, parent_id, sort_order) VALUES (@name, @slug, @parent_id, @sort_order)");
  const sportsId = db.prepare("SELECT id FROM categories WHERE slug = 'sports'").get()?.id;
  if (sportsId) {
    insertCat.run({ name: "Youth Sports",   slug: "youth-sports",   parent_id: sportsId, sort_order: 1 });
    insertCat.run({ name: "Adult Leagues",  slug: "adult-leagues",  parent_id: sportsId, sort_order: 2 });
    insertCat.run({ name: "Live Sports",    slug: "live-sports",    parent_id: sportsId, sort_order: 3 });
  }
}

// Migration: add Realms.tv push tracking columns to events (legacy, kept for migration)
try { db.exec("ALTER TABLE events ADD COLUMN realms_id TEXT") } catch { /* already exists */ }
try { db.exec("ALTER TABLE events ADD COLUMN realms_pushed_at DATETIME") } catch { /* already exists */ }
try { db.exec("ALTER TABLE events ADD COLUMN realms_push_error TEXT") } catch { /* already exists */ }

// Migration: add Realms.tv channel mapping columns (legacy, kept for migration)
try { db.exec("ALTER TABLE channels ADD COLUMN realms_id TEXT") } catch { /* already exists */ }
try { db.exec("ALTER TABLE channels ADD COLUMN realms_slug TEXT") } catch { /* already exists */ }

// Migration: add city_reviewed flag for city audit
try {
  db.exec("ALTER TABLE events ADD COLUMN city_reviewed INTEGER DEFAULT 0");
} catch { /* already exists */ }

// Migration: add Realms.tv category mapping column (legacy, kept for migration)
try { db.exec("ALTER TABLE categories ADD COLUMN realms_id TEXT") } catch { /* already exists */ }

// ── Multi-environment Realms.tv tables ──────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS realms_environments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    base_url    TEXT NOT NULL,
    token       TEXT NOT NULL,
    slug        TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS realms_event_pushes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    environment_id  INTEGER NOT NULL REFERENCES realms_environments(id) ON DELETE CASCADE,
    realms_id       TEXT,
    pushed_at       TEXT,
    push_error      TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(event_id, environment_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rep_event ON realms_event_pushes(event_id);
  CREATE INDEX IF NOT EXISTS idx_rep_env ON realms_event_pushes(environment_id);

  CREATE TABLE IF NOT EXISTS realms_channel_pushes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id      INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    environment_id  INTEGER NOT NULL REFERENCES realms_environments(id) ON DELETE CASCADE,
    realms_id       TEXT,
    realms_slug     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(channel_id, environment_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rcp_channel ON realms_channel_pushes(channel_id);
  CREATE INDEX IF NOT EXISTS idx_rcp_env ON realms_channel_pushes(environment_id);

  CREATE TABLE IF NOT EXISTS realms_category_pushes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    environment_id  INTEGER NOT NULL REFERENCES realms_environments(id) ON DELETE CASCADE,
    realms_id       TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(category_id, environment_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rcatp_cat ON realms_category_pushes(category_id);
  CREATE INDEX IF NOT EXISTS idx_rcatp_env ON realms_category_pushes(environment_id);

  CREATE TABLE IF NOT EXISTS realms_hub_pushes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    hub_slug        TEXT NOT NULL,
    environment_id  INTEGER NOT NULL REFERENCES realms_environments(id) ON DELETE CASCADE,
    realms_id       TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(hub_slug, environment_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rhp_slug ON realms_hub_pushes(hub_slug);
  CREATE INDEX IF NOT EXISTS idx_rhp_env ON realms_hub_pushes(environment_id);
`);

// Migration: cache per-event cover upload so we can skip re-uploading the same image on updates
try { db.exec("ALTER TABLE realms_event_pushes ADD COLUMN cover_upload_id TEXT") } catch { /* already exists */ }
try { db.exec("ALTER TABLE realms_event_pushes ADD COLUMN cover_source_url TEXT") } catch { /* already exists */ }

// Migration: track created vs updated events in export logs
try { db.exec("ALTER TABLE export_logs ADD COLUMN created_events INTEGER DEFAULT 0") } catch { /* already exists */ }
try { db.exec("ALTER TABLE export_logs ADD COLUMN updated_events INTEGER DEFAULT 0") } catch { /* already exists */ }

// Migration: seed initial Realms environment from .env (one-time)
{
  const existingEnvs = db.prepare("SELECT COUNT(*) as n FROM realms_environments").get().n;
  if (existingEnvs === 0 && process.env.REALMS_TOKEN) {
    db.prepare(`
      INSERT INTO realms_environments (name, base_url, token, slug, sort_order)
      VALUES (@name, @base_url, @token, @slug, @sort_order)
    `).run({
      name: "local",
      base_url: process.env.REALMS_BASE_URL || "http://localhost:3000",
      token: process.env.REALMS_TOKEN,
      slug: process.env.REALMS_SLUG || null,
      sort_order: 1,
    });
  }
}

// Migration: move legacy realms_* column data into new push tables
{
  const envRow = db.prepare("SELECT id FROM realms_environments LIMIT 1").get();
  if (envRow) {
    const eventsMigrated = db.prepare("SELECT COUNT(*) as n FROM realms_event_pushes").get().n;
    if (eventsMigrated === 0) {
      db.prepare(`
        INSERT INTO realms_event_pushes (event_id, environment_id, realms_id, pushed_at, push_error)
        SELECT id, ?, realms_id, realms_pushed_at, realms_push_error
        FROM events WHERE realms_id IS NOT NULL OR realms_push_error IS NOT NULL
      `).run(envRow.id);
    }

    const channelsMigrated = db.prepare("SELECT COUNT(*) as n FROM realms_channel_pushes").get().n;
    if (channelsMigrated === 0) {
      db.prepare(`
        INSERT INTO realms_channel_pushes (channel_id, environment_id, realms_id, realms_slug)
        SELECT id, ?, realms_id, realms_slug
        FROM channels WHERE realms_id IS NOT NULL
      `).run(envRow.id);
    }

    const catsMigrated = db.prepare("SELECT COUNT(*) as n FROM realms_category_pushes").get().n;
    if (catsMigrated === 0) {
      db.prepare(`
        INSERT INTO realms_category_pushes (category_id, environment_id, realms_id)
        SELECT id, ?, realms_id
        FROM categories WHERE realms_id IS NOT NULL
      `).run(envRow.id);
    }
  }
}

// ── Event changelog table ────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS event_changelog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    tool       TEXT,
    changes    TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_event_changelog_event ON event_changelog(event_id);
`);

// ── Realms environment helpers ──────────────────────────────────────────────

export function getEventPushes(eventId) {
  return db.prepare(`
    SELECT rep.*, re.name as environment_name, re.base_url
    FROM realms_event_pushes rep
    JOIN realms_environments re ON re.id = rep.environment_id
    WHERE rep.event_id = ?
    ORDER BY re.sort_order
  `).all(eventId);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Auto-archive past events that are over:
// - Non-recurring events with start_date in the past
// - Recurring events whose recurrence_end_date is in the past
export function archivePastEvents() {
  const today = new Date().toISOString().slice(0, 10);
  const result = db.prepare(`
    UPDATE events SET archived = 1, updated_at = datetime('now')
    WHERE archived = 0 AND (
      (recurring = 0 AND start_date < :today) OR
      (recurring = 1 AND recurrence_end_date IS NOT NULL AND recurrence_end_date < :today)
    )
  `).run({ today });
  return result.changes;
}

export function unarchiveEvent(id) {
  return db.prepare("UPDATE events SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function logEventChange(eventId, action, tool, changes) {
  db.prepare(`
    INSERT INTO event_changelog (event_id, action, tool, changes)
    VALUES (?, ?, ?, ?)
  `).run(eventId, action, tool ?? null, changes ? JSON.stringify(changes) : null);
}

export function getEventChangelog(eventId) {
  return db.prepare(
    "SELECT * FROM event_changelog WHERE event_id = ? ORDER BY created_at DESC"
  ).all(eventId);
}

export function getArchivedCount() {
  return db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 1").get().count;
}

export function getEventWithSources(id) {
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  if (!event) return null;
  event.sources = db.prepare("SELECT DISTINCT source_name, source_url, source_id, imported_at FROM event_sources WHERE event_id = ?").all(id);
  event.taxonomy = db.prepare(`
    SELECT c.id, c.name, c.slug, c.parent_id, p.name as parent_name, p.slug as parent_slug
    FROM event_categories ec
    JOIN categories c ON c.id = ec.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE ec.event_id = ?
    ORDER BY p.sort_order, c.sort_order, c.name
  `).all(id);
  return event;
}

const DATA_SCORE_SQL = `(
  CASE WHEN e.channel_id IS NOT NULL THEN 20 ELSE 0 END +
  CASE WHEN e.start_time IS NOT NULL AND e.start_time != '' THEN 15 ELSE 0 END +
  CASE WHEN e.description IS NOT NULL AND e.description != '' THEN 10 ELSE 0 END +
  CASE WHEN e.description IS NOT NULL AND LENGTH(e.description) > 100 THEN 5 ELSE 0 END +
  CASE WHEN e.image_url IS NOT NULL AND e.image_url != '' THEN 15 ELSE 0 END +
  CASE WHEN e.venue IS NOT NULL AND e.venue != '' THEN 8 ELSE 0 END +
  CASE WHEN e.address IS NOT NULL AND e.address != '' THEN 7 ELSE 0 END +
  CASE WHEN e.city IS NOT NULL AND e.city != '' THEN 5 ELSE 0 END +
  CASE WHEN e.zip IS NOT NULL AND e.zip != '' THEN 5 ELSE 0 END +
  CASE WHEN e.end_time IS NOT NULL AND e.end_time != '' THEN 5 ELSE 0 END +
  CASE WHEN EXISTS (SELECT 1 FROM event_categories ec WHERE ec.event_id = e.id) THEN 5 ELSE 0 END
)`;

export function searchEvents({ search, source, startDate, endDate, category, taxonomy, excludeTaxonomy, recurring, channel, completeness, missingField, realmsPushed, realmsEnvironment, pricing, hasTickets, minScore, includeArchived = false, page = 1, limit = 50, sort = "start_date", idsOnly = false }) {
  const conditions = [];
  const params = {};

  if (!includeArchived) conditions.push("e.archived = 0");
  conditions.push("e.is_dismissed = 0");

  if (search) {
    conditions.push("(e.title LIKE :search OR e.venue LIKE :search OR e.description LIKE :search)");
    params.search = `%${search}%`;
  }
  if (source) {
    conditions.push("EXISTS (SELECT 1 FROM event_sources es WHERE es.event_id = e.id AND es.source_name = :source)");
    params.source = source;
  }
  if (startDate) {
    conditions.push("e.start_date >= :startDate");
    params.startDate = startDate;
  }
  if (endDate) {
    conditions.push("e.start_date <= :endDate");
    params.endDate = endDate;
  }
  if (category) {
    conditions.push("e.category = :category");
    params.category = category;
  }
  if (recurring != null && recurring !== "") {
    conditions.push("e.recurring = :recurring");
    params.recurring = Number(recurring);
  }
  if (channel != null && channel !== "") {
    conditions.push("e.channel_id = :channel");
    params.channel = Number(channel);
  }
  if (taxonomy != null && taxonomy !== "") {
    const parts = taxonomy.split(",").filter(Boolean);
    const hasUncategorized = parts.includes("uncategorized");
    const ids = parts.filter((p) => p !== "uncategorized").map(Number).filter((n) => n > 0);
    const subconditions = [];
    if (hasUncategorized) {
      subconditions.push("NOT EXISTS (SELECT 1 FROM event_categories ec WHERE ec.event_id = e.id)");
    }
    if (ids.length > 0) {
      const idList = ids.join(",");
      subconditions.push(`EXISTS (
        SELECT 1 FROM event_categories ec
        JOIN categories cat ON cat.id = ec.category_id
        WHERE ec.event_id = e.id
        AND (cat.id IN (${idList}) OR cat.parent_id IN (${idList}))
      )`);
    }
    if (subconditions.length > 0) {
      conditions.push(`(${subconditions.join(" OR ")})`);
    }
  }
  if (realmsPushed && realmsEnvironment) {
    params.realmsEnvId = Number(realmsEnvironment);
    if (realmsPushed === "yes") {
      conditions.push("EXISTS (SELECT 1 FROM realms_event_pushes rep WHERE rep.event_id = e.id AND rep.environment_id = :realmsEnvId AND rep.realms_id IS NOT NULL)");
    }
    if (realmsPushed === "no") {
      conditions.push("NOT EXISTS (SELECT 1 FROM realms_event_pushes rep WHERE rep.event_id = e.id AND rep.environment_id = :realmsEnvId AND rep.realms_id IS NOT NULL)");
    }
    if (realmsPushed === "error") {
      conditions.push("EXISTS (SELECT 1 FROM realms_event_pushes rep WHERE rep.event_id = e.id AND rep.environment_id = :realmsEnvId AND rep.push_error IS NOT NULL AND rep.realms_id IS NULL)");
    }
  }

  if (hasTickets === "1" || hasTickets === true) conditions.push("e.ticket_url IS NOT NULL");

  if (pricing === "free") conditions.push("(e.price IS NULL OR e.price = '' OR LOWER(e.price) = 'free')");
  if (pricing === "paid") conditions.push("(e.price IS NOT NULL AND e.price != '' AND LOWER(e.price) != 'free')");

  if (excludeTaxonomy) {
    const ids = excludeTaxonomy.split(",").map(Number).filter((n) => n > 0);
    if (ids.length > 0) {
      const idList = ids.join(",");
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM event_categories ec
        JOIN categories cat ON cat.id = ec.category_id
        WHERE ec.event_id = e.id
        AND (cat.id IN (${idList}) OR cat.parent_id IN (${idList}))
      )`);
    }
  }

  // "blocked" = missing a required field (channel or start_time) — push will fail
  const missingRequiredCheck = `(
    e.channel_id IS NULL OR
    (e.start_time IS NULL OR e.start_time = '')
  )`;
  // "incomplete" = missing any field (required or optional)
  const missingAnyCheck = `(
    (e.start_time IS NULL OR e.start_time = '') OR
    (e.description IS NULL OR e.description = '') OR
    (e.image_url IS NULL OR e.image_url = '') OR
    (e.venue IS NULL OR e.venue = '') OR
    (e.address IS NULL OR e.address = '') OR
    (e.city IS NULL OR e.city = '') OR
    (e.zip IS NULL OR e.zip = '') OR
    e.channel_id IS NULL
  )`;
  if (completeness === "blocked")    conditions.push(missingRequiredCheck);
  if (completeness === "ready")      conditions.push(`NOT (${missingRequiredCheck})`);
  if (completeness === "incomplete") conditions.push(missingAnyCheck);
  if (completeness === "complete")   conditions.push(`NOT (${missingAnyCheck})`);

  const missingFieldMap = {
    channel_id:  "e.channel_id IS NULL",
    start_time:  "(e.start_time IS NULL OR e.start_time = '')",
    description: "(e.description IS NULL OR e.description = '')",
    image_url:   "(e.image_url IS NULL OR e.image_url = '')",
    venue:       "(e.venue IS NULL OR e.venue = '')",
    address:     "(e.address IS NULL OR e.address = '')",
    city:        "(e.city IS NULL OR e.city = '')",
    zip:         "(e.zip IS NULL OR e.zip = '')",
    end_time:    "(e.end_time IS NULL OR e.end_time = '')",
  };
  if (missingField && missingFieldMap[missingField]) {
    conditions.push(missingFieldMap[missingField]);
  }

  if (minScore != null && minScore !== "") {
    conditions.push(`${DATA_SCORE_SQL} >= :minScore`);
    params.minScore = Number(minScore);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const allowedSorts = ["start_date", "title", "venue", "created_at", "data_score"];
  const sortByScore = sort === "data_score";
  const orderCol = allowedSorts.includes(sort) ? sort : "start_date";
  const orderDir = sortByScore ? "DESC" : "ASC";
  const orderExpr = sortByScore ? DATA_SCORE_SQL : `e.${orderCol}`;

  if (idsOnly) {
    return db.prepare(`SELECT e.id FROM events e ${where} ORDER BY ${orderExpr} ${orderDir}`).all(params).map((r) => r.id);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM events e ${where}`).get(params).count;

  const offset = (page - 1) * limit;
  params.limit = limit;
  params.offset = offset;

  const events = db.prepare(`
    SELECT e.*, ${DATA_SCORE_SQL} as data_score FROM events e ${where}
    ORDER BY ${orderExpr} ${orderDir}
    LIMIT :limit OFFSET :offset
  `).all(params);

  // Attach sources for each event
  const sourceStmt = db.prepare("SELECT DISTINCT source_name FROM event_sources WHERE event_id = ?");
  for (const ev of events) {
    ev.sources = sourceStmt.all(ev.id).map((r) => r.source_name);
  }

  return { events, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export function insertEvent(data, changelog = null) {
  const stmt = db.prepare(`
    INSERT INTO events (title, start_date, start_time, end_date, end_time, description, venue,
      address, city, state, zip, latitude, longitude, category, tags, price, image_url,
      url, external_url, contact, organizer, is_online, recurring, recurrence_frequency, recurrence_end_date)
    VALUES (@title, @start_date, @start_time, @end_date, @end_time, @description, @venue,
      @address, @city, @state, @zip, @latitude, @longitude, @category, @tags, @price, @image_url,
      @url, @external_url, @contact, @organizer, @is_online, @recurring, @recurrence_frequency, @recurrence_end_date)
  `);
  const result = stmt.run(data);
  if (changelog) {
    logEventChange(result.lastInsertRowid, changelog.action, changelog.tool ?? null, null);
  }
  return result;
}

export function updateEvent(id, data, changelog = null) {
  const fields = Object.keys(data)
    .filter((k) => k !== "id")
    .map((k) => `${k} = @${k}`)
    .join(", ");
  if (!fields) return;

  let before = null;
  if (changelog) {
    before = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  }

  data.id = id;
  data.updated_at = new Date().toISOString();
  const result = db.prepare(`UPDATE events SET ${fields}, updated_at = @updated_at WHERE id = @id`).run(data);

  if (changelog && before) {
    const changes = {};
    for (const k of Object.keys(data)) {
      if (k === "id" || k === "updated_at") continue;
      const from = before[k] ?? null;
      const to = data[k] ?? null;
      if (String(from ?? "") !== String(to ?? "")) {
        changes[k] = { from, to };
      }
    }
    if (Object.keys(changes).length > 0) {
      logEventChange(id, changelog.action, changelog.tool ?? null, changes);
    }
  }

  return result;
}

export function deleteEventById(id) {
  return db.prepare("DELETE FROM events WHERE id = ?").run(id);
}

export function addEventSource(data) {
  return db.prepare(`
    INSERT OR IGNORE INTO event_sources (event_id, source_name, source_id, source_url, import_log_id)
    VALUES (@event_id, @source_name, @source_id, @source_url, @import_log_id)
  `).run(data);
}

// Find an existing event from the same source with identical title + date + time.
// Guards against sources (like RPL) that create unique IDs per registration slot
// for what is actually the same event occurrence.
export function findSameSourceEvent(sourceName, { title, start_date, start_time }) {
  return db.prepare(`
    SELECT e.* FROM events e
    JOIN event_sources es ON es.event_id = e.id
    WHERE es.source_name = ?
      AND e.title = ?
      AND e.start_date = ?
      AND (e.start_time = ? OR (e.start_time IS NULL AND ? IS NULL))
    LIMIT 1
  `).get(sourceName, title, start_date, start_time ?? null, start_time ?? null) || null;
}

export function findEventBySourceId(sourceName, sourceId) {
  const row = db.prepare(`
    SELECT e.* FROM events e
    JOIN event_sources es ON es.event_id = e.id
    WHERE es.source_name = ? AND es.source_id = ?
  `).get(sourceName, sourceId);
  return row || null;
}

export function createImportLog(data) {
  return db.prepare(`
    INSERT INTO import_logs (source_name, file_name, started_at, status)
    VALUES (@source_name, @file_name, @started_at, 'running')
  `).run(data);
}

export function completeImportLog(id, stats) {
  return db.prepare(`
    UPDATE import_logs SET completed_at = @completed_at, status = @status,
      total_rows = @total_rows, new_events = @new_events, updated_events = @updated_events,
      duplicate_events = @duplicate_events, errors = @errors, error_details = @error_details
    WHERE id = @id
  `).run({ id, ...stats });
}

export function getImportLogs() {
  return db.prepare("SELECT * FROM import_logs ORDER BY started_at DESC").all();
}

export function getImportLog(id) {
  return db.prepare("SELECT * FROM import_logs WHERE id = ?").get(id);
}

export function createExportLog(data) {
  return db.prepare(`
    INSERT INTO export_logs (environment_id, environment_name, export_type, started_at, status, total_events)
    VALUES (@environment_id, @environment_name, @export_type, @started_at, 'running', @total_events)
  `).run(data);
}

export function updateExportLogProgress(id, stats) {
  return db.prepare(`
    UPDATE export_logs SET pushed_events = @pushed_events, failed_events = @failed_events,
      skipped_events = @skipped_events, errors = @errors,
      created_events = @created_events, updated_events = @updated_events
    WHERE id = @id
  `).run({ id, created_events: 0, updated_events: 0, ...stats });
}

export function completeExportLog(id, stats) {
  return db.prepare(`
    UPDATE export_logs SET completed_at = @completed_at, status = @status,
      total_events = @total_events, pushed_events = @pushed_events, failed_events = @failed_events,
      skipped_events = @skipped_events, errors = @errors, error_details = @error_details,
      created_events = @created_events, updated_events = @updated_events
    WHERE id = @id
  `).run({ id, created_events: 0, updated_events: 0, ...stats });
}

export function getExportLogs() {
  return db.prepare("SELECT * FROM export_logs ORDER BY started_at DESC").all();
}

export function getExportLog(id) {
  return db.prepare("SELECT * FROM export_logs WHERE id = ?").get(id);
}

export function addExportLogEvent(exportLogId, eventId, status, realmsId = null, error = null) {
  return db.prepare(`
    INSERT INTO export_log_events (export_log_id, event_id, status, realms_id, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(exportLogId, eventId, status, realmsId, error);
}

export function getExportLogEvents(exportLogId) {
  return db.prepare(`
    SELECT ele.*, e.title, e.start_date, e.start_time, e.venue, e.channel_id
    FROM export_log_events ele
    JOIN events e ON e.id = ele.event_id
    WHERE ele.export_log_id = ?
    ORDER BY ele.status DESC, e.title ASC
  `).all(exportLogId);
}

export function createEnrichmentLog(data) {
  return db.prepare(`
    INSERT INTO enrichment_logs (function_name, started_at, status, total_events)
    VALUES (@function_name, @started_at, 'running', @total_events)
  `).run(data);
}

export function completeEnrichmentLog(id, stats) {
  return db.prepare(`
    UPDATE enrichment_logs SET completed_at = @completed_at, status = @status,
      total_events = @total_events, changed_events = @changed_events,
      skipped_events = @skipped_events, errors = @errors, error_details = @error_details
    WHERE id = @id
  `).run({ id, ...stats });
}

export function addEnrichmentChange(logId, { event_id, event_title, field_name, old_value, new_value }) {
  return db.prepare(`
    INSERT INTO enrichment_changes (enrichment_log_id, event_id, event_title, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(logId, event_id, event_title || null, field_name, old_value ?? null, new_value ?? null);
}

export function getEnrichmentLogs() {
  return db.prepare("SELECT * FROM enrichment_logs ORDER BY started_at DESC").all();
}

export function getEnrichmentLog(id) {
  return db.prepare("SELECT * FROM enrichment_logs WHERE id = ?").get(id);
}

export function getEnrichmentChanges(logId) {
  return db.prepare("SELECT * FROM enrichment_changes WHERE enrichment_log_id = ? ORDER BY id ASC").all(logId);
}

export function getScrapeStatuses() {
  return db.prepare("SELECT * FROM scrape_status ORDER BY source_name").all();
}

export function getScrapeStatus(source) {
  return db.prepare("SELECT * FROM scrape_status WHERE source_name = ?").get(source);
}

export function updateScrapeStatus(source, data) {
  return db.prepare(
    "UPDATE scrape_status SET last_scraped = COALESCE(@last_scraped, last_scraped), status = @status, error = @error WHERE source_name = @source_name"
  ).run({ source_name: source, last_scraped: data.last_scraped || null, status: data.status, error: data.error || null });
}

export function getAllEvents() {
  return db.prepare(`
    SELECT e.id, e.title, e.start_date, e.start_time, e.venue, e.description, e.category, e.tags, e.channel_id,
           GROUP_CONCAT(es.source_name) as sources
    FROM events e
    LEFT JOIN event_sources es ON es.event_id = e.id
    WHERE e.archived = 0 AND e.is_dismissed = 0
    GROUP BY e.id
  `).all();
}

export function getUncategorizedEvents() {
  return db.prepare(`
    SELECT id, title, start_date, start_time, venue, description, category, tags
    FROM events
    WHERE archived = 0 AND is_dismissed = 0
      AND id NOT IN (SELECT DISTINCT event_id FROM event_categories)
  `).all();
}

export function getPossibleAttractions() {
  return db.prepare(`
    SELECT e.id, e.title, e.start_date, e.end_date, e.start_time, e.recurrence_frequency,
           CAST(julianday(COALESCE(e.end_date, e.start_date)) - julianday(e.start_date) AS INTEGER) AS span_days,
           (SELECT source_name FROM event_sources WHERE event_id = e.id LIMIT 1) AS source_name
    FROM events e
    WHERE e.archived = 0
      AND e.is_dismissed = 0
      AND (
        e.recurrence_frequency = 'daily'
        OR (
          e.end_date IS NOT NULL AND e.end_date != ''
          AND CAST(julianday(e.end_date) - julianday(e.start_date) AS INTEGER) > 90
          AND (e.start_time IS NULL OR e.start_time = '')
        )
      )
    ORDER BY span_days DESC
  `).all();
}

export function getDismissedEvents() {
  return db.prepare(`
    SELECT e.id, e.title, e.start_date, e.end_date, e.recurrence_frequency,
           e.updated_at AS dismissed_at,
           (SELECT source_name FROM event_sources WHERE event_id = e.id LIMIT 1) AS source_name
    FROM events e
    WHERE e.is_dismissed = 1
    ORDER BY e.updated_at DESC
  `).all();
}

export function dismissEvent(id) {
  return db.prepare("UPDATE events SET is_dismissed = 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function undismissEvent(id) {
  return db.prepare("UPDATE events SET is_dismissed = 0, updated_at = datetime('now') WHERE id = ?").run(id);
}

export function getRecurringEvents() {
  return db.prepare("SELECT id, title, start_date, recurrence_frequency, recurrence_end_date, rrule FROM events WHERE recurring = 1 AND archived = 0 ORDER BY start_date ASC").all();
}

export function getMissingTimeEvents() {
  return db.prepare(`
    SELECT id, title, start_date, description
    FROM events
    WHERE (start_time IS NULL OR start_time = '')
      AND description IS NOT NULL AND description != ''
      AND archived = 0
    ORDER BY start_date ASC
  `).all();
}

export function getMissingPriceEvents() {
  return db.prepare(`
    SELECT id, title, start_date, description
    FROM events
    WHERE (price IS NULL OR price = '')
      AND description IS NOT NULL AND description != ''
      AND archived = 0
    ORDER BY start_date ASC
  `).all();
}

export function getEventsWithoutZip() {
  return db.prepare(`
    SELECT id, address, city, state, venue, latitude, longitude
    FROM events
    WHERE (zip IS NULL OR zip = '')
      AND (
        (latitude IS NOT NULL AND longitude IS NOT NULL)
        OR (city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '')
      )
    ORDER BY id ASC
  `).all();
}

export function getEventsMissingAddress() {
  return db.prepare(`
    SELECT id, address, city, state, zip, venue, latitude, longitude
    FROM events
    WHERE archived = 0 AND is_dismissed = 0
      AND (
        (address IS NULL OR address = '')
        OR (city IS NULL OR city = '')
        OR (state IS NULL OR state = '')
        OR (zip IS NULL OR zip = '')
        OR (latitude IS NULL)
        OR (longitude IS NULL)
      )
      AND (
        venue IS NOT NULL AND venue != ''
        OR (latitude IS NOT NULL AND longitude IS NOT NULL)
        OR (address IS NOT NULL AND address != '')
      )
    ORDER BY id ASC
  `).all();
}

export function getAddressStats() {
  const total = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0").get().count;
  const missingAddress = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (address IS NULL OR address = '')").get().count;
  const missingCity = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (city IS NULL OR city = '')").get().count;
  const missingState = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (state IS NULL OR state = '')").get().count;
  const missingZip = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (zip IS NULL OR zip = '')").get().count;
  const missingCoords = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (latitude IS NULL OR longitude IS NULL)").get().count;
  const missingVenue = db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND is_dismissed = 0 AND (venue IS NULL OR venue = '')").get().count;
  return { total, missingAddress, missingCity, missingState, missingZip, missingCoords, missingVenue };
}

export function getUncategorizedCount() {
  return db.prepare("SELECT COUNT(*) as count FROM events WHERE archived = 0 AND id NOT IN (SELECT DISTINCT event_id FROM event_categories)").get().count;
}

export function setRrule(id, rrule) {
  return db.prepare("UPDATE events SET rrule = ?, updated_at = datetime('now') WHERE id = ?").run(rrule, id);
}

export function clearMultipleDatesEvents() {
  return db.prepare(
    "UPDATE events SET recurring = 0, recurrence_frequency = NULL, recurrence_end_date = NULL, updated_at = datetime('now') WHERE recurrence_frequency = 'Multiple dates'"
  ).run();
}

// ── Channels ─────────────────────────────────────────────────────────────────

export function upsertChannel({ name, type = "organization", website = null, image_url = null }) {
  db.prepare(`
    INSERT OR IGNORE INTO channels (name, type, website)
    VALUES (@name, @type, @website)
  `).run({ name, type, website });
  if (image_url) {
    db.prepare(`
      UPDATE channels SET image_url = @image_url, updated_at = @updated_at
      WHERE name = @name AND (image_url IS NULL OR image_url = '')
    `).run({ name, image_url, updated_at: new Date().toISOString() });
  }
  return db.prepare("SELECT * FROM channels WHERE name = ?").get(name);
}

export function assignEventChannel(eventId, channelId) {
  return db.prepare("UPDATE events SET channel_id = ? WHERE id = ?").run(channelId, eventId);
}

export function getChannels() {
  return db.prepare(`
    SELECT c.*, COUNT(e.id) as event_count
    FROM channels c
    LEFT JOIN events e ON e.channel_id = c.id
    GROUP BY c.id
    ORDER BY event_count DESC, c.name ASC
  `).all();
}

export function getChannel(id) {
  const channel = db.prepare("SELECT * FROM channels WHERE id = ?").get(id);
  if (!channel) return null;
  channel.event_count = db.prepare("SELECT COUNT(*) as count FROM events WHERE channel_id = ?").get(id).count;
  channel.default_categories = getChannelCategories(id);
  return channel;
}

export function getChannelCategories(channelId) {
  return db.prepare(`
    SELECT c.*, p.name AS parent_name, p.slug AS parent_slug
    FROM channel_categories cc
    JOIN categories c ON c.id = cc.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE cc.channel_id = ?
    ORDER BY p.sort_order, c.sort_order, c.name
  `).all(channelId);
}

export function addChannelCategory(channelId, categoryId) {
  return db.prepare("INSERT OR IGNORE INTO channel_categories (channel_id, category_id) VALUES (?, ?)").run(channelId, categoryId);
}

export function removeChannelCategory(channelId, categoryId) {
  return db.prepare("DELETE FROM channel_categories WHERE channel_id = ? AND category_id = ?").run(channelId, categoryId);
}

export function getEmptyChannels() {
  return db.prepare(`
    SELECT c.*, 0 AS event_count
    FROM channels c
    LEFT JOIN events e ON e.channel_id = c.id
    WHERE e.id IS NULL
    ORDER BY c.name ASC
  `).all();
}

export function deleteChannel(id) {
  return db.prepare("DELETE FROM channels WHERE id = ?").run(id);
}

export function deleteEmptyChannels() {
  const rows = getEmptyChannels();
  const stmt = db.prepare("DELETE FROM channels WHERE id = ?");
  const tx = db.transaction((items) => {
    for (const it of items) stmt.run(it.id);
  });
  tx(rows);
  return rows.length;
}

export function updateChannel(id, data) {
  const allowed = ["name", "description", "website", "type", "image_url"];
  const fields = allowed.filter((k) => data[k] !== undefined);
  if (!fields.length) return;
  const setClause = fields.map((k) => `${k} = @${k}`).join(", ");
  const params = { id, updated_at: new Date().toISOString() };
  for (const k of fields) params[k] = data[k];
  return db.prepare(`UPDATE channels SET ${setClause}, updated_at = @updated_at WHERE id = @id`).run(params);
}

// ── Taxonomy Categories ───────────────────────────────────────────────────────

export function getCategories() {
  const rows = db.prepare("SELECT * FROM categories ORDER BY sort_order, name").all();
  const parents = rows.filter((r) => !r.parent_id);
  return parents.map((p) => ({ ...p, subcategories: rows.filter((r) => r.parent_id === p.id) }));
}

export function getCategoryBySlug(slug) {
  return db.prepare("SELECT * FROM categories WHERE slug = ?").get(slug);
}

export function getEventCategories(eventId) {
  return db.prepare(`
    SELECT c.*, p.name as parent_name, p.slug as parent_slug
    FROM event_categories ec
    JOIN categories c ON c.id = ec.category_id
    LEFT JOIN categories p ON p.id = c.parent_id
    WHERE ec.event_id = ?
    ORDER BY p.sort_order, c.sort_order, c.name
  `).all(eventId);
}

export function addEventCategory(eventId, categoryId) {
  return db.prepare("INSERT OR IGNORE INTO event_categories (event_id, category_id) VALUES (?, ?)").run(eventId, categoryId);
}

export function removeEventCategory(eventId, categoryId) {
  return db.prepare("DELETE FROM event_categories WHERE event_id = ? AND category_id = ?").run(eventId, categoryId);
}

export function setEventCategories(eventId, categoryIds) {
  const del = db.prepare("DELETE FROM event_categories WHERE event_id = ?");
  const ins = db.prepare("INSERT OR IGNORE INTO event_categories (event_id, category_id) VALUES (?, ?)");
  db.transaction(() => {
    del.run(eventId);
    for (const id of categoryIds) ins.run(eventId, id);
  })();
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export function dismissDuplicate(idA, idB) {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
  return db.prepare("INSERT OR IGNORE INTO duplicate_dismissals (id_a, id_b) VALUES (?, ?)").run(a, b);
}

export function getDismissedPairs() {
  return db.prepare("SELECT id_a, id_b FROM duplicate_dismissals").all();
}

// Merge event B into event A: move sources + categories, merge fields, delete B.
export function mergeEvents(keepId, removeId) {
  db.transaction(() => {
    const keep = db.prepare("SELECT * FROM events WHERE id = ?").get(keepId);
    const remove = db.prepare("SELECT * FROM events WHERE id = ?").get(removeId);
    if (!keep || !remove) throw new Error("Event not found");

    const fieldKeys = [
      "description", "venue", "address", "city", "state", "zip",
      "latitude", "longitude", "category", "tags", "price", "image_url",
      "url", "external_url", "contact", "organizer", "end_date", "end_time",
      "start_time", "recurrence_frequency", "recurrence_end_date", "rrule",
    ];
    const updates = {};
    for (const k of fieldKeys) {
      if (!keep[k] && remove[k]) updates[k] = remove[k];
      if (k === "description" && remove[k] && keep[k] && remove[k].length > keep[k].length) updates[k] = remove[k];
    }
    if (Object.keys(updates).length) {
      const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
      updates.id = keepId;
      db.prepare(`UPDATE events SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(updates);
    }

    db.prepare("UPDATE OR IGNORE event_sources SET event_id = ? WHERE event_id = ?").run(keepId, removeId);
    db.prepare("DELETE FROM event_sources WHERE event_id = ?").run(removeId);
    db.prepare("INSERT OR IGNORE INTO event_categories (event_id, category_id) SELECT ?, category_id FROM event_categories WHERE event_id = ?").run(keepId, removeId);
    db.prepare("DELETE FROM event_categories WHERE event_id = ?").run(removeId);
    // Merge Realms push records: keep A's records, adopt B's for environments A hasn't been pushed to
    db.prepare(`
      INSERT OR IGNORE INTO realms_event_pushes (event_id, environment_id, realms_id, pushed_at, push_error)
      SELECT ?, environment_id, realms_id, pushed_at, push_error
      FROM realms_event_pushes WHERE event_id = ?
    `).run(keepId, removeId);
    db.prepare("DELETE FROM realms_event_pushes WHERE event_id = ?").run(removeId);
    db.prepare("DELETE FROM duplicate_dismissals WHERE id_a = ? OR id_b = ?").run(removeId, removeId);
    db.prepare("DELETE FROM events WHERE id = ?").run(removeId);
  })();
}

// ── Channel duplicate detection ─────────────────────────────────────────────

export function dismissChannelDuplicate(idA, idB) {
  const [a, b] = idA < idB ? [idA, idB] : [idB, idA];
  return db.prepare("INSERT OR IGNORE INTO channel_duplicate_dismissals (id_a, id_b) VALUES (?, ?)").run(a, b);
}

export function getDismissedChannelPairs() {
  return db.prepare("SELECT id_a, id_b FROM channel_duplicate_dismissals").all();
}

// Merge channel B into A: reassign events, fill missing fields on A,
// absorb realms pushes for environments A isn't pushed to, delete B.
export function mergeChannels(keepId, removeId) {
  if (keepId === removeId) throw new Error("keep and remove channels must differ");
  db.transaction(() => {
    const keep = db.prepare("SELECT * FROM channels WHERE id = ?").get(keepId);
    const remove = db.prepare("SELECT * FROM channels WHERE id = ?").get(removeId);
    if (!keep || !remove) throw new Error("Channel not found");

    const fieldKeys = ["description", "website", "image_url", "type"];
    const updates = {};
    for (const k of fieldKeys) {
      if (!keep[k] && remove[k]) updates[k] = remove[k];
    }
    if (Object.keys(updates).length) {
      const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(", ");
      updates.id = keepId;
      db.prepare(`UPDATE channels SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(updates);
    }

    db.prepare("UPDATE events SET channel_id = ? WHERE channel_id = ?").run(keepId, removeId);
    db.prepare(`
      INSERT OR IGNORE INTO realms_channel_pushes (channel_id, environment_id, realms_id, realms_slug, created_at, updated_at)
      SELECT ?, environment_id, realms_id, realms_slug, created_at, updated_at
      FROM realms_channel_pushes WHERE channel_id = ?
    `).run(keepId, removeId);
    db.prepare("DELETE FROM realms_channel_pushes WHERE channel_id = ?").run(removeId);
    db.prepare("DELETE FROM channel_duplicate_dismissals WHERE id_a = ? OR id_b = ?").run(removeId, removeId);
    db.prepare("DELETE FROM channels WHERE id = ?").run(removeId);
  })();
}

export default db;
