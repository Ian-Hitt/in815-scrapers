// Attempts to extract a price from a free-text description.
// Returns { price, confidence } where:
//   price      — normalized string like "Free", "$10", "$5–$20", "Donation"
//   confidence — "high" | "medium" | "low"

// Matches dollar amounts: $10, $5.00, $10-$20, $5 to $20, $5–$20
const DOLLAR_RANGE_RE = /\$(\d+(?:\.\d{1,2})?)(?:\s*(?:-|–|to)\s*\$(\d+(?:\.\d{1,2})?))?/i;

// Explicit free patterns (high confidence)
const FREE_RE = /\b(free\s+admission|free\s+event|free\s+entry|free\s+to\s+attend|free\s+and\s+open|admission\s+is\s+free|no\s+(?:cost|charge|admission|fee)|complimentary)\b/i;

// Standalone "free" — medium confidence (word might appear in other contexts)
const FREE_WORD_RE = /\bfree\b/i;

// Donation-based
const DONATION_RE = /\b(suggested\s+donation|free\s+(?:with\s+)?donation|donation\s+(?:only|based|requested|appreciated|welcome|accepted)|pay\s+what\s+you\s+(?:can|wish)|by\s+donation)\b/i;

// Ticket/admission price intro words — boosts confidence of a nearby dollar match
const PRICE_INTRO_RE = /\b(ticket[s]?|admission|entry|cost[s]?|price[s]?|fee[s]?|charge[s]?)\b/i;

function formatDollars(whole, fractional) {
  const a = parseFloat(whole);
  const b = fractional != null ? parseFloat(fractional) : null;
  const fmt = (n) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  return b != null ? `${fmt(a)}–${fmt(b)}` : fmt(a);
}

export function extractPrice(text) {
  if (!text) return { price: null, confidence: null };

  // Explicit free phrases (high confidence)
  if (FREE_RE.test(text)) return { price: "Free", confidence: "high" };

  // Donation (high confidence)
  if (DONATION_RE.test(text)) return { price: "Donation", confidence: "high" };

  // Dollar amount — check if near a price-intro word for confidence boost
  const dollarMatch = DOLLAR_RANGE_RE.exec(text);
  if (dollarMatch) {
    const price = formatDollars(dollarMatch[1], dollarMatch[2]);
    const hasIntro = PRICE_INTRO_RE.test(text);
    return { price, confidence: hasIntro ? "high" : "medium" };
  }

  // Standalone "free" (lower confidence — could be "free parking", "free refreshments", etc.)
  if (FREE_WORD_RE.test(text)) return { price: "Free", confidence: "low" };

  return { price: null, confidence: null };
}
