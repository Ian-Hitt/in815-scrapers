import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import eventsRouter from "./routes/events.js";
import importsRouter from "./routes/imports.js";
import channelsRouter from "./routes/channels.js";
import curateRouter from "./routes/curate.js";
import categoriesRouter from "./routes/categories.js";
import realmsRouter from "./routes/realms.js";
import chatRouter from "./routes/chat.js";
import { getImportLogs } from "./db.js";
import db from "./db.js";
import { runImportFromFile, DEFAULT_PATHS, backfillChannels, backfillChannelAvatars } from "./importers/base.js";
import { startScheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Serve uploaded channel avatars
const uploadsDir = path.join(__dirname, "data", "uploads");
app.use("/api/uploads", express.static(uploadsDir));

// API routes
app.use("/api/events", eventsRouter);
app.use("/api/imports", importsRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/curate", curateRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/realms", realmsRouter);
app.use("/api/chat", chatRouter);

// Serve built frontend in production
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Event Hub server running on http://localhost:${PORT}`);

  // Clear any stale statuses left over from before restart
  db.prepare("UPDATE scrape_status SET status = 'idle', error = NULL WHERE status IN ('scraping', 'error')").run();
  db.prepare("UPDATE import_logs SET status = 'failed', completed_at = datetime('now'), error_details = '[\"Interrupted by server restart\"]' WHERE status = 'running'").run();
  db.prepare("UPDATE export_logs SET status = 'failed', completed_at = datetime('now'), error_details = '[\"Interrupted by server restart\"]' WHERE status = 'running'").run();
  db.prepare("UPDATE enrichment_logs SET status = 'failed', completed_at = datetime('now'), error_details = '[\"Interrupted by server restart\"]' WHERE status = 'running'").run();

  // Backfill channels for any events missing them (one-time migration)
  const backfilled = backfillChannels();
  if (backfilled > 0) {
    console.log(`Backfilled channels for ${backfilled} events`);
  }

  // Backfill avatars for channels with known logos (e.g. SNAP schools)
  const avatars = backfillChannelAvatars();
  if (avatars > 0) {
    console.log(`Backfilled avatars for ${avatars} channels`);
  }

  // Auto-import existing CSVs on first start (when DB is empty)
  const logs = getImportLogs();
  if (logs.length === 0) {
    console.log("First start detected — importing existing CSV files...");
    for (const [source, csvPath] of Object.entries(DEFAULT_PATHS)) {
      const resolved = path.resolve(__dirname, "..", csvPath);
      if (existsSync(resolved)) {
        try {
          const result = runImportFromFile(source);
          console.log(`  [${source}] ${result.new_events} new, ${result.duplicate_events} dupes, ${result.errors} errors`);
        } catch (err) {
          console.log(`  [${source}] import failed: ${err.message}`);
        }
      } else {
        console.log(`  [${source}] no CSV found at ${resolved}, skipping`);
      }
    }
  }

  startScheduler();
});
