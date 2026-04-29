const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchEvents(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/events${qs ? `?${qs}` : ""}`);
}

export function fetchEventIds(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ""))
  ).toString();
  return request(`/events/ids${qs ? `?${qs}` : ""}`);
}

export function fetchEvent(id) {
  return request(`/events/${id}`);
}

export function fetchEventChangelog(id) {
  return request(`/events/${id}/changelog`);
}

export function createEvent(data) {
  return request(`/events`, { method: "POST", body: JSON.stringify(data) });
}

export function updateEvent(id, data) {
  return request(`/events/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteEvent(id) {
  return request(`/events/${id}`, { method: "DELETE" });
}

export function bulkDeleteEvents(ids) {
  return request("/events/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) });
}

export function bulkUpdateEvents(ids, data) {
  return request("/events/bulk", { method: "PATCH", body: JSON.stringify({ ids, ...data }) });
}

export function bulkAddCategoryToEvents(eventIds, categoryId) {
  return request("/categories/events/bulk-add", { method: "POST", body: JSON.stringify({ event_ids: eventIds, category_id: categoryId }) });
}

export function bulkRemoveCategoryFromEvents(eventIds, categoryId) {
  return request("/categories/events/bulk-remove", { method: "POST", body: JSON.stringify({ event_ids: eventIds, category_id: categoryId }) });
}

export function runAllScrapers() {
  return request("/imports/scrape-all", { method: "POST" });
}

export function fetchScrapeAllStatus() {
  return request("/imports/scrape-all/status");
}

export function startScrape(source) {
  return request(`/imports/scrape/${source}`, { method: "POST" });
}

export function cancelScrape(source) {
  return request(`/imports/scrape/${source}`, { method: "DELETE" });
}

export function fetchSources() {
  return request("/imports/sources");
}

export function fetchImports() {
  return request("/imports");
}

export function fetchImport(id) {
  return request(`/imports/${id}`);
}

export function fetchChannels() {
  return request("/channels");
}

export function fetchChannel(id) {
  return request(`/channels/${id}`);
}

export function updateChannel(id, data) {
  return request(`/channels/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function addChannelCategory(id, categoryId) {
  return request(`/channels/${id}/categories`, { method: "POST", body: JSON.stringify({ category_id: categoryId }) });
}

export function removeChannelCategory(id, categoryId) {
  return request(`/channels/${id}/categories/${categoryId}`, { method: "DELETE" });
}

export function fetchRecurringEvents() {
  return request("/curate/recurring");
}

export function runRruleAutoConvert() {
  return request("/curate/rrules", { method: "POST" });
}

export function setEventRrule(id, rrule) {
  return request(`/curate/rrules/${id}`, { method: "PATCH", body: JSON.stringify({ rrule }) });
}

export function clearMultipleDatesEvents() {
  return request("/curate/clear-multiple-dates", { method: "POST" });
}

export function fetchCategories() {
  return request("/categories");
}

export function fetchEventCategories(eventId) {
  return request(`/categories/event/${eventId}`);
}

export function addEventCategory(eventId, categoryId) {
  return request(`/categories/event/${eventId}`, { method: "POST", body: JSON.stringify({ category_id: categoryId }) });
}

export function removeEventCategory(eventId, categoryId) {
  return request(`/categories/event/${eventId}/${categoryId}`, { method: "DELETE" });
}

export function fetchCategoryStats() {
  return request("/curate/category-stats");
}

export function fetchCategorySuggestions({ page = 1, limit = 50 } = {}) {
  return request(`/curate/category-suggestions?page=${page}&limit=${limit}`);
}

export function runAutoCategorize() {
  return request("/curate/auto-categorize", { method: "POST" });
}

export function applyEventCategories(id) {
  return request(`/curate/auto-categorize/${id}`, { method: "POST" });
}

export function fetchCategoryRules() {
  return request("/curate/category-rules");
}

export function fetchTimeSuggestions() {
  return request("/curate/time-suggestions");
}

export function setEventTimes(id, { start_time, end_time }) {
  return request(`/curate/times/${id}`, { method: "PATCH", body: JSON.stringify({ start_time, end_time }) });
}

export function fetchPriceSuggestions() {
  return request("/curate/price-suggestions");
}

export function setEventPrice(id, price) {
  return request(`/curate/prices/${id}`, { method: "PATCH", body: JSON.stringify({ price }) });
}

export function fetchArchiveStats() {
  return request("/curate/archive-stats");
}

export function runArchivePast() {
  return request("/curate/archive-past", { method: "POST" });
}

export function fetchArchiveCandidates() {
  return request("/curate/archive-candidates");
}

export function archiveEvent(id) {
  return request(`/curate/archive/${id}`, { method: "POST" });
}

export function archiveEventBatch(ids) {
  return request("/curate/archive-batch", { method: "POST", body: JSON.stringify({ ids }) });
}

export function unarchiveEvent(id) {
  return request(`/curate/unarchive/${id}`, { method: "POST" });
}

export function fetchDuplicates() {
  return request("/curate/duplicates");
}

export function mergeDuplicates(keep_id, remove_id) {
  return request("/curate/duplicates/merge", { method: "POST", body: JSON.stringify({ keep_id, remove_id }) });
}

export function dismissDuplicate(id_a, id_b) {
  return request("/curate/duplicates/dismiss", { method: "POST", body: JSON.stringify({ id_a, id_b }) });
}

export function dismissDuplicateBatch(pairs) {
  return request("/curate/duplicates/dismiss-batch", { method: "POST", body: JSON.stringify({ pairs }) });
}

export function mergeDuplicateBatch(pairs) {
  return request("/curate/duplicates/merge-batch", { method: "POST", body: JSON.stringify({ pairs }) });
}

export function fetchChannelDuplicates() {
  return request("/curate/channel-duplicates");
}

export function mergeChannelDuplicates(keep_id, remove_id) {
  return request("/curate/channel-duplicates/merge", { method: "POST", body: JSON.stringify({ keep_id, remove_id }) });
}

export function dismissChannelDuplicate(id_a, id_b) {
  return request("/curate/channel-duplicates/dismiss", { method: "POST", body: JSON.stringify({ id_a, id_b }) });
}

export function fetchEmptyChannels() {
  return request("/curate/empty-channels");
}

export function deleteEmptyChannels(ids) {
  return request("/curate/empty-channels/delete", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : {}),
  });
}

export function dismissChannelDuplicateBatch(pairs) {
  return request("/curate/channel-duplicates/dismiss-batch", { method: "POST", body: JSON.stringify({ pairs }) });
}

export function mergeChannelDuplicateBatch(pairs) {
  return request("/curate/channel-duplicates/merge-batch", { method: "POST", body: JSON.stringify({ pairs }) });
}

export function fetchZipStats() {
  return request("/curate/zip-stats");
}

export function runGeocodeZips(limit) {
  const qs = limit ? `?limit=${limit}` : "";
  return request(`/curate/geocode-zips${qs}`, { method: "POST" });
}

export function fetchAddressStats() {
  return request("/curate/address-stats");
}

export function runGeocodeAddresses(limit) {
  const qs = limit ? `?limit=${limit}` : "";
  return request(`/curate/geocode-addresses${qs}`, { method: "POST" });
}

export function fetchAddressCandidates() {
  return request("/curate/address-candidates");
}

export function runGeocodePreview(limit) {
  const qs = limit ? `?limit=${limit}` : "";
  return request(`/curate/geocode-preview${qs}`, { method: "POST" });
}

export function fetchGeocodePreviewStatus() {
  return request("/curate/geocode-preview/status");
}

export function fetchGeocodePreviewResults() {
  return request("/curate/geocode-preview/results");
}

export function applyGeocode(id, updates) {
  return request(`/curate/geocode-apply/${id}`, { method: "POST", body: JSON.stringify(updates) });
}

export function applyGeocodeBatch(items) {
  return request("/curate/geocode-apply-batch", { method: "POST", body: JSON.stringify({ items }) });
}

export function fetchAttractionCandidates() {
  return request("/curate/attractions");
}

export function fetchDismissedEvents() {
  return request("/curate/dismissed");
}

export function dismissAttraction(id) {
  return request(`/curate/attractions/dismiss/${id}`, { method: "POST" });
}

export function undismissAttraction(id) {
  return request(`/curate/attractions/undismiss/${id}`, { method: "POST" });
}

// ── City audit ──────────────────────────────────────────────────────────────

export function fetchCityAuditStats() {
  return request("/curate/city-audit/stats");
}

export function fetchCityAudit() {
  return request("/curate/city-audit");
}

export function acceptCityEvent(id) {
  return request(`/curate/city-audit/accept/${id}`, { method: "POST" });
}

export function acceptAllCityEvents() {
  return request("/curate/city-audit/accept-all", { method: "POST" });
}

export function dismissCityEvent(id) {
  return request(`/curate/city-audit/dismiss/${id}`, { method: "POST" });
}

// ── Enrichment logs ────────────────────────────────────────────────────────

export function fetchEnrichmentLogs() {
  return request("/curate/enrichment-logs");
}

export function fetchEnrichmentChanges(logId) {
  return request(`/curate/enrichment-logs/${logId}/changes`);
}

// ── Export logs ─────────────────────────────────────────────────────────────

export function fetchExportLogs() {
  return request("/realms/export-logs");
}

export function fetchExportLog(id) {
  return request(`/realms/export-logs/${id}`);
}

export function fetchExportLogEvents(id) {
  return request(`/realms/export-logs/${id}/events`);
}

export function runBackfillAvatars() {
  return request("/curate/backfill-avatars", { method: "POST" });
}

export function fetchSportsFallbackStats() {
  return request("/curate/sports-fallback-stats");
}

export function runAllEnrichments() {
  return request("/curate/run-all", { method: "POST" });
}

export function fetchRunAllStatus() {
  return request("/curate/run-all/status");
}

export function runSportsFallbackImages() {
  return request("/curate/sports-fallback-images", { method: "POST" });
}

export function fetchFeaturedStats() {
  return request("/curate/featured-stats");
}

export function fetchFeaturedCandidates(params = {}) {
  const filtered = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined));
  const q = new URLSearchParams(filtered).toString();
  return request(`/curate/featured-candidates${q ? `?${q}` : ""}`);
}

export function setEventFeatured(id, featured) {
  return request(`/curate/feature/${id}`, { method: "POST", body: JSON.stringify({ featured }) });
}

export function dismissFeaturedCandidate(id) {
  return request(`/curate/featured-candidates/dismiss/${id}`, { method: "POST" });
}

export function dismissFeaturedCandidateBatch(ids) {
  return request("/curate/featured-candidates/dismiss-batch", { method: "POST", body: JSON.stringify({ ids }) });
}


// ── Realms environments ─────────────────────────────────────────────────────

export function fetchRealmsEnvironments() {
  return request("/realms/environments");
}

export function createRealmsEnvironment(data) {
  return request("/realms/environments", { method: "POST", body: JSON.stringify(data) });
}

export function updateRealmsEnvironment(id, data) {
  return request(`/realms/environments/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteRealmsEnvironment(id) {
  return request(`/realms/environments/${id}`, { method: "DELETE" });
}

// ── Realms push ─────────────────────────────────────────────────────────────

export function fetchRealmsStatus(environmentId) {
  const qs = environmentId ? `?environment_id=${environmentId}` : "";
  return request(`/realms/status${qs}`);
}

export function pushEventToRealms(id, { force = false, environmentId } = {}) {
  const qs = new URLSearchParams();
  if (force) qs.set("force", "true");
  if (environmentId) qs.set("environment_id", environmentId);
  return request(`/realms/push/${id}?${qs}`, { method: "POST" });
}

export function disconnectEventFromRealms(id, environmentId) {
  return request(`/realms/disconnect/${id}?environment_id=${environmentId}`, { method: "DELETE" });
}

export function pushEventsToRealms(ids, { force = false, environmentId } = {}) {
  return request("/realms/push-batch", { method: "POST", body: JSON.stringify({ eventIds: ids, force, environment_id: environmentId }) });
}

export function pushAllReady(environmentId, { force = false } = {}) {
  return request("/realms/push-ready", { method: "POST", body: JSON.stringify({ environment_id: environmentId, force }) });
}

export function cancelPushReady() {
  return request("/realms/push-ready/cancel", { method: "POST" });
}

// ── Chat ────────────────────────────────────────────────────────────────────

export async function sendChatStream(messages, { onDelta, onDone, onError, onStatus, signal }) {
  let res;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") return;
    onError(err);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }
        if (event.type === "delta") onDelta(event.text);
        else if (event.type === "done") onDone(event);
        else if (event.type === "error") onError(new Error(event.error));
        else if (event.type === "status" && onStatus) onStatus(event.message);
      }
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    onError(err);
  }
}
