import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvent, deleteEvent, fetchCategories, addEventCategory, removeEventCategory, pushEventToRealms, disconnectEventFromRealms, fetchRealmsEnvironments, setEventFeatured, fetchEventChangelog } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";
import { getMissingRequired, getMissingOptional, isReady } from "../exportFields.js";

const ACTION_STYLES = {
  imported:       "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  enriched:       "bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-surface-300",
  approved:       "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "batch-approved": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  edited:         "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  exported:       "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
};

function ChangelogEntry({ entry }) {
  const [open, setOpen] = useState(false);
  const style = ACTION_STYLES[entry.action] || ACTION_STYLES.enriched;
  const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;
  const label = entry.tool ? `${entry.action} · ${entry.tool}` : entry.action;
  const ts = new Date(entry.created_at).toLocaleString();

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style}`}>{label}</span>
        <span className="text-xs text-gray-400 dark:text-surface-500">{ts}</span>
        {hasChanges && (
          <button onClick={() => setOpen((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600 dark:text-surface-500 dark:hover:text-surface-300 cursor-pointer">
            {open ? "hide changes" : `${Object.keys(entry.changes).length} field${Object.keys(entry.changes).length !== 1 ? "s" : ""} changed`}
          </button>
        )}
      </div>
      {open && hasChanges && (
        <ul className="ml-2 space-y-0.5">
          {Object.entries(entry.changes).map(([field, { from, to }]) => (
            <li key={field} className="text-xs text-gray-600 dark:text-surface-400 font-mono">
              <span className="font-semibold text-gray-700 dark:text-surface-300">{field}:</span>{" "}
              <span className="line-through text-red-400">{from === null || from === "" ? "—" : String(from)}</span>
              {" → "}
              <span className="text-green-600 dark:text-green-400">{to === null || to === "" ? "—" : String(to)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Changelog({ eventId }) {
  const { data, isLoading } = useQuery({
    queryKey: ["changelog", eventId],
    queryFn: () => fetchEventChangelog(eventId),
  });

  if (isLoading) return <p className="text-sm text-gray-400 dark:text-surface-500">Loading…</p>;
  if (!data?.length) return <p className="text-sm text-gray-400 dark:text-surface-500">No history yet.</p>;

  return (
    <ul className="space-y-3">
      {data.map((entry) => <ChangelogEntry key={entry.id} entry={entry} />)}
    </ul>
  );
}

function ExportReadiness({ event }) {
  const missingRequired = getMissingRequired(event);
  const missingOptional = getMissingOptional(event);
  if (missingRequired.length === 0 && missingOptional.length === 0) {
    return (
      <div className="mt-6 border-t dark:border-surface-700 pt-4">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">✓ All fields present.</p>
      </div>
    );
  }
  return (
    <div className="mt-6 border-t dark:border-surface-700 pt-4">
      <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-2">Export readiness</h3>
      <ul className="space-y-1">
        {missingRequired.map(({ label, note }) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            <span className="text-red-500 mt-0.5">✕</span>
            <span>
              <span className="font-medium text-gray-800 dark:text-surface-200">{label}</span>
              <span className="text-gray-400 dark:text-surface-500 ml-1">— {note}</span>
            </span>
          </li>
        ))}
        {missingOptional.map(({ label, note }) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            <span className="text-amber-400 mt-0.5">–</span>
            <span>
              <span className="text-gray-600 dark:text-surface-300">{label}</span>
              <span className="text-gray-400 dark:text-surface-500 ml-1">— {note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CategoryPicker({ event }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: tree } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const add = useMutation({
    mutationFn: (catId) => addEventCategory(event.id, catId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["event", String(event.id)] }); setAdding(false); },
  });
  const remove = useMutation({
    mutationFn: (catId) => removeEventCategory(event.id, catId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", String(event.id)] }),
  });

  const assignedIds = new Set(event.taxonomy?.map((c) => c.id));

  const options = tree?.flatMap((parent) => [
    { id: parent.id, label: parent.name, isParent: true },
    ...parent.subcategories.map((sub) => ({ id: sub.id, label: `${parent.name} › ${sub.name}`, isParent: false })),
  ]).filter((o) => !assignedIds.has(o.id)) ?? [];

  return (
    <div className="mt-6 border-t dark:border-surface-700 pt-4">
      <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-2">Categories</h3>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {event.taxonomy?.map((cat) => (
          <span key={cat.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
            {cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name}
            <button onClick={() => remove.mutate(cat.id)} className="hover:text-indigo-600 dark:hover:text-indigo-300 cursor-pointer leading-none">&times;</button>
          </span>
        ))}
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-gray-400 hover:text-blue-600 dark:hover:text-accent-400 cursor-pointer px-1">+ Add</button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2 items-center">
          <select
            autoFocus
            defaultValue=""
            onChange={(e) => { if (e.target.value) add.mutate(parseInt(e.target.value)); }}
            className="border border-gray-300 dark:border-surface-600 rounded px-2 py-1 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200"
          >
            <option value="" disabled>Select category...</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.isParent ? o.label : `  ${o.label}`}</option>
            ))}
          </select>
          <button onClick={() => setAdding(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer">Cancel</button>
        </div>
      )}
    </div>
  );
}

function RealmsPushRow({ event, env, pushRecord }) {
  const queryClient = useQueryClient();
  const [pushError, setPushError] = useState(null);

  const push = useMutation({
    mutationFn: (force = false) => pushEventToRealms(event.id, { force, environmentId: env.id }),
    onSuccess: () => {
      setPushError(null);
      queryClient.invalidateQueries({ queryKey: ["event", String(event.id)] });
    },
    onError: (err) => setPushError(err.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectEventFromRealms(event.id, env.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", String(event.id)] }),
  });

  const ready = isReady(event);
  const realmsId = pushRecord?.realms_id;

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-xs font-medium text-gray-500 dark:text-surface-400 min-w-20 pt-1">{env.name}</span>
      {realmsId ? (
        <div className="flex-1">
          <p className="text-sm text-green-700 dark:text-green-400 mb-1">
            ✓ <span className="font-mono">{realmsId}</span>
            {pushRecord.pushed_at && (
              <span className="text-gray-400 dark:text-surface-500 ml-2 text-xs">({pushRecord.pushed_at})</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => push.mutate(true)}
              disabled={push.isPending || disconnect.isPending}
              className="px-2 py-1 text-xs font-medium rounded bg-gray-200 dark:bg-surface-700 text-gray-800 dark:text-surface-200 hover:bg-gray-300 dark:hover:bg-surface-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {push.isPending ? "Syncing…" : "Re-sync"}
            </button>
            <button
              onClick={() => disconnect.mutate()}
              disabled={push.isPending || disconnect.isPending}
              className="px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {disconnect.isPending ? "…" : "Disconnect"}
            </button>
            {pushError && <span className="text-xs text-red-600 dark:text-red-400">{pushError}</span>}
          </div>
        </div>
      ) : !ready ? (
        <span className="text-xs text-gray-400 dark:text-surface-500 pt-1">Not ready</span>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => push.mutate(false)}
            disabled={push.isPending}
            className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {push.isPending ? "Pushing…" : "Push"}
          </button>
          {(pushError || pushRecord?.push_error) && (
            <span className="text-xs text-red-600 dark:text-red-400">{pushError || pushRecord.push_error}</span>
          )}
        </div>
      )}
    </div>
  );
}

function RealmsPush({ event }) {
  const { data: environments } = useQuery({
    queryKey: ["realms-environments"],
    queryFn: fetchRealmsEnvironments,
  });

  if (!environments?.length) return null;

  return (
    <div className="mt-6 border-t dark:border-surface-700 pt-4">
      <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-2">Realms.tv</h3>
      <div className="divide-y divide-gray-100 dark:divide-surface-700">
        {environments.map((env) => {
          const pushRecord = event.realms_pushes?.find((p) => p.environment_id === env.id);
          return (
            <RealmsPushRow
              key={env.id}
              event={event}
              env={env}
              pushRecord={pushRecord}
            />
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-surface-200">{value}</dd>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id),
  });

  const remove = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/");
    },
  });

  const isFeatured = event?.taxonomy?.some((c) => c.slug === "featured") ?? false;

  const toggleFeatured = useMutation({
    mutationFn: (featured) => setEventFeatured(id, featured),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", id] }),
  });

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Error: {error.message}</p>;
  if (!event) return <p className="dark:text-surface-300">Not found</p>;

  const location = [event.address, event.city, event.state, event.zip].filter(Boolean).join(", ");

  return (
    <div>
      <Link to="/" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-flex items-center gap-1 py-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to events
      </Link>

      <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-4 md:p-6">
        {/* Mobile: image on top, full-width */}
        {event.image_url && (
          <img src={event.image_url} alt="" className="w-full h-44 object-cover rounded-lg mb-4 md:hidden" />
        )}

        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold dark:text-surface-100">{event.title}</h1>
            <div className="flex gap-1 mt-2 flex-wrap">
              {event.sources?.map((s) => (
                <SourceBadge key={s.source_name} source={s.source_name} />
              ))}
            </div>
          </div>
          <div className="flex items-start gap-3 shrink-0">
            <button
              onClick={() => toggleFeatured.mutate(!isFeatured)}
              disabled={toggleFeatured.isPending}
              title={isFeatured ? "Remove from featured" : "Mark as featured"}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition-colors ${isFeatured ? "bg-yellow-400 text-yellow-900 hover:bg-yellow-300" : "bg-gray-100 dark:bg-surface-700 text-gray-600 dark:text-surface-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill={isFeatured ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {isFeatured ? "Featured" : "Feature"}
            </button>
            <Link
              to={`/events/${event.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </Link>
            {/* Desktop: small image thumbnail */}
            {event.image_url && (
              <img src={event.image_url} alt="" className="hidden md:block w-32 h-24 object-cover rounded" />
            )}
          </div>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-4">
          <Field label="Date" value={event.start_date} />
          <Field label="Time" value={[event.start_time, event.end_time].filter(Boolean).join(" - ")} />
          <Field label="Venue" value={event.venue} />
          <Field label="Location" value={location} />
          <Field label="Category" value={event.category} />
          <Field label="Price" value={event.price} />
          <Field label="Contact" value={event.contact} />
          <Field label="Organizer" value={event.organizer} />
          {event.recurring === 1 && (
            <>
              <Field label="Recurrence" value={event.recurrence_frequency} />
              <Field label="Until" value={event.recurrence_end_date} />
              <Field label="RRULE" value={event.rrule} />
            </>
          )}
        </dl>

        {event.description && (
          <div className="mt-6">
            <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-1">Description</h3>
            <p className="text-sm text-gray-700 dark:text-surface-300 whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:gap-3">
          {event.ticket_url && (
            <a href={event.ticket_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
              Buy tickets &rarr;
            </a>
          )}
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer py-2 sm:py-0">
              Event page &rarr;
            </a>
          )}
          {event.external_url && event.external_url !== event.ticket_url && (
            <a href={event.external_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer py-2 sm:py-0">
              External link &rarr;
            </a>
          )}
        </div>

        {event.sources?.length > 0 && (
          <div className="mt-6 border-t dark:border-surface-700 pt-4">
            <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-2">Source Provenance</h3>
            <ul className="space-y-2 text-sm">
              {event.sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-1.5 md:gap-2">
                  <SourceBadge source={s.source_name} />
                  <span className="text-gray-500 dark:text-surface-400 text-xs md:text-sm">ID: {s.source_id || "n/a"}</span>
                  <span className="text-gray-400 dark:text-surface-500 text-xs md:text-sm">imported {s.imported_at}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <CategoryPicker event={event} />
        <ExportReadiness event={event} />
        <RealmsPush event={event} />

        <div className="mt-6 border-t dark:border-surface-700 pt-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-3">Change History</h3>
          <Changelog eventId={event.id} />
        </div>

        <div className="mt-6 border-t dark:border-surface-700 pt-4">
          <button
            onClick={() => { if (confirm("Delete this event?")) remove.mutate(); }}
            className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 cursor-pointer"
          >
            Delete event
          </button>
        </div>
      </div>
    </div>
  );
}
