import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchRecurringEvents, runRruleAutoConvert, setEventRrule, clearMultipleDatesEvents } from "../api.js";

function StatusBadge({ rrule, suggested }) {
  if (rrule) {
    return <span className="text-xs font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 dark:text-green-400 dark:bg-green-900/40">Set</span>;
  }
  if (suggested) {
    return <span className="text-xs font-medium text-blue-700 bg-blue-50 rounded px-1.5 py-0.5 dark:text-white dark:bg-accent-900/40">Can auto-convert</span>;
  }
  return <span className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 dark:text-amber-400 dark:bg-amber-900/40">Needs review</span>;
}

function RruleCell({ event, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(event.rrule || event.suggested_rrule || "");

  function handleSave() {
    onSave(event.id, value.trim() || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          className="border border-gray-300 dark:border-surface-600 rounded px-2 py-0.5 text-xs font-mono w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-text bg-white dark:bg-surface-700 dark:text-surface-200"
          placeholder="FREQ=WEEKLY;BYDAY=MO"
        />
        <button onClick={handleSave} className="text-xs text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 cursor-pointer">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 dark:text-surface-500 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      {event.rrule ? (
        <code className="text-xs text-gray-800 dark:text-surface-200 font-mono">{event.rrule}</code>
      ) : event.suggested_rrule ? (
        <code className="text-xs text-blue-600 dark:text-white font-mono">{event.suggested_rrule}</code>
      ) : (
        <span className="text-xs text-gray-400 dark:text-surface-500">—</span>
      )}
      <button
        onClick={() => { setValue(event.rrule || event.suggested_rrule || ""); setEditing(true); }}
        className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-accent-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
      >
        Edit
      </button>
    </div>
  );
}

export default function RruleCurationPage() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const { data: events, isLoading } = useQuery({
    queryKey: ["recurring-events"],
    queryFn: fetchRecurringEvents,
  });

  const autoConvert = useMutation({
    mutationFn: runRruleAutoConvert,
    onSuccess: (result) => {
      setLastResult(result);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["recurring-events"] });
    },
  });

  const clearMultipleDates = useMutation({
    mutationFn: clearMultipleDatesEvents,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring-events"] }),
  });

  const saveRrule = useMutation({
    mutationFn: ({ id, rrule }) => setEventRrule(id, rrule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring-events"] }),
  });

  const total = events?.length ?? 0;
  const withRrule = events?.filter((e) => e.rrule).length ?? 0;
  const canConvert = events?.filter((e) => !e.rrule && e.suggested_rrule).length ?? 0;
  const multipleDates = events?.filter((e) => e.recurrence_frequency === "Multiple dates").length ?? 0;
  const needsReview = events?.filter((e) => !e.rrule && !e.suggested_rrule && e.recurrence_frequency !== "Multiple dates").length ?? 0;

  const selectableIds = events?.filter((e) => !e.rrule && e.suggested_rrule).map((e) => e.id) ?? [];
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

  async function acceptSelected() {
    const toAccept = events.filter((e) => selected.has(e.id) && e.suggested_rrule);
    for (const ev of toAccept) {
      await setEventRrule(ev.id, ev.suggested_rrule);
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["recurring-events"] });
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Recurrence Rules</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Convert human-readable frequency strings to iCal RRULE format. Blue values are auto-suggested — accept individually, select in bulk, or run auto-convert to apply all at once.
      </p>

      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        <span className="text-gray-600 dark:text-surface-400">{total} recurring events</span>
        <span className="text-green-700 dark:text-green-400">{withRrule} set</span>
        {canConvert > 0 && <span className="text-blue-700 dark:text-white">{canConvert} can auto-convert</span>}
        {multipleDates > 0 && <span className="text-red-600 dark:text-red-400">{multipleDates} &ldquo;Multiple dates&rdquo;</span>}
        {needsReview > 0 && <span className="text-amber-700 dark:text-amber-400">{needsReview} need review</span>}
        {selected.size > 0 && (
          <button
            onClick={acceptSelected}
            className="ml-auto px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer"
          >
            Accept {selected.size} selected
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <button
          onClick={() => autoConvert.mutate()}
          disabled={autoConvert.isPending || canConvert === 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {autoConvert.isPending ? "Converting..." : `Auto-convert all ${canConvert}`}
        </button>
        {multipleDates > 0 && (
          <button
            onClick={() => { if (confirm(`Mark ${multipleDates} "Multiple dates" events as non-recurring?`)) clearMultipleDates.mutate(); }}
            disabled={clearMultipleDates.isPending}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {clearMultipleDates.isPending ? "Clearing..." : `Clear ${multipleDates} "Multiple dates"`}
          </button>
        )}
        {lastResult && (
          <p className="text-sm text-gray-600 dark:text-surface-400">
            Converted {lastResult.converted}, skipped {lastResult.skipped} already set,{" "}
            {lastResult.needs_review} still need manual review.
          </p>
        )}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Loading...</p>}

      {events && (
        <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
            <thead className="bg-gray-50 dark:bg-surface-700">
              <tr>
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="cursor-pointer accent-gray-600 dark:accent-surface-400"
                    title="Select all auto-convertible"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Frequency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">RRULE</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {events.map((ev) => {
                const canAccept = !ev.rrule && !!ev.suggested_rrule;
                return (
                  <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                    <td className="px-3 py-3 text-center">
                      {canAccept && (
                        <input
                          type="checkbox"
                          checked={selected.has(ev.id)}
                          onChange={() => toggleOne(ev.id)}
                          className="cursor-pointer accent-gray-600 dark:accent-surface-400"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">{ev.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{ev.start_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.recurrence_frequency || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      <RruleCell event={ev} onSave={(id, rrule) => saveRrule.mutate({ id, rrule })} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge rrule={ev.rrule} suggested={ev.suggested_rrule} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {canAccept && (
                        <button
                          onClick={() => saveRrule.mutate({ id: ev.id, rrule: ev.suggested_rrule })}
                          disabled={saveRrule.isPending}
                          className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No recurring events found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
