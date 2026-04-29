// Attempts to extract start and end times from a free-text description.
// Returns { startTime, endTime, complex } where:
//   startTime / endTime — normalized "H:MM AM/PM" strings or null
//   complex — true if 3+ distinct times found (conflicting schedules, needs manual review)

// Matches a range like "5pm to 7pm", "5:30 PM - 7:30 PM", "5-7pm"
// ampm on start side is optional (inherits from end side if missing)
const RANGE_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|[-–])\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;

// Matches a single time like "7:30pm", "7 PM"
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi;

function normalize(h, m, ampm) {
  const hour = parseInt(h, 10);
  const min = m ? m.padStart(2, "0") : "00";
  if (hour < 1 || hour > 12) return null;
  return `${hour}:${min} ${ampm.toUpperCase()}`;
}

function countTimes(text) {
  TIME_RE.lastIndex = 0;
  let n = 0;
  while (TIME_RE.exec(text)) n++;
  return n;
}

export function extractTimes(text) {
  if (!text) return { startTime: null, endTime: null, complex: false };

  const timeCount = countTimes(text);
  const complex = timeCount >= 4; // multiple ranges = conflicting schedules

  // Try to find a time range first
  RANGE_RE.lastIndex = 0;
  const range = RANGE_RE.exec(text);
  if (range) {
    const [, h1, m1, ampm1, h2, m2, ampm2] = range;
    const endAmpm = ampm2.toLowerCase();
    const startAmpm = (ampm1 || ampm2).toLowerCase(); // inherit end's am/pm if start omitted
    return {
      startTime: normalize(h1, m1, startAmpm),
      endTime: normalize(h2, m2, endAmpm),
      complex,
    };
  }

  // Fall back to first single time mention
  TIME_RE.lastIndex = 0;
  const single = TIME_RE.exec(text);
  if (!single) return { startTime: null, endTime: null, complex: false };

  return {
    startTime: normalize(single[1], single[2], single[3]),
    endTime: null,
    complex,
  };
}
