import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchChannels, mergeChannelDuplicates } from "../api.js";

export default function ChannelMergeModal({ source, onClose, onMerged }) {
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState(null);
  const [error, setError] = useState(null);

  const { data: channels } = useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
  });

  const matches = useMemo(() => {
    if (!channels) return [];
    const q = query.trim().toLowerCase();
    const others = channels.filter((c) => c.id !== source.id);
    if (!q) return others.slice(0, 25);
    return others
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 25);
  }, [channels, query, source.id]);

  const target = channels?.find((c) => c.id === targetId) || null;

  const merge = useMutation({
    mutationFn: ({ keep_id, remove_id }) => mergeChannelDuplicates(keep_id, remove_id),
    onSuccess: (_res, vars) => onMerged(vars.keep_id),
    onError: (err) => setError(err.message || "Merge failed"),
  });

  function doMerge() {
    if (!target) return;
    merge.mutate({ keep_id: target.id, remove_id: source.id });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-surface-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-200 dark:border-surface-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-surface-700">
          <h2 className="text-lg font-semibold dark:text-surface-100">Merge channel</h2>
          <p className="text-xs text-gray-500 dark:text-surface-400 mt-1">
            Move all events from <span className="font-medium">{source.name}</span> into
            another channel. The source channel will be deleted.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-surface-300 mb-1.5">
              Merge into
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Search channels..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setTargetId(null); }}
              className="w-full border border-gray-300 dark:border-surface-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-400"
            />
          </div>

          {matches.length > 0 && (
            <div className="border border-gray-200 dark:border-surface-700 rounded-md max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-surface-700">
              {matches.map((ch) => {
                const active = ch.id === targetId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => setTargetId(ch.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm cursor-pointer ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/30"
                        : "hover:bg-gray-50 dark:hover:bg-surface-700"
                    }`}
                  >
                    {ch.image_url ? (
                      <img src={ch.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-surface-700 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400 dark:text-surface-500">
                        {ch.name.charAt(0)}
                      </div>
                    )}
                    <span className="truncate flex-1 dark:text-surface-100">{ch.name}</span>
                    <span className="text-xs text-gray-400 dark:text-surface-500 shrink-0">
                      {ch.event_count} {ch.event_count === 1 ? "event" : "events"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {target && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-medium mb-1">Confirm merge</p>
              <p>
                <span className="font-medium">{source.event_count ?? "?"}</span> event{source.event_count === 1 ? "" : "s"} will move from{" "}
                <span className="font-medium">{source.name}</span> to{" "}
                <span className="font-medium">{target.name}</span>. The source channel will be deleted.
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 dark:border-surface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-surface-200 hover:bg-gray-100 dark:hover:bg-surface-700 rounded-md cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={doMerge}
            disabled={!target || merge.isPending}
            className="px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-surface-200 text-white dark:text-surface-900 hover:bg-gray-800 dark:hover:bg-surface-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {merge.isPending ? "Merging..." : "Merge"}
          </button>
        </div>
      </div>
    </div>
  );
}
