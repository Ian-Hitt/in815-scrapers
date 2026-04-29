import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startScrape, cancelScrape, fetchSources, runAllScrapers, fetchScrapeAllStatus } from "../api.js";
import SourceBadge from "../components/SourceBadge.jsx";
import { useNotifications, useCompletionNotifier } from "../hooks/useNotifications.js";

// true = always populated, false = always null, "partial" = sometimes/depends on listing
const COVERAGE_FIELDS = [
  { key: "start_time",  label: "Start time"   },
  { key: "end_time",    label: "End time"      },
  { key: "description", label: "Description"   },
  { key: "image_url",   label: "Image"         },
  { key: "venue",       label: "Venue"         },
  { key: "address",     label: "Address"       },
  { key: "price",       label: "Price"         },
  { key: "organizer",   label: "Organizer"     },
  { key: "tags",        label: "Tags"          },
  { key: "geo",         label: "Coordinates"   },
];

const SNAP_SCHOOL = { start_time: true, end_time: false, description: true, image_url: false, venue: true, address: true, price: false, organizer: true,      tags: true,      geo: false };

const SOURCE_COVERAGE = {
  rpd:                    { start_time: true,      end_time: true,      description: true,      image_url: false,    venue: true, address: true, price: false,     organizer: false,     tags: false,     geo: false },
  gorockford:             { start_time: "partial", end_time: "partial", description: true,      image_url: true,     venue: true, address: true, price: true,      organizer: false,     tags: false,     geo: true  },
  eventbrite:             { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: true,      organizer: true,      tags: true,      geo: false },
  rpl:                    { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: false,     organizer: true,      tags: true,      geo: false },
  "intersoccer-saturday": { start_time: true,      end_time: false,     description: true,      image_url: false,    venue: true, address: true, price: true,      organizer: true,      tags: true,      geo: false },
  "intersoccer-sunday":   { start_time: true,      end_time: false,     description: true,      image_url: false,    venue: true, address: true, price: true,      organizer: true,      tags: true,      geo: false },
  harlem:                 SNAP_SCHOOL,
  hononegah:              SNAP_SCHOOL,
  guilford:               SNAP_SCHOOL,
  east:                   SNAP_SCHOOL,
  auburn:                 SNAP_SCHOOL,
  jefferson:              SNAP_SCHOOL,
  "lutheran-hs":          SNAP_SCHOOL,
  marysplace:             { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: true,      organizer: true,      tags: "partial", geo: false },
  rockfordlive:           { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: true,      organizer: true,      tags: "partial", geo: true  },
  rockbuzz:               { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: "partial", organizer: "partial", tags: "partial", geo: true  },
  hardrock:               { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: true,      organizer: "partial", tags: "partial", geo: false },
  boylan:                 { start_time: "partial", end_time: "partial", description: "partial", image_url: false,    venue: true, address: true, price: true,      organizer: true,      tags: "partial", geo: false },
  rivets:                 { start_time: true,      end_time: false,     description: true,      image_url: true,     venue: true, address: false, price: true,     organizer: true,      tags: true,      geo: false },
  ticketmaster:           { start_time: true,      end_time: "partial", description: "partial", image_url: true,     venue: true, address: true, price: "partial", organizer: "partial", tags: true,      geo: true  },
  northsuburban:          { start_time: true,      end_time: true,      description: true,      image_url: true,     venue: true, address: true, price: false,     organizer: true,      tags: true,      geo: false },
};

function CoverageIcon({ value }) {
  if (value === true)      return <span className="text-green-600 dark:text-green-400 font-bold">✓</span>;
  if (value === false)     return <span className="text-red-400 dark:text-red-500">✗</span>;
  if (value === "partial") return <span className="text-amber-500 dark:text-amber-400 font-bold">~</span>;
  return <span className="text-gray-300">—</span>;
}

const SOURCE_META = {
  rpd:                    { label: "Rockford Park District",        type: "community",     description: "Scrapes calendarwiz.com for RPD events" },
  gorockford:             { label: "GoRockford",                    type: "community",     description: "Scrapes gorockford.com community events" },
  eventbrite:             { label: "Eventbrite",                    type: "community",     description: "Scrapes Eventbrite Rockford-area events", interactive: true },
  rpl:                    { label: "Rockford Public Library",       type: "community",     description: "Scrapes RPL events via RSS feed + detail pages" },
  "intersoccer-saturday": { label: "Inter Soccer League (Saturday)", type: "sports-league", description: "Scrapes Saturday schedule from intersoccerleague.com" },
  "intersoccer-sunday":   { label: "Inter Soccer League (Sunday)",   type: "sports-league", description: "Scrapes Sunday schedule from intersoccerleague.com" },
  harlem:                 { label: "Harlem High School",            type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  hononegah:              { label: "Hononegah High School",         type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  guilford:               { label: "Guilford High School",          type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  east:                   { label: "East High School",              type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  auburn:                 { label: "Auburn High School",            type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  jefferson:              { label: "Jefferson High School",         type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  "lutheran-hs":          { label: "Rockford Lutheran",            type: "school",        description: "Fetches athletics events via SNAP.app GraphQL API" },
  marysplace:             { label: "Mary's Place Bar",             type: "community",     description: "Scrapes live music events from marysplacebar.com" },
  rockfordlive:           { label: "Rockford Live",                type: "community",     description: "Scrapes events from rockfordlive.com via SimpleView ASM API" },
  rockbuzz:               { label: "Rockford Buzz",               type: "community",     description: "Scrapes events from rockbuzz.com via Puppeteer scroll + RSC parsing" },
  hardrock:               { label: "Hard Rock Casino",            type: "community",     description: "Scrapes Hard Rock Live shows from casino.hardrock.com/rockford" },
  boylan:                 { label: "Boylan Catholic High School", type: "school",        description: "Fetches athletics events via Google Calendar iCal feed" },
  rivets:                 { label: "Rockford Rivets",             type: "community",     description: "Fetches home game schedule via Northwoods League scorebook API" },
  ticketmaster:           { label: "Ticketmaster",               type: "community",     description: "Fetches events via Ticketmaster Discovery API (requires API key)" },
  northsuburban:          { label: "North Suburban Library",     type: "community",     description: "Scrapes North Suburban Library District events via JSON-LD detail pages" },
};

const TABS = [
  { key: "all",          label: "All" },
  { key: "community",    label: "Community" },
  { key: "school",       label: "Schools" },
  { key: "sports-league", label: "Sports Leagues" },
];

function timeAgo(isoStr) {
  if (!isoStr) return "Never";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ScrapeCard({ source }) {
  const queryClient = useQueryClient();
  const meta = SOURCE_META[source.source_name] || { label: source.source_name, description: "" };
  const coverage = SOURCE_COVERAGE[source.source_name];
  const [expanded, setExpanded] = useState(false);

  const scrape = useMutation({
    mutationFn: () => startScrape(source.source_name),
    onSuccess: () => {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["sources"] });
      }, 3000);
      setTimeout(() => clearInterval(interval), 600000);
      window.__scrapeInterval = interval;
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelScrape(source.source_name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  const isScraping = source.status === "scraping";

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-lg dark:text-surface-100 flex items-center gap-2">
            {meta.label}
            <SourceBadge source={source.source_name} />
          </h3>
          <p className="text-sm text-gray-500 dark:text-surface-400 mt-1">{meta.description}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-gray-500 dark:text-surface-400">Last scraped: </span>
          <span className={source.last_scraped ? "text-gray-900 dark:text-surface-200 font-medium" : "text-gray-400 dark:text-surface-500"}>
            {isScraping && !source.last_scraped
              ? "In progress..."
              : source.last_scraped
              ? `${timeAgo(source.last_scraped)} (${new Date(source.last_scraped).toLocaleDateString()})`
              : "Never"}
          </span>
        </div>
      </div>

      {source.status === "error" && source.error && (
        <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-sm">
          <strong>Error:</strong> {source.error}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => scrape.mutate()}
          disabled={isScraping || scrape.isPending}
          className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-md bg-gray-800 hover:bg-gray-900 dark:bg-surface-700 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
        >
          {isScraping ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Scraping...
            </>
          ) : (
            `Scrape ${meta.label}`
          )}
        </button>
        {isScraping && (
          <button
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="px-3 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 rounded-md border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {isScraping && meta.interactive && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded p-2 mt-2 text-center">
          A browser window has opened on your machine. If a captcha appears, solve it there — but don't close the window until scraping is complete.
        </p>
      )}
      {isScraping && !meta.interactive && (
        <p className="text-xs text-gray-400 dark:text-surface-500 mt-2 text-center">
          This may take a few minutes. The page will update automatically.
        </p>
      )}

      {coverage && (
        <div className="mt-3 border-t border-gray-100 dark:border-surface-700 pt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-gray-400 dark:text-surface-500 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer flex items-center gap-1"
          >
            <span>{expanded ? "▾" : "▸"}</span>
            Data coverage
          </button>
          {expanded && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {COVERAGE_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-surface-400">
                  <CoverageIcon value={coverage[key]} />
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScrapeRow({ source }) {
  const queryClient = useQueryClient();
  const meta = SOURCE_META[source.source_name] || { label: source.source_name, description: "" };

  const scrape = useMutation({
    mutationFn: () => startScrape(source.source_name),
    onSuccess: () => {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["sources"] });
      }, 3000);
      setTimeout(() => clearInterval(interval), 600000);
    },
  });

  const cancel = useMutation({
    mutationFn: () => cancelScrape(source.source_name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  const isScraping = source.status === "scraping";
  const isError = source.status === "error";

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${isScraping ? "bg-blue-500 animate-pulse" : isError ? "bg-red-500" : source.last_scraped ? "bg-green-500" : "bg-gray-300 dark:bg-surface-600"}`} />

      {/* Name + badge */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-medium text-gray-900 dark:text-surface-100 truncate">{meta.label}</span>
        <SourceBadge source={source.source_name} />
      </div>

      {/* Last scraped */}
      <span className="text-xs text-gray-400 dark:text-surface-500 shrink-0 hidden sm:block">
        {isScraping ? "Running..." : timeAgo(source.last_scraped)}
      </span>

      {/* Action */}
      {isScraping ? (
        <button
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending}
          className="px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 rounded-md border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50 cursor-pointer shrink-0"
        >
          Cancel
        </button>
      ) : (
        <button
          onClick={() => scrape.mutate()}
          disabled={scrape.isPending}
          className="px-2.5 py-1 text-xs font-medium text-white rounded-md bg-gray-800 dark:bg-surface-700 hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 cursor-pointer shrink-0"
        >
          Scrape
        </button>
      )}
    </div>
  );
}

function IconGrid() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  );
}

function IconRows() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ScrapeAllBar({ sources }) {
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["scrape-all-status"],
    queryFn: fetchScrapeAllStatus,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const run = useMutation({
    mutationFn: runAllScrapers,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scrape-all-status"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const running = status?.running || run.isPending;
  const total = sources?.length ?? 0;
  const scrapingNow = sources?.find((s) => s.status === "scraping")?.source_name;

  function onClick() {
    if (running) return;
    const ok = window.confirm(
      `Scrape all ${total} sources sequentially? This takes roughly 10–15 minutes. ` +
      `Eventbrite may open a browser window that needs a CAPTCHA solved manually. ` +
      `Enrichment runs automatically after scraping finishes.`
    );
    if (ok) run.mutate();
  }

  return (
    <div className="flex items-center gap-3 mb-6 p-4 bg-white dark:bg-surface-800 rounded-lg shadow">
      <div className="flex-1 min-w-0">
        <div className="font-semibold dark:text-surface-100">Run all scrapers</div>
        <p className="text-sm text-gray-500 dark:text-surface-400 truncate">
          {running
            ? scrapingNow
              ? `Scraping ${SOURCE_META[scrapingNow]?.label || scrapingNow}…`
              : "Starting…"
            : `Runs all ${total} sources in order, then chains the enrichment pipeline.`}
        </p>
      </div>
      <button
        onClick={onClick}
        disabled={running}
        className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
      >
        {running ? "Running…" : "Scrape all"}
      </button>
    </div>
  );
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [view, setView] = useState("cards");
  const { notify } = useNotifications();

  const { data: sources, isLoading, error } = useQuery({
    queryKey: ["sources"],
    queryFn: fetchSources,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.some((s) => s.status === "scraping")) return 3000;
      return false;
    },
  });

  useCompletionNotifier(sources, {
    getKey: useCallback((s) => s.source_name, []),
    getStatus: useCallback((s) => s.status, []),
    runningStatuses: ["scraping"],
    onComplete: useCallback((s) => {
      const label = SOURCE_META[s.source_name]?.label || s.source_name;
      notify(`Scrape finished: ${label}`, {
        body: s.status === "error" ? `Failed: ${s.error}` : "Import complete",
        type: s.status === "error" ? "error" : "success",
      });
    }, [notify]),
  });

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">Error: {error.message}</p>;

  const filtered = sources?.filter((s) => {
    if (activeTab === "all") return true;
    return (SOURCE_META[s.source_name]?.type ?? "community") === activeTab;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold dark:text-surface-100">Scrape Sources</h1>
        <div className="flex rounded-md border border-gray-300 dark:border-surface-600 overflow-hidden">
          <button
            onClick={() => setView("cards")}
            className={`px-2.5 py-1.5 cursor-pointer ${view === "cards" ? "bg-gray-800 text-white dark:bg-surface-600" : "bg-white dark:bg-surface-800 text-gray-500 dark:text-surface-400 hover:bg-gray-50 dark:hover:bg-surface-700"}`}
            title="Cards"
          >
            <IconGrid />
          </button>
          <button
            onClick={() => setView("rows")}
            className={`px-2.5 py-1.5 cursor-pointer ${view === "rows" ? "bg-gray-800 text-white dark:bg-surface-600" : "bg-white dark:bg-surface-800 text-gray-500 dark:text-surface-400 hover:bg-gray-50 dark:hover:bg-surface-700"}`}
            title="Compact rows"
          >
            <IconRows />
          </button>
        </div>
      </div>
      <p className="text-gray-500 dark:text-surface-400 mb-4">Run scrapers to fetch new events and import them into the database.</p>

      <ScrapeAllBar sources={sources} />


      {/* Desktop: tab bar */}
      <div className="hidden md:flex gap-1 mb-6 border-b border-gray-200 dark:border-surface-700">
        {TABS.map((tab) => {
          const count = tab.key === "all"
            ? sources?.length
            : sources?.filter((s) => (SOURCE_META[s.source_name]?.type ?? "community") === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors ${
                activeTab === tab.key
                  ? "border-gray-800 text-gray-900 dark:border-surface-200 dark:text-surface-100"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-surface-400 dark:hover:text-surface-200"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-xs text-gray-400 dark:text-surface-500">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mobile: dropdown */}
      <div className="md:hidden mb-4">
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
          className="w-full border border-gray-300 dark:border-surface-600 rounded-md px-3 py-2 text-sm cursor-pointer bg-white dark:bg-surface-700 dark:text-surface-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TABS.map((tab) => {
            const count = tab.key === "all"
              ? sources?.length
              : sources?.filter((s) => (SOURCE_META[s.source_name]?.type ?? "community") === tab.key).length;
            return (
              <option key={tab.key} value={tab.key}>
                {tab.label} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filtered?.map((s) => (
            <ScrapeCard key={s.source_name} source={s} />
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-surface-800 rounded-xl shadow divide-y divide-gray-100 dark:divide-surface-700 overflow-hidden">
          {filtered?.map((s) => (
            <ScrapeRow key={s.source_name} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}
