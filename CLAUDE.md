# in815 Scrapers — Rockford Events Data Hub

## Project Purpose

This is a data pipeline for aggregating community events across the Rockford, IL region (the "815" area code). It scrapes events from multiple local sources, normalizes and deduplicates them into a central SQLite database, and will eventually export/import that data into **Realms.tv**.

## Architecture Overview

Two-stage pipeline:

1. **Scrapers** (`/scrapers/`) — Node.js scripts that pull event data from each source and write to CSV files in `/data/`
2. **Event Hub** (`/event-hub/`) — Full-stack web app (Express + React) that imports CSVs, deduplicates, and stores events in SQLite

## Sources

| Scraper | Source | Method | Output |
|---|---|---|---|
| `rpd.js` | Rockford Park District (CalendarWiz) | Puppeteer | `data/rpd.csv` |
| `gorockford.js` | GoRockford.com | SimpleView ASM API (monthly windows) | `data/gorockford.csv` |
| `eventbrite.js` | Eventbrite (Rockford region) | Puppeteer (anti-detection) | `data/eventbrite.csv` |
| `rpl.js` | Rockford Public Library | Puppeteer + HTTPS | `data/rpl.csv` |
| `harlem.js` | Harlem High School Athletics | GraphQL API | `data/harlem.csv` |
| `intersoccer.js` | Inter Soccer League (Saturday) | Puppeteer (Next.js) | `data/intersoccer-saturday.csv` |
| `intersoccer.js` | Inter Soccer League (Sunday) | Puppeteer (Next.js) | `data/intersoccer-sunday.csv` |
| `hononegah.js` | Hononegah High School Athletics | SNAP.app GraphQL API | `data/hononegah.csv` |
| `guilford.js` | Guilford High School Athletics | SNAP.app GraphQL API | `data/guilford.csv` |
| `east.js` | East High School Athletics | SNAP.app GraphQL API | `data/east.csv` |
| `auburn.js` | Auburn High School Athletics | SNAP.app GraphQL API | `data/auburn.csv` |
| `jefferson.js` | Jefferson High School Athletics | SNAP.app GraphQL API | `data/jefferson.csv` |
| `rl.js` | Rockford Lutheran High School Athletics | SNAP.app GraphQL API | `data/rl.csv` |
| `rockfordlive.js` | Rockford Live (rockfordlive.com) | Puppeteer + SimpleView ASM API | `data/rockfordlive.csv` |
| `rockbuzz.js` | Rockford Buzz (rockbuzz.com) | Puppeteer scroll + HTTPS RSC parsing | `data/rockbuzz.csv` |
| `hardrock.js` | Hard Rock Casino Rockford | HTTPS + HTML parsing | `data/hardrock.csv` |
| `boylan.js` | Boylan Catholic High School Athletics | Google Calendar iCal feed | `data/boylan.csv` |
| `rivets.js` | Rockford Rivets (Northwoods League baseball) | HTTPS JSON API | `data/rivets.csv` |
| `ticketmaster.js` | Ticketmaster (Rockford region) | Discovery API v2 | `data/ticketmaster.csv` |
| `marysplace.js` | Mary's Place Bar (marysplacebar.com) | HTTPS + ai1ec HTML parsing | `data/marysplace.csv` |
| `northsuburban.js` | North Suburban Library District | HTTPS + JSON-LD detail pages | `data/northsuburban.csv` |

Shared scraper utilities are in `scrapers/utils.js`.

## Event Hub Stack

- **Backend:** Express, better-sqlite3, csv-parse, string-similarity
- **Frontend:** React 19, React Router, TanStack Query, Tailwind CSS, Vite
- **Database:** SQLite with WAL mode at `event-hub/data/events.db`

## Key Backend Modules

- `event-hub/server/db.js` — Schema definitions and DB helpers
- `event-hub/server/dedup.js` — Two-layer deduplication (exact source ID + fuzzy title/date/venue matching)
- `event-hub/server/categorize.js` — Auto-category assignment
- `event-hub/server/rrule.js` — iCal RRULE recurrence handling
- `event-hub/server/importers/` — Per-source CSV → DB field mappers

## Data Model (events table key fields)

```
id, title, start_date, start_time, end_date, end_time,
description, venue, address, city, state, zip,
latitude, longitude, category, tags (semicolon-separated),
price, image_url, url, external_url, contact, organizer,
is_online, recurring, recurrence_frequency, recurrence_end_date,
channel_id, rrule, created_at, updated_at
```

Events are linked to their original scraped record via `event_sources` (source_name + source_id). Multiple source records can merge into a single event row.

## Channels

Channels represent organizations/venues. They are auto-assigned on import:
- RPD → "Rockford Park District"
- RPL → "Rockford Public Library"
- Harlem → "Harlem High School Athletics"
- InterSoccer Saturday/Sunday → "International Soccer League"
- Eventbrite/GoRockford → derived from organizer/venue fields

## Deduplication

1. Exact match on `(source_name, source_id)` → update existing event
2. Fuzzy Jaro-Winkler similarity on title + date + venue across sources → merge into one event, link both sources

## Realms.tv Integration

The eventual destination for this data is Realms.tv. See `docs/api-docs.md` for the GraphQL mutation spec used to create events on that platform. The API doc covers all input fields, enums, scheduling, recurrence, and registration options.

## Running the Project

```bash
# Run a scraper
node scrapers/rpd.js

# Start the event hub (from event-hub/)
npm run dev        # starts both server and client via concurrently

# Server only
node server/index.js

# Client only
npm run client
```

## Adding a New Scraper — Complete Checklist

Every new source requires touching **9 files**. Do all of them or the source won't appear in the UI.

### 1. `scrapers/<name>.js`
Write the scraper. It must write a CSV to `data/<name>.csv`. Follow the patterns in existing scrapers:
- **Only collect upcoming events** — filter to `startDate >= today`. Do not store past/completed events.
- Use `escapeCsv()` from `utils.js` for all CSV output
- If the source has multiple sub-schedules (e.g. Saturday/Sunday), one scraper file can write multiple CSVs — register each CSV as its own source key

#### Required CSV columns (every scraper must produce these)

| Column | Format | Notes |
|---|---|---|
| `sourceId` | String, stable across runs | Used for deduplication. Use the source's own ID field if available; otherwise construct one from `startDate-title` or similar. Column can be named `eventId`, `matchId`, etc. to match the source. |
| `title` | String | Human-readable event name |
| `startDate` | `YYYY-MM-DD` | |
| `startTime` | `H:MM AM/PM` e.g. `9:00 AM` | Empty string if unknown |
| `endDate` | `YYYY-MM-DD` | Empty string if unknown |
| `endTime` | `H:MM AM/PM` | Empty string if unknown |
| `description` | Plain text, no HTML | Synthesize from available fields if the source has no description field |
| `venue` | String | Facility or location name |
| `address` | String | Street address only |
| `city` | String | |
| `state` | Two-letter code e.g. `IL` | |
| `zip` | String | |
| `country` | Two-letter code e.g. `US` | Hard-code `US` if not provided |
| `organizer` | String | Organization running the event. Hard-code if not in source data. |
| `price` | String e.g. `Free`, `$10`, `$5–$20` | Hard-code `Free` if not provided |
| `isOnline` | `yes` or `no` | Hard-code `no` for in-person events |
| `tags` | Semicolon-separated e.g. `soccer; youth` | At minimum include one tag describing the event type |
| `imageUrl` | Full URL or empty string | |
| `externalUrl` | Full URL | Link to the event or source page. Use the org's calendar URL if no per-event URL exists. |

### SNAP.app schools (shared utility)

Schools using the SNAP.app athletics platform share a GraphQL API. Use the shared utilities instead of duplicating the full scraper each time:

**Scraper** — `scrapers/snap.js` exports `runSnapScraper(config)`. Each school scraper is just:
```js
import { runSnapScraper } from "./snap.js";
runSnapScraper({
  schoolName: "School Name",
  organizationId: "OrgId",   // from schools.snap.app/<OrgId>/calendar
  homeAddress: { address: "...", city: "...", state: "IL", zip: "..." },
  outputFile: "../data/schoolname.csv",
}).catch(console.error);
```

**Importer** — `event-hub/server/importers/snapFactory.js` exports `makeSnapMapRow(config)`. Each school importer is just:
```js
import { makeSnapMapRow } from "./snapFactory.js";
export const mapRow = makeSnapMapRow({
  organizer: "School Name",
  calendarUrl: "https://schools.snap.app/OrgId/calendar",
});
```

Then follow the normal checklist steps 3–10 to register the new source.

### Note: scrapers don't need to clean or enrich data

Scrapers just need to get the raw data out and into CSV. Post-import enrichment is handled by the curation pipeline in the event hub — don't over-engineer the scraper trying to fix data quality issues. If a new data problem is discovered that the scraper can't solve, it gets handled by adding a new curation function (see **Curation Pipeline** section below).

### 2. `event-hub/server/importers/<name>.js`
Create the mapper. Export a single `mapRow(row)` function that returns `{ event, sourceId, sourceUrl }`.
- `event` must match the DB schema fields (see Data Model above)
- `sourceId` is the unique ID used for deduplication — must be stable across re-runs
- Map CSV column names → DB field names (they often differ)
- `is_online` is an integer: `0` or `1`
- If multiple source keys share the same CSV shape, one importer file can be imported twice in base.js

### 3. `event-hub/server/importers/base.js`
Three additions:
```js
// a) Import the mapper
import { mapRow as mapName } from "./name.js";

// b) Add to MAPPERS
const MAPPERS = { ..., "source-key": mapName };

// c) Add to DEFAULT_PATHS
const DEFAULT_PATHS = { ..., "source-key": "../data/name.csv" };

// d) Add to resolveChannel() switch statement
case "source-key":
  return { name: "Org Name", type: "organization", website: "https://..." };
```

### 4. `event-hub/server/routes/imports.js`
Add to `SCRAPER_SCRIPTS`:
```js
"source-key": path.join(PROJECT_ROOT, "scrapers", "name.js"),
```

### 5. `event-hub/server/db.js`
Add a migration line so the source row appears in the DB (and therefore the UI) on next server start:
```js
db.exec("INSERT OR IGNORE INTO scrape_status (source_name) VALUES ('source-key')");
```
Without this the scrape card will never appear on `/import`.

### 6. `event-hub/client/src/pages/ImportPage.jsx`
Add to `SOURCE_META` — include a `type` so it appears under the correct filter tab:
```js
"source-key": { label: "Human Name", type: "school", description: "One-line description" },
```
Valid types: `community` (RPD, RPL, GoRockford, Eventbrite), `school` (SNAP athletics), `sports-league` (recreational leagues).

### 7. `event-hub/client/src/components/FilterBar.jsx`
Add an `<option>` to the Source filter dropdown:
```jsx
<option value="source-key">Human Name</option>
```

Also add the source key → label mapping to `SOURCE_LABELS` in `event-hub/client/src/pages/EventList.jsx`:
```js
const SOURCE_LABELS = { ..., "source-key": "Human Name" };
```

### 8. `event-hub/client/src/components/SourceBadge.jsx`
Add a color to `COLORS`:
```js
"source-key": "bg-yellow-100 text-yellow-800",
```
Pick a Tailwind color not already used. Current assignments: blue=RPD, green=GoRockford, orange=Eventbrite+Auburn (conflict — reassign when editing), purple=RPL, red=Harlem, yellow=InterSoccer (Sat+Sun), pink=Hononegah, teal=Guilford, indigo=East, lime=Jefferson, cyan=Lutheran-HS, fuchsia=Boylan, sky=Rivets, rose=MarysPlace, violet=RockfordLive, amber=Rockbuzz, stone=Hardrock, emerald=Ticketmaster.

### 9. `CLAUDE.md` Sources table
Add a row to the Sources table at the top of this file.

---

## Curation Pipeline

After events are imported into the DB, a separate curation step cleans and enriches them. This runs via the `/curate` page in the event hub UI, or via `POST /api/curate/*` endpoints. Scrapers do not need to handle any of this — if raw data has a quality issue that can't be fixed at scrape time, add a new curation function here instead.

### Existing curation functions

| Function | Endpoint | What it does |
|---|---|---|
| Auto-categorize | `POST /api/curate/auto-categorize` | Runs keyword regex rules against title + description + category and assigns matching category slugs. Rules live in `event-hub/server/categorize.js`. |
| Convert RRULEs | `POST /api/curate/rrules` | Converts human-readable `recurrence_frequency` strings (e.g. "Weekly on Monday") into iCal RRULE format for all recurring events that don't already have one. Logic lives in `event-hub/server/rrule.js`. |
| Clear "Multiple dates" | `POST /api/curate/clear-multiple-dates` | Marks events with `recurrence_frequency = "Multiple dates"` as non-recurring, since that string can't be converted to an RRULE. |
| Sports fallback images | `POST /api/curate/sports-fallback-images` | Assigns a generated PNG cover image (`/fallbacks/sports/<slug>.png`) to sports events with no `image_url`. Sport is detected via assigned taxonomy or keyword match on title/tags/category — logic in `event-hub/server/fallbackImages.js`. The PNGs are Tabler Icons (MIT) wrapped in colored squares. To regenerate (e.g. swap an icon, add a new sport, change a color), edit `event-hub/client/public/fallbacks/sports/build.py` and run `python3 build.py` — it fetches the latest Tabler SVGs and re-renders the PNGs via macOS `qlmanage`. The Realms uploader in `realms.js` reads these local paths from disk via `resolveFallbackPath()` and uploads bytes directly to `/api/upload`. |

### Adding a new curation function

If imported data has a systematic problem (wrong format, missing field that can be derived, bad values from a specific source), add a new curation function rather than complicating the scraper or importer:

1. Add the logic function to an appropriate server file (`categorize.js`, `rrule.js`, or a new file)
2. Add a `POST /api/curate/<name>` route in `event-hub/server/routes/curate.js`
3. Add a trigger button/card on the curation page in `event-hub/client/src/pages/CurationPage.jsx`

---

## Notes

- All packages use ES modules (`"type": "module"`)
- Eventbrite scraper requires headless=false and may need manual CAPTCHA solving
- Scrapers are incremental — they check for existing IDs/rows and skip duplicates
- City filtering on Eventbrite allows all hub cities (Rockford core, Stateline, Belvidere, Nearby Towns, Northern IL, Chicago Collar). Many distant cities won't appear in the 25mi radius search anyway.
