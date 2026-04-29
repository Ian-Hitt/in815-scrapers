import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchChannels } from "../api.js";
import { useStickyState } from "../hooks/useStickyState.js";
import Pagination from "../components/Pagination.jsx";

const PAGE_SIZE = 60;

const TYPE_COLORS = {
  organization: "bg-blue-100 text-blue-800 dark:bg-accent-900/50 dark:text-accent-200",
  venue: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  promoter: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
};

export default function ChannelsPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useStickyState("channels-view", "cards");
  const [page, setPage] = useState(1);

  const { data: channels, isLoading, error } = useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
  });

  useEffect(() => {
    setPage(1);
  }, [search]);

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Error: {error.message}</p>;

  const filtered = search.trim()
    ? channels?.filter((ch) => ch.name.toLowerCase().includes(search.toLowerCase()))
    : channels;

  const total = filtered?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginated = filtered?.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2 dark:text-surface-100">Channels</h1>
      <p className="text-gray-500 dark:text-surface-400 mb-4">
        Venues, organizations, and promoters hosting events in the Rockford area.
      </p>
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search channels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm border border-gray-300 dark:border-surface-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-400"
        />
        <div className="flex border border-gray-300 dark:border-surface-600 rounded-md overflow-hidden shrink-0">
          <button
            onClick={() => setView("cards")}
            className={`px-2.5 py-1.5 text-sm cursor-pointer ${view === "cards" ? "bg-blue-500 text-white" : "bg-white dark:bg-surface-700 text-gray-600 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            title="Card view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-2.5 py-1.5 text-sm cursor-pointer border-l border-gray-300 dark:border-surface-600 ${view === "table" ? "bg-blue-500 text-white" : "bg-white dark:bg-surface-700 text-gray-600 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            title="Table view"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="text-gray-400 dark:text-surface-500">No channels yet. Import some events to get started.</p>
      ) : (
        <>
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            itemLabel="channel"
          />
          {view === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {paginated?.map((ch) => (
                <Link
                  key={ch.id}
                  to={`/channels/${ch.id}`}
                  className="bg-white dark:bg-surface-800 rounded-lg shadow p-5 hover:shadow-md transition-shadow flex flex-col gap-2 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {ch.image_url ? (
                        <img src={ch.image_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-surface-600 shrink-0 flex items-center justify-center text-xs font-bold text-gray-400 dark:text-surface-500">
                          {ch.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-semibold text-gray-900 dark:text-surface-100 leading-snug">{ch.name}</span>
                    </div>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[ch.type] || "bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-surface-300"}`}>
                      {ch.type}
                    </span>
                  </div>
                  {ch.website && (
                    <span className="text-xs text-blue-500 dark:text-surface-400 truncate">{ch.website}</span>
                  )}
                  <span className="text-sm font-medium text-gray-500 dark:text-surface-400 mt-auto">
                    {ch.event_count} {ch.event_count === 1 ? "event" : "events"}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-surface-700 text-gray-500 dark:text-surface-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 hidden sm:table-cell">Website</th>
                    <th className="px-4 py-3 text-right">Events</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-surface-700">
                  {paginated?.map((ch) => (
                    <tr key={ch.id} className="hover:bg-gray-50 dark:hover:bg-surface-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link to={`/channels/${ch.id}`} className="flex items-center gap-2 min-w-0">
                          {ch.image_url ? (
                            <img src={ch.image_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-surface-600 shrink-0 flex items-center justify-center text-[10px] font-bold text-gray-400 dark:text-surface-500">
                              {ch.name.charAt(0)}
                            </div>
                          )}
                          <span className="font-medium text-gray-900 dark:text-surface-100 truncate hover:underline">{ch.name}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[ch.type] || "bg-gray-100 text-gray-700 dark:bg-surface-700 dark:text-surface-300"}`}>
                          {ch.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {ch.website ? (
                          <span className="text-xs text-blue-500 dark:text-surface-400 truncate block max-w-xs">{ch.website}</span>
                        ) : (
                          <span className="text-xs text-gray-300 dark:text-surface-600">&mdash;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-surface-400 font-medium">
                        {ch.event_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-4">
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
                itemLabel="channel"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
