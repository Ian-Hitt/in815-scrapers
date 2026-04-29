import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchEvents, fetchCategories } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";
import { useStickyState } from "../hooks/useStickyState.js";
import FilterBar from "../components/FilterBar.jsx";
import FilterDrawer from "../components/FilterDrawer.jsx";
import Pagination from "../components/Pagination.jsx";
import EventModal from "../components/EventModal.jsx";
import BulkEditModal from "../components/BulkEditModal.jsx";
import { getMissingFields } from "../exportFields.js";

const SOURCE_LABELS = { rpd: "RPD", gorockford: "GoRockford", eventbrite: "Eventbrite", rpl: "RPL", harlem: "Harlem High School", hononegah: "Hononegah High School", "intersoccer-saturday": "Inter Soccer League (Saturday)", "intersoccer-sunday": "Inter Soccer League (Sunday)", guilford: "Guilford High School", east: "East High School", auburn: "Auburn High School", jefferson: "Jefferson High School", "lutheran-hs": "Rockford Lutheran", boylan: "Boylan Catholic High School", rivets: "Rockford Rivets", marysplace: "Mary's Place Bar", rockfordlive: "Rockford Live", rockbuzz: "Rockford Buzz", hardrock: "Hard Rock Casino", ticketmaster: "Ticketmaster", northsuburban: "North Suburban Library", manual: "Manually added" };
const COMPLETENESS_LABELS = { incomplete: "Incomplete", ready: "Ready" };
const MIN_SCORE_LABELS = { "25": "Quality 25+", "50": "Quality 50+", "75": "Quality 75+" };

function ActiveFilters({ filters, onChange }) {
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  function remove(key) {
    onChange({ ...filters, [key]: undefined, page: 1 });
  }

  const tags = [];
  if (filters.search) tags.push({ key: "search", label: `"${filters.search}"` });
  if (filters.taxonomy) {
    const flat = categories?.flatMap((p) => [p, ...p.subcategories]) ?? [];
    const names = filters.taxonomy.split(",").map((id) => {
      if (id === "uncategorized") return "Uncategorized";
      const cat = flat.find((c) => String(c.id) === id);
      return cat ? (cat.parent_id ? `${categories.find((p) => p.id === cat.parent_id)?.name} › ${cat.name}` : cat.name) : id;
    });
    tags.push({ key: "taxonomy", label: names.join(", ") });
  }
  if (filters.excludeTaxonomy) {
    const flat = categories?.flatMap((p) => [p, ...p.subcategories]) ?? [];
    const names = filters.excludeTaxonomy.split(",").map((id) => {
      const cat = flat.find((c) => String(c.id) === id);
      return cat?.name ?? id;
    });
    tags.push({ key: "excludeTaxonomy", label: `Excluding: ${names.join(", ")}` });
  }
  if (filters.source) tags.push({ key: "source", label: SOURCE_LABELS[filters.source] ?? filters.source });
  if (filters.startDate) tags.push({ key: "startDate", label: `From ${filters.startDate}` });
  if (filters.endDate) tags.push({ key: "endDate", label: `To ${filters.endDate}` });
  if (filters.completeness) tags.push({ key: "completeness", label: COMPLETENESS_LABELS[filters.completeness] ?? filters.completeness });
  if (filters.min_score) tags.push({ key: "min_score", label: MIN_SCORE_LABELS[filters.min_score] ?? `Quality ${filters.min_score}+` });
  if (filters.has_tickets) tags.push({ key: "has_tickets", label: "Has tickets" });

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {tags.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-accent-900/50 dark:text-accent-200">
          {label}
          <button onClick={() => remove(key)} className="hover:text-blue-600 dark:hover:text-accent-300 cursor-pointer leading-none text-sm">&times;</button>
        </span>
      ))}
    </div>
  );
}

function CompletenessBadge({ event }) {
  const missing = getMissingFields(event);
  if (missing.length === 0) {
    return <span className="text-xs font-medium text-green-700 bg-green-50 rounded px-1.5 py-0.5 dark:text-green-400 dark:bg-green-900/40">Ready</span>;
  }
  return (
    <span
      title={`Missing: ${missing.map((f) => f.label).join(", ")}`}
      className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 cursor-default dark:text-amber-400 dark:bg-amber-900/40"
    >
      {missing.length} missing
    </span>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return null;
  const cls = score >= 75 ? "text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/40"
    : score >= 50 ? "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/40"
    : score >= 25 ? "text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/40"
    : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/40";
  return <span title="Data quality score" className={`text-xs font-medium rounded px-1.5 py-0.5 tabular-nums ${cls}`}>{score}</span>;
}

function EventCard({ ev, onSelect }) {
  return (
    <button onClick={onSelect} className="bg-white dark:bg-surface-800 rounded-lg shadow overflow-hidden flex flex-col hover:shadow-md transition-shadow text-left w-full cursor-pointer">
      {ev.image_url ? (
        <img src={ev.image_url} alt="" className="w-full h-28 md:h-40 object-cover" />
      ) : (
        <div className="w-full h-28 md:h-40 bg-gray-100 dark:bg-surface-700 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 md:w-10 md:h-10 text-gray-300 dark:text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-surface-100 leading-snug">{ev.title}</p>
        <p className="text-xs text-gray-500 dark:text-surface-400">
          {ev.start_date}{ev.start_time ? ` · ${ev.start_time}` : ""}
        </p>
        {ev.venue && <p className="text-xs text-gray-500 dark:text-surface-400 truncate">{ev.venue}</p>}
        <div className="flex items-center justify-between mt-auto pt-1.5">
          <div className="flex gap-1 flex-wrap">
            {ev.sources?.map((s) => <SourceBadge key={s} source={s} />)}
          </div>
          <div className="flex items-center gap-1">
            <ScoreBadge score={ev.data_score} />
            <CompletenessBadge event={ev} />
          </div>
        </div>
      </div>
    </button>
  );
}

function IconList() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DayOverflow({ anchorRef, date, events, onSelect, onClose }) {
  const popupRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  const label = new Date(date + "T00:00:00").toLocaleDateString("default", { weekday: "long", month: "long", day: "numeric" });

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 w-56 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-600 rounded-lg shadow-xl p-2"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-xs font-semibold text-gray-700 dark:text-surface-200">{label}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-surface-200 cursor-pointer text-sm leading-none">&times;</button>
      </div>
      <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
        {events.map(ev => (
          <button
            key={ev.id}
            onClick={() => { onSelect(ev.id); onClose(); }}
            className="text-xs truncate rounded px-1.5 py-1 bg-gray-100 dark:bg-surface-700 text-gray-900 dark:text-surface-100 hover:bg-gray-200 dark:hover:bg-surface-600 text-left w-full cursor-pointer"
          >
            {ev.title}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}

function DayCell({ dateStr, dayEvents, isToday, onSelect }) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef(null);
  const day = parseInt(dateStr.slice(-2), 10);
  return (
    <div className="bg-white dark:bg-surface-800 min-h-20 p-1.5 flex flex-col relative">
      <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-1 ${isToday ? "bg-blue-600 text-white" : "text-gray-500 dark:text-surface-400"}`}>
        {day}
      </span>
      <div className="flex flex-col gap-0.5 overflow-hidden">
        {dayEvents.slice(0, 3).map(ev => (
          <button key={ev.id} onClick={() => onSelect(ev.id)} className="text-xs truncate rounded px-1 py-0.5 bg-blue-50 dark:bg-accent-900/40 text-blue-700 dark:text-white hover:bg-blue-100 dark:hover:bg-accent-900/60 leading-snug text-left w-full cursor-pointer">
            {ev.title}
          </button>
        ))}
        {dayEvents.length > 3 && (
          <button
            ref={moreRef}
            onClick={() => setOpen(o => !o)}
            className="text-xs text-blue-500 dark:text-white hover:text-blue-700 dark:hover:text-accent-200 px-1 text-left cursor-pointer"
          >
            +{dayEvents.length - 3} more
          </button>
        )}
        {open && (
          <DayOverflow
            anchorRef={moreRef}
            date={dateStr}
            events={dayEvents}
            onSelect={onSelect}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

function CalendarView({ events, year, month, onPrevMonth, onNextMonth, onSelect }) {
  const today = new Date();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const byDate = {};
  for (const ev of events) {
    if (!ev.start_date) continue;
    if (!byDate[ev.start_date]) byDate[ev.start_date] = [];
    byDate[ev.start_date].push(ev);
  }

  const monthLabel = firstDay.toLocaleString("default", { month: "long", year: "numeric" });
  const todayStr = today.toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrevMonth} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 text-gray-600 dark:text-surface-300 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-surface-100">{monthLabel}</span>
        <button onClick={onNextMonth} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 text-gray-600 dark:text-surface-300 cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 dark:text-surface-500 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-surface-700 border border-gray-200 dark:border-surface-700 rounded-lg overflow-hidden">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="bg-gray-50 dark:bg-surface-900 min-h-20" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = byDate[dateStr] || [];
          const isToday = dateStr === todayStr;
          return (
            <DayCell key={dateStr} dateStr={dateStr} dayEvents={dayEvents} isToday={isToday} onSelect={onSelect} />
          );
        })}
      </div>
    </div>
  );
}

export default function EventList() {
  const [filters, setFilters] = useState({ page: 1 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewMode, setViewMode] = useStickyState("events-view", "grid");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const activeFilterCount = [filters.source, filters.startDate, filters.endDate, filters.taxonomy, filters.excludeTaxonomy, filters.completeness, filters.has_tickets, filters.min_score].filter(Boolean).length;

  const todayDate = new Date().toISOString().slice(0, 10);
  const baseParams = (!includeArchived && !filters.startDate)
    ? { ...filters, startDate: todayDate }
    : filters;
  const queryParams = includeArchived ? { ...baseParams, include_archived: "1" } : baseParams;

  const calStartDate = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-01`;
  const calLastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const calEndDate = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(calLastDay).padStart(2, "0")}`;
  const calQueryParams = {
    ...Object.fromEntries(Object.entries(queryParams).filter(([k]) => !["page", "startDate", "endDate"].includes(k))),
    startDate: calStartDate,
    endDate: calEndDate,
    limit: 500,
    include_archived: "1",
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["events", queryParams],
    queryFn: () => fetchEvents(queryParams),
    keepPreviousData: true,
    enabled: viewMode !== "calendar",
  });

  const { data: calData, isLoading: calLoading } = useQuery({
    queryKey: ["events-calendar", calQueryParams],
    queryFn: () => fetchEvents(calQueryParams),
    keepPreviousData: true,
    enabled: viewMode === "calendar",
  });

  const pageIds = data?.events.map((ev) => ev.id) ?? [];
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); pageIds.forEach((id) => next.add(id)); return next; });
    }
  }

  function toggleRow(id) {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return (
    <div>
      {/* Header — stacks on mobile */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold dark:text-surface-100 shrink-0">Events</h1>

        {/* Inline search */}
        <div className="relative flex-1 sm:max-w-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-surface-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search events..."
            value={filters.search || ""}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined, page: 1 }))}
            className="w-full pl-8 pr-3 py-2 md:py-1.5 border border-gray-300 dark:border-surface-600 rounded-md text-sm bg-white dark:bg-surface-800 text-gray-900 dark:text-surface-100 placeholder-gray-400 dark:placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/events/new"
            className="flex items-center gap-1.5 px-3 py-2 md:py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">New event</span>
            <span className="sm:hidden">New</span>
          </Link>
          {/* Include past toggle */}
          <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-surface-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="cursor-pointer accent-gray-600 dark:accent-surface-400"
            />
            <span className="hidden sm:inline">Include past</span>
            <span className="sm:hidden">Past</span>
          </label>

          {/* View toggle — hide list (table) on mobile */}
          <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`hidden md:block px-2.5 py-1.5 cursor-pointer ${viewMode === "list" ? "bg-gray-800 text-white dark:bg-surface-600" : "bg-white dark:bg-surface-800 text-gray-500 dark:text-surface-400 hover:bg-gray-50 dark:hover:bg-surface-700"}`}
              title="List view"
            >
              <IconList />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-2 md:py-1.5 cursor-pointer ${viewMode === "grid" ? "bg-gray-800 text-white dark:bg-surface-600" : "bg-white dark:bg-surface-800 text-gray-500 dark:text-surface-400 hover:bg-gray-50 dark:hover:bg-surface-700"}`}
              title="Grid view"
            >
              <IconGrid />
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-2.5 py-2 md:py-1.5 cursor-pointer ${viewMode === "calendar" ? "bg-gray-800 text-white dark:bg-surface-600" : "bg-white dark:bg-surface-800 text-gray-500 dark:text-surface-400 hover:bg-gray-50 dark:hover:bg-surface-700"}`}
              title="Calendar view"
            >
              <IconCalendar />
            </button>
          </div>

          {/* Sort */}
          <select
            value={filters.sort || "start_date"}
            onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value, page: 1 }))}
            className="px-2 py-2 md:py-1.5 border border-gray-300 dark:border-surface-600 rounded-md text-sm bg-white dark:bg-surface-800 text-gray-700 dark:text-surface-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="start_date">Date</option>
            <option value="title">Title</option>
            <option value="data_score">Quality</option>
          </select>

          {/* Filters button — larger tap target on mobile */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-2 px-3 py-2 md:py-1.5 border border-gray-300 dark:border-surface-600 rounded-md text-sm text-gray-700 dark:text-surface-300 hover:bg-gray-50 dark:hover:bg-surface-800 cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 8h12M9 12h6" />
            </svg>
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <FilterBar filters={filters} onChange={setFilters} />
      </FilterDrawer>

      <ActiveFilters filters={filters} onChange={setFilters} />

      {(viewMode !== "calendar" ? isLoading : calLoading) && <p className="text-gray-500 dark:text-surface-400">Loading...</p>}
      {error && <p className="text-red-600 dark:text-red-400">Error: {error.message}</p>}

      {viewMode === "calendar" && calData && (
        <CalendarView
          events={calData.events}
          year={calYear}
          month={calMonth}
          onPrevMonth={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); }}
          onNextMonth={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); }}
          onSelect={setSelectedEventId}
        />
      )}

      {viewMode !== "calendar" && data && (
        <>
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={(p) => setFilters((f) => ({ ...f, page: p }))}
          />

          {viewMode === "list" ? (
            <div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3 mb-2 px-1">
                  <span className="text-sm text-gray-600 dark:text-surface-300">{selectedIds.size} selected</span>
                  <button
                    onClick={() => setBulkModalOpen(true)}
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
                  >
                    Edit selected
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 text-sm text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
              <div className="overflow-x-auto bg-white dark:bg-surface-800 rounded-lg shadow">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-surface-700">
                  <thead className="bg-gray-50 dark:bg-surface-700">
                    <tr>
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          ref={(el) => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                          onChange={toggleSelectAll}
                          className="cursor-pointer accent-blue-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Venue</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Recurring</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Sources</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Export</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-surface-400 uppercase">Quality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-surface-700">
                    {data.events.map((ev) => (
                      <tr
                        key={ev.id}
                        className={`hover:bg-gray-50 dark:hover:bg-surface-700 ${selectedIds.has(ev.id) ? "bg-blue-50 dark:bg-accent-900/20" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(ev.id)}
                            onChange={() => toggleRow(ev.id)}
                            className="cursor-pointer accent-blue-600"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button onClick={() => setSelectedEventId(ev.id)} className="text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 cursor-pointer text-left">
                            {ev.title}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.start_date}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.start_time || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-surface-400">{ev.venue || "-"}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-surface-400">
                          {ev.recurring === 1 ? ev.recurrence_frequency || "Yes" : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-1">
                            {ev.sources?.map((s) => <SourceBadge key={s} source={s} />)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <CompletenessBadge event={ev} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <ScoreBadge score={ev.data_score} />
                        </td>
                      </tr>
                    ))}
                    {data.events.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-400 dark:text-surface-500">No events found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {data.events.map((ev) => <EventCard key={ev.id} ev={ev} onSelect={() => setSelectedEventId(ev.id)} />)}
              {data.events.length === 0 && (
                <p className="col-span-full text-center text-gray-400 dark:text-surface-500 py-8">No events found</p>
              )}
            </div>
          )}
        </>
      )}

      {selectedEventId != null && (
        <EventModal eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
      )}

      {bulkModalOpen && (
        <BulkEditModal
          selectedIds={[...selectedIds]}
          onClose={() => setBulkModalOpen(false)}
          onSuccess={() => { setSelectedIds(new Set()); setBulkModalOpen(false); }}
        />
      )}
    </div>
  );
}
