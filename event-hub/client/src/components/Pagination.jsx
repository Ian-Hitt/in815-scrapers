function pageRange(current, total) {
  // Always show first, last, current, and neighbors. Fill gaps with null (ellipsis).
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
    result.push(sorted[i]);
  }
  return result;
}

export default function Pagination({ page, totalPages, total, onPageChange, itemLabel = "event" }) {
  const label = `${total} ${total === 1 ? itemLabel : `${itemLabel}s`}`;

  if (totalPages <= 1) {
    return <p className="text-sm text-gray-500 dark:text-surface-400 mb-3">{label}</p>;
  }

  const pages = pageRange(page, totalPages);

  return (
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-gray-500 dark:text-surface-400">{label}</span>

      {/* Mobile: compact prev/next */}
      <div className="flex items-center gap-1 md:hidden">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-surface-600 rounded-md disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-surface-700 dark:text-surface-300 cursor-pointer disabled:cursor-default min-h-11"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="px-2 py-1 text-sm dark:text-surface-300 tabular-nums">
          {page}/{totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-surface-600 rounded-md disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-surface-700 dark:text-surface-300 cursor-pointer disabled:cursor-default min-h-11"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Desktop: numbered pages */}
      <div className="hidden md:flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 text-sm rounded-md disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-surface-700 dark:text-surface-300 cursor-pointer disabled:cursor-default"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm text-gray-400 dark:text-surface-500 select-none">&hellip;</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-8 px-2 py-1 text-sm rounded-md tabular-nums cursor-pointer ${
                p === page
                  ? "bg-gray-800 dark:bg-surface-600 text-white font-medium"
                  : "text-gray-600 dark:text-surface-300 hover:bg-gray-100 dark:hover:bg-surface-700"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 text-sm rounded-md disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-surface-700 dark:text-surface-300 cursor-pointer disabled:cursor-default"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
