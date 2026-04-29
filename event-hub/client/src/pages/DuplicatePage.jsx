import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchDuplicates, mergeDuplicates, dismissDuplicate, mergeDuplicateBatch, dismissDuplicateBatch } from "../api.js";

const STRIP = {
  high:   "border-l-red-400 dark:border-l-red-500/70",
  medium: "border-l-amber-400 dark:border-l-amber-500/70",
  low:    "border-l-gray-200 dark:border-l-surface-600",
};

const DOT = {
  high:   "bg-red-400 dark:bg-red-500",
  medium: "bg-amber-400 dark:bg-amber-500",
  low:    "bg-gray-300 dark:bg-surface-500",
};

function confidence(score) {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function FilterPill({ active, onClick, dotColor, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
        active
          ? "bg-gray-900 dark:bg-surface-200 text-white dark:text-surface-900 border-gray-900 dark:border-surface-200"
          : "bg-white dark:bg-surface-800 text-gray-600 dark:text-surface-300 border-gray-200 dark:border-surface-700 hover:bg-gray-50 dark:hover:bg-surface-700"
      }`}
    >
      {dotColor && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span>{label}</span>
      <span className={active ? "opacity-80" : "text-gray-400 dark:text-surface-500"}>{count}</span>
    </button>
  );
}

function EventSide({ ev, isKeep, onSetKeep }) {
  return (
    <button
      type="button"
      onClick={onSetKeep}
      className={`flex-1 min-w-0 rounded-md p-3 text-sm text-left border transition-colors cursor-pointer ${
        isKeep
          ? "border-green-500 dark:border-green-500/70 ring-1 ring-green-500 dark:ring-green-500/70 bg-white dark:bg-surface-800"
          : "border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-gray-300 dark:hover:border-surface-600"
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span
          className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
            isKeep
              ? "border-green-500 dark:border-green-500/70"
              : "border-gray-300 dark:border-surface-500"
          }`}
        >
          {isKeep && <span className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-500/90" />}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to={`/events/${ev.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-gray-900 dark:text-surface-100 hover:underline line-clamp-2 leading-snug block"
          >
            {ev.title}
          </Link>
          <div className="text-xs text-gray-500 dark:text-surface-400 mt-0.5">
            {ev.start_date}{ev.start_time ? ` · ${ev.start_time}` : ""}
          </div>
          {ev.venue && (
            <div className="text-xs text-gray-400 dark:text-surface-500 mt-0.5 truncate">{ev.venue}</div>
          )}
        </div>
      </div>
      <div className="text-[10px] text-gray-300 dark:text-surface-600 pl-6.5">ID {ev.id}</div>
    </button>
  );
}

function PairRow({ pair, onMerge, onDismiss }) {
  const conf = confidence(pair.score);
  const [keepId, setKeepId] = useState(pair.id_a);
  const removeId = keepId === pair.id_a ? pair.id_b : pair.id_a;

  return (
    <div className={`rounded-md border border-gray-200 dark:border-surface-700 border-l-[3px] ${STRIP[conf]} bg-white dark:bg-surface-800 p-3`}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap text-xs">
        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-surface-300">
          <span className={`w-1.5 h-1.5 rounded-full ${DOT[conf]}`} />
          Score <span className="font-semibold tabular-nums">{pair.score}</span>
        </span>
        <span className="text-gray-300 dark:text-surface-600">·</span>
        <span className="text-gray-500 dark:text-surface-400 tabular-nums">{pair.sim}% title match</span>
        <span className="text-gray-300 dark:text-surface-600">·</span>
        <span className="text-gray-400 dark:text-surface-500">{pair.a.start_date}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch">
        <EventSide ev={pair.a} isKeep={keepId === pair.id_a} onSetKeep={() => setKeepId(pair.id_a)} />
        <div className="hidden sm:flex items-center text-gray-300 dark:text-surface-600 text-sm select-none px-1">≈</div>
        <EventSide ev={pair.b} isKeep={keepId === pair.id_b} onSetKeep={() => setKeepId(pair.id_b)} />
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onMerge(keepId, removeId)}
          className="px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-surface-200 text-white dark:text-surface-900 hover:bg-gray-800 dark:hover:bg-surface-100 rounded-md cursor-pointer"
        >
          Merge into #{keepId}
        </button>
        <button
          onClick={() => onDismiss(pair.id_a, pair.id_b)}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-surface-300 hover:bg-gray-100 dark:hover:bg-surface-700 rounded-md cursor-pointer"
        >
          Not a duplicate
        </button>
      </div>
    </div>
  );
}

export default function DuplicatePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: pairs, isLoading } = useQuery({
    queryKey: ["duplicates"],
    queryFn: fetchDuplicates,
  });

  const merge = useMutation({
    mutationFn: ({ keep_id, remove_id }) => mergeDuplicates(keep_id, remove_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["duplicates"] }),
  });

  const dismiss = useMutation({
    mutationFn: ({ id_a, id_b }) => dismissDuplicate(id_a, id_b),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["duplicates"] }),
  });

  const mergeBatch = useMutation({
    mutationFn: mergeDuplicateBatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["duplicates"] }),
  });

  const dismissBatch = useMutation({
    mutationFn: dismissDuplicateBatch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["duplicates"] }),
  });

  const counts = {
    all: pairs?.length ?? 0,
    high: pairs?.filter((p) => confidence(p.score) === "high").length ?? 0,
    medium: pairs?.filter((p) => confidence(p.score) === "medium").length ?? 0,
    low: pairs?.filter((p) => confidence(p.score) === "low").length ?? 0,
  };

  const visible = pairs?.filter((p) => filter === "all" || confidence(p.score) === filter) ?? [];

  const batchBusy = mergeBatch.isPending || dismissBatch.isPending;

  function onMergeAll() {
    if (visible.length === 0) return;
    const label = filter === "all" ? "all visible" : `all ${filter}-confidence`;
    const msg = `Merge ${visible.length} ${label} pair${visible.length === 1 ? "" : "s"}? The first event in each pair will be kept.`;
    if (!window.confirm(msg)) return;
    mergeBatch.mutate(visible.map((p) => ({ keep_id: p.id_a, remove_id: p.id_b })));
  }

  function onDismissAll() {
    if (visible.length === 0) return;
    const label = filter === "all" ? "all visible" : `all ${filter}-confidence`;
    const msg = `Dismiss ${visible.length} ${label} pair${visible.length === 1 ? "" : "s"}? They won't appear as duplicates again.`;
    if (!window.confirm(msg)) return;
    dismissBatch.mutate(visible.map((p) => ({ id_a: p.id_a, id_b: p.id_b })));
  }

  return (
    <div>
      <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">&larr; Back to Enrichment</Link>

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Duplicate Detection</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Candidate duplicate event pairs found by comparing title, date, time, and venue.
        Click an event to mark it as the one to keep, then merge — or dismiss if they're not actually the same event.
      </p>

      {pairs && (
        <div className="sticky top-14 md:top-14 z-10 py-2 bg-gray-50 dark:bg-surface-900 -mx-4 px-4 mb-5 flex flex-wrap items-center gap-2 justify-between">
          <div className="flex flex-wrap gap-2">
            <FilterPill active={filter === "all"}    onClick={() => setFilter("all")}    label="All"    count={counts.all} />
            <FilterPill active={filter === "high"}   onClick={() => setFilter("high")}   label="High"   count={counts.high}   dotColor={DOT.high} />
            <FilterPill active={filter === "medium"} onClick={() => setFilter("medium")} label="Medium" count={counts.medium} dotColor={DOT.medium} />
            <FilterPill active={filter === "low"}    onClick={() => setFilter("low")}    label="Low"    count={counts.low}    dotColor={DOT.low} />
          </div>
          {visible.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={onMergeAll}
                disabled={batchBusy}
                className="px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-surface-200 text-white dark:text-surface-900 hover:bg-gray-800 dark:hover:bg-surface-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {mergeBatch.isPending ? "Merging..." : `Merge all (${visible.length})`}
              </button>
              <button
                onClick={onDismissAll}
                disabled={batchBusy}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-surface-200 bg-white dark:bg-surface-800 border border-gray-300 dark:border-surface-600 hover:bg-gray-50 dark:hover:bg-surface-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {dismissBatch.isPending ? "Dismissing..." : `Dismiss all (${visible.length})`}
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading && <p className="text-gray-500 dark:text-surface-400 text-sm">Scanning for duplicates...</p>}

      {pairs && pairs.length === 0 && (
        <p className="text-gray-400 dark:text-surface-500 text-sm">No duplicate candidates found.</p>
      )}

      {pairs && pairs.length > 0 && visible.length === 0 && (
        <p className="text-gray-400 dark:text-surface-500 text-sm">No pairs at this confidence level.</p>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((pair) => (
            <PairRow
              key={`${pair.id_a}:${pair.id_b}`}
              pair={pair}
              onMerge={(keep_id, remove_id) => merge.mutate({ keep_id, remove_id })}
              onDismiss={(id_a, id_b) => dismiss.mutate({ id_a, id_b })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
