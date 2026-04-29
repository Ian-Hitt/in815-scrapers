import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchChannelDuplicates, mergeChannelDuplicates, dismissChannelDuplicate, mergeChannelDuplicateBatch, dismissChannelDuplicateBatch } from "../api.js";

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
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  return "low";
}

function IconGlobe() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-7.5-7-12a7 7 0 1114 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function IconType() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h12M8 4v16M16 4v16M4 20h4M16 20h4" />
    </svg>
  );
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

function ChannelSide({ ch, isKeep, onSetKeep }) {
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
        {ch.image_url ? (
          <img src={ch.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-surface-700 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400 dark:text-surface-500">
            {ch.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            to={`/channels/${ch.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-gray-900 dark:text-surface-100 hover:underline truncate block leading-snug"
          >
            {ch.name}
          </Link>
          <div className="text-xs text-gray-500 dark:text-surface-400 mt-0.5">
            {ch.type || "—"} · {ch.event_count} {ch.event_count === 1 ? "event" : "events"}
          </div>
        </div>
      </div>
      {ch.website && (
        <div className="text-xs text-gray-400 dark:text-surface-500 truncate pl-6.5">{ch.website}</div>
      )}
      <div className="text-[10px] text-gray-300 dark:text-surface-600 mt-1 pl-6.5">ID {ch.id}</div>
    </button>
  );
}

function PairRow({ pair, onMerge, onDismiss }) {
  const conf = confidence(pair.score);
  const [keepId, setKeepId] = useState(pair.id_a);
  const removeId = keepId === pair.id_a ? pair.id_b : pair.id_a;

  const reasons = [];
  if (pair.sim >= 55) reasons.push({ icon: "name", label: `${pair.sim}% name match` });
  if (pair.subset_match) reasons.push({ icon: "name", label: "Name contained" });
  if (pair.same_domain) reasons.push({ icon: "domain", label: "Same website", value: pair.matched_domain });
  if (pair.shared_address) reasons.push({ icon: "pin", label: "Same address", value: pair.matched_address });
  else if (pair.proximity_m != null && pair.proximity_m < 1000)
    reasons.push({ icon: "pin", label: `~${pair.proximity_m}m apart` });

  return (
    <div className={`rounded-md border border-gray-200 dark:border-surface-700 border-l-[3px] ${STRIP[conf]} bg-white dark:bg-surface-800 p-3`}>
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-surface-300">
          <span className={`w-1.5 h-1.5 rounded-full ${DOT[conf]}`} />
          Score <span className="font-semibold tabular-nums">{pair.score}</span>
        </span>
      </div>

      {reasons.length > 0 && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 px-2.5 py-1.5 mb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-blue-800 dark:text-blue-300 shrink-0">Matched on:</span>
            {reasons.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 min-w-0">
                {r.icon === "name" && <IconType />}
                {r.icon === "domain" && <IconGlobe />}
                {r.icon === "pin" && <IconPin />}
                <span className="font-medium">{r.label}</span>
                {r.value && (
                  <span className="text-blue-600/80 dark:text-blue-400/80 truncate">
                    <span className="text-blue-400/60 dark:text-blue-500/50 mx-0.5">·</span>
                    {r.value}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-3 items-stretch">
        <ChannelSide ch={pair.a} isKeep={keepId === pair.id_a} onSetKeep={() => setKeepId(pair.id_a)} />
        <div className="hidden sm:flex items-center text-gray-300 dark:text-surface-600 text-sm select-none px-1">≈</div>
        <ChannelSide ch={pair.b} isKeep={keepId === pair.id_b} onSetKeep={() => setKeepId(pair.id_b)} />
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

export default function ChannelDuplicatePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  const { data: pairs, isLoading } = useQuery({
    queryKey: ["channel-duplicates"],
    queryFn: fetchChannelDuplicates,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["channel-duplicates"] });
    queryClient.invalidateQueries({ queryKey: ["channels"] });
  };

  const merge = useMutation({
    mutationFn: ({ keep_id, remove_id }) => mergeChannelDuplicates(keep_id, remove_id),
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: ({ id_a, id_b }) => dismissChannelDuplicate(id_a, id_b),
    onSuccess: invalidate,
  });

  const mergeBatch = useMutation({
    mutationFn: mergeChannelDuplicateBatch,
    onSuccess: invalidate,
  });

  const dismissBatch = useMutation({
    mutationFn: dismissChannelDuplicateBatch,
    onSuccess: invalidate,
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
    const msg = `Merge ${visible.length} ${label} pair${visible.length === 1 ? "" : "s"}? The channel with more events will be kept in each pair.`;
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

      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Channel Duplicates</h1>
      <p className="text-sm text-gray-500 dark:text-surface-400 mb-4">
        Candidate duplicate channel pairs found by comparing name similarity and website domain.
        Click a channel to mark it as the one to keep, then merge — events reassign and missing fields fill in.
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
