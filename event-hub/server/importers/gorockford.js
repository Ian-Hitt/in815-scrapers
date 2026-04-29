export function mapRow(row) {
  const event = {
    title: row.title || null,
    start_date: row.startDate || null,
    start_time: row.startTime || null,
    end_date: row.endDate || null,
    end_time: row.endTime || null,
    description: row.description || null,
    venue: row.location || null,
    address: row.address || null,
    city: row.city || null,
    state: row.state || null,
    zip: row.zip || null,
    latitude: row.latitude ? parseFloat(row.latitude) : null,
    longitude: row.longitude ? parseFloat(row.longitude) : null,
    category: null,
    tags: null,
    price: row.price || null,
    image_url: row.imageUrl || null,
    url: row.link || null,
    external_url: row.externalUrl || null,
    contact: null,
    organizer: null,
    is_online: 0,
    recurring: row.recurring?.toLowerCase() === "yes" ? 1 : 0,
    recurrence_frequency: row.recurrenceFrequency || null,
    recurrence_end_date: row.recurrenceEndDate || null,
  };

  return {
    event,
    sourceId: row.recid || null,
    sourceUrl: row.link || null,
    channelImageUrl: null,
  };
}
