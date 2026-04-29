import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchPriceSuggestions, setEventPrice } from "../api.js";

const CONFIDENCE_STYLES = {
  high:   "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  medium: "bg-blue-50 dark:bg-accent-900/30 text-blue-700 dark:text-white",
  low:    "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
};

function PriceCell({ event, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(event.suggested_price || "");

  function handleSave() {
    onSave(value.trim() || null);
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
          className="border border-gray-300 dark:border-surface-600 rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200"
          placeholder="Free, $10, $5–$20"
        />
        <button onClick={handleSave} className="text-xs text-green-700 dark:text-green-400 hover:text-green-900 cursor-pointer">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 group">
      {event.suggested_price ? (
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CONFIDENCE_STYLES[event.confidence]}`}>
            {event.suggested_price}
          </span>
          <span className="text-xs text-gray-400 dark:text-surface-500">{event.confidence}</span>
        </div>
      ) : (
        <span className="text-xs text-gray-400 dark:text-surface-500">—</span>
      )}
      <button
        onClick={() => { setValue(event.suggested_price || ""); setEditing(true); }}
        className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-accent-400 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity"
      >
        Edit
      </button>
    </div>
  );
}

function DescriptionSnippet({ description }) {
  if (!description) return <span className="text-gray-400 dark:text-surface-500">—</span>;

  // Find the first price-like mention to highlight
  const pricePattern = /\$\d+(?:\.\d{1,2})?|\bfree\b|\bdonation\b|\bno\s+(?:cost|charge)\b/i;
  const match = description.match(pricePattern);
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

export default function PriceCurationPage() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const { data: events, isLoading } = useQuery({
    queryKey: ["price-suggestions"],
    queryFn: fetchPriceSuggestions,
  });

  const save = useMutation({
    mutationFn: ({ id, price }) => setEventPrice(id, price),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-suggestions"] }),
  });

  const withSuggestion = events?.filter((e) => e.suggested_price).length ?? 0;
  const highConfidence = events?.filter((e) => e.confidence === "high").length ?? 0;
  const noSuggestion = events?.filter((e) => !e.suggested_price).length ?? 0;

  const displayed = showAll ? events : events?.filter((e) => e.suggested_price);

  const selectableIds = displayed?.filter((e) => e.suggested_price).map((e) => e.id) ?? [];
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
    const toAccept = displayed.filter((e) => selected.has(e.id) && e.suggested_price);
    for (const ev of toAccept) {
      await setEventPrice(ev.id, ev.suggested_price);
    }
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["price-suggestions"] });
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Prices</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events missing a price where one was found in the description.
        Green = high confidence, blue = medium, amber = low (e.g. "free" mentioned but may refer to something else).
      </p>

      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        {events && <>
          <span className="text-gray-600 dark:text-surface-400">{events.length} events missing price</span>
          {withSuggestion > 0 && <span className="text-blue-700 dark:text-white">{withSuggestion} with suggestion</span>}
          {highConfidence > 0 && <span className="text-green-700 dark:text-green-400">{highConfidence} high confidence</span>}
          {noSuggestion > 0 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-gray-400 dark:text-surface-500 underline cursor-pointer"
            >
              {showAll ? "Hide" : "Show"} {noSuggestion} with nothing found
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Suggested price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {displayed.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                  <td className="px-3 py-3 text-center">
                    {ev.suggested_price && (
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
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">{ev.start_date}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <DescriptionSnippet description={ev.description} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <PriceCell event={ev} onSave={(val) => save.mutate({ id: ev.id, price: val })} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {ev.suggested_price && (
                      <button
                        onClick={() => save.mutate({ id: ev.id, price: ev.suggested_price })}
                        disabled={save.isPending}
                        className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50"
                      >
                        Accept
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No price suggestions found
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
