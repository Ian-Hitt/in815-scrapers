import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchTimeSuggestions, setEventTimes } from "../api.js";

function TimeCell({ label, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(value || "");

  function handleSave() {
    onSave(input.trim() || null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex gap-1 items-center">
        <input
          autoFocus
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          className="border border-gray-300 dark:border-surface-600 rounded px-2 py-0.5 text-xs font-mono w-32 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200"
          placeholder="7:30 PM"
        />
        <button onClick={handleSave} className="text-xs text-green-700 dark:text-green-400 hover:text-green-900 cursor-pointer">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-gray-400 dark:text-surface-500">{label}</span>
        {value ? (
          <code className="text-xs text-blue-600 dark:text-white font-mono">{value}</code>
        ) : (
          <span className="text-xs text-gray-400 dark:text-surface-500">—</span>
        )}
      </div>
      <button
        onClick={() => { setInput(value || ""); setEditing(true); }}
        className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-accent-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
      >
        Edit
      </button>
    </div>
  );
}

function DescriptionSnippet({ description, suggestedStartTime }) {
  if (!description) return <span className="text-gray-400 dark:text-surface-500">—</span>;

  if (!suggestedStartTime) {
    return <span className="text-xs text-gray-500 dark:text-surface-400 line-clamp-2">{description.slice(0, 160)}</span>;
  }

  const timePattern = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
  const match = description.match(timePattern);
  if (!match) {
    return <span className="text-xs text-gray-500 dark:text-surface-400 line-clamp-2">{description.slice(0, 160)}</span>;
  }

  const idx = match.index;
  const before = description.slice(Math.max(0, idx - 60), idx);
  const matched = match[0];
  const after = description.slice(idx + matched.length, idx + matched.length + 80);

  return (
    <span className="text-xs text-gray-500 dark:text-surface-400">
      {idx > 60 && "…"}{before}
      <mark className="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 rounded px-0.5">{matched}</mark>
      {after}{after.length === 80 && "…"}
    </span>
  );
}

export default function TimeCurationPage() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const { data: events, isLoading } = useQuery({
    queryKey: ["time-suggestions"],
    queryFn: fetchTimeSuggestions,
  });

  const save = useMutation({
    mutationFn: ({ id, start_time, end_time }) => setEventTimes(id, { start_time, end_time }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["time-suggestions"] }),
  });

  const withSuggestion = events?.filter((e) => e.suggested_start_time).length ?? 0;
  const complex = events?.filter((e) => e.complex).length ?? 0;
  const noSuggestion = events?.filter((e) => !e.suggested_start_time && !e.complex).length ?? 0;

  const displayed = showAll ? events : events?.filter((e) => e.suggested_start_time || e.complex);

  // Only rows with a suggestion can be accepted
  const selectableIds = displayed?.filter((e) => e.suggested_start_time && !e.complex).map((e) => e.id) ?? [];
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

  function acceptOne(ev) {
    save.mutate({ id: ev.id, start_time: ev.suggested_start_time, end_time: ev.suggested_end_time ?? undefined });
  }

  async function acceptSelected() {
    const toAccept = displayed.filter((e) => selected.has(e.id) && e.suggested_start_time);
    for (const ev of toAccept) {
      await setEventTimes(ev.id, { start_time: ev.suggested_start_time, end_time: ev.suggested_end_time ?? undefined });
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["time-suggestions"] });
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Start Times</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events missing a start time. Blue values are auto-suggested from the description — review and save, or edit manually.
        Complex events have conflicting schedules and need manual review.
      </p>

      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        {events && <>
          <span className="text-gray-600 dark:text-surface-400">{events.length} events missing start time</span>
          {withSuggestion > 0 && <span className="text-blue-700 dark:text-white">{withSuggestion} with suggestion</span>}
          {complex > 0 && <span className="text-orange-700 dark:text-orange-400">{complex} complex (review manually)</span>}
          {noSuggestion > 0 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-gray-400 dark:text-surface-500 underline cursor-pointer"
            >
              {showAll ? "Hide" : "Show"} {noSuggestion} with no time found
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={acceptSelected}
              className="ml-auto px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer"
            >
              Accept {selected.size} selected
            </button>
          )}
        </>}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Loading...</p>}

      {displayed && (
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
                    title="Select all with suggestions"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase w-64">Description snippet</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Start time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">End time</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {displayed.map((ev) => {
                const canAccept = !!ev.suggested_start_time && !ev.complex;
                return (
                  <tr key={ev.id} className={`hover:bg-gray-50 dark:hover:bg-surface-700 ${ev.complex ? "bg-orange-50 dark:bg-orange-900/10" : ""}`}>
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
                      <div className="flex items-center gap-2">
                        <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">{ev.title}</Link>
                        {ev.complex && (
                          <span title="Multiple conflicting time mentions — review manually" className="text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 rounded px-1.5 py-0.5 whitespace-nowrap">
                            Complex
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">{ev.start_date}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <DescriptionSnippet description={ev.description} suggestedStartTime={ev.suggested_start_time} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <TimeCell
                        label="Start"
                        value={ev.suggested_start_time}
                        onSave={(val) => save.mutate({ id: ev.id, start_time: val, end_time: undefined })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <TimeCell
                        label="End"
                        value={ev.suggested_end_time}
                        onSave={(val) => save.mutate({ id: ev.id, start_time: undefined, end_time: val })}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {canAccept && (
                        <button
                          onClick={() => acceptOne(ev)}
                          disabled={save.isPending}
                          className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50"
                        >
                          Accept
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No time suggestions found
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
