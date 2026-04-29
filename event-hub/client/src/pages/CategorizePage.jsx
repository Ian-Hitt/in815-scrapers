import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchCategorySuggestions, fetchCategoryRules, runAutoCategorize, applyEventCategories } from "../api.js";

const CONFIDENCE_STYLES = {
  high:   "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  low:    "bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-surface-400",
};

function ConfidenceBadge({ level }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_STYLES[level] || CONFIDENCE_STYLES.low}`}>
      {level}
    </span>
  );
}

function CategoryChip({ cat }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-accent-900/40 text-blue-700 dark:text-white font-medium">
      {cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name}
    </span>
  );
}

function RulesPanel() {
  const [open, setOpen] = useState(false);
  const { data: rules } = useQuery({ queryKey: ["category-rules"], queryFn: fetchCategoryRules, enabled: open });

  return (
    <div className="mt-6 border border-gray-200 dark:border-surface-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-surface-300 bg-gray-50 dark:bg-surface-800 hover:bg-gray-100 dark:hover:bg-surface-700 cursor-pointer"
      >
        <span>Keyword rules</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && rules && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white dark:bg-surface-800">
          {rules.map((cat) => (
            <div key={cat.slug} className="border border-gray-100 dark:border-surface-700 rounded p-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-surface-100 mb-2">
                {cat.parentName ? (
                  <><span className="text-gray-400 dark:text-surface-500">{cat.parentName} › </span>{cat.name}</>
                ) : cat.name}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {cat.keywords.map((kw) => (
                  <span key={kw} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-surface-300 rounded-full">{kw}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

export default function CategorizePage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["category-suggestions", page],
    queryFn: () => fetchCategorySuggestions({ page, limit: PAGE_SIZE }),
    keepPreviousData: true,
  });

  const suggestions = data?.suggestions ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;

  const autoAll = useMutation({
    mutationFn: runAutoCategorize,
    onSuccess: () => {
      setSelected(new Set());
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["category-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["category-stats"] });
    },
  });

  const applyOne = useMutation({
    mutationFn: (id) => applyEventCategories(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["category-stats"] });
    },
  });

  const selectableIds = suggestions.map((e) => e.id);
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
    for (const id of [...selected]) await applyEventCategories(id);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["category-suggestions"] });
    queryClient.invalidateQueries({ queryKey: ["category-stats"] });
  }

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Category Assignment</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Events that match keyword rules but haven't been categorized yet. Review the suggestions and accept individually or in bulk.
      </p>

      <div className="flex flex-wrap gap-4 mb-4 text-sm items-center">
        {total > 0 && (
          <span className="text-gray-600 dark:text-surface-400">
            {total} events with suggestions — showing {start}–{end}
          </span>
        )}
        {selected.size > 0 && (
          <button onClick={acceptSelected} className="px-3 py-1 bg-green-700 hover:bg-green-800 text-white text-xs font-medium rounded-md cursor-pointer">
            Accept {selected.size} selected
          </button>
        )}
        <button
          onClick={() => { if (confirm(`Apply keyword rules to all ${total} events?`)) autoAll.mutate(); }}
          disabled={autoAll.isPending || total === 0}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {autoAll.isPending ? "Applying..." : "Accept all"}
        </button>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Confidence</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Source category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Suggested categories</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
              {suggestions.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                  <td className="px-3 py-3 text-center">
                    <input type="checkbox" checked={selected.has(ev.id)} onChange={() => toggleOne(ev.id)} className="cursor-pointer accent-gray-600 dark:accent-surface-400" />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">{ev.title}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">{ev.start_date}</td>
                  <td className="px-4 py-3"><ConfidenceBadge level={ev.confidence} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{ev.raw_category || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {ev.suggested_categories.map((cat) => <CategoryChip key={cat.slug} cat={cat} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button onClick={() => applyOne.mutate(ev.id)} disabled={applyOne.isPending} className="px-2.5 py-1 text-xs font-medium bg-green-700 hover:bg-green-800 text-white rounded cursor-pointer disabled:opacity-50">
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">
                    No suggestions — all events are categorized or no keyword rules matched
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

      <RulesPanel />
    </div>
  );
}
