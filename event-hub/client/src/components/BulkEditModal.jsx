import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCategories,
  fetchChannels,
  bulkDeleteEvents,
  bulkUpdateEvents,
  bulkAddCategoryToEvents,
  bulkRemoveCategoryFromEvents,
} from "../api.js";

function CategoryPicker({ label, actionLabel, count, onSubmit, isPending }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const flat = useMemo(() => {
    if (!categories) return [];
    return categories.flatMap((p) => [
      { id: p.id, name: p.name, label: p.name },
      ...p.subcategories.map((c) => ({ id: c.id, name: c.name, label: `${p.name} › ${c.name}` })),
    ]);
  }, [categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return flat.slice(0, 20);
    return flat.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 20);
  }, [flat, query]);

  function pick(cat) {
    setSelected(cat);
    setQuery(cat.label);
    setOpen(false);
  }

  function handleSubmit() {
    if (!selected) return;
    onSubmit(selected.id, () => {
      setSelected(null);
      setQuery("");
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600 dark:text-surface-300">{label}</label>
      <div className="relative">
        <input
          type="text"
          placeholder="Search categories..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full border border-gray-300 dark:border-surface-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {open && filtered.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.id}
                onMouseDown={() => pick(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-surface-700 dark:text-surface-200 cursor-pointer"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handleSubmit}
        disabled={!selected || isPending}
        className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {isPending ? "Applying..." : `${actionLabel} ${count} event${count === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

function ChannelPicker({ count, onSubmit, isPending }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);

  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const filtered = useMemo(() => {
    if (!channels) return [];
    const q = query.trim().toLowerCase();
    if (!q) return channels.slice(0, 20);
    return channels.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 20);
  }, [channels, query]);

  function pick(ch) {
    setSelected(ch);
    setQuery(ch.name);
    setOpen(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-surface-300 mb-1.5">Assign to channel</label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search channels..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
            onFocus={() => setOpen(true)}
            className="w-full border border-gray-300 dark:border-surface-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {open && filtered.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-md shadow-lg max-h-52 overflow-y-auto">
              {filtered.map((ch) => (
                <button
                  key={ch.id}
                  onMouseDown={() => pick(ch)}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-surface-700 cursor-pointer"
                >
                  {ch.image_url ? (
                    <img src={ch.image_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-surface-700 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400">
                      {ch.name.charAt(0)}
                    </div>
                  )}
                  <span className="truncate dark:text-surface-200">{ch.name}</span>
                  <span className="text-xs text-gray-400 dark:text-surface-500 shrink-0">{ch.event_count} events</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => selected && onSubmit(selected.id)}
        disabled={!selected || isPending}
        className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {isPending ? "Assigning..." : `Assign ${count} event${count === 1 ? "" : "s"} to channel`}
      </button>
      <div className="border-t border-gray-100 dark:border-surface-700 pt-3">
        <button
          onClick={() => onSubmit(null)}
          disabled={isPending}
          className="w-full px-3 py-2 text-sm font-medium text-gray-600 dark:text-surface-300 border border-gray-300 dark:border-surface-600 rounded-md hover:bg-gray-50 dark:hover:bg-surface-700 disabled:opacity-50 cursor-pointer"
        >
          Unassign from all channels
        </button>
      </div>
    </div>
  );
}

const TABS = [
  { id: "categories", label: "Categories" },
  { id: "channel", label: "Channel" },
  { id: "delete", label: "Delete" },
];

export default function BulkEditModal({ selectedIds, onClose, onSuccess }) {
  const count = selectedIds.length;
  const qc = useQueryClient();
  const [tab, setTab] = useState("categories");
  const [deleteStep, setDeleteStep] = useState(1);
  const [toast, setToast] = useState(null);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["events"] });
  }

  const addCategory = useMutation({
    mutationFn: ({ categoryId }) => bulkAddCategoryToEvents(selectedIds, categoryId),
    onSuccess: (_, { reset }) => { invalidate(); showToast("Category added"); reset?.(); },
  });

  const removeCategory = useMutation({
    mutationFn: ({ categoryId }) => bulkRemoveCategoryFromEvents(selectedIds, categoryId),
    onSuccess: (_, { reset }) => { invalidate(); showToast("Category removed"); reset?.(); },
  });

  const assignChannel = useMutation({
    mutationFn: ({ channelId }) => bulkUpdateEvents(selectedIds, { channel_id: channelId ?? "" }),
    onSuccess: () => { invalidate(); showToast(assignChannel.variables?.channelId ? "Channel assigned" : "Channel unassigned"); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => bulkDeleteEvents(selectedIds),
    onSuccess: () => { invalidate(); onSuccess?.(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-surface-800 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-surface-700 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-surface-700 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold dark:text-surface-100">Edit selected events</h2>
            <p className="text-xs text-gray-500 dark:text-surface-400 mt-0.5">{count} event{count === 1 ? "" : "s"} selected</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-surface-200 cursor-pointer text-xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-surface-700 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setDeleteStep(1); }}
              className={`px-4 py-2.5 text-sm font-medium cursor-pointer border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? t.id === "delete"
                    ? "border-red-500 text-red-600 dark:text-red-400"
                    : "border-blue-600 text-blue-600 dark:text-accent-300"
                  : "border-transparent text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1">
          {tab === "categories" && (
            <div className="space-y-5">
              <CategoryPicker
                label="Add category to all selected"
                actionLabel="Add category to"
                count={count}
                onSubmit={(categoryId, reset) => addCategory.mutate({ categoryId, reset })}
                isPending={addCategory.isPending}
              />
              <div className="border-t border-gray-100 dark:border-surface-700 pt-5">
                <CategoryPicker
                  label="Remove category from all selected"
                  actionLabel="Remove category from"
                  count={count}
                  onSubmit={(categoryId, reset) => removeCategory.mutate({ categoryId, reset })}
                  isPending={removeCategory.isPending}
                />
              </div>
            </div>
          )}

          {tab === "channel" && (
            <ChannelPicker
              count={count}
              onSubmit={(channelId) => assignChannel.mutate({ channelId })}
              isPending={assignChannel.isPending}
            />
          )}

          {tab === "delete" && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Delete {count} event{count === 1 ? "" : "s"}?</p>
                <p className="text-xs text-red-700 dark:text-red-400">This will permanently remove the selected events and all their source links. This cannot be undone.</p>
              </div>

              {deleteStep === 1 && (
                <button
                  onClick={() => setDeleteStep(2)}
                  className="w-full px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer"
                >
                  Delete {count} event{count === 1 ? "" : "s"}
                </button>
              )}

              {deleteStep === 2 && (
                <div className="space-y-2">
                  <p className="text-xs text-center text-gray-500 dark:text-surface-400">Are you absolutely sure?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteStep(1)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-surface-200 border border-gray-300 dark:border-surface-600 rounded-md hover:bg-gray-50 dark:hover:bg-surface-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Yes, delete permanently"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="mx-5 mb-4 px-3 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md text-xs text-green-800 dark:text-green-300 text-center">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
