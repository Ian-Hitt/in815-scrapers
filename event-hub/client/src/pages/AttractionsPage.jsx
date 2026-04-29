import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAttractionCandidates, fetchDismissedEvents, dismissAttraction, undismissAttraction } from "../api.js";

function CandidateRow({ event, onDismiss, isPending }) {
  return (
    <tr className="border-t border-gray-100 dark:border-surface-700">
      <td className="py-2 pr-4">
        <Link to={`/events/${event.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 font-medium">
          {event.title}
        </Link>
      </td>
      <td className="py-2 pr-4 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">
        {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` → ${event.end_date}` : ""}
        {event.span_days > 0 && <span className="ml-1 text-xs text-gray-400">({event.span_days}d)</span>}
      </td>
      <td className="py-2 pr-4 text-sm text-gray-500 dark:text-surface-400">{event.recurrence_frequency || "—"}</td>
      <td className="py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{event.source_name}</td>
      <td className="py-2 text-right">
        <button
          onClick={() => onDismiss(event.id)}
          disabled={isPending}
          className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 cursor-pointer"
        >
          Dismiss
        </button>
      </td>
    </tr>
  );
}

function DismissedRow({ event, onUndismiss, isPending }) {
  return (
    <tr className="border-t border-gray-100 dark:border-surface-700">
      <td className="py-2 pr-4 text-sm text-gray-600 dark:text-surface-300">
        <Link to={`/events/${event.id}`} className="hover:underline">
          {event.title}
        </Link>
      </td>
      <td className="py-2 pr-4 text-sm text-gray-400 dark:text-surface-500 whitespace-nowrap">
        {event.start_date}{event.end_date && event.end_date !== event.start_date ? ` → ${event.end_date}` : ""}
      </td>
      <td className="py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{event.recurrence_frequency || "—"}</td>
      <td className="py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{event.source_name}</td>
      <td className="py-2 text-right">
        <button
          onClick={() => onUndismiss(event.id)}
          disabled={isPending}
          className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 disabled:opacity-50 cursor-pointer"
        >
          Restore
        </button>
      </td>
    </tr>
  );
}

export default function AttractionsPage() {
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ["attraction-candidates"],
    queryFn: fetchAttractionCandidates,
  });

  const { data: dismissed = [], isLoading: loadingDismissed } = useQuery({
    queryKey: ["dismissed-events"],
    queryFn: fetchDismissedEvents,
  });

  const dismiss = useMutation({
    mutationFn: dismissAttraction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attraction-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dismissed-events"] });
    },
  });

  const undismiss = useMutation({
    mutationFn: undismissAttraction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attraction-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dismissed-events"] });
    },
  });

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/curate" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">&larr; Enrichment</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1 dark:text-surface-100">Possible Attractions</h1>
      <p className="text-gray-500 dark:text-surface-400 mb-8 text-sm">
        Events flagged by heuristic: <strong>daily</strong> recurrence, or a span &gt;90 days with no start time. These may be venue attractions or exhibitions rather than discrete events. Dismissed events are kept in the DB so they won't re-import as duplicates.
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3 dark:text-surface-100">
          Candidates {!loadingCandidates && <span className="text-gray-400 font-normal text-base">({candidates.length})</span>}
        </h2>

        {loadingCandidates ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-surface-500">No candidates — all flagged events have been reviewed.</p>
        ) : (
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-surface-500 uppercase tracking-wide">
                  <th className="px-4 pt-3 pb-2 font-medium">Title</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Dates</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Recurrence</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Source</th>
                  <th className="px-4 pt-3 pb-2"></th>
                </tr>
              </thead>
              <tbody className="px-4">
                {candidates.map((ev) => (
                  <tr key={ev.id} className="border-t border-gray-100 dark:border-surface-700">
                    <td className="px-4 py-2 pr-4">
                      <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 font-medium">
                        {ev.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-500 dark:text-surface-400 whitespace-nowrap">
                      {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` → ${ev.end_date}` : ""}
                      {ev.span_days > 0 && <span className="ml-1 text-xs text-gray-400">({ev.span_days}d)</span>}
                    </td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-500 dark:text-surface-400">{ev.recurrence_frequency || "—"}</td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{ev.source_name}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => dismiss.mutate(ev.id)}
                        disabled={dismiss.isPending}
                        className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50 cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 dark:text-surface-100">
          Dismissed {!loadingDismissed && dismissed.length > 0 && <span className="text-gray-400 font-normal text-base">({dismissed.length})</span>}
        </h2>

        {loadingDismissed ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : dismissed.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-surface-500">Nothing dismissed yet.</p>
        ) : (
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-surface-500 uppercase tracking-wide">
                  <th className="px-4 pt-3 pb-2 font-medium">Title</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Dates</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Recurrence</th>
                  <th className="px-4 pt-3 pb-2 font-medium">Source</th>
                  <th className="px-4 pt-3 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {dismissed.map((ev) => (
                  <tr key={ev.id} className="border-t border-gray-100 dark:border-surface-700">
                    <td className="px-4 py-2 pr-4 text-sm text-gray-500 dark:text-surface-400">
                      <Link to={`/events/${ev.id}`} className="hover:underline">
                        {ev.title}
                      </Link>
                    </td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-400 dark:text-surface-500 whitespace-nowrap">
                      {ev.start_date}{ev.end_date && ev.end_date !== ev.start_date ? ` → ${ev.end_date}` : ""}
                    </td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{ev.recurrence_frequency || "—"}</td>
                    <td className="px-4 py-2 pr-4 text-sm text-gray-400 dark:text-surface-500">{ev.source_name}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => undismiss.mutate(ev.id)}
                        disabled={undismiss.isPending}
                        className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 disabled:opacity-50 cursor-pointer"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
