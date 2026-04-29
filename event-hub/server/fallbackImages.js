import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Directory holding the generated PNG fallback images.
// Lives under client/public so Vite/Express serve the same files at the URL
// path below — no extra static middleware needed.
export const FALLBACK_DIR = path.join(__dirname, "..", "client", "public", "fallbacks", "sports");

// Stored URL prefix for events that use a local fallback image. The Realms
// uploader detects this prefix and reads the file from disk instead of fetching.
export const FALLBACK_URL_PREFIX = "/fallbacks/sports/";

// ── Keyword patterns for text-based detection (safety net when taxonomy is missing)

const SPORT_PATTERNS = [
  { slug: "baseball-softball", re: /\b(baseball|softball|t-?ball)\b/i },
  { slug: "basketball",        re: /\bbasketball\b/i },
  { slug: "soccer",            re: /\bsoccer\b/i },
  { slug: "football",          re: /\bfootball\b/i },
  { slug: "swimming-diving",   re: /\b(swim(ming)?|diving)\b/i },
  { slug: "volleyball",        re: /\bvolleyball\b/i },
  { slug: "wrestling",         re: /\bwrestling\b/i },
  { slug: "tennis",            re: /\btennis\b/i },
  { slug: "golf",              re: /\bgolf\b/i },
  { slug: "track-field",       re: /\btrack\b.*\bfield\b|\btrack\s*&\s*field\b/i },
  { slug: "cross-country",     re: /\bcross.?country\b/i },
  { slug: "cheerleading",      re: /\bcheer(leading|leader)?\b/i },
  { slug: "bowling",           re: /\bbowling\b/i },
  { slug: "hockey",            re: /\b(hockey|icehogs)\b/i },
  { slug: "lacrosse",          re: /\blacrosse\b/i },
  { slug: "pickleball",        re: /\bpickleball\b/i },
];

const KEYWORD_PATTERNS = [
  ...SPORT_PATTERNS,
  { slug: "sports",       re: /\b(athletic(s)?|sportscore|sports factory|indoor sports center|5[- ]?k|fun run)\b/i },
  { slug: "music",        re: /\bconcert\b|\blive music\b|\bjazz\b|\bsymphony\b|\borchestra\b|\brecital\b|\bband\b/i },
  { slug: "performances", re: /\btheater\b|\btheatre\b|\bmusical\b|\bballet\b|\bcomedy\b|\bstandup\b|\bstand-up\b|\bimprov\b|\bopera\b|\bbroadway\b/i },
  { slug: "festivals",    re: /\bfestival\b|\bfair\b|\bexpo\b|\bgala\b|\bcelebration\b|\bparade\b|\bfest\b|\bblock party\b/i },
  { slug: "outdoors",     re: /\bhike\b|\bhiking\b|\bnature walk\b|\bbirding\b|\bbird walk\b|\bgardens?\b|\bbotanical\b|\bearth day\b/i },
  { slug: "classes",      re: /\bclass\b|\bclasses\b|\bworkshop\b|\blesson\b|\blessons\b|\bseminar\b|\bclinic\b|\bstorytime\b|\bstory time\b|\bcamp\b/i },
];

// ── Slugs that have a fallback PNG (cached on first call)

let _availableSlugs = null;
function getAvailableSlugs() {
  if (!_availableSlugs) {
    _availableSlugs = new Set();
    if (fs.existsSync(FALLBACK_DIR)) {
      for (const f of fs.readdirSync(FALLBACK_DIR)) {
        if (f.endsWith(".png")) _availableSlugs.add(f.slice(0, -4));
      }
    }
  }
  return _availableSlugs;
}

// ── Priority: sports subcategories first, then specific top-levels, then generic sports

const SPORTS_PARENT_SLUG = "sports";

/**
 * Given an event (with optional .taxonomy array), return the best matching
 * fallback slug, or null. Prefers the most specific taxonomy match that has
 * a PNG on disk; falls back to keyword detection.
 */
export function detectFallbackSlug(event) {
  if (!event) return null;
  const available = getAvailableSlugs();

  // 1. Taxonomy-based: pick the most specific slug that has a fallback image.
  //    Sports subcategories > any top-level category > generic "sports" parent.
  if (Array.isArray(event.taxonomy) && event.taxonomy.length > 0) {
    // First pass: sports subcategories (most specific)
    for (const cat of event.taxonomy) {
      if (cat.parent_slug === SPORTS_PARENT_SLUG && available.has(cat.slug)) {
        return cat.slug;
      }
    }
    // Second pass: any top-level category with a fallback
    for (const cat of event.taxonomy) {
      if (!cat.parent_id && available.has(cat.slug)) {
        return cat.slug;
      }
    }
    // Third pass: if it has the "sports" parent but no specific sub matched
    if (event.taxonomy.some((c) => c.slug === SPORTS_PARENT_SLUG || c.parent_slug === SPORTS_PARENT_SLUG)) {
      if (available.has(SPORTS_PARENT_SLUG)) return SPORTS_PARENT_SLUG;
    }
  }

  // 2. Keyword fallback for events without taxonomy.
  const text = [event.title, event.tags, event.category].filter(Boolean).join(" ").replace(/\+/g, " ");
  for (const { slug, re } of KEYWORD_PATTERNS) {
    if (re.test(text) && available.has(slug)) return slug;
  }

  return null;
}

/**
 * Returns the stored image_url value for an event's fallback image (e.g.
 * "/fallbacks/sports/baseball-softball.png"), or null if no category matched
 * or the corresponding PNG file isn't on disk.
 */
export function getFallbackImageUrl(event) {
  const slug = detectFallbackSlug(event);
  if (!slug) return null;
  return `${FALLBACK_URL_PREFIX}${slug}.png`;
}

/**
 * Resolve a stored image_url to a local file path, or null if it's not a
 * fallback URL. Used by the Realms uploader to read fallback bytes from disk.
 */
export function resolveFallbackPath(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith(FALLBACK_URL_PREFIX)) return null;
  const filename = path.basename(imageUrl);
  // Guard against path traversal — only allow simple filenames.
  if (filename !== imageUrl.slice(FALLBACK_URL_PREFIX.length)) return null;
  const filepath = path.join(FALLBACK_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return filepath;
}
