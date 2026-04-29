import crypto from "crypto";

function normalizeTime(t) {
  if (!t) return null;
  // "10:00am" -> "10:00 AM"
  const match = t.trim().match(/^(\d{1,2}:\d{2})\s*(am|pm)$/i);
  if (match) return `${match[1]} ${match[2].toUpperCase()}`;
  return t.trim();
}

function parseCompoundAddress(raw) {
  if (!raw) return { address: null, city: null, state: null, zip: null };

  const parts = raw.split(",").map((s) => s.trim());

  let address = null;
  let city = null;
  let state = null;
  let zip = null;

  // Walk backwards: last might be "US", then zip, then state, then city, then street
  let idx = parts.length - 1;

  // Drop country
  if (idx >= 0 && /^(US|USA)$/i.test(parts[idx])) idx--;

  // Zip
  if (idx >= 0 && /^\d{5}/.test(parts[idx])) {
    zip = parts[idx].match(/\d{5}/)[0];
    idx--;
  }

  // State
  if (idx >= 0 && /^[A-Z]{2}$/.test(parts[idx])) {
    state = parts[idx];
    idx--;
  }

  // City
  if (idx >= 0) {
    city = parts[idx];
    idx--;
  }

  // Street address: the part that starts with a digit
  for (let i = 0; i <= idx; i++) {
    if (/^\d/.test(parts[i])) {
      address = parts.slice(i, idx + 1).join(", ");
      break;
    }
  }

  return { address, city, state, zip };
}

export function mapRow(row) {
  const parsed = parseCompoundAddress(row.address);

  const event = {
    title: row.title || null,
    start_date: row.date || null,
    start_time: normalizeTime(row.startTime),
    end_date: null,
    end_time: normalizeTime(row.endTime),
    description: row.description || null,
    venue: row.location || null,
    address: parsed.address,
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
    latitude: null,
    longitude: null,
    category: row.category || null,
    tags: null,
    price: null,
    image_url: null,
    url: row.moreInfoUrl || null,
    external_url: row.moreInfoUrl ? null : "https://www.calendarwiz.com/rpdfun",
    contact: row.contact || null,
    organizer: null,
    is_online: 0,
    recurring: row.recurring?.toLowerCase() === "yes" ? 1 : 0,
    recurrence_frequency: row.recurrenceFrequency || null,
    recurrence_end_date: row.recurrenceEndDate || null,
  };

  // Generate a source ID from key fields since RPD has no native ID
  const hash = crypto
    .createHash("md5")
    .update(`${event.title}|${event.start_date}|${event.start_time}|${event.venue}`)
    .digest("hex")
    .slice(0, 12);

  return { event, sourceId: `rpd-${hash}`, sourceUrl: event.url };
}
