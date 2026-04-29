import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvents, fetchEventIds, fetchChannels, fetchRealmsStatus, fetchRealmsEnvironments, createRealmsEnvironment, updateRealmsEnvironment, deleteRealmsEnvironment, pushEventsToRealms, pushAllReady, cancelPushReady } from "../api.js";
import { getMissingRequired, getMissingOptional, EXPORT_FIELDS } from "../exportFields.js";
import FilterDrawer from "../components/FilterDrawer.jsx";
import Pagination from "../components/Pagination.jsx";
import { useNotifications } from "../hooks/useNotifications.js";

const SOURCE_LABELS = { rpd: "RPD", gorockford: "GoRockford", eventbrite: "Eventbrite", rpl: "RPL", harlem: "Harlem High School", hononegah: "Hononegah High School", "intersoccer-saturday": "Inter Soccer League (Saturday)", "intersoccer-sunday": "Inter Soccer League (Sunday)", guilford: "Guilford High School", east: "East High School", auburn: "Auburn High School", jefferson: "Jefferson High School", "lutheran-hs": "Rockford Lutheran", boylan: "Boylan Catholic High School", rivets: "Rockford Rivets", marysplace: "Mary's Place Bar", rockfordlive: "Rockford Live", rockbuzz: "Rockford Buzz", hardrock: "Hard Rock Casino", ticketmaster: "Ticketmaster" };

function EnvironmentToggle({ environments, selectedEnv, onSelect }) {
  if (!environments?.length) {
    return <p className="text-sm text-gray-400 dark:text-surface-500">No environments configured</p>;
  }
  return (
    <div className="inline-flex rounded-lg bg-gray-100 dark:bg-surface-700 p-0.5">
      {environments.map((env) => (
        <button
          key={env.id}
          onClick={() => onSelect(env.id)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
            selectedEnv === env.id
              ? "bg-white dark:bg-surface-600 text-gray-900 dark:text-surface-100 shadow-sm"
              : "text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200"
          }`}
        >
          {env.name}
        </button>
      ))}
    </div>
  );
}

function EnvironmentSettings({ environments, queryClient }) {
  const [editing, setEditing] = useState(null); // env id or "new"
  const [form, setForm] = useState({ name: "", base_url: "", token: "", slug: "" });

  const create = useMutation({
    mutationFn: createRealmsEnvironment,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["realms-environments"] }); setEditing(null); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }) => updateRealmsEnvironment(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["realms-environments"] }); queryClient.invalidateQueries({ queryKey: ["realms-status"] }); setEditing(null); },
  });
  const remove = useMutation({
    mutationFn: deleteRealmsEnvironment,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["realms-environments"] }); queryClient.invalidateQueries({ queryKey: ["realms-status"] }); },
  });

  function startEdit(env) {
    setEditing(env.id);
    setForm({ name: env.name, base_url: env.base_url, token: "", slug: env.slug || "" });
  }

  function startNew() {
    setEditing("new");
    setForm({ name: "", base_url: "", token: "", slug: "" });
  }

  function save() {
    if (editing === "new") {
      create.mutate(form);
    } else {
      const data = { id: editing, name: form.name, base_url: form.base_url, slug: form.slug || null };
      if (form.token) data.token = form.token;
      update.mutate(data);
    }
  }

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-4 mb-6">
      <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-3">Environments</h3>
      <div className="space-y-2">
        {environments?.map((env) => (
          <div key={env.id} className="flex items-center gap-3 text-sm">
            {editing === env.id ? (
              <EnvironmentForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} saving={update.isPending} isNew={false} />
            ) : (
              <>
                <span className="font-medium text-gray-800 dark:text-surface-200 w-20">{env.name}</span>
                <span className="font-mono text-xs text-gray-500 dark:text-surface-400 flex-1 truncate">{env.base_url}</span>
                <button onClick={() => startEdit(env)} className="text-xs text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer">Edit</button>
                <button
                  onClick={() => { if (confirm(`Delete "${env.name}" environment? This removes all push tracking for it.`)) remove.mutate(env.id); }}
                  className="text-xs text-red-500 dark:text-red-400 hover:underline cursor-pointer"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
        {editing === "new" ? (
          <EnvironmentForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} saving={create.isPending} isNew={true} />
        ) : (
          <button onClick={startNew} className="text-xs text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer mt-1">+ Add environment</button>
        )}
      </div>
    </div>
  );
}

function EnvironmentForm({ form, setForm, onSave, onCancel, saving, isNew }) {
  return (
    <div className="flex flex-wrap items-end gap-2 w-full py-2 border-t border-gray-100 dark:border-surface-700">
      <div>
        <label className="block text-xs text-gray-500 dark:text-surface-400 mb-0.5">Name</label>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="develop" className="border border-gray-300 dark:border-surface-600 rounded px-2 py-1 text-sm w-28 bg-white dark:bg-surface-700 dark:text-surface-200" />
      </div>
      <div className="flex-1 min-w-48">
        <label className="block text-xs text-gray-500 dark:text-surface-400 mb-0.5">Base URL</label>
        <input value={form.base_url} onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))} placeholder="https://in815.develop.realms.tv" className="border border-gray-300 dark:border-surface-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-surface-700 dark:text-surface-200" />
      </div>
      <div className="min-w-36">
        <label className="block text-xs text-gray-500 dark:text-surface-400 mb-0.5">{isNew ? "Token" : "Token (leave blank to keep)"}</label>
        <input value={form.token} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} type="password" placeholder={isNew ? "required" : "••••••"} className="border border-gray-300 dark:border-surface-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-surface-700 dark:text-surface-200" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 dark:text-surface-400 mb-0.5">Realm slug</label>
        <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="optional" className="border border-gray-300 dark:border-surface-600 rounded px-2 py-1 text-sm w-28 bg-white dark:bg-surface-700 dark:text-surface-200" />
      </div>
      <button onClick={onSave} disabled={saving || !form.name || !form.base_url || (isNew && !form.token)} className="px-3 py-1 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed">
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={onCancel} className="px-3 py-1 text-sm text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer">Cancel</button>
    </div>
  );
}

function StatusBar({ status }) {
  if (!status?.events) return null;
  const { events, channels } = status;
  return (
    <div className="flex flex-wrap gap-6 text-sm mb-4">
      <div>
        <span className="text-green-700 dark:text-green-400 font-medium">{events.pushed} pushed</span>
        <span className="text-gray-400 mx-1">·</span>
        <span className="text-gray-600 dark:text-surface-300">{events.unpushed} remaining</span>
      </div>
      <div>
        <span className="text-green-700 dark:text-green-400 font-medium">{channels.mapped} channels mapped</span>
        <span className="text-gray-400 mx-1">·</span>
        <span className="text-gray-600 dark:text-surface-300">{channels.total - channels.mapped} unmapped</span>
      </div>
    </div>
  );
}

function PushBadge({ event, pushResults }) {
  const result = pushResults[event.id];
  if (result?.ok) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        ✓ Pushed
      </span>
    );
  }
  if (event.realms_id) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
        ✓ {event.realms_id}
      </span>
    );
  }
  if (result?.error || event.realms_push_error) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 cursor-default">
        ✕ Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-surface-400">
      Not pushed
    </span>
  );
}

const selectCls = "w-full border border-gray-300 dark:border-surface-600 rounded px-2 py-1.5 text-sm cursor-pointer bg-white dark:bg-surface-700 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-1";

function ExportFilters({ filters, setFilter, channelList }) {
  return (
    <>
      <div>
        <label className={labelCls}>Push status</label>
        <select value={filters.realms_pushed} onChange={(e) => setFilter("realms_pushed", e.target.value)} className={selectCls}>
          <option value="">All events</option>
          <option value="no">Not pushed</option>
          <option value="yes">Already pushed</option>
          <option value="error">Push errors</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Readiness</label>
        <select value={filters.completeness} onChange={(e) => setFilter("completeness", e.target.value)} className={selectCls}>
          <option value="">All</option>
          <option value="ready">Ready to push</option>
          <option value="blocked">Blocked</option>
          <option value="complete">Complete (no gaps)</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Missing field</label>
        <select value={filters.missing_field} onChange={(e) => setFilter("missing_field", e.target.value)} className={selectCls}>
          <option value="">Any</option>
          {EXPORT_FIELDS.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Source</label>
        <select value={filters.source} onChange={(e) => setFilter("source", e.target.value)} className={selectCls}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).sort(([, a], [, b]) => a.localeCompare(b)).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Channel</label>
        <select value={filters.channel} onChange={(e) => setFilter("channel", e.target.value)} className={selectCls}>
          <option value="">All channels</option>
          {[...(channelList ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function ExportActions({ selected, batchPush, pushReady, cancelPush, status, selectedEnv, className }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className || ""}`}>
      {selected.size > 0 && (
        <button
          onClick={() => batchPush.mutate([...selected])}
          disabled={batchPush.isPending || pushReady.isPending}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {batchPush.isPending ? "Pushing…" : `Push ${selected.size}`}
        </button>
      )}
      {status?.push_in_progress ? (
        <button
          onClick={() => cancelPush.mutate()}
          disabled={cancelPush.isPending}
          className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className="inline-block w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          Cancel
        </button>
      ) : (
        <>
          <button
            onClick={() => pushReady.mutate({ force: false })}
            disabled={batchPush.isPending || pushReady.isPending || !selectedEnv}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Push all ready
          </button>
          <button
            onClick={() => {
              if (confirm("Re-sync all pushable events to Realms? This will update events that were already pushed successfully, overwriting remote data with the latest local values.")) {
                pushReady.mutate({ force: true });
              }
            }}
            disabled={batchPush.isPending || pushReady.isPending || !selectedEnv}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-green-600 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title="Also re-push events already pushed successfully (to sync local edits like category changes)"
          >
            Re-sync all
          </button>
        </>
      )}
      {pushReady.data && !status?.push_in_progress && (
        <span className="text-xs text-gray-500 dark:text-surface-400">
          {pushReady.data.pushed} pushed{pushReady.data.failed > 0 && `, ${pushReady.data.failed} failed`}{pushReady.data.aborted && ", cancelled"}
        </span>
      )}
    </div>
  );
}

export default function ExportPage() {
  const queryClient = useQueryClient();
  const [selectedEnv, setSelectedEnv] = useState(null);
  const [filters, setFilters] = useState({ realms_pushed: "", source: "", channel: "", completeness: "", missing_field: "", page: 1 });
  const [selected, setSelected] = useState(new Set());
  const [pushResults, setPushResults] = useState({});
  const [showSettings, setShowSettings] = useState(false);
  const { notify } = useNotifications();
  const wasPushingRef = useRef(false);

  const { data: environments } = useQuery({
    queryKey: ["realms-environments"],
    queryFn: fetchRealmsEnvironments,
  });

  // Auto-select first environment
  useEffect(() => {
    if (environments?.length && !selectedEnv) {
      setSelectedEnv(environments[0].id);
    }
  }, [environments, selectedEnv]);

  const { data: status } = useQuery({
    queryKey: ["realms-status", selectedEnv],
    queryFn: () => fetchRealmsStatus(selectedEnv),
    enabled: !!selectedEnv,
    refetchInterval: (query) => query.state.data?.push_in_progress ? 2000 : 0,
  });

  // Notify when push completes
  useEffect(() => {
    const pushing = !!status?.push_in_progress;
    if (wasPushingRef.current && !pushing) {
      notify("Export complete", {
        body: "Push to Realms has finished",
        type: "success",
      });
    }
    wasPushingRef.current = pushing;
  }, [status?.push_in_progress, notify]);

  const { data: channelList } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const { data, isLoading } = useQuery({
    queryKey: ["events-export", filters, selectedEnv],
    queryFn: () =>
      fetchEvents({
        realms_pushed: filters.realms_pushed || undefined,
        realms_environment: selectedEnv || undefined,
        source: filters.source || undefined,
        channel: filters.channel || undefined,
        completeness: filters.completeness || undefined,
        missing_field: filters.missing_field || undefined,
        page: filters.page,
        limit: 50,
        sort: "start_date",
      }),
    enabled: !!selectedEnv,
  });

  const [selectingAll, setSelectingAll] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const activeFilterCount = [filters.realms_pushed, filters.source, filters.channel, filters.completeness, filters.missing_field].filter(Boolean).length;

  const batchPush = useMutation({
    mutationFn: (ids) => pushEventsToRealms(ids, { force: true, environmentId: selectedEnv }),
    onSuccess: ({ results }) => {
      const newResults = {};
      for (const r of results) {
        newResults[r.eventId] = r;
      }
      setPushResults((prev) => ({ ...prev, ...newResults }));
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["realms-status"] });
      queryClient.invalidateQueries({ queryKey: ["events-export"] });
    },
  });

  const pushReady = useMutation({
    mutationFn: ({ force = false } = {}) => pushAllReady(selectedEnv, { force }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["realms-status"] });
      queryClient.invalidateQueries({ queryKey: ["events-export"] });
    },
  });

  const cancelPush = useMutation({
    mutationFn: cancelPushReady,
  });

  const events = data?.events ?? [];
  const totalPages = data?.totalPages ?? 1;
  const totalCount = data?.total ?? null;
  const channelMap = Object.fromEntries((channelList ?? []).map((c) => [c.id, c.name]));

  const allIds = events.map((e) => e.id);
  const allPageSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const hasMoreThanPage = totalCount > allIds.length;

  function toggleAll() {
    if (allPageSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const { ids } = await fetchEventIds({
        realms_pushed: filters.realms_pushed || undefined,
        realms_environment: selectedEnv || undefined,
        source: filters.source || undefined,
        channel: filters.channel || undefined,
        completeness: filters.completeness || undefined,
        missing_field: filters.missing_field || undefined,
      });
      setSelected(new Set(ids));
    } finally {
      setSelectingAll(false);
    }
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setFilter(key, val) {
    setFilters((f) => ({ ...f, [key]: val, page: 1 }));
    setSelected(new Set());
  }

  return (
    <div>
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-2xl font-bold dark:text-surface-100">Export to Realms</h1>
        {totalCount !== null && (
          <span className="text-sm text-gray-500 dark:text-surface-400">{totalCount.toLocaleString()} events</span>
        )}
      </div>

      {/* Environment toggle */}
      <div className="flex items-center gap-3 mb-4">
        <EnvironmentToggle
          environments={environments}
          selectedEnv={selectedEnv}
          onSelect={(id) => {
            setSelectedEnv(id);
            setPushResults({});
            setSelected(new Set());
          }}
        />
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs text-gray-400 dark:text-surface-500 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer"
          title="Manage environments"
        >
          {showSettings ? "Hide settings" : "Settings"}
        </button>
      </div>

      {showSettings && <EnvironmentSettings environments={environments} queryClient={queryClient} />}

      <StatusBar status={status} />

      {/* Desktop filters — inline */}
      <div className="hidden md:flex flex-wrap gap-3 mb-4 items-end">
        <ExportFilters filters={filters} setFilter={setFilter} channelList={channelList} />
        <ExportActions selected={selected} batchPush={batchPush} pushReady={pushReady} cancelPush={cancelPush} status={status} selectedEnv={selectedEnv} className="ml-auto" />
      </div>

      {/* Mobile filters — button + drawer */}
      <div className="md:hidden flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilterDrawerOpen(true)}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-surface-600 rounded-md text-sm text-gray-700 dark:text-surface-300 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 8h12M9 12h6" />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none">
              {activeFilterCount}
            </span>
          )}
        </button>
        <ExportActions selected={selected} batchPush={batchPush} pushReady={pushReady} cancelPush={cancelPush} status={status} selectedEnv={selectedEnv} className="ml-auto" />
      </div>

      <FilterDrawer open={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)}>
        <div className="flex flex-col gap-4">
          <ExportFilters filters={filters} setFilter={setFilter} channelList={channelList} />
        </div>
      </FilterDrawer>

      {/* Select-all-matching banner */}
      {allPageSelected && hasMoreThanPage && (
        <div className="mb-3 px-4 py-2 bg-blue-50 dark:bg-accent-900/30 rounded text-sm text-blue-800 dark:text-white flex items-center gap-3">
          {selected.size === totalCount
            ? <span>All <strong>{totalCount}</strong> matching events selected.</span>
            : <span>All <strong>{allIds.length}</strong> events on this page are selected.</span>
          }
          {selected.size < totalCount
            ? <button onClick={selectAllMatching} disabled={selectingAll} className="underline font-medium cursor-pointer disabled:opacity-50">
                {selectingAll ? "Loading…" : `Select all ${totalCount} matching events`}
              </button>
            : <button onClick={() => setSelected(new Set())} className="underline font-medium cursor-pointer">
                Clear selection
              </button>
          }
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-surface-700 border-b border-gray-200 dark:border-surface-600">
            <tr>
              <th className="px-3 py-2 whitespace-nowrap w-0">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    disabled={allIds.length === 0}
                    className="cursor-pointer"
                  />
                  <button
                    onClick={toggleAll}
                    disabled={allIds.length === 0}
                    className="text-xs text-gray-400 dark:text-surface-500 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {allPageSelected ? "Deselect" : "Select page"}
                  </button>
                </div>
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-surface-300 w-full">Title</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-surface-300 w-24">Date</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-surface-300 w-52">Channel</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-surface-300 w-48">Gaps</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-surface-300 w-32">Realms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 dark:text-surface-500">Loading…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 dark:text-surface-500">No events found</td></tr>
            ) : events.map((event) => {
              const missingRequired = getMissingRequired(event);
              const missingOptional = getMissingOptional(event);
              return (
                <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-surface-700/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(event.id)}
                      onChange={() => toggleOne(event.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Link to={`/events/${event.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 font-medium">
                        {event.title}
                      </Link>
                      {!event.realms_id && (pushResults[event.id]?.error || event.realms_push_error) && (
                        <span
                          title={pushResults[event.id]?.error || event.realms_push_error}
                          className="text-red-500 dark:text-red-400 cursor-help shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                          </svg>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-500 dark:text-surface-400 whitespace-nowrap">{event.start_date}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-surface-300 text-xs">{event.channel_id ? channelMap[event.channel_id] || `Channel ${event.channel_id}` : <span className="text-gray-400">No channel</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {missingRequired.map(({ label }) => (
                        <span key={label} className="px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          {label}
                        </span>
                      ))}
                      {missingOptional.map(({ label }) => (
                        <span key={label} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 dark:bg-surface-700 dark:text-surface-400">
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PushBadge event={event} pushResults={pushResults} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          total={totalCount ?? 0}
          onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
        />
      </div>

    </div>
  );
}
