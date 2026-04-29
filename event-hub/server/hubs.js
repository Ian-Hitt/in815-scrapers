/**
 * Hub definitions — maps cities to geographic hub regions.
 * Each event is assigned to exactly one hub based on its city field.
 * Unrecognized cities fall to "Outside Region".
 */

export const HUBS = [
  {
    name: "Rockford",
    slug: "rockford",
    cities: ["rockford", "cherry valley", "new milford", "machesney park", "loves park"],
    displayOrder: 1,
  },
  {
    name: "Stateline",
    slug: "stateline",
    cities: ["roscoe", "rockton", "south beloit", "beloit"],
    displayOrder: 2,
  },
  {
    name: "Belvidere",
    slug: "belvidere",
    cities: ["belvidere", "poplar grove"],
    displayOrder: 3,
  },
  {
    name: "Nearby Towns",
    slug: "nearby-towns",
    cities: ["pecatonica", "winnebago", "durand", "byron", "rochelle", "oregon", "freeport"],
    displayOrder: 4,
  },
  {
    name: "Northern Illinois",
    slug: "northern-il",
    cities: ["dixon", "sterling", "dekalb", "galena", "ottawa", "lasalle-peru", "lasalle", "peru", "janesville", "monroe"],
    displayOrder: 5,
  },
  {
    name: "Chicago Collar",
    slug: "chicago-collar",
    cities: ["mchenry", "woodstock", "crystal lake", "joliet", "kankakee", "lake geneva"],
    displayOrder: 6,
  },
  {
    name: "Outside Region",
    slug: "outside-region",
    cities: [],
    displayOrder: 7,
  },
];

// Build a lookup map: lowercase city → hub slug
const CITY_TO_HUB = new Map();
for (const hub of HUBS) {
  for (const city of hub.cities) {
    CITY_TO_HUB.set(city.toLowerCase(), hub.slug);
  }
}

const FALLBACK_HUB_SLUG = "outside-region";

/**
 * Resolve which hub an event belongs to based on its city field.
 * Returns the hub definition object.
 */
export function resolveHubForEvent(event) {
  const city = (event.city || "").trim().toLowerCase();
  const slug = CITY_TO_HUB.get(city) || FALLBACK_HUB_SLUG;
  return HUBS.find((h) => h.slug === slug);
}

/**
 * Get all unique cities across all hubs (useful for whitelisting).
 */
export function getAllHubCities() {
  return HUBS.flatMap((h) => h.cities);
}
