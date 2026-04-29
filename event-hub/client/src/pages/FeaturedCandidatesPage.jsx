import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchFeaturedStats, fetchFeaturedCandidates, setEventFeatured, dismissFeaturedCandidate, dismissFeaturedCandidateBatch, fetchChannels } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";

const PAGE_SIZE = 50;

const SOURCE_LABELS = {
  ticketmaster: "Ticketmaster", hardrock: "Hard Rock Casino", rivets: "Rockford Rivets",
  rockfordlive: "Rockford Live", eventbrite: "Eventbrite", gorockford: "GoRockford",
  rpd: "RPD", rpl: "RPL", marysplace: "Mary's Place", rockbuzz: "Rockford Buzz",
};

export default function FeaturedCandidatesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showFeatured, setShowFeatured] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [ticketsOnly, setTicketsOnly] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const { data: stats } = useQuery({ queryKey: ["featured-stats"], queryFn: fetchFeaturedStats });
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const queryParams = {
    page, limit: PAGE_SIZE,
    showFeatured: showFeatured ? "1" : undefined,
    source: sourceFilter || undefined,
    channel_id: channelFilter || undefined,
    has_tickets: ticketsOnly ? "1" : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["featured-candidates", queryParams],
    queryFn: () => fetchFeaturedCandidates(queryParams),
    keepPreviousData: true,
  });

  const feature = useMutation({
    mutationFn: ({ id, featured }) => setEventFeatured(id, featured),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-stats"] });
      queryClient.invalidateQueries({ queryKey: ["featured-candidates"] });
    },
  });

  const dismiss = useMutation({
    mutationFn: (id) => dismissFeaturedCandidate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["featured-stats"] });
      queryClient.invalidateQueries({ queryKey: ["featured-candidates"] });
    },
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const selectableIds = events.filter((e) => !e.featured).map((e) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); selectableIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => new Set([...s, ...selectableIds]));
    }
  }

  function toggleOne(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function featureSelected() {
    for (const id of [...selected]) await setEventFeatured(id, true);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["featured-stats"] });
    queryClient.invalidateQueries({ queryKey: ["featured-candidates"] });
  }

  async function dismissSelected() {
    await dismissFeaturedCandidateBatch([...selected]);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["featured-stats"] });
    queryClient.invalidateQueries({ queryKey: ["featured-candidates"] });
  }

  function resetFilters() {
    setSourceFilter(""); setChannelFilter(""); setTicketsOnly(false); setShowFeatured(false); setPage(1);
  }

  const hasFilters = sourceFilter || channelFilter || ticketsOnly || showFeatured;
  const inputCls = "border border-gray-300 dark:border-surface-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-surface-700 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Featured Events</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events from ticketing sources and channels with ticket links — candidates to feature.
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>

        <select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(1); }} className={inputCls}>
          <option value="">All channels</option>
          {channels?.map((ch) => (
            <option key={ch.id} value={ch.id}>{ch.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm cursor-pointer dark:text-surface-200 select-none">
          <input type="checkbox" checked={ticketsOnly} onChange={(e) => { setTicketsOnly(e.target.checked); setPage(1); }} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
          Has tickets
        </label>

        <label className="flex items-center gap-2 text-sm cursor-pointer dark:text-surface-200 select-none">
          <input type="checkbox" checked={showFeatured} onChange={(e) => { setShowFeatured(e.target.checked); setPage(1); }} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
          Show already featured
        </label>

        {hasFilters && (
          <button onClick={resetFilters} className="text-sm text-gray-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer">
            Clear filters
          </button>
        )}
      </div>

      {/* Bulk actions + count */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        {total > 0 && (
          <span className="text-gray-600 dark:text-surface-400">
            {stats?.featured ?? 0} featured · {total} candidates — showing {start}–{end}
          </span>
        )}
        {selected.size > 0 && (
          <>
            <button onClick={featureSelected} className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer">
              Feature {selected.size} selected
            </button>
            <button onClick={dismissSelected} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 dark:bg-surface-600 dark:hover:bg-surface-500 text-gray-700 dark:text-surface-200 text-xs font-medium rounded-md cursor-pointer">
              Dismiss {selected.size} selected
            </button>
          </>
        )}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Loading...</p>}

      {!isLoading && (
        <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
            <thead className="bg-gray-50 dark:bg-surface-700">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer accent-gray-600 dark:accent-surface-400" title="Select all on this page" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {events.map((ev) => {
                const sources = ev.sources ? [...new Set(ev.sources.split(","))] : [];
                const reasons = [];
                if (ev.featured_source_match) reasons.push(`From ${ev.featured_source_match}`);
                if (ev.has_ticket_url) reasons.push("Ticket link");
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(ev.id)}
                        onChange={() => toggleOne(ev.id)}
                        disabled={!!ev.featured}
                        className="cursor-pointer accent-gray-600 dark:accent-surface-400 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">{ev.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">{ev.start_date}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {reasons.map((r) => (
                          <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-accent-900/40 text-blue-700 dark:text-accent-200 font-medium">{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {sources.map((s) => <SourceBadge key={s} source={s} />)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{ev.venue || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {ev.featured ? (
                          <button onClick={() => feature.mutate({ id: ev.id, featured: false })} disabled={feature.isPending} className="px-2.5 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded cursor-pointer hover:bg-yellow-200 disabled:opacity-50">
                            Unfeature
                          </button>
                        ) : (
                          <>
                            <button onClick={() => feature.mutate({ id: ev.id, featured: true })} disabled={feature.isPending || dismiss.isPending} className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50">
                              Feature
                            </button>
                            <button onClick={() => dismiss.mutate(ev.id)} disabled={feature.isPending || dismiss.isPending} className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-surface-600 hover:bg-gray-200 dark:hover:bg-surface-500 text-gray-600 dark:text-surface-300 rounded cursor-pointer disabled:opacity-50">
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No candidates found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 dark:border-surface-600 rounded-md disabled:opacity-40 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-700 dark:text-surface-300">
            Previous
          </button>
          <span className="text-gray-500 dark:text-surface-400">Page {page} of {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages} className="px-3 py-1.5 border border-gray-300 dark:border-surface-600 rounded-md disabled:opacity-40 cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-700 dark:text-surface-300">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
