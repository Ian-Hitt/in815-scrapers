/**
 * Zip code lookup via Nominatim (OpenStreetMap).
 * Rate-limited to 1 req/sec per Nominatim ToS.
 */

import https from "https";

const NOMINATIM_HOST = "nominatim.openstreetmap.org";
const USER_AGENT = "in815-scrapers/1.0 (rockford-il events aggregator)";

function nominatimGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: NOMINATIM_HOST,
        path,
        method: "GET",
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Nominatim HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Bad JSON from Nominatim: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error("Nominatim request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

function extractZip(address) {
  const code = address?.postcode;
  if (!code) return null;
  // US zips are 5 digits; strip any +4 suffix and whitespace
  const match = code.replace(/\s/g, "").match(/^\d{5}/);
  return match ? match[0] : null;
}

const STATE_ABBREVS = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/**
 * Extract full address details from a Nominatim result.
 * Returns an object with only the fields that have values.
 */
function extractAddress(result) {
  if (!result) return null;
  const addr = result.address || {};
  const out = {};

  // Street address: "123 North Main Street"
  const parts = [addr.house_number, addr.road].filter(Boolean);
  if (parts.length) out.address = parts.join(" ");

  if (addr.city || addr.town || addr.village) out.city = addr.city || addr.town || addr.village;

  // State: Nominatim returns full name, convert to abbreviation
  if (addr.state) {
    const abbrev = STATE_ABBREVS[addr.state.toLowerCase()];
    out.state = abbrev || addr.state;
  }

  const zip = extractZip(addr);
  if (zip) out.zip = zip;

  // Coordinates
  if (result.lat && result.lon) {
    out.latitude = parseFloat(result.lat);
    out.longitude = parseFloat(result.lon);
  }

  return Object.keys(out).length > 0 ? out : null;
}

async function reverseGeocode(lat, lon) {
  const path = `/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const result = await nominatimGet(path);
  return extractAddress(result);
}

// In-process cache keyed by venue name — most events share the same ~25 school venues,
// so caching cuts ~1100 Nominatim requests down to ~25 unique lookups.
const venueCache = new Map();

async function forwardGeocode({ address, venue, city, state }) {
  // Structured search works well when we have a real street address
  if (address) {
    const params = new URLSearchParams({
      format: "json",
      addressdetails: "1",
      limit: "1",
      countrycodes: "us",
      street: address,
    });
    if (city) params.set("city", city);
    if (state) params.set("state", state);
    const results = await nominatimGet(`/search?${params.toString()}`);
    if (Array.isArray(results) && results.length > 0) {
      const addr = extractAddress(results[0]);
      if (addr) return addr;
    }
  }

  // Free-form search works better for venue names
  if (venue) {
    const cacheKey = venue.trim().toLowerCase();
    if (venueCache.has(cacheKey)) return venueCache.get(cacheKey);

    const venueQueries = [venue];
    // School scrapers return short names like "Harlem" or "Belvidere (North)" —
    // retry with "High School" appended so Nominatim can find the building
    if (!/high school/i.test(venue)) venueQueries.push(`${venue} High School`);

    for (let i = 0; i < venueQueries.length; i++) {
      if (i > 0) await geocodeDelay();
      // Fall back to IL when no location context — prevents Nominatim from matching
      // same-named venues in other states (e.g. "Jefferson High School" → El Paso TX)
      const searchState = state || (!city ? "IL" : undefined);
      const q = [venueQueries[i], city, searchState].filter(Boolean).join(", ");
      const params = new URLSearchParams({
        q,
        format: "json",
        addressdetails: "1",
        limit: "1",
        countrycodes: "us",
      });
      const results = await nominatimGet(`/search?${params.toString()}`);
      if (Array.isArray(results) && results.length > 0) {
        const addr = extractAddress(results[0]);
        if (addr) { venueCache.set(cacheKey, addr); return addr; }
      }
    }

    venueCache.set(cacheKey, null); // cache misses too so we don't retry on every run
  }

  return null;
}

/**
 * Look up a zip code for a single event record.
 * Legacy wrapper — returns just the zip string.
 */
export async function lookupZip(event) {
  const result = await lookupAddress(event);
  return result?.zip || null;
}

/**
 * Look up address details for a single event record.
 * Prefers reverse geocoding (lat/lon) when available; falls back to forward geocoding.
 * Returns { address, city, state, zip, latitude, longitude } with only filled fields, or null.
 */
export async function lookupAddress(event) {
  if (event.latitude && event.longitude) {
    return reverseGeocode(event.latitude, event.longitude);
  }
  if (event.venue || (event.city && event.state) || event.address) {
    return forwardGeocode(event);
  }
  return null;
}

export function geocodeDelay() {
  return new Promise((r) => setTimeout(r, 1100)); // >= 1 req/sec
}
