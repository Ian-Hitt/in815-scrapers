// Runs the bulk-auto enrichment functions in dependency order.
// Review-required steps (duplicates, time/price suggestions, city-audit,
// attractions) are deliberately excluded — they need human judgment per item.
// Every step logs to enrichment_logs, so changes can still be reviewed after.

const PORT = process.env.PORT || 3002;
const BASE = `http://127.0.0.1:${PORT}/api/curate`;

// Ordered for dependencies:
//  1. archive stale events first so enrichment skips them
//  2. geocode addresses before anything that reads city/coords
//  3. clear "Multiple dates" before rrules so they don't pollute needs-review
//  4. auto-categorize before sports-fallback-images (image picks from taxonomy)
//  5. backfill-avatars is independent, runs last
const STEPS = [
  { name: "archive-past",            path: "archive-past" },
  { name: "geocode-addresses",       path: "geocode-addresses" },
  { name: "geocode-zips",            path: "geocode-zips" },
  { name: "clear-multiple-dates",    path: "clear-multiple-dates" },
  { name: "convert-rrules",          path: "rrules" },
  { name: "auto-categorize",         path: "auto-categorize" },
  { name: "sports-fallback-images",  path: "sports-fallback-images" },
  { name: "backfill-avatars",        path: "backfill-avatars" },
];

let isRunning = false;

async function callStep(path) {
  const res = await fetch(`${BASE}/${path}`, { method: "POST" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function runEnrichmentPipeline() {
  if (isRunning) {
    return { skipped: true, reason: "pipeline already running" };
  }
  isRunning = true;
  const startedAt = new Date().toISOString();
  console.log(`[pipeline] starting at ${startedAt}`);

  const results = [];
  for (const step of STEPS) {
    const t0 = Date.now();
    try {
      const data = await callStep(step.path);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[pipeline] ${step.name} ok (${elapsed}s)`, data);
      results.push({ step: step.name, ok: true, elapsed_s: Number(elapsed), data });
    } catch (err) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`[pipeline] ${step.name} failed (${elapsed}s): ${err.message}`);
      results.push({ step: step.name, ok: false, elapsed_s: Number(elapsed), error: err.message });
    }
  }

  isRunning = false;
  const completedAt = new Date().toISOString();
  console.log(`[pipeline] complete at ${completedAt}`);
  return { started_at: startedAt, completed_at: completedAt, results };
}

export function isPipelineRunning() {
  return isRunning;
}
