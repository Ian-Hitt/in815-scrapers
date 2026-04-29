# in815 Scrapers

Event data pipeline for the Rockford, IL (815 area code) region. Scrapes community events from 20+ local sources, deduplicates them, and stores everything in a central SQLite database for review and export to [Realms.tv](https://realms.tv).

## How it works

Two-stage pipeline:

1. **Scrapers** (`/scrapers/`) — Node.js scripts that pull events from each source and write to CSV files in `/data/`
2. **Event Hub** (`/event-hub/`) — Express + React app that imports CSVs, deduplicates, and stores events in SQLite with a UI for curation and export

## Sources

| Source | Method |
|---|---|
| Rockford Park District | Puppeteer (CalendarWiz) |
| GoRockford.com | SimpleView ASM API |
| Eventbrite (Rockford region) | Puppeteer (anti-detection) |
| Rockford Public Library | Puppeteer + HTTPS |
| Rockford Live | Puppeteer + SimpleView ASM API |
| Rockford Buzz | Puppeteer scroll + RSC parsing |
| Hard Rock Casino Rockford | HTTPS + HTML parsing |
| Ticketmaster (Rockford region) | Discovery API v2 |
| Rockford Rivets | HTTPS JSON API |
| Mary's Place Bar | HTTPS + ai1ec HTML parsing |
| North Suburban Library District | HTTPS + JSON-LD |
| Boylan Catholic HS Athletics | Google Calendar iCal feed |
| Harlem HS Athletics | GraphQL API |
| Inter Soccer League (Sat + Sun) | Puppeteer (Next.js) |
| Hononegah HS Athletics | SNAP.app GraphQL API |
| Guilford HS Athletics | SNAP.app GraphQL API |
| East HS Athletics | SNAP.app GraphQL API |
| Auburn HS Athletics | SNAP.app GraphQL API |
| Jefferson HS Athletics | SNAP.app GraphQL API |
| Rockford Lutheran HS Athletics | SNAP.app GraphQL API |

## Setup

```bash
# Install dependencies
npm install

# Copy env file and fill in any API keys
cp event-hub/.env.example event-hub/.env
```

## Running scrapers

```bash
# Run a single scraper
node scrapers/rpd.js

# Scrapers via npm scripts (subset)
npm run scrape:rpd
npm run scrape:gorockford
npm run scrape:eventbrite
npm run scrape:rpl
npm run scrape:harlem
```

Each scraper writes a CSV to `data/<name>.csv`. The Event Hub can then import those files.

## Event Hub

```bash
cd event-hub

# Development (server + client with live reload)
npm run dev

# Production
npm run build
npm start
```

The UI runs at `http://localhost:5173` (dev) and exposes pages for importing, curating, deduplicating, and exporting events.

## Stack

- **Scrapers:** Node.js, Puppeteer
- **Backend:** Express, better-sqlite3, csv-parse, string-similarity
- **Frontend:** React 19, React Router, TanStack Query, Tailwind CSS, Vite
- **Database:** SQLite (WAL mode) at `event-hub/data/events.db`

## Project structure

```
scrapers/        # One file per source
data/            # CSV output (gitignored)
event-hub/
  server/        # Express API, importers, dedup, curation logic
  client/        # React frontend
  data/          # SQLite database (gitignored)
docs/            # API documentation for Realms.tv integration
```
