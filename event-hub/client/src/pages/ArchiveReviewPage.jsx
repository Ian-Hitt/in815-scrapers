import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchArchiveCandidates, archiveEvent, archiveEventBatch, runArchivePast } from "../api.js";

export default function ArchiveReviewPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [archived, setArchived] = useState(new Set());
  const [kept, setKept] = useState(new Set());

  const { data: events, isLoading } = useQuery({
    queryKey: ["archive-candidates"],
    queryFn: fetchArchiveCandidates,
  });

  const archiveOne = useMutation({
    mutationFn: (id) => archiveEvent(id),
    onSuccess: (_, id) => {
      setArchived((s) => new Set([...s, id]));
      queryClient.invalidateQueries({ queryKey: ["archive-stats"] });
    },
  });

  const archiveAll = useMutation({
    mutationFn: runArchivePast,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archive-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["archive-stats"] });
      setSelected(new Set());
      setArchived(new Set());
      setKept(new Set());
    },
  });

  function keepOne(id) {
    setKept((s) => new Set([...s, id]));
  }

  async function archiveSelected() {
    const ids = [...selected];
    await archiveEventBatch(ids);
    setArchived((s) => new Set([...s, ...ids]));
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["archive-stats"] });
  }

  const visible = (events ?? []).filter((e) => !archived.has(e.id) && !kept.has(e.id));
  const selectableIds = visible.map((e) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableIds));
  }

  function toggleOne(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-white hover:underline mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Archive Past Events</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events whose date has passed. Archive to hide them from listings and export, or keep ones that should stay visible.
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        {visible.length > 0 && (
          <span className="text-sm text-gray-600 dark:text-surface-400">{visible.length} past events</span>
        )}
        {selected.size > 0 && (
          <button onClick={archiveSelected} className="px-3 py-1 bg-gray-800 dark:bg-surface-700 hover:bg-gray-900 dark:hover:bg-surface-600 text-white text-xs font-medium rounded-md cursor-pointer">
            Archive {selected.size} selected
          </button>
        )}
        {visible.length > 0 && (
          <button
            onClick={() => { if (confirm(`Archive all ${visible.length} past events?`)) archiveAll.mutate(); }}
            disabled={archiveAll.isPending}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {archiveAll.isPending ? "Archiving..." : "Archive all"}
          </button>
        )}
        {kept.size > 0 && (
          <span className="text-xs text-gray-400 dark:text-surface-500">{kept.size} kept</span>
        )}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Loading...</p>}

      {!isLoading && (
        <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
            <thead className="bg-gray-50 dark:bg-surface-700">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Type</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {visible.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleOne(ev.id)} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-white hover:underline dark:hover:text-accent-300">{ev.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">
                    {ev.start_date}{ev.start_time ? ` ${ev.start_time}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{ev.venue || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">
                    {ev.recurring ? "Recurring" : "One-time"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => archiveOne.mutate(ev.id)}
                        disabled={archiveOne.isPending}
                        className="px-2.5 py-1 text-xs font-medium bg-gray-800 dark:bg-surface-700 hover:bg-gray-900 dark:hover:bg-surface-600 text-white rounded cursor-pointer disabled:opacity-50"
                      >
                        Archive
                      </button>
                      <button
                        onClick={() => keepOne(ev.id)}
                        className="px-2.5 py-1 text-xs font-medium border border-gray-300 dark:border-surface-600 text-gray-600 dark:text-surface-300 hover:bg-gray-100 dark:hover:bg-surface-700 rounded cursor-pointer"
                      >
                        Keep
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No past events to archive
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
