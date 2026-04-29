import { readFileSync, existsSync } from "fs";

/**
 * Escape a value for CSV output.
 */
export function escapeCsv(value) {
  const str = String(value ?? "").trim();
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Decode common HTML entities (named + numeric).
 */
export function decodeHtmlEntities(str) {
  return String(str ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Sleep for ms milliseconds.
 */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sleep for baseMs + random jitter up to jitterMs.
 */
export function randomDelay(baseMs, jitterMs) {
  return delay(baseMs + Math.floor(Math.random() * jitterMs));
}

/**
 * Parse an ISO datetime string into separate date and time strings.
 * Returns { date: "YYYY-MM-DD", time: "H:MM AM/PM" }
 */
export function parseDateTime(isoString) {
  if (!isoString) return { date: "", time: "" };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { date: isoString, time: "" };
  const date = d.toISOString().split("T")[0];
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time };
}

/**
 * Load a set of existing IDs from a CSV file given the column index.
 */
export function loadExistingIds(filePath, columns, idColumn) {
  if (!existsSync(filePath)) return new Set();
  const csv = readFileSync(filePath, "utf-8");
  const lines = csv.split("\n").slice(1);
  const idIdx = columns.indexOf(idColumn);
  const ids = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const id = parts[idIdx]?.replace(/"/g, "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Load existing CSV data rows (skipping header) from a file.
 */
export function loadExistingRows(filePath) {
  if (!existsSync(filePath)) return [];
  const csv = readFileSync(filePath, "utf-8");
  return csv.split("\n").slice(1).filter((l) => l.trim());
}

/**
 * Load existing CSV rows as a Map<id, rowString> for upsert support.
 * Re-fetched events replace their existing row; events not seen this run are preserved.
 */
export function loadExistingRowsById(filePath, columns, idColumn) {
  if (!existsSync(filePath)) return new Map();
  const csv = readFileSync(filePath, "utf-8");
  const lines = csv.split("\n").slice(1);
  const idIdx = columns.indexOf(idColumn);
  const map = new Map();
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const id = parts[idIdx]?.replace(/"/g, "").trim();
    if (id) map.set(id, line);
  }
  return map;
}
