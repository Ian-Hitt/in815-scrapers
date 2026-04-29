import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { fetchExportLogEvents, fetchChannels } from "../api.js";
import { useState } from "react";

const STATUS_BADGE = {
  created: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  pushed:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  failed:  "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-surface-400",
};

export default function ExportLogDetail() {
  const { id } = useParams();
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["export-log-events", id],
    queryFn: () => fetchExportLogEvents(id),
  });

  const { data: channelList } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const channelMap = Object.fromEntries((channelList ?? []).map((c) => [c.id, c.name]));

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (!data) return <p className="text-red-600 dark:text-red-400">Export log not found.</p>;

  const { log, events } = data;
  const filtered = statusFilter ? events.filter((e) => e.status === statusFilter) : events;

  const counts = { created: 0, updated: 0, pushed: 0, failed: 0, skipped: 0 };
  for (const e of events) counts[e.status] = (counts[e.status] || 0) + 1;

  return (
    <div>
      <Link to="/logs/exports" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">
        &larr; Back to Logs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold dark:text-surface-100">
          Export Log #{log.id}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-500 dark:text-surface-400">
          <span>{log.environment_name}</span>
          <span>{log.export_type}</span>
          <span className={`font-medium ${log.status === "completed" ? "text-green-700 dark:text-green-400" : log.status === "failed" ? "text-red-700 dark:text-red-400" : ""}`}>
            {log.status}
          </span>
          <span>{log.started_at ? new Date(log.started_at + "Z").toLocaleString() : ""}</span>
        </div>
      </div>

      {/* Summary + filter */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${!statusFilter ? "bg-gray-800 dark:bg-surface-700 text-white border-transparent" : "border-gray-300 dark:border-surface-600 text-gray-600 dark:text-surface-300 hover:bg-gray-100 dark:hover:bg-surface-700"}`}
        >
          All ({events.length})
        </button>
        {counts.created > 0 && (
          <button
            onClick={() => setStatusFilter("created")}
            className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statusFilter === "created" ? "bg-green-700 text-white border-transparent" : "border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"}`}
          >
            Created ({counts.created})
          </button>
        )}
        {counts.updated > 0 && (
          <button
            onClick={() => setStatusFilter("updated")}
            className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statusFilter === "updated" ? "bg-blue-700 text-white border-transparent" : "border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"}`}
          >
            Updated ({counts.updated})
          </button>
        )}
        {counts.pushed > 0 && (
          <button
            onClick={() => setStatusFilter("pushed")}
            className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statusFilter === "pushed" ? "bg-green-700 text-white border-transparent" : "border-green-300 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"}`}
          >
            Pushed ({counts.pushed})
          </button>
        )}
        {counts.failed > 0 && (
          <button
            onClick={() => setStatusFilter("failed")}
            className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statusFilter === "failed" ? "bg-red-700 text-white border-transparent" : "border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"}`}
          >
            Failed ({counts.failed})
          </button>
        )}
        {counts.skipped > 0 && (
          <button
            onClick={() => setStatusFilter("skipped")}
            className={`px-3 py-1.5 text-sm rounded-md border cursor-pointer ${statusFilter === "skipped" ? "bg-gray-700 text-white border-transparent" : "border-gray-300 dark:border-surface-600 text-gray-600 dark:text-surface-400 hover:bg-gray-100 dark:hover:bg-surface-700"}`}
          >
            Skipped ({counts.skipped})
          </button>
        )}
      </div>

      {/* Events table */}
      <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-surface-700 border-b border-gray-200 dark:border-surface-600">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Status</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Event</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Date</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Channel</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Realms ID</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No events</td></tr>
            ) : filtered.map((ev) => (
              <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700/50">
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[ev.status] || ""}`}>
                    {ev.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <Link to={`/events/${ev.event_id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">
                    {ev.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-500 dark:text-surface-400 whitespace-nowrap">
                  {ev.start_date}{ev.start_time ? ` ${ev.start_time}` : ""}
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-surface-300 text-xs">
                  {ev.channel_id ? channelMap[ev.channel_id] || `#${ev.channel_id}` : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500 dark:text-surface-400 font-mono">
                  {ev.realms_id || "—"}
                </td>
                <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400 max-w-xs truncate" title={ev.error || ""}>
                  {ev.error || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
