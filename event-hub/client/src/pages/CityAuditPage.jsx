import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchCityAudit, acceptCityEvent, acceptAllCityEvents, dismissCityEvent } from "../api.js";

export default function CityAuditPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [accepted, setAccepted] = useState(new Set());
  const [dismissed, setDismissed] = useState(new Set());

  const { data: events, isLoading } = useQuery({
    queryKey: ["city-audit"],
    queryFn: fetchCityAudit,
  });

  const acceptOne = useMutation({
    mutationFn: (id) => acceptCityEvent(id),
    onSuccess: (_, id) => {
      setAccepted((s) => new Set([...s, id]));
      queryClient.invalidateQueries({ queryKey: ["city-audit-stats"] });
    },
  });

  const dismissOne = useMutation({
    mutationFn: (id) => dismissCityEvent(id),
    onSuccess: (_, id) => {
      setDismissed((s) => new Set([...s, id]));
      queryClient.invalidateQueries({ queryKey: ["city-audit-stats"] });
    },
  });

  const acceptAll = useMutation({
    mutationFn: acceptAllCityEvents,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["city-audit"] });
      queryClient.invalidateQueries({ queryKey: ["city-audit-stats"] });
      setSelected(new Set());
    },
  });

  async function acceptSelected() {
    for (const id of [...selected]) {
      await acceptCityEvent(id);
      setAccepted((s) => new Set([...s, id]));
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["city-audit-stats"] });
  }

  async function dismissSelected() {
    for (const id of [...selected]) {
      await dismissCityEvent(id);
      setDismissed((s) => new Set([...s, id]));
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["city-audit-stats"] });
  }

  const visible = (events ?? []).filter((e) => !accepted.has(e.id) && !dismissed.has(e.id));

  // Group by city for the summary
  const cityCounts = {};
  for (const e of visible) {
    cityCounts[e.city] = (cityCounts[e.city] || 0) + 1;
  }

  const selectableIds = visible.map((e) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }

  function toggleOne(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-white hover:underline mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">City Audit</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events with cities outside the Rockford-area whitelist (Rockford, Machesney Park, Loves Park, Roscoe, Rockton, Cherry Valley). Accept valid entries or archive out-of-area events.
      </p>

      {/* City summary chips */}
      {Object.keys(cityCounts).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(cityCounts).sort(([,a],[,b]) => b - a).map(([city, count]) => (
            <span key={city} className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
              {city} ({count})
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        {visible.length > 0 && (
          <span className="text-gray-600 dark:text-surface-400">
            {visible.length} events flagged
          </span>
        )}
        {selected.size > 0 && (
          <>
            <button onClick={acceptSelected} className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer">
              Accept {selected.size} selected
            </button>
            <button onClick={dismissSelected} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md cursor-pointer">
              Archive {selected.size} selected
            </button>
          </>
        )}
        {visible.length > 0 && (
          <button
            onClick={() => { if (confirm(`Accept all ${visible.length} flagged events?`)) acceptAll.mutate(); }}
            disabled={acceptAll.isPending}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {acceptAll.isPending ? "Accepting..." : "Accept all"}
          </button>
        )}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Loading...</p>}

      {!isLoading && (
        <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
            <thead className="bg-gray-50 dark:bg-surface-700">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer accent-gray-600 dark:accent-surface-400" title="Select all" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">City</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
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
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">{ev.start_date}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {ev.city}{ev.state ? `, ${ev.state}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{ev.venue || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => acceptOne.mutate(ev.id)}
                        disabled={acceptOne.isPending}
                        className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => dismissOne.mutate(ev.id)}
                        disabled={dismissOne.isPending}
                        className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded cursor-pointer disabled:opacity-50"
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No events outside the city whitelist
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
