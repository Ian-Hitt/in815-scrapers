import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { fetchEnrichmentChanges, fetchEnrichmentLogs } from "../api.js";

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

function EventLink({ change }) {
  if (!change.event_id) return <span>{change.event_title || "—"}</span>;
  return (
    <Link to={`/events/${change.event_id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">
      {change.event_title || `#${change.event_id}`}
    </Link>
  );
}

function CategorizeTable({ changes }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 dark:bg-surface-700 border-b border-gray-200 dark:border-surface-600">
        <tr>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Event</th>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Rule Matched</th>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Categories</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
        {changes.length === 0 ? (
          <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No individual changes recorded</td></tr>
        ) : changes.map((c) => (
          <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-surface-700/50">
            <td className="px-4 py-2 text-gray-700 dark:text-surface-300"><EventLink change={c} /></td>
            <td className="px-4 py-2 text-gray-500 dark:text-surface-400 font-mono text-xs max-w-xs truncate" title={c.old_value || ""}>{c.old_value || "—"}</td>
            <td className="px-4 py-2 text-green-700 dark:text-green-400">{c.new_value || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DefaultTable({ changes }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 dark:bg-surface-700 border-b border-gray-200 dark:border-surface-600">
        <tr>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Event</th>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Field</th>
          <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-surface-300">Value</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
        {changes.length === 0 ? (
          <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No individual changes recorded</td></tr>
        ) : changes.map((c) => (
          <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-surface-700/50">
            <td className="px-4 py-2 text-gray-700 dark:text-surface-300"><EventLink change={c} /></td>
            <td className="px-4 py-2 font-mono text-gray-600 dark:text-surface-400">{c.field_name}</td>
            <td className="px-4 py-2 text-green-700 dark:text-green-400 max-w-xs truncate" title={c.new_value || ""}>{c.new_value || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function EnrichmentLogDetail() {
  const { id } = useParams();

  const { data: logs } = useQuery({
    queryKey: ["enrichmentLogs"],
    queryFn: fetchEnrichmentLogs,
  });
  const log = logs?.find((l) => l.id === parseInt(id));

  const { data: changes, isLoading } = useQuery({
    queryKey: ["enrichment-changes", id],
    queryFn: () => fetchEnrichmentChanges(id),
  });

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (!log) return <p className="text-red-600 dark:text-red-400">Enrichment log not found.</p>;

  const isCategorize = log.function_name === "auto-categorize";

  return (
    <div>
      <Link to="/logs/enrichment" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">
        &larr; Back to Logs
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold dark:text-surface-100">
          Enrichment Log #{log.id}
        </h1>
        <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-500 dark:text-surface-400">
          <span>{FUNCTION_LABELS[log.function_name] || log.function_name}</span>
          <span className={`font-medium ${log.status === "completed" ? "text-green-700 dark:text-green-400" : log.status === "failed" ? "text-red-700 dark:text-red-400" : ""}`}>
            {log.status}
          </span>
          <span>{log.started_at ? new Date(log.started_at + "Z").toLocaleString() : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-1 text-sm text-gray-500 dark:text-surface-400">
          <span>{log.total_events} total</span>
          <span className="text-green-700 dark:text-green-400">{log.changed_events} changed</span>
          <span className="text-yellow-700 dark:text-yellow-400">{log.skipped_events} skipped</span>
          {log.errors > 0 && <span className="text-red-700 dark:text-red-400">{log.errors} errors</span>}
        </div>
      </div>

      <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-hidden">
        {isCategorize
          ? <CategorizeTable changes={changes || []} />
          : <DefaultTable changes={changes || []} />
        }
      </div>
    </div>
  );
}
