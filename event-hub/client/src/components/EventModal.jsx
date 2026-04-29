import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEvent } from "../api.js";
import SourceBadge from "./SourceBadge.jsx";

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-surface-200">{value}</dd>
    </div>
  );
}

export default function EventModal({ eventId, onClose }) {
  const { data: event, isLoading } = useQuery({
    queryKey: ["event", String(eventId)],
    queryFn: () => fetchEvent(eventId),
    enabled: eventId != null,
  });

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = orig; };
  }, []);

  const location = event ? [event.address, event.city, event.state, event.zip].filter(Boolean).join(", ") : null;

  return (
    <>
      {/* Backdrop — desktop only (mobile is full-screen) */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/50 z-40 hidden md:block"
      />

      {/* ── Desktop: centered modal ── */}
      <div className="fixed inset-0 z-50 hidden md:block overflow-y-auto" onClick={onClose}>
        <div className="flex items-start justify-center min-h-full p-8">
        <div className="bg-white dark:bg-surface-800 rounded-xl shadow-2xl w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b dark:border-surface-700">
            <div className="flex-1 pr-4">
              {isLoading
                ? <div className="h-6 w-48 bg-gray-200 dark:bg-surface-600 rounded animate-pulse" />
                : <h2 className="text-lg font-bold text-gray-900 dark:text-surface-100 leading-snug">{event?.title}</h2>
              }
              {event && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {event.sources?.map((s) => <SourceBadge key={s.source_name} source={s.source_name} />)}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer text-2xl leading-none shrink-0"
            >
              &times;
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            {isLoading && <p className="text-gray-400 dark:text-surface-500 text-sm">Loading...</p>}

            {event && (
              <>
                {event.image_url && (
                  <img src={event.image_url} alt="" className="w-full h-48 object-cover rounded-lg mb-4" />
                )}

                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
                  <Field label="Date" value={event.start_date} />
                  <Field label="Time" value={[event.start_time, event.end_time].filter(Boolean).join(" – ")} />
                  <Field label="Venue" value={event.venue} />
                  <Field label="Location" value={location} />
                  <Field label="Price" value={event.price} />
                  <Field label="Organizer" value={event.organizer} />
                  {event.recurring === 1 && (
                    <Field label="Recurrence" value={event.recurrence_frequency} />
                  )}
                </dl>

                {event.description && (
                  <div className="mb-4">
                    <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-1">Description</h3>
                    <p className="text-sm text-gray-700 dark:text-surface-300 whitespace-pre-wrap">{event.description}</p>
                  </div>
                )}

                {(event.url || event.external_url) && (
                  <div className="flex gap-3">
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">
                        Event page &rarr;
                      </a>
                    )}
                    {event.external_url && (
                      <a href={event.external_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">
                        External link &rarr;
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {event && (
            <div className="flex items-center justify-between px-5 py-3 border-t dark:border-surface-700">
              <button
                onClick={onClose}
                className="text-sm text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                <Link
                  to={`/events/${event.id}/edit`}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Edit
                </Link>
                <Link
                  to={`/events/${event.id}`}
                  className="text-sm px-3 py-1.5 bg-gray-800 dark:bg-surface-600 text-white rounded-md hover:bg-gray-700 dark:hover:bg-surface-500"
                >
                  Open full page &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Mobile: full-screen slide-up ── */}
      <div
        className="fixed inset-0 z-50 md:hidden bg-white dark:bg-surface-900 flex flex-col"
        style={{ paddingTop: "var(--sai-top, 0px)", paddingBottom: "var(--sai-bottom, 0px)" }}
      >
        {/* Mobile header bar */}
        <div className="flex items-center gap-3 px-4 h-12 border-b dark:border-surface-700 shrink-0 bg-white dark:bg-surface-900">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-blue-600 dark:text-white cursor-pointer text-sm font-medium py-2 pr-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="flex-1" />
          {event && (
            <>
              <Link
                to={`/events/${event.id}/edit`}
                className="text-sm text-blue-600 dark:text-white font-medium py-2 px-2"
              >
                Edit
              </Link>
              <Link
                to={`/events/${event.id}`}
                className="text-sm text-blue-600 dark:text-white font-medium py-2 pl-2"
              >
                Full page
              </Link>
            </>
          )}
        </div>

        {/* Mobile body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="text-gray-400 dark:text-surface-500 text-sm p-4">Loading...</p>}

          {event && (
            <>
              {event.image_url && (
                <img src={event.image_url} alt="" className="w-full h-52 object-cover" />
              )}

              <div className="px-4 py-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-surface-100 leading-snug mb-2">{event.title}</h2>

                {event.sources?.length > 0 && (
                  <div className="flex gap-1 mb-4 flex-wrap">
                    {event.sources.map((s) => <SourceBadge key={s.source_name} source={s.source_name} />)}
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
                  <Field label="Date" value={event.start_date} />
                  <Field label="Time" value={[event.start_time, event.end_time].filter(Boolean).join(" – ")} />
                  <Field label="Venue" value={event.venue} />
                  <Field label="Location" value={location} />
                  <Field label="Price" value={event.price} />
                  <Field label="Organizer" value={event.organizer} />
                  {event.recurring === 1 && (
                    <Field label="Recurrence" value={event.recurrence_frequency} />
                  )}
                </dl>

                {event.description && (
                  <div className="mb-4">
                    <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-1">Description</h3>
                    <p className="text-sm text-gray-700 dark:text-surface-300 whitespace-pre-wrap leading-relaxed">{event.description}</p>
                  </div>
                )}

                {(event.url || event.external_url) && (
                  <div className="flex flex-col gap-3 mt-4">
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noreferrer" className="block text-center text-sm font-medium text-blue-600 dark:text-white border border-blue-200 dark:border-accent-800 rounded-lg px-4 py-3">
                        View event page
                      </a>
                    )}
                    {event.external_url && (
                      <a href={event.external_url} target="_blank" rel="noreferrer" className="block text-center text-sm font-medium text-blue-600 dark:text-white border border-blue-200 dark:border-accent-800 rounded-lg px-4 py-3">
                        View external link
                      </a>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
