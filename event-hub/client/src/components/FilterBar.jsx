import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "../api.js";

function CategoryList({ categories, selectedIds, onToggle, showUncategorized = false }) {
  const [expanded, setExpanded] = useState({});

  function toggleExpand(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const rowCls = "flex items-center gap-2 px-3 py-1.5 text-sm dark:text-surface-200";
  const checkCls = "accent-gray-600 dark:accent-surface-400";

  return (
    <div className="border border-gray-300 dark:border-surface-600 rounded-md overflow-y-auto max-h-48 bg-white dark:bg-surface-700">
      {showUncategorized && (
        <label className={`${rowCls} cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-600`}>
          <input type="checkbox" checked={selectedIds.includes("uncategorized")} onChange={() => onToggle("uncategorized")} className={checkCls} />
          Uncategorized
        </label>
      )}
      {categories?.map((parent) => {
        const hasSubs = parent.subcategories?.length > 0;
        const isExpanded = expanded[parent.id];
        return (
          <div key={parent.id}>
            {hasSubs ? (
              <>
                <button
                  onClick={() => toggleExpand(parent.id)}
                  className={`${rowCls} w-full text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-600 font-medium text-gray-700 dark:text-surface-300`}
                >
                  <svg className={`w-3 h-3 shrink-0 transition-transform text-gray-400 dark:text-surface-500 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  {parent.name}
                </button>
                {isExpanded && (
                  <>
                    <label className={`${rowCls} cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-600 pl-7`}>
                      <input type="checkbox" checked={selectedIds.includes(String(parent.id))} onChange={() => onToggle(parent.id)} className={checkCls} />
                      <span className="text-gray-500 dark:text-surface-400 italic">All {parent.name}</span>
                    </label>
                    {parent.subcategories.map((sub) => (
                      <label key={sub.id} className={`${rowCls} cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-600 pl-7`}>
                        <input type="checkbox" checked={selectedIds.includes(String(sub.id))} onChange={() => onToggle(sub.id)} className={checkCls} />
                        {sub.name}
                      </label>
                    ))}
                  </>
                )}
              </>
            ) : (
              <label className={`${rowCls} cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-600`}>
                <input type="checkbox" checked={selectedIds.includes(String(parent.id))} onChange={() => onToggle(parent.id)} className={checkCls} />
                {parent.name}
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FilterBar({ filters, onChange }) {
  const [local, setLocal] = useState(filters);
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  function update(key, value) {
    const next = { ...local, [key]: value, page: 1 };
    setLocal(next);
    onChange(next);
  }

  function clearAll() {
    const reset = { page: 1 };
    setLocal(reset);
    onChange(reset);
  }

  const hasFilters = [local.search, local.source, local.startDate, local.endDate, local.taxonomy, local.excludeTaxonomy, local.completeness, local.recurring, local.pricing, local.has_tickets, local.min_score].some(Boolean);

  const includedIds = (local.taxonomy || "").split(",").filter(Boolean);
  function toggleInclude(id) {
    const str = String(id);
    const next = includedIds.includes(str) ? includedIds.filter((x) => x !== str) : [...includedIds, str];
    update("taxonomy", next.length ? next.join(",") : undefined);
  }

  const excludedIds = (local.excludeTaxonomy || "").split(",").filter(Boolean);
  function toggleExclude(id) {
    const str = String(id);
    const next = excludedIds.includes(str) ? excludedIds.filter((x) => x !== str) : [...excludedIds, str];
    update("excludeTaxonomy", next.length ? next.join(",") : undefined);
  }

  const inputCls = "w-full border border-gray-300 dark:border-surface-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-400";
  const labelCls = "block text-xs font-medium text-gray-500 dark:text-surface-400 mb-1";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={labelCls}>Search</label>
        <input
          type="text"
          placeholder="Title, venue, description..."
          value={local.search || ""}
          onChange={(e) => update("search", e.target.value)}
          className={`${inputCls} cursor-text`}
        />
      </div>

      <div>
        <label className={labelCls}>Categories</label>
        <CategoryList categories={categories} selectedIds={includedIds} onToggle={toggleInclude} showUncategorized />
      </div>

      <div>
        <label className={labelCls}>Exclude categories</label>
        <CategoryList categories={categories} selectedIds={excludedIds} onToggle={toggleExclude} />
      </div>

      <div>
        <label className={labelCls}>Source</label>
        <select
          value={local.source || ""}
          onChange={(e) => update("source", e.target.value)}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="">All sources</option>
          <option value="rpd">RPD</option>
          <option value="gorockford">GoRockford</option>
          <option value="eventbrite">Eventbrite</option>
          <option value="rpl">RPL</option>
          <option value="harlem">Harlem High School</option>
          <option value="hononegah">Hononegah High School</option>
          <option value="guilford">Guilford High School</option>
          <option value="east">East High School</option>
          <option value="auburn">Auburn High School</option>
          <option value="jefferson">Jefferson High School</option>
          <option value="intersoccer-saturday">Inter Soccer League (Saturday)</option>
          <option value="intersoccer-sunday">Inter Soccer League (Sunday)</option>
          <option value="lutheran-hs">Rockford Lutheran</option>
          <option value="boylan">Boylan Catholic High School</option>
          <option value="marysplace">Mary's Place Bar</option>
          <option value="rockfordlive">Rockford Live</option>
          <option value="rockbuzz">Rockford Buzz</option>
          <option value="hardrock">Hard Rock Casino</option>
          <option value="rivets">Rockford Rivets</option>
          <option value="ticketmaster">Ticketmaster</option>
          <option value="northsuburban">North Suburban Library</option>
          <option value="manual">Manually added</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Date range</label>
        <div className="flex gap-2">
          <input
            type="date"
            value={local.startDate || ""}
            onChange={(e) => update("startDate", e.target.value)}
            className={`flex-1 border border-gray-300 dark:border-surface-600 rounded-md px-3 py-1.5 text-sm cursor-pointer bg-white dark:bg-surface-700 dark:text-surface-200`}
          />
          <span className="self-center text-gray-400 dark:text-surface-500 text-xs">to</span>
          <input
            type="date"
            value={local.endDate || ""}
            onChange={(e) => update("endDate", e.target.value)}
            className={`flex-1 border border-gray-300 dark:border-surface-600 rounded-md px-3 py-1.5 text-sm cursor-pointer bg-white dark:bg-surface-700 dark:text-surface-200`}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Recurring</label>
        <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden text-sm">
          {[["", "All"], ["1", "Recurring"], ["0", "One-time"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => update("recurring", val)}
              className={`flex-1 px-3 py-1.5 cursor-pointer ${local.recurring === val || (!local.recurring && val === "") ? "bg-gray-800 dark:bg-surface-600 text-white" : "bg-white dark:bg-surface-700 text-gray-700 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Price</label>
        <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden text-sm">
          {[["", "All"], ["free", "Free"], ["paid", "Paid"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => update("pricing", val)}
              className={`flex-1 px-3 py-1.5 cursor-pointer ${local.pricing === val || (!local.pricing && val === "") ? "bg-gray-800 dark:bg-surface-600 text-white" : "bg-white dark:bg-surface-700 text-gray-700 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Export status</label>
        <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden text-sm">
          {[["", "All"], ["incomplete", "Incomplete"], ["ready", "Ready"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => update("completeness", val)}
              className={`flex-1 px-3 py-1.5 cursor-pointer ${local.completeness === val || (!local.completeness && val === "") ? "bg-gray-800 dark:bg-surface-600 text-white" : "bg-white dark:bg-surface-700 text-gray-700 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Data quality</label>
        <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden text-sm">
          {[["", "Any"], ["25", "25+"], ["50", "50+"], ["75", "75+"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => update("min_score", val)}
              className={`flex-1 px-3 py-1.5 cursor-pointer ${local.min_score === val || (!local.min_score && val === "") ? "bg-gray-800 dark:bg-surface-600 text-white" : "bg-white dark:bg-surface-700 text-gray-700 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={`${labelCls} mb-1.5`}>Tickets</label>
        <label className="flex items-center gap-2 text-sm cursor-pointer dark:text-surface-200 px-0.5">
          <input
            type="checkbox"
            checked={!!local.has_tickets}
            onChange={(e) => update("has_tickets", e.target.checked ? "1" : undefined)}
            className="accent-gray-600 dark:accent-surface-400"
          />
          Has tickets
        </label>
      </div>

      {hasFilters && (
        <button
          onClick={clearAll}
          className="text-sm text-gray-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer text-left mt-1"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
