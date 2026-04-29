import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { runGeocodePreview, applyGeocode, applyGeocodeBatch, fetchGeocodePreviewStatus, fetchGeocodePreviewResults } from "../api.js";

const FIELD_LABELS = { address: "Address", city: "City", state: "State", zip: "Zip", latitude: "Lat", longitude: "Lng" };

function FieldDiff({ label, current, suggested }) {
  if (!suggested) return null;
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-gray-400 dark:text-surface-500 w-12 shrink-0">{label}</span>
      {current ? (
        <>
          <span className="text-gray-500 dark:text-surface-400 line-through">{String(current)}</span>
          <span className="text-gray-300 dark:text-surface-600">&rarr;</span>
        </>
      ) : null}
      <span className="text-green-700 dark:text-green-400 font-medium">{String(suggested)}</span>
    </div>
  );
}

export default function AddressReviewPage() {
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [accepted, setAccepted] = useState(new Set());

  const { data: serverStatus } = useQuery({
    queryKey: ["geocode-preview-status"],
    queryFn: fetchGeocodePreviewStatus,
    refetchInterval: (query) => query.state.data?.running ? 2000 : false,
    onSuccess: (data) => {
      // Job just finished — fetch stored results from server (survives HTTP timeout)
      if (!data.running && data.total > 0) {
        fetchGeocodePreviewResults().then((res) => {
          if (res.suggestions?.length > 0) {
            setSuggestions(res.suggestions);
            setRemaining(0);
            setSelected(new Set());
            setAccepted(new Set());
          }
        });
      }
    },
  });

  const preview = useMutation({
    mutationFn: (limit) => runGeocodePreview(limit),
    onSuccess: (data) => {
      setSuggestions(data.suggestions);
      setRemaining(data.remaining);
      setSelected(new Set());
      setAccepted(new Set());
    },
  });

  const isRunning = preview.isPending || serverStatus?.running;

  const applyOne = useMutation({
    mutationFn: ({ id, updates }) => applyGeocode(id, updates),
    onSuccess: (_, { id }) => {
      setAccepted((s) => new Set([...s, id]));
      queryClient.invalidateQueries({ queryKey: ["address-stats"] });
    },
  });

  async function acceptSelected() {
    const items = (suggestions ?? [])
      .filter((s) => selected.has(s.id) && !accepted.has(s.id))
      .map((s) => ({ id: s.id, updates: s.suggested }));
    if (items.length === 0) return;
    await applyGeocodeBatch(items);
    setAccepted((prev) => new Set([...prev, ...items.map((i) => i.id)]));
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["address-stats"] });
  }

  async function acceptAll() {
    const items = (suggestions ?? [])
      .filter((s) => !accepted.has(s.id))
      .map((s) => ({ id: s.id, updates: s.suggested }));
    if (items.length === 0) return;
    await applyGeocodeBatch(items);
    setAccepted((prev) => new Set([...prev, ...items.map((i) => i.id)]));
    queryClient.invalidateQueries({ queryKey: ["address-stats"] });
  }

  const visible = (suggestions ?? []).filter((s) => !accepted.has(s.id));
  const selectableIds = visible.map((s) => s.id);
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

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Address Geocoding</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Look up missing address fields via OpenStreetMap. Preview suggestions before applying. Rate limited to 1 req/sec — fetching may take a minute.
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <button
          onClick={() => preview.mutate()}
          disabled={isRunning}
          className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isRunning ? "Looking up addresses..." : "Fetch suggestions"}
        </button>

        {visible.length > 0 && selected.size > 0 && (
          <button onClick={acceptSelected} className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer">
            Accept {selected.size} selected
          </button>
        )}
        {visible.length > 0 && (
          <button
            onClick={() => { if (confirm(`Accept all ${visible.length} suggestions?`)) acceptAll(); }}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md cursor-pointer"
          >
            Accept all ({visible.length})
          </button>
        )}

        {suggestions && (
          <span className="text-sm text-gray-500 dark:text-surface-400">
            {visible.length} suggestions{accepted.size > 0 && `, ${accepted.size} accepted`}{remaining > 0 && `, ${remaining} more to fetch`}
          </span>
        )}
      </div>

      {isRunning && serverStatus?.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 dark:text-surface-400 mb-1">
            <span>Querying OpenStreetMap... {serverStatus.done} / {serverStatus.total} events</span>
            <span>{serverStatus.found} found so far</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-surface-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${Math.round((serverStatus.done / serverStatus.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {isRunning && !serverStatus?.total && (
        <p className="text-gray-500 dark:text-surface-400 text-sm mb-4">Querying OpenStreetMap... ~1 second per event.</p>
      )}

      {suggestions && (
        <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
            <thead className="bg-gray-50 dark:bg-surface-700">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Event</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Current</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Suggested fills</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {visible.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleOne(s.id)} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/events/${s.id}`} className="text-blue-600 dark:text-white hover:underline dark:hover:text-accent-300">{s.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{s.venue || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-500 dark:text-surface-400 space-y-0.5">
                      {s.current.address && <div>{s.current.address}</div>}
                      {(s.current.city || s.current.state || s.current.zip) && (
                        <div>{[s.current.city, s.current.state, s.current.zip].filter(Boolean).join(", ")}</div>
                      )}
                      {!s.current.address && !s.current.city && <span className="text-gray-300 dark:text-surface-600">empty</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {Object.entries(s.suggested).map(([key, val]) => (
                        <FieldDiff key={key} label={FIELD_LABELS[key] || key} current={s.current[key]} suggested={val} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => applyOne.mutate({ id: s.id, updates: s.suggested })}
                      disabled={applyOne.isPending}
                      className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && suggestions.length > 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-green-600 dark:text-green-400">
                    All suggestions accepted
                  </td>
                </tr>
              )}
              {suggestions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No suggestions found — events may not have enough data to geocode
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
