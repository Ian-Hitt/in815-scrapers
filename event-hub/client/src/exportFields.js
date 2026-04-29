// Fields checked before exporting to Realms.
// required: true  → push will fail or produce bad data without this field
// required: false → nice to have; missing is flagged but doesn't block pushing
// title and start_date are always present (DB NOT NULL), so not listed here.
export const EXPORT_FIELDS = [
  { key: "channel_id",  label: "Channel",        required: true,  note: "Required for API channel association" },
  { key: "start_time",  label: "Start time",      required: true,  note: "Needed for schedule.start_at" },
  { key: "end_time",    label: "End time",         required: false, note: "Needed for schedule.end_at" },
  { key: "description", label: "Description",     required: false, note: "Event description text" },
  { key: "image_url",   label: "Cover image",     required: false, note: "Uploaded as event cover" },
  { key: "venue",       label: "Venue",           required: false, note: "Maps to address_description" },
  { key: "address",     label: "Street address",  required: false, note: "Maps to address_line1" },
  { key: "city",        label: "City",            required: false, note: "Maps to address_city" },
  { key: "zip",         label: "ZIP code",        required: false, note: "Maps to address_postal_code" },
];

export function getMissingRequired(event) {
  return EXPORT_FIELDS.filter(({ key, required }) => required && !event[key]);
}

export function getMissingOptional(event) {
  return EXPORT_FIELDS.filter(({ key, required }) => !required && !event[key]);
}

/** All missing fields (required + optional). */
export function getMissingFields(event) {
  return EXPORT_FIELDS.filter(({ key }) => !event[key]);
}

/** Ready to push: all required fields present. */
export function isReady(event) {
  return getMissingRequired(event).length === 0;
}

/** Fully complete: no fields missing at all. */
export function isComplete(event) {
  return getMissingFields(event).length === 0;
}
