import { durationToEndTime } from "./utils.js";

export function mapRow(row) {
  const end_time = durationToEndTime(row.startTime, row.endTime);

  return {
    event: {
      title: row.title,
      start_date: row.startDate,
      start_time: row.startTime || null,
      end_date: row.endDate || null,
      end_time,
      description: row.description || null,
      venue: row.venue || null,
      address: row.address || null,
      city: row.city || null,
      state: row.state || null,
      zip: row.zip || null,
      latitude: null,
      longitude: null,
      category: null,
      tags: row.tags || null,
      price: row.price || null,
      image_url: row.imageUrl || null,
      url: row.externalUrl || "https://northwoodsleague.com/rockford-rivets/schedule/",
      external_url: row.externalUrl || null,
      ticket_url: row.externalUrl || null,
      contact: null,
      organizer: "Rockford Rivets",
      is_online: 0,
      recurring: 0,
      recurrence_frequency: null,
      recurrence_end_date: null,
    },
    sourceId: row.sourceId,
    sourceUrl: "https://northwoodsleague.com/rockford-rivets/schedule/",
  };
}
