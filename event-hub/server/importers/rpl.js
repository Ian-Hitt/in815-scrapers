export function mapRow(row) {
  const event = {
    title: row.title || null,
    start_date: row.startDate || null,
    start_time: row.startTime || null,
    end_date: row.endDate || null,
    end_time: row.endTime || null,
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
    price: null,
    image_url: row.imageUrl || null,
    url: row.link || null,
    external_url: null,
    contact: row.author || null,
    organizer: "Rockford Public Library",
    is_online: 0,
    recurring: 0,
    recurrence_frequency: null,
    recurrence_end_date: null,
  };

  return { event, sourceId: row.eventId || null, sourceUrl: row.link || null };
}
