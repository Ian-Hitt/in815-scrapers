import { durationToEndTime } from "./utils.js";

export function mapRow(row) {
  const end_time = durationToEndTime(row.startTime, row.endTime);

  return {
    event: {
      title: row.title,
      start_date: row.startDate,
      start_time: row.startTime || null,
      end_date: null,
      end_time,
      description: row.description || null,
      venue: row.venue || "Mercy Sportscore 2",
      address: row.address || "8800 E Riverside Blvd",
      city: row.city || "Loves Park",
      state: row.state || "IL",
      zip: row.zip || "61111",
      latitude: null,
      longitude: null,
      category: "Sports",
      tags: [row.division, "soccer"].filter(Boolean).join("; ") || null,
      price: row.price || "Free",
      image_url: null,
      url: row.externalUrl || "https://www.intersoccerleague.com",
      external_url: row.externalUrl || "https://www.intersoccerleague.com",
      contact: null,
      organizer: row.organizer || "International Soccer League",
      is_online: 0,
      recurring: 0,
      recurrence_frequency: null,
      recurrence_end_date: null,
    },
    sourceId: row.matchId,
    sourceUrl: row.externalUrl || "https://www.intersoccerleague.com",
  };
}
