export function addMinutes(timeStr, minutes) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  const total = h * 60 + min + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  const na = nh < 12 ? "AM" : "PM";
  const dh = nh === 0 ? 12 : nh > 12 ? nh - 12 : nh;
  return `${dh}:${String(nm).padStart(2, "0")} ${na}`;
}

export function durationToEndTime(startTime, durationStr) {
  const m = (durationStr || "").match(/^(\d+)\s*minutes?$/i);
  if (!m) return durationStr || null;
  return addMinutes(startTime, parseInt(m[1], 10));
}
