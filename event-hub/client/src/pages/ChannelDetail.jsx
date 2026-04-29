import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { fetchChannel, fetchEvents, updateChannel, fetchCategories, addChannelCategory, removeChannelCategory } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";
import Pagination from "../components/Pagination.jsx";
import { useState, useRef } from "react";
import ChannelMergeModal from "../components/ChannelMergeModal.jsx";

function DefaultCategoryPicker({ channel }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data: tree } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["channel", String(channel.id)] });
  const add = useMutation({ mutationFn: (catId) => addChannelCategory(channel.id, catId), onSuccess: () => { invalidate(); setAdding(false); } });
  const remove = useMutation({ mutationFn: (catId) => removeChannelCategory(channel.id, catId), onSuccess: invalidate });

  const assignedIds = new Set(channel.default_categories?.map((c) => c.id));
  const options = tree?.flatMap((parent) => [
    { id: parent.id, label: parent.name, isParent: true },
    ...parent.subcategories.map((sub) => ({ id: sub.id, label: `${parent.name} › ${sub.name}`, isParent: false })),
  ]).filter((o) => !assignedIds.has(o.id)) ?? [];

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4">
      <h3 className="text-xs font-medium text-gray-500 dark:text-surface-400 uppercase mb-1">Default categories</h3>
      <p className="text-xs text-gray-400 dark:text-surface-500 mb-2">Events in this channel inherit these categories when auto-categorize finds no keyword match.</p>
      <div className="flex flex-wrap gap-1.5">
        {channel.default_categories?.map((cat) => (
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
        <div className="flex gap-2 items-center mt-2">
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

export default function ChannelDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const fileRef = useRef();
  const qc = useQueryClient();

  const { data: channel, isLoading: loadingChannel } = useQuery({
    queryKey: ["channel", id],
    queryFn: () => fetchChannel(id),
  });

  async function uploadFile(file) {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/channels/${id}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (!res.ok) throw new Error("Upload failed");
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      setAvatarMenu(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function saveUrl() {
    if (!urlInput.trim()) return;
    setUploading(true);
    try {
      await updateChannel(id, { image_url: urlInput.trim() });
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      setAvatarMenu(false);
      setUrlInput("");
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    setUploading(true);
    try {
      await updateChannel(id, { image_url: "" });
      qc.invalidateQueries({ queryKey: ["channel", id] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      setAvatarMenu(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  }

  const { data, isLoading: loadingEvents } = useQuery({
    queryKey: ["events", { channel: id, page }],
    queryFn: () => fetchEvents({ channel: id, page, limit: 50 }),
    enabled: !!channel,
  });

  if (loadingChannel) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (!channel) return <p className="text-red-600 dark:text-red-400">Channel not found.</p>;

  return (
    <div>
      <Link to="/channels" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-block">
        ← All Channels
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <div className="relative shrink-0">
            <button
              onClick={() => setAvatarMenu(!avatarMenu)}
              className="w-14 h-14 rounded-full overflow-hidden border-2 border-transparent hover:border-blue-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Change avatar"
            >
              {channel.image_url ? (
                <img src={channel.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200 dark:bg-surface-600 flex items-center justify-center text-lg font-bold text-gray-400 dark:text-surface-500">
                  {channel.name.charAt(0)}
                </div>
              )}
            </button>
            {avatarMenu && (
              <div className="absolute top-16 left-0 z-10 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg shadow-lg p-3 w-72">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files[0] && uploadFile(e.target.files[0])}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100 dark:hover:bg-surface-700 dark:text-surface-200 cursor-pointer"
                >
                  Upload image...
                </button>
                <div className="flex gap-1.5 mt-2">
                  <input
                    type="text"
                    placeholder="Paste image URL"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveUrl()}
                    className="flex-1 text-sm border border-gray-300 dark:border-surface-600 rounded px-2 py-1.5 bg-white dark:bg-surface-700 dark:text-surface-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={saveUrl}
                    disabled={uploading || !urlInput.trim()}
                    className="text-sm px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
                {channel.image_url && (
                  <button
                    onClick={removeAvatar}
                    disabled={uploading}
                    className="w-full text-left px-3 py-2 mt-1 text-sm text-red-600 dark:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-surface-700 cursor-pointer"
                  >
                    Remove avatar
                  </button>
                )}
              </div>
            )}
          </div>
          <div>
          <h1 className="text-2xl font-bold dark:text-surface-100">{channel.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-surface-400">
            <span className="capitalize">{channel.type}</span>
            {channel.website && (
              <a
                href={channel.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer"
              >
                {channel.website}
              </a>
            )}
            <span>{channel.event_count} events</span>
          </div>
          {channel.description && (
            <p className="mt-2 text-gray-600 dark:text-surface-400 text-sm">{channel.description}</p>
          )}
          </div>
        </div>
        <button
          onClick={() => setMergeOpen(true)}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-surface-200 bg-white dark:bg-surface-800 border border-gray-300 dark:border-surface-600 hover:bg-gray-50 dark:hover:bg-surface-700 rounded-md cursor-pointer"
          title="Merge this channel into another"
        >
          Merge into…
        </button>
      </div>

      {mergeOpen && (
        <ChannelMergeModal
          source={channel}
          onClose={() => setMergeOpen(false)}
          onMerged={(keepId) => {
            setMergeOpen(false);
            qc.invalidateQueries({ queryKey: ["channels"] });
            qc.invalidateQueries({ queryKey: ["channel-duplicates"] });
            navigate(`/channels/${keepId}`);
          }}
        />
      )}

      <DefaultCategoryPicker channel={channel} />

      {loadingEvents && <p className="text-gray-400 dark:text-surface-500">Loading events...</p>}

      {data && (
        <>
          <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
              <thead className="bg-gray-50 dark:bg-surface-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Sources</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
                {data.events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50 dark:hover:bg-surface-700">
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/events/${ev.id}`} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300">
                        {ev.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.start_date}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.start_time || "-"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.venue || "-"}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1">
                        {ev.sources?.map((s) => <SourceBadge key={s} source={s} />)}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No events</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
