// Converts human-readable recurrence frequency strings to iCal RRULE format.
// Returns null if the string can't be auto-converted (needs manual review).

const DAY_ABBR = {
  monday: "MO", tuesday: "TU", wednesday: "WE", thursday: "TH",
  friday: "FR", saturday: "SA", sunday: "SU",
  // abbreviated
  mon: "MO", tue: "TU", wed: "WE", thu: "TH",
  fri: "FR", sat: "SA", sun: "SU",
};

function dayToAbbr(name) {
  // normalize: lowercase, strip trailing 's' for plurals (tuesdays -> tuesday)
  const normalized = name.trim().toLowerCase().replace(/s$/, "");
  return DAY_ABBR[normalized] || null;
}

export function toRrule(frequency) {
  if (!frequency) return null;
  const f = frequency.trim().toLowerCase();

  if (f === "daily") return "FREQ=DAILY";
  if (f === "weekly") return "FREQ=WEEKLY";
  if (f === "monthly") return "FREQ=MONTHLY";
  if (f === "annually" || f === "yearly") return "FREQ=YEARLY";

  // "monthly on the 2nd thursday" / "monthly on the last friday"
  const monthlyNth = f.match(/^monthly on the (1st|2nd|3rd|4th|last) (.+)$/);
  if (monthlyNth) {
    const nthMap = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "last": -1 };
    const n = nthMap[monthlyNth[1]];
    const day = dayToAbbr(monthlyNth[2]);
    if (day) return `FREQ=MONTHLY;BYDAY=${n}${day}`;
  }

  // "every N days"
  const everyNDays = f.match(/^every (\d+) days?$/);
  if (everyNDays) {
    const n = parseInt(everyNDays[1]);
    return n === 1 ? "FREQ=DAILY" : `FREQ=DAILY;INTERVAL=${n}`;
  }

  // "every N weeks"
  const everyNWeeks = f.match(/^every (\d+) weeks?$/);
  if (everyNWeeks) {
    const n = parseInt(everyNWeeks[1]);
    return n === 1 ? "FREQ=WEEKLY" : `FREQ=WEEKLY;INTERVAL=${n}`;
  }

  // "weekly on monday" / "weekly on monday & wednesday" / "weekly on tuesday, thursday"
  const weeklyOn = f.match(/^weekly on (.+)$/);
  if (weeklyOn) {
    const parts = weeklyOn[1].split(/\s*[&,]\s*/);
    const days = parts.map(dayToAbbr).filter(Boolean);
    if (days.length > 0 && days.length === parts.length) {
      return `FREQ=WEEKLY;BYDAY=${days.join(",")}`;
    }
  }

  // "every other monday" / "every other week on monday"
  const everyOtherDay = f.match(/^every other (?:week on )?(.+)$/);
  if (everyOtherDay) {
    const day = dayToAbbr(everyOtherDay[1]);
    if (day) return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`;
    // "every other week" without a day
    if (everyOtherDay[1] === "week") return "FREQ=WEEKLY;INTERVAL=2";
  }

  return null; // needs manual review
}

// Returns a human-friendly label for a given RRULE string, for display purposes.
export function rruleLabel(rrule) {
  if (!rrule) return null;
  // just return the raw value — it's already fairly readable
  return rrule;
}
