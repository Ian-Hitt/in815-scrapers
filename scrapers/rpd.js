import puppeteer from "puppeteer";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { escapeCsv, decodeHtmlEntities } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = path.join(__dirname, "..", "data", "rpd.csv");

const BASE_URL = "https://www.calendarwiz.com/calendars/list.php";
const CALENDAR_ID = "rpdfun";

function buildMonthUrl(month, year) {
  const params = new URLSearchParams({
    crd: CALENDAR_ID,
    jsenabled: "1",
    winh: "900",
    winw: "1400",
    inifr: "N",
    op: "cal",
    month: String(month),
    year: String(year),
  });
  return `${BASE_URL}?${params.toString()}`;
}

function escapeCsvWithDecode(value) {
  const str = decodeHtmlEntities(String(value ?? "")).trim();
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const COLUMNS = [
  "title",
  "date",
  "startTime",
  "endTime",
  "location",
  "address",
  "contact",
  "category",
  "description",
  "moreInfoUrl",
  "recurring",
  "recurrenceFrequency",
  "recurrenceEndDate",
];

function parseDateHeader(text, year) {
  const cleaned = text
    .replace(
      /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s*/i,
      ""
    )
    .replace(/(\d+)(st|nd|rd|th)/i, "$1")
    .trim();
  const parsed = new Date(`${cleaned}, ${year}`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

async function scrapeMonth(page, month, year) {
  const url = buildMonthUrl(month, year);
  console.log(`Fetching ${month}/${year}...`);

  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  const events = await page.evaluate(() => {
    const results = [];
    const container =
      document.querySelector(".cw_list_view") || document.body;

    let currentDate = "";
    const nodes = container.querySelectorAll(".daycell, .event_container");

    for (const node of nodes) {
      if (node.classList.contains("daycell")) {
        currentDate = node.textContent.trim();
        continue;
      }

      const titleLink = node.querySelector("a[onclick*='epopup']");
      const title = titleLink ? titleLink.textContent.trim() : "";
      if (!title) continue;

      const text = node.textContent;
      let startTime = "";
      let endTime = "";
      const timeMatch = text.match(
        /Time:\s*(\d{1,2}:\d{2}\s*[ap]m)\s*[-–]\s*(\d{1,2}:\d{2}\s*[ap]m)/i
      );
      if (timeMatch) {
        startTime = timeMatch[1].trim();
        endTime = timeMatch[2].trim();
      } else {
        const singleTime = text.match(/Time:\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
        if (singleTime) startTime = singleTime[1].trim();
      }

      let category = "";
      let moreInfoUrl = "";
      let location = "";
      let contact = "";
      const tds = node.querySelectorAll("td");

      for (const td of tds) {
        const bolds = td.querySelectorAll("b");
        for (const b of bolds) {
          const label = b.textContent.trim();

          if (label === "Category") {
            const tdText = td.textContent;
            const catStart = tdText.indexOf("Category") + "Category".length;
            let catEnd = tdText.indexOf("More Info");
            if (catEnd === -1) catEnd = tdText.length;
            category = tdText.slice(catStart, catEnd).trim();

            const moreInfoLink = td.querySelector("a.links[href]");
            if (moreInfoLink) {
              moreInfoUrl = moreInfoLink.getAttribute("href") || "";
            }
          }

          if (label === "Location") {
            const tdText = td.textContent;
            const locStart =
              tdText.indexOf("Location") + "Location".length;
            location = tdText.slice(locStart).trim();
          }

          if (label === "Contact") {
            const tdText = td.textContent;
            const contStart =
              tdText.indexOf("Contact") + "Contact".length;
            let contEnd = tdText.indexOf("Location");
            if (contEnd === -1) contEnd = tdText.length;
            contact = tdText.slice(contStart, contEnd).trim();
          }
        }
      }

      let address = "";
      const descEl = node.querySelector(".event_description");
      if (descEl) {
        const descHtml = descEl.innerHTML;
        const addrMatch = descHtml.match(
          /Location Details:<\/b>\s*([\s\S]*?)(?:<br|$)/i
        );
        if (addrMatch) {
          address = addrMatch[1].replace(/<[^>]+>/g, "").trim();
        }
      }

      if (!contact && descEl) {
        const contactMatch = descEl.textContent.match(
          /Location Contact:\s*([^\n]+)/i
        );
        if (contactMatch) contact = contactMatch[1].trim();
      }

      let description = "";
      if (descEl) {
        const descHtml = descEl.innerHTML;
        const cleaned = descHtml
          .replace(/<br\s*\/?>\s*<b>Location Details:<\/b>[\s\S]*/i, "")
          .replace(/<!--.*?-->/g, "")
          .replace(/<br\s*\/?>/g, "\n")
          .replace(/<[^>]+>/g, "")
          .trim();
        description = cleaned;
      }

      results.push({
        title,
        date: currentDate,
        startTime,
        endTime,
        location,
        address,
        contact,
        category,
        description,
        moreInfoUrl,
      });
    }

    return results;
  });

  return events;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function detectRecurrence(dates) {
  if (dates.length < 2) return null;

  const timestamps = dates.map((d) => new Date(d + "T00:00:00").getTime());
  const gaps = [];
  for (let i = 1; i < timestamps.length; i++) {
    gaps.push(Math.round((timestamps[i] - timestamps[i - 1]) / 86400000));
  }

  const endDate = dates[dates.length - 1];
  const mode = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const modeCount = gaps.filter((g) => Math.abs(g - mode) <= 1).length;
  const consistent = modeCount / gaps.length >= 0.7;

  if (!consistent) {
    const byDay = {};
    for (const d of dates) {
      const day = new Date(d + "T00:00:00").getDay();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(d);
    }
    const activeDays = Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b);
    if (activeDays.length >= 2 && activeDays.length <= 5) {
      let allWeekly = true;
      for (const day of activeDays) {
        const dayDates = byDay[day];
        if (dayDates.length < 2) continue;
        const dayTs = dayDates.map(
          (d) => new Date(d + "T00:00:00").getTime()
        );
        for (let i = 1; i < dayTs.length; i++) {
          const gap = Math.round((dayTs[i] - dayTs[i - 1]) / 86400000);
          if (gap < 5 || gap > 9) {
            allWeekly = false;
            break;
          }
        }
        if (!allWeekly) break;
      }
      if (allWeekly) {
        const dayNames = activeDays.map((d) => DAY_NAMES[d]);
        return { frequency: `Weekly on ${dayNames.join(" & ")}`, endDate };
      }
    }

    if (dates.length >= 3) {
      return { frequency: "Multiple dates", endDate };
    }
    return null;
  }

  if (mode === 1) return { frequency: "Daily", endDate };
  if (mode === 7) {
    const dayOfWeek = DAY_NAMES[new Date(dates[0] + "T00:00:00").getDay()];
    return { frequency: `Weekly on ${dayOfWeek}`, endDate };
  }
  if (mode === 14) {
    const dayOfWeek = DAY_NAMES[new Date(dates[0] + "T00:00:00").getDay()];
    return { frequency: `Every other ${dayOfWeek}`, endDate };
  }
  if (mode >= 28 && mode <= 31) return { frequency: "Monthly", endDate };

  return { frequency: `Every ${mode} days`, endDate };
}

function collapseRecurring(events) {
  const groups = new Map();

  for (const ev of events) {
    const key = `${ev.title}|${ev.startTime}|${ev.endTime}|${ev.location}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  const result = [];
  for (const [, group] of groups) {
    group.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    if (group.length === 1) {
      result.push({
        ...group[0],
        recurring: "No",
        recurrenceFrequency: "",
        recurrenceEndDate: "",
      });
      continue;
    }

    const dates = group.map((e) => e.date).filter(Boolean);
    const recurrence = detectRecurrence(dates);

    const base = group[0];
    const bestDesc = group.reduce(
      (best, e) => (e.description.length > best.length ? e.description : best),
      ""
    );

    result.push({
      ...base,
      description: bestDesc,
      recurring: "Yes",
      recurrenceFrequency: recurrence?.frequency ?? "",
      recurrenceEndDate: recurrence?.endDate ?? dates[dates.length - 1],
    });
  }

  result.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.startTime || "") < (b.startTime || "") ? -1 : 1;
  });

  return result;
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startMonth = today.getMonth() + 1;
  const startYear = today.getFullYear();

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const allEvents = [];
  let emptyMonths = 0;

  for (let i = 0; i < 12; i++) {
    let month = startMonth + i;
    let year = startYear;
    while (month > 12) {
      month -= 12;
      year++;
    }

    const events = await scrapeMonth(page, month, year);
    console.log(`  Found ${events.length} events`);

    if (events.length === 0) {
      emptyMonths++;
      if (emptyMonths >= 2) {
        console.log("Two consecutive empty months, stopping.");
        break;
      }
    } else {
      emptyMonths = 0;
    }

    for (const ev of events) {
      const eventDate = parseDateHeader(ev.date, year);
      if (eventDate && eventDate < today) continue;

      if (eventDate) {
        ev.date = eventDate.toISOString().split("T")[0];
      }
      allEvents.push(ev);
    }
  }

  await browser.close();

  const seen = new Set();
  const deduped = [];
  for (const ev of allEvents) {
    const key = `${ev.title}|${ev.date}|${ev.startTime}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(ev);
    }
  }

  const collapsed = collapseRecurring(deduped);

  const rows = collapsed.map((ev) =>
    COLUMNS.map((col) => escapeCsvWithDecode(ev[col])).join(",")
  );
  const csv = [COLUMNS.join(","), ...rows].join("\n");
  writeFileSync(OUTPUT_FILE, csv);

  console.log(
    `\nDone! ${deduped.length} occurrences collapsed into ${collapsed.length} events written to data/rpd.csv`
  );
}

main().catch(console.error);
