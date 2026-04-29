/**
 * Realms.tv GraphQL API client.
 * All functions accept an `env` object: { base_url, token, slug }.
 */

import fs from "fs";
import sharp from "sharp";
import { resolveFallbackPath } from "./fallbackImages.js";

const GQL_TIMEOUT_MS = parseInt(process.env.REALMS_TIMEOUT_MS || "30000", 10);

async function gql(env, query, variables = {}, label = "gql", { retries = 3, retryDelay = 2000 } = {}) {
  if (!env?.token) throw new Error("Realms environment has no token configured");

  const body = JSON.stringify({ query, variables });
  if (process.env.REALMS_DEBUG) console.log("[realms:gql] →", body);

  const maxRetries = env._gqlRetries ?? retries;
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelay * attempt;
      console.log(`[realms:gql] ${label} retry ${attempt}/${maxRetries} after ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }

    const t0 = Date.now();
    let res;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), GQL_TIMEOUT_MS);
    try {
      res = await fetch(`${env.base_url}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.token}`,
          ...(env.slug ? { "x-realmslug": env.slug } : {}),
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      if (err.name === "AbortError") {
        lastError = new Error(`Realms request timeout after ${GQL_TIMEOUT_MS}ms (${label})`);
      } else {
        lastError = err;
      }
      continue;
    }
    clearTimeout(timeoutHandle);
    console.log(`[realms:timing] ${label} ${Date.now() - t0}ms${attempt > 0 ? ` (attempt ${attempt + 1})` : ""}`);

    if (res.status === 502 || res.status === 503 || res.status === 504) {
      lastError = new Error(`Realms HTTP error: ${res.status} ${res.statusText}`);
      console.warn(`[realms:gql] ${label} got ${res.status} on attempt ${attempt + 1}/${maxRetries + 1}`);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Realms HTTP error: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Realms returned non-JSON: ${text.slice(0, 200)}`);
    }
    if (json.errors?.length) {
      const err = json.errors[0];
      if (process.env.REALMS_DEBUG) console.log("[realms:gql] ← error", JSON.stringify(json.errors));
      const validation = err.extensions?.validation ?? err.validation;
      const detail = validation ? JSON.stringify(validation) : err.message;
      throw new Error(detail);
    }
    return json.data;
  }

  throw lastError;
}

// ── Slug generation ──────────────────────────────────────────────────────────

function toSlug(name) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30)
    .replace(/^-|-$/g, "");
  // Minimum 3 chars required
  return slug.length >= 3 ? slug : `${slug}-ch`.slice(0, 30);
}

// ── Date/time helpers ────────────────────────────────────────────────────────

/**
 * Parse "H:MM AM/PM" → { hours, minutes } in 24-hour format.
 * Returns null if time is empty or unparseable.
 */
function parseTime(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3].toUpperCase();
  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

/**
 * Build ISO 8601 timestamp from "YYYY-MM-DD" + "H:MM AM/PM".
 * Treats the date/time as local (America/Chicago) — the local Realms
 * instance will interpret timestamps accordingly.
 * Falls back to midnight if no time is provided.
 */
/** Returns the nth weekday of a given month/year. weekday: 0=Sun…6=Sat, n: 1-based */
function nthWeekday(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  const diff = (weekday - d.getDay() + 7) % 7;
  return new Date(year, month, 1 + diff + (n - 1) * 7);
}

function toIso(date, time) {
  const t = parseTime(time);
  const hours = t ? String(t.hours).padStart(2, "0") : "00";
  const mins = t ? String(t.minutes).padStart(2, "0") : "00";
  // Central Time: CDT (UTC-5) from 2nd Sun of Mar to 1st Sun of Nov; CST (UTC-6) otherwise
  const [y, m, day] = date.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  const cdtStart = nthWeekday(y, 2, 0, 2); // 2nd Sun of March
  const cdtEnd = nthWeekday(y, 10, 0, 1);  // 1st Sun of November
  const isDST = d >= cdtStart && d < cdtEnd;
  const offset = isDST ? "-05:00" : "-06:00";
  return `${date}T${hours}:${mins}:00${offset}`;
}

// ── RRule helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

/**
 * Normalize recurrence_end_date to YYYY-MM-DD.
 * Handles both "YYYY-MM-DD" and "Month DD, YYYY" formats.
 */
function normalizeEndDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // "Month DD, YYYY"
  const m = dateStr.match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (month) return `${m[3]}-${month}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

/**
 * Parse an iCal RRULE string + recurrence_end_date into a Realms recurrence_rules object.
 * Returns null if the rrule can't be parsed or has no bounded end.
 */
function parseRRule(rruleStr, recurrenceEndDate) {
  if (!rruleStr) return null;

  const parts = {};
  rruleStr.split(";").forEach((part) => {
    const eq = part.indexOf("=");
    if (eq !== -1) parts[part.slice(0, eq)] = part.slice(eq + 1);
  });

  const freqMap = { DAILY: "DAILY", WEEKLY: "WEEKLY", MONTHLY: "MONTHLY", YEARLY: "YEARLY" };
  if (!parts.FREQ || !freqMap[parts.FREQ]) return null;

  const rule = {
    frequency: freqMap[parts.FREQ],
    interval: parts.INTERVAL ? parseInt(parts.INTERVAL, 10) : 1,
  };

  if (parts.BYDAY) rule.by_day = parts.BYDAY.split(",");
  if (parts.BYMONTH) rule.by_month = parts.BYMONTH.split(",").map(Number);
  if (parts.BYMONTHDAY) rule.by_month_date = parts.BYMONTHDAY.split(",").map(Number);
  const today = new Date().toISOString().slice(0, 10);

  if (parts.COUNT) {
    rule.count = parseInt(parts.COUNT, 10);
  } else if (parts.UNTIL) {
    // iCal UNTIL format: 20261231T000000Z → strip to date portion
    const untilDate = parts.UNTIL.replace(/T.*$/, "").replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3");
    if (untilDate < today) return null; // recurrence already ended
    rule.until = `${untilDate}T23:59:59Z`;
  } else {
    const endDate = normalizeEndDate(recurrenceEndDate);
    if (endDate) {
      if (endDate < today) return null; // recurrence already ended
      rule.until = `${endDate}T23:59:59Z`;
    }
    // no end date = recur indefinitely, omit until
  }

  return rule;
}

/**
 * Compute duration in minutes between start and end.
 * Returns 0 if end date/time is unknown or not after start.
 */
function toDuration(startDate, startTime, endDate, endTime) {
  if (!endDate && !endTime) return 0;
  const start = new Date(toIso(startDate, startTime));
  // If no end_date but end_time is set, assume same day
  const resolvedEndDate = endDate || startDate;
  const end = new Date(toIso(resolvedEndDate, endTime || startTime));
  const diff = Math.floor((end - start) / 1000 / 60);
  return diff > 0 ? diff : 0;
}

// ── Tag sanitization ─────────────────────────────────────────────────────────

/** Realms tags: only letters, numbers, and spaces allowed. */
function sanitizeTags(tagsStr) {
  if (!tagsStr) return [];
  return tagsStr
    .split(";")
    .map((t) => t.trim().replace(/[^a-zA-Z0-9 ]/g, "").trim())
    .filter(Boolean);
}

// ── Category slug helpers ─────────────────────────────────────────────────────

/**
 * Convert a local category slug to a Realms-compatible slug (3–15 chars).
 * Truncates at a word boundary when possible.
 */
export function toCategorySlug(localSlug) {
  if (localSlug.length <= 15) return localSlug;
  // Truncate to 15, then trim to last hyphen to avoid mid-word cuts
  let slug = localSlug.slice(0, 15);
  const lastHyphen = slug.lastIndexOf("-");
  if (lastHyphen >= 3) slug = slug.slice(0, lastHyphen);
  slug = slug.replace(/^-|-$/g, "");
  return slug.length >= 3 ? slug : `${slug}-c`.slice(0, 15);
}

// ── Category creation ─────────────────────────────────────────────────────────

const CREATE_CATEGORY = `
  mutation CreateCategory($category: createCategoryData) {
    createCategory(category: $category) {
      category {
        id
        name
        slug
        parent_id
      }
    }
  }
`;

const GET_CATEGORY_BY_SLUG = `
  query GetCategoryBySlug($slug: String!) {
    category(slug: $slug) {
      id
      name
      slug
      parent_id
    }
  }
`;

/**
 * Create a category in Realms from a local categories row.
 * If the slug is already taken, fetches the existing category instead.
 * Pass parentRealmsId for subcategories; omit or pass null for top-level.
 * Returns { id, name, slug, parent_id }.
 */
export async function createRealmCategory(env, category, parentRealmsId = null) {
  const slug = toCategorySlug(category.slug);
  const input = { name: category.name, slug };
  if (parentRealmsId) input.parent_id = parentRealmsId;
  try {
    const data = await gql(env, CREATE_CATEGORY, { category: input }, "createCategory");
    return data.createCategory.category;
  } catch (err) {
    if (err.message?.includes("already taken")) {
      const data = await gql(env, GET_CATEGORY_BY_SLUG, { slug }, "getCategoryBySlug");
      return data.category;
    }
    throw err;
  }
}

// ── Channel creation ─────────────────────────────────────────────────────────

const CREATE_CHANNEL = `
  mutation CreateChannel($channel: CreateChannelData!) {
    createChannel(channel: $channel) {
      channel {
        id
        slug
      }
    }
  }
`;

const GET_CHANNEL_BY_SLUG = `
  query GetChannelBySlug($slug: String!) {
    channel(slug: $slug) {
      id
      slug
    }
  }
`;

/**
 * Create a channel in Realms from a local channels row.
 * If the slug is already taken, fetches the existing channel instead.
 * Returns { id, slug }.
 */
export async function createRealmChannel(env, channel) {
  const slug = toSlug(channel.name);

  const input = { name: channel.name, slug };
  if (channel.description) input.description = channel.description;
  if (channel.website) {
    input.cta_type = "custom";
    input.cta_data = { name: "Website", url: channel.website };
  }

  try {
    const data = await gql(env, CREATE_CHANNEL, { channel: input }, "createChannel");
    return data.createChannel.channel; // { id, slug }
  } catch (err) {
    if (err.message?.includes("already taken")) {
      const data = await gql(env, GET_CHANNEL_BY_SLUG, { slug }, "getChannelBySlug");
      return data.channel; // { id, slug }
    }
    throw err;
  }
}

// ── Hub creation ────────────────────────────────────────────────────────────

const CREATE_HUB = `
  mutation CreateHub($hub: createHubData!) {
    createHub(hub: $hub) {
      hub { id name slug }
    }
  }
`;

const GET_HUBS = `
  query {
    hubs { data { id name slug } }
  }
`;

function extractHubs(data) {
  return data.hubs?.data ?? data.hubs ?? [];
}

/**
 * Create a hub in Realms. If the slug is already taken, fetches existing hubs
 * and returns the matching one.
 * Returns { id, name, slug }.
 */
export async function createRealmHub(env, hub) {
  const input = {
    name: hub.name,
    slug: hub.slug,
    display_order: hub.displayOrder ?? 0,
  };
  try {
    const data = await gql(env, CREATE_HUB, { hub: input }, "createHub");
    return data.createHub.hub;
  } catch (err) {
    if (err.message?.includes("already taken") || err.message?.includes("already exists")) {
      const data = await gql(env, GET_HUBS, {}, "getHubs");
      const existing = extractHubs(data).find((h) => h.slug === hub.slug);
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Fetch all hubs from the Realms instance.
 */
export async function getRealmHubs(env) {
  const data = await gql(env, GET_HUBS, {}, "getHubs");
  return extractHubs(data);
}

const GET_CATEGORIES = `
  query {
    categories { data { id name slug parent_id } }
  }
`;

/**
 * Fetch all categories from the Realms instance.
 */
export async function getRealmCategories(env) {
  const data = await gql(env, GET_CATEGORIES, {}, "getCategories");
  return data.categories?.data ?? data.categories ?? [];
}

// ── Event create / update ────────────────────────────────────────────────────

/** Marker for GraphQL enum values that must appear unquoted in inline literals. */
export function gqlEnum(value) { return { __gqlEnum: value }; }

/**
 * Serialize a JS object into a GraphQL inline input literal.
 * { __gqlEnum: "foo" } → foo (unquoted enum identifier)
 * strings → "escaped"
 * booleans/numbers → bare
 * arrays/objects → recursive
 */
function toGqlLiteral(value) {
  if (value === null || value === undefined) return "null";
  if (value?.__gqlEnum) return value.__gqlEnum;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(toGqlLiteral).join(", ")}]`;
  if (typeof value === "object") {
    const fields = Object.entries(value).map(([k, v]) => `${k}: ${toGqlLiteral(v)}`).join(", ");
    return `{ ${fields} }`;
  }
  return "null";
}


/**
 * Fetch an image URL and upload it to Realms as an event cover.
 * Returns the upload ID string, or null if the URL is empty or upload fails.
 *
 * Local fallback images (URLs starting with /fallbacks/sports/) are read
 * directly from disk instead of being fetched over HTTP.
 */
async function uploadCoverImage(env, imageUrl) {
  if (!imageUrl) return null;

  let buffer;
  let contentType;

  const localPath = resolveFallbackPath(imageUrl);
  if (localPath) {
    try {
      buffer = fs.readFileSync(localPath); // Node Buffer — Blob accepts it as ArrayBufferView
    } catch (err) {
      console.warn(`[realms] Could not read fallback image ${localPath}: ${err.message}`);
      return null;
    }
    contentType = "image/png";
  } else {
    let imgRes;
    const t0 = Date.now();
    const imgCtrl = new AbortController();
    const imgTimeout = setTimeout(() => imgCtrl.abort(), GQL_TIMEOUT_MS);
    try {
      imgRes = await fetch(imageUrl, { signal: imgCtrl.signal });
    } catch (err) {
      clearTimeout(imgTimeout);
      console.log(`[realms:timing] image-fetch FAIL ${Date.now() - t0}ms`);
      console.warn(`[realms] Could not fetch image ${imageUrl}: ${err.message}`);
      return null;
    }
    clearTimeout(imgTimeout);
    if (!imgRes.ok) {
      console.log(`[realms:timing] image-fetch ${imgRes.status} ${Date.now() - t0}ms`);
      console.warn(`[realms] Image fetch failed (${imgRes.status}): ${imageUrl}`);
      return null;
    }

    contentType = (imgRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    buffer = await imgRes.arrayBuffer();
    console.log(`[realms:timing] image-fetch ${Date.now() - t0}ms (${buffer.byteLength} bytes)`);

    if (buffer.byteLength > 4 * 1024 * 1024) {
      console.warn(`[realms] Image too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB), resizing: ${imageUrl}`);
      try {
        const resized = await sharp(Buffer.from(buffer))
          .resize({ width: 1920, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        buffer = resized.buffer.slice(resized.byteOffset, resized.byteOffset + resized.byteLength);
        contentType = "image/jpeg";
        console.log(`[realms] Resized to ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);
      } catch (err) {
        console.warn(`[realms] Resize failed, skipping image: ${err.message}`);
        return null;
      }
    }
  }

  const allowed = ["image/jpeg", "image/gif", "image/png"];
  if (!allowed.includes(contentType)) {
    console.warn(`[realms] Unsupported image type ${contentType}: ${imageUrl}`);
    return null;
  }

  const ext = contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : "jpg";
  const blob = new Blob([buffer], { type: contentType });

  const form = new FormData();
  form.append("content_type", "App\\Models\\Event");
  form.append("content_field", "cover");
  form.append("upload", blob, `cover.${ext}`);

  const tUp = Date.now();
  const uploadCtrl = new AbortController();
  const uploadTimeout = setTimeout(() => uploadCtrl.abort(), GQL_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${env.base_url}/api/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        ...(env.slug ? { "x-realmslug": env.slug } : {}),
        // Do NOT set Content-Type — fetch sets it with the multipart boundary
      },
      body: form,
      signal: uploadCtrl.signal,
    });
  } catch (err) {
    clearTimeout(uploadTimeout);
    console.warn(`[realms] Image upload request failed: ${err.message}`);
    return null;
  }
  clearTimeout(uploadTimeout);
  console.log(`[realms:timing] image-upload ${Date.now() - tUp}ms`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[realms] Image upload failed (${res.status}): ${body.slice(0, 200)}`);
    return null;
  }

  const json = await res.json();
  return json?.payload?.upload?.id ?? null;
}

function buildEventPayloads(event, channel, { uploadId = null, categoryRealmsIds = [], hubRealmsIds = [] } = {}) {
  const eventInput = {};

  if (channel) {
    // create-only fields
    eventInput.kind = gqlEnum("container_generic");
    eventInput.access_kind = gqlEnum("preset");
    eventInput.channel_id = channel.realms_id;
    eventInput.is_in_person = !event.is_online;
  }

  eventInput.name = event.title;
  if (event.description) eventInput.description = event.description;
  const extUrl = (event.external_url?.startsWith("http") ? event.external_url : null) || (event.url?.startsWith("http") ? event.url : null);
  if (extUrl) eventInput.external_url = extUrl;
  if (event.external_url?.startsWith("http")) {
    eventInput.is_external_registration = true;
    eventInput.register_url = event.external_url.slice(0, 250);
    eventInput.register_cta_text = "Buy Tickets";
  }

  if (event.venue) eventInput.address_description = event.venue;
  if (event.address) eventInput.address_line1 = event.address;
  if (event.city) eventInput.address_city = event.city;
  if (event.state) eventInput.address_state = event.state;
  if (event.zip) eventInput.address_postal_code = event.zip;
  eventInput.address_country = "US";

  const tags = sanitizeTags(event.tags);
  if (tags.length) eventInput.tags = tags;
  if (categoryRealmsIds.length) eventInput.category_ids = categoryRealmsIds;
  if (hubRealmsIds.length) eventInput.hub_ids = hubRealmsIds;

  if (uploadId) eventInput.uploads = { cover: uploadId };

  const scheduleInput = {
    start_at: toIso(event.start_date, event.start_time),
    duration: toDuration(event.start_date, event.start_time, event.end_date, event.end_time),
  };

  const rrule = parseRRule(event.rrule, event.recurrence_end_date);
  if (rrule) scheduleInput.recurrence = { recurrence_rules: [rrule] };

  return { eventInput, scheduleInput };
}

/**
 * Resolve which upload to attach as the cover for this push.
 * If the source image URL matches the cached one, reuse the cached upload ID
 * (skipping the slow ~3s /api/upload round-trip). Otherwise re-upload.
 * Returns { uploadId, sourceUrl } where sourceUrl is the URL we actually
 * associated with the uploadId (so the caller can persist it).
 */
async function resolveCoverUpload(env, event, { cachedUploadId = null, cachedSourceUrl = null } = {}) {
  const currentUrl = event.image_url || null;
  if (currentUrl && cachedUploadId && currentUrl === cachedSourceUrl) {
    console.log(`[realms:timing] image-upload CACHED (skip)`);
    return { uploadId: cachedUploadId, sourceUrl: currentUrl };
  }
  const uploadId = await uploadCoverImage(env, currentUrl);
  return { uploadId, sourceUrl: uploadId ? currentUrl : null };
}

/**
 * Create an event in Realms. channel must already have realms_id set.
 * categoryRealmsIds: array of Realms category IDs to attach.
 * hubRealmsIds: array of Realms hub IDs to assign.
 * Returns { id, name, uploadId, sourceUrl } — upload fields for caller to persist.
 */
export async function createRealmEvent(env, event, channel, { categoryRealmsIds = [], hubRealmsIds = [], cachedUploadId = null, cachedSourceUrl = null } = {}) {
  const { uploadId, sourceUrl } = await resolveCoverUpload(env, event, { cachedUploadId, cachedSourceUrl });
  const { eventInput, scheduleInput } = buildEventPayloads(event, channel, { uploadId, categoryRealmsIds, hubRealmsIds });
  // Inline the event input so GraphQL skips field-level type checking (access_kind is NonNull
  // in the schema but must be absent so the backend's setupDefaultAccess hook can run).
  const mutation = `
    mutation CreateEvent($schedule: createEventScheduleData) {
      createEvent(event: ${toGqlLiteral(eventInput)}, schedule: $schedule) {
        event { id name }
      }
    }
  `;
  const data = await gql(env, mutation, { schedule: scheduleInput }, "createEvent");
  return { ...data.createEvent.event, uploadId, sourceUrl };
}

/**
 * Update an existing Realms event by its Realms ID.
 * categoryRealmsIds: array of Realms category IDs to attach.
 * hubRealmsIds: array of Realms hub IDs to assign.
 * Returns { id, name, uploadId, sourceUrl } — upload fields for caller to persist.
 */
export async function updateRealmEvent(env, realmsId, event, { categoryRealmsIds = [], hubRealmsIds = [], cachedUploadId = null, cachedSourceUrl = null } = {}) {
  const { uploadId, sourceUrl } = await resolveCoverUpload(env, event, { cachedUploadId, cachedSourceUrl });
  const { eventInput, scheduleInput } = buildEventPayloads(event, null, { uploadId, categoryRealmsIds, hubRealmsIds });

  // Realms rejects schedule updates for past events — only send schedule if event hasn't started yet
  const today = new Date().toISOString().slice(0, 10);
  const includeSchedule = event.start_date >= today;

  eventInput.id = realmsId;
  const mutation = `
    mutation UpdateEvent($schedule: updateEventScheduleData) {
      updateEvent(event: ${toGqlLiteral(eventInput)}, schedule: $schedule) {
        event { id name }
      }
    }
  `;
  const data = await gql(env, mutation, { schedule: includeSchedule ? scheduleInput : undefined }, "updateEvent");
  return { ...data.updateEvent.event, uploadId, sourceUrl };
}
