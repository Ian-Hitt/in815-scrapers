import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { fetchImports, fetchExportLogs, fetchEnrichmentLogs } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";
import { useNotifications, useCompletionNotifier } from "../hooks/useNotifications.js";

const TABS = [
  { key: "imports", label: "Import" },
  { key: "exports", label: "Export" },
  { key: "enrichment", label: "Enrichment" },
];

function StatusBadge({ status }) {
  const cls =
    status === "completed" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400" :
    status === "failed" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400" :
    status === "aborted" ? "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-400" :
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400";
  const label = status === "running" ? "in progress" : status;
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
}

function ImportTable({ logs }) {
  if (!logs?.length) {
    return <p className="text-gray-400 dark:text-surface-500">No imports yet. Go to the Sources page to get started.</p>;
  }
  return (
    <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
        <thead className="bg-gray-50 dark:bg-surface-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Source</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Rows</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">New</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Updated</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Dupes</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Errors</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
          {logs.map((log) => (
            <tr key={log.id} className="dark:bg-surface-800">
              <td className="px-4 py-3 text-sm"><SourceBadge source={log.source_name} /></td>
              <td className="px-4 py-3 text-sm"><StatusBadge status={log.status} /></td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{log.total_rows}</td>
              <td className="px-4 py-3 text-sm text-green-700 dark:text-green-400">{log.new_events}</td>
              <td className="px-4 py-3 text-sm text-blue-700 dark:text-surface-200">{log.updated_events}</td>
              <td className="px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">{log.duplicate_events}</td>
              <td className="px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {log.errors || 0}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{log.started_at?.replace("T", " ").slice(0, 19)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EXPORT_TYPE_LABELS = {
  "push-ready": "Push All Ready",
  "push-batch": "Batch Push",
};

function ExportTable({ logs }) {
  const navigate = useNavigate();
  if (!logs?.length) {
    return <p className="text-gray-400 dark:text-surface-500">No exports yet. Go to the Export page to push events to Realms.</p>;
  }
  return (
    <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
        <thead className="bg-gray-50 dark:bg-surface-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Environment</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Total</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Created</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Updated</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Skipped</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Failed</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
          {logs.map((log) => (
            <tr key={log.id} onClick={() => navigate(`/logs/exports/${log.id}`)} className="hover:bg-gray-50 dark:hover:bg-surface-700/50 cursor-pointer">
              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-surface-100">{log.environment_name}</td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{EXPORT_TYPE_LABELS[log.export_type] || log.export_type}</td>
              <td className="px-4 py-3 text-sm"><StatusBadge status={log.status} /></td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{log.total_events}</td>
              <td className="px-4 py-3 text-sm text-green-700 dark:text-green-400">{log.created_events || 0}</td>
              <td className="px-4 py-3 text-sm text-blue-700 dark:text-blue-400">{log.updated_events || 0}</td>
              <td className="px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">{log.skipped_events}</td>
              <td className="px-4 py-3 text-sm text-red-700 dark:text-red-400">{log.failed_events}</td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{log.started_at?.replace("T", " ").slice(0, 19)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FUNCTION_LABELS = {
  "rrule-convert": "RRULE Convert",
  "clear-multiple-dates": "Clear Multiple Dates",
  "auto-categorize": "Auto-Categorize",
  "archive-past": "Archive Past Events",
  "unarchive": "Unarchive Event",
  "geocode-zips": "Geocode Zips",
  "geocode-addresses": "Geocode Addresses",
  "geocode-apply": "Apply Geocode",
  "merge-duplicates": "Merge Event Duplicates",
  "dismiss-duplicate": "Dismiss Event Duplicate",
  "merge-channel-duplicates": "Merge Channel Duplicates",
  "dismiss-channel-duplicate": "Dismiss Channel Duplicate",
  "delete-empty-channels": "Delete Empty Channels",
  "backfill-avatars": "Backfill Channel Avatars",
  "dismiss-attraction": "Dismiss Attraction",
  "undismiss-attraction": "Restore Attraction",
  "city-audit-accept": "Accept City",
  "city-audit-dismiss": "Dismiss City",
  "sports-fallback-images": "Sports Fallback Images",
};

function EnrichmentTable({ logs }) {
  const navigate = useNavigate();

  if (!logs?.length) {
    return <p className="text-gray-400 dark:text-surface-500">No enrichment runs yet. Go to the Enrichment page to curate events.</p>;
  }
  return (
    <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
        <thead className="bg-gray-50 dark:bg-surface-700">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Function</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Total</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Changed</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Skipped</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Errors</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
          {logs.map((log) => (
            <tr
              key={log.id}
              onClick={() => navigate(`/logs/enrichment/${log.id}`)}
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-700/50"
            >
              <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-surface-100">
                {FUNCTION_LABELS[log.function_name] || log.function_name}
              </td>
              <td className="px-4 py-3 text-sm"><StatusBadge status={log.status} /></td>
              <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{log.total_events}</td>
              <td className="px-4 py-3 text-sm text-green-700 dark:text-green-400">{log.changed_events}</td>
              <td className="px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">{log.skipped_events}</td>
              <td className="px-4 py-3 text-sm text-red-700 dark:text-red-400">{log.errors}</td>
              <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">{log.started_at?.replace("T", " ").slice(0, 19)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ImportLog() {
  const { tab = "imports" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useNotifications();

  useEffect(() => {
    const key = tab === "imports" ? "imports" : tab === "exports" ? "exportLogs" : "enrichmentLogs";
    queryClient.invalidateQueries({ queryKey: [key] });
  }, [tab, queryClient]);

  const { data: importLogs, isLoading: importLoading, error: importError } = useQuery({
    queryKey: ["imports"],
    queryFn: fetchImports,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((l) => l.status === "running" || l.status === "scraping")) return 3000;
      return false;
    },
  });

  const { data: exportLogs, isLoading: exportLoading, error: exportError } = useQuery({
    queryKey: ["exportLogs"],
    queryFn: fetchExportLogs,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((l) => l.status === "running")) return 3000;
      return false;
    },
  });

  const { data: enrichmentLogs, isLoading: enrichmentLoading, error: enrichmentError } = useQuery({
    queryKey: ["enrichmentLogs"],
    queryFn: fetchEnrichmentLogs,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((l) => l.status === "running")) return 3000;
      return false;
    },
  });

  const getLogId = useCallback((l) => l.id, []);
  const getLogStatus = useCallback((l) => l.status, []);
  const runningStatuses = ["running", "scraping"];

  useCompletionNotifier(importLogs, {
    getKey: getLogId,
    getStatus: getLogStatus,
    runningStatuses,
    onComplete: useCallback((l) => {
      notify(`Import ${l.status === "failed" ? "failed" : "complete"}: ${l.source_name}`, {
        body: l.status === "failed" ? l.error_details : `${l.new_events} new, ${l.updated_events} updated`,
        type: l.status === "failed" ? "error" : "success",
      });
    }, [notify]),
  });

  useCompletionNotifier(exportLogs, {
    getKey: getLogId,
    getStatus: getLogStatus,
    runningStatuses: ["running"],
    onComplete: useCallback((l) => {
      const type = EXPORT_TYPE_LABELS[l.export_type] || l.export_type;
      notify(`Export ${l.status === "failed" ? "failed" : "complete"}: ${type}`, {
        body: `${l.created_events || 0} created, ${l.updated_events || 0} updated, ${l.failed_events} failed`,
        type: l.status === "failed" ? "error" : "success",
      });
    }, [notify]),
  });

  useCompletionNotifier(enrichmentLogs, {
    getKey: getLogId,
    getStatus: getLogStatus,
    runningStatuses: ["running"],
    onComplete: useCallback((l) => {
      const fn = FUNCTION_LABELS[l.function_name] || l.function_name;
      notify(`Enrichment ${l.status === "failed" ? "failed" : "complete"}: ${fn}`, {
        body: `${l.changed_events} changed, ${l.skipped_events} skipped`,
        type: l.status === "failed" ? "error" : "success",
      });
    }, [notify]),
  });

  const isLoading = tab === "imports" ? importLoading : tab === "exports" ? exportLoading : enrichmentLoading;
  const error = tab === "imports" ? importError : tab === "exports" ? exportError : enrichmentError;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 dark:text-surface-100">Logs</h1>

      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-surface-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(`/logs/${t.key}`)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t.key
                ? "border-green-500 text-green-600 dark:text-green-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500 dark:text-surface-400">Loading...</p>}
      {error && <p className="text-red-600 dark:text-red-400">Error: {error.message}</p>}

      {!isLoading && !error && tab === "imports" && <ImportTable logs={importLogs} />}
      {!isLoading && !error && tab === "exports" && <ExportTable logs={exportLogs} />}
      {!isLoading && !error && tab === "enrichment" && <EnrichmentTable logs={enrichmentLogs} />}
    </div>
  );
}
