import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchChannels } from "../api.js";

const EMPTY = {
  title: "",
  start_date: "",
  start_time: "",
  end_date: "",
  end_time: "",
  description: "",
  venue: "",
  address: "",
  city: "",
  state: "IL",
  zip: "",
  latitude: "",
  longitude: "",
  price: "",
  tags: "",
  image_url: "",
  url: "",
  external_url: "",
  ticket_url: "",
  contact: "",
  organizer: "",
  is_online: false,
  recurring: false,
  recurrence_frequency: "",
  recurrence_end_date: "",
  rrule: "",
  channel_id: "",
};

function toFormState(event) {
  if (!event) return { ...EMPTY };
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) {
    const v = event[k];
    if (v == null) continue;
    if (k === "is_online" || k === "recurring") out[k] = v === 1 || v === true;
    else out[k] = String(v);
  }
  return out;
}

function toPayload(state) {
  const payload = {};
  for (const [k, v] of Object.entries(state)) {
    if (k === "is_online" || k === "recurring") {
      payload[k] = v ? 1 : 0;
    } else if (k === "latitude" || k === "longitude") {
      payload[k] = v === "" ? null : Number(v);
    } else if (k === "channel_id") {
      payload[k] = v === "" ? null : Number(v);
    } else {
      payload[k] = v === "" ? null : v;
    }
  }
  return payload;
}

const inputCls = "w-full border border-gray-300 dark:border-surface-600 rounded px-3 py-2 text-sm bg-white dark:bg-surface-700 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-medium text-gray-600 dark:text-surface-300 uppercase mb-1";

function Field({ label, children, span = 1 }) {
  const colClass = span === 2 ? "md:col-span-2" : span === 3 ? "md:col-span-3" : "";
  return (
    <div className={colClass}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

export default function EventForm({ initialEvent, onSubmit, onCancel, submitLabel = "Save", isSubmitting = false, error = null }) {
  const [state, setState] = useState(() => toFormState(initialEvent));
  const { data: channels } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  function set(k, v) {
    setState((s) => ({ ...s, [k]: v }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!state.title.trim() || !state.start_date.trim()) return;
    onSubmit(toPayload(state));
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-surface-800 rounded-lg shadow p-4 md:p-6 space-y-6">
      {/* Basics */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-surface-200 mb-3">Basics</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Title *" span={3}>
            <input type="text" required value={state.title} onChange={(e) => set("title", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Start date *">
            <input type="date" required value={state.start_date} onChange={(e) => set("start_date", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Start time">
            <input type="time" value={state.start_time} onChange={(e) => set("start_time", e.target.value)} className={inputCls} />
          </Field>
          <Field label="End time">
            <input type="time" value={state.end_time} onChange={(e) => set("end_time", e.target.value)} className={inputCls} />
          </Field>
          <Field label="End date">
            <input type="date" value={state.end_date} onChange={(e) => set("end_date", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Channel" span={2}>
            <select value={state.channel_id} onChange={(e) => set("channel_id", e.target.value)} className={inputCls}>
              <option value="">— None —</option>
              {channels?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" span={3}>
            <textarea rows={5} value={state.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
          </Field>
        </div>
      </section>

      {/* Location */}
      <section className="border-t dark:border-surface-700 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-surface-200 mb-3">Location</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Venue" span={3}>
            <input type="text" value={state.venue} onChange={(e) => set("venue", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Street address" span={3}>
            <input type="text" value={state.address} onChange={(e) => set("address", e.target.value)} className={inputCls} />
          </Field>
          <Field label="City">
            <input type="text" value={state.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
          </Field>
          <Field label="State">
            <input type="text" maxLength={2} value={state.state} onChange={(e) => set("state", e.target.value.toUpperCase())} className={inputCls} />
          </Field>
          <Field label="ZIP">
            <input type="text" value={state.zip} onChange={(e) => set("zip", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Latitude">
            <input type="number" step="any" value={state.latitude} onChange={(e) => set("latitude", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Longitude">
            <input type="number" step="any" value={state.longitude} onChange={(e) => set("longitude", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Online event">
            <label className="flex items-center gap-2 h-[38px] text-sm text-gray-700 dark:text-surface-200">
              <input type="checkbox" checked={state.is_online} onChange={(e) => set("is_online", e.target.checked)} className="accent-blue-600 w-4 h-4 cursor-pointer" />
              Held online
            </label>
          </Field>
        </div>
      </section>

      {/* Details */}
      <section className="border-t dark:border-surface-700 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-surface-200 mb-3">Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Organizer">
            <input type="text" value={state.organizer} onChange={(e) => set("organizer", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Contact">
            <input type="text" value={state.contact} onChange={(e) => set("contact", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Price">
            <input type="text" placeholder="Free, $10, $5–$20…" value={state.price} onChange={(e) => set("price", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tags (semicolon separated)" span={3}>
            <input type="text" placeholder="music; festival" value={state.tags} onChange={(e) => set("tags", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Image URL" span={3}>
            <input type="url" value={state.image_url} onChange={(e) => set("image_url", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Event URL" span={3}>
            <input type="url" value={state.url} onChange={(e) => set("url", e.target.value)} className={inputCls} />
          </Field>
          <Field label="External URL" span={3}>
            <input type="url" value={state.external_url} onChange={(e) => set("external_url", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Ticket URL" span={3}>
            <input type="url" value={state.ticket_url} onChange={(e) => set("ticket_url", e.target.value)} className={inputCls} />
          </Field>
        </div>
      </section>

      {/* Recurrence */}
      <section className="border-t dark:border-surface-700 pt-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-surface-200 mb-3">Recurrence</h2>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-surface-200 mb-3">
          <input type="checkbox" checked={state.recurring} onChange={(e) => set("recurring", e.target.checked)} className="accent-blue-600 w-4 h-4 cursor-pointer" />
          This event repeats
        </label>
        {state.recurring && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Frequency">
              <input type="text" placeholder="Weekly on Monday" value={state.recurrence_frequency} onChange={(e) => set("recurrence_frequency", e.target.value)} className={inputCls} />
            </Field>
            <Field label="End date">
              <input type="date" value={state.recurrence_end_date} onChange={(e) => set("recurrence_end_date", e.target.value)} className={inputCls} />
            </Field>
            <Field label="RRULE (iCal)">
              <input type="text" placeholder="FREQ=WEEKLY;BYDAY=MO" value={state.rrule} onChange={(e) => set("rrule", e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}
      </section>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t dark:border-surface-700 pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-md bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-surface-200 hover:bg-gray-200 dark:hover:bg-surface-600 cursor-pointer">
            Cancel
          </button>
        )}
        <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
          {isSubmitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
