import { useState } from "react";
import { useStickyState } from "../hooks/useStickyState.js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchRecurringEvents, fetchCategoryStats, fetchTimeSuggestions, fetchPriceSuggestions, fetchArchiveStats, fetchDuplicates, fetchChannelDuplicates, fetchEmptyChannels, deleteEmptyChannels, fetchAddressStats, fetchAttractionCandidates, fetchDismissedEvents, runBackfillAvatars, fetchChannels, fetchCityAuditStats, fetchSportsFallbackStats, runSportsFallbackImages, runAllEnrichments, fetchRunAllStatus, fetchFeaturedStats } from "../api.js";

function StatBlock({ lines }) {
  const [expanded, setExpanded] = useState(false);
  if (!lines || lines.length === 0) return null;
  const first = lines[0];
  const rest = lines.slice(1);
  return (
    <div className="text-sm mb-4">
      <div className={first.color}>{first.text}</div>
      {rest.length > 0 && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-gray-400 dark:text-surface-500 hover:text-gray-600 dark:hover:text-surface-300 cursor-pointer mt-1"
          >
            {expanded ? "Less" : `+${rest.length} more`}
          </button>
          {expanded && (
            <div className="mt-1 space-y-0.5 text-xs">
              {rest.map((l, i) => <div key={i} className={l.color}>{l.text}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CardLink({ to, buttonLabel = "Review", children }) {
  return (
    <Link
      to={to}
      className="bg-white dark:bg-surface-800 rounded-lg shadow p-6 flex flex-col hover:shadow-md active:bg-gray-50 dark:active:bg-surface-700 transition-shadow cursor-pointer group"
    >
      {children}
      <div className="mt-auto pt-2">
        <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-gray-100 dark:bg-surface-700 text-gray-700 dark:text-surface-200 group-hover:bg-gray-800 group-hover:text-white dark:group-hover:bg-surface-600">
          {buttonLabel}
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

function RruleCard() {
  const { data: events } = useQuery({
    queryKey: ["recurring-events"],
    queryFn: fetchRecurringEvents,
  });

  const total = events?.length ?? "—";
  const withRrule = events?.filter((e) => e.rrule).length ?? 0;
  const canConvert = events?.filter((e) => !e.rrule && e.suggested_rrule).length ?? 0;
  const needsReview = events?.filter((e) => !e.rrule && !e.suggested_rrule).length ?? 0;

  return (
    <CardLink to="/curate/rrules">
      <h3 className="font-semibold text-lg dark:text-surface-100">Recurrence Rules</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Convert human-readable recurrence strings to iCal RRULE format for export to Realms.
      </p>

      {events ? (
        <StatBlock lines={[
          { text: `${total} recurring — ${withRrule} with RRULE`, color: "text-gray-600 dark:text-surface-400" },
          canConvert > 0 && { text: `${canConvert} can auto-convert`, color: "text-blue-700 dark:text-surface-300" },
          needsReview > 0 && { text: `${needsReview} need manual review`, color: "text-amber-700 dark:text-amber-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function CategoryCard() {
  const { data: stats } = useQuery({
    queryKey: ["category-stats"],
    queryFn: fetchCategoryStats,
  });

  return (
    <CardLink to="/curate/categorize">
      <h3 className="font-semibold text-lg dark:text-surface-100">Category Assignment</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Assign master taxonomy categories to events using keyword rules, then review and fill in the rest manually.
      </p>

      {stats ? (
        <div className="text-sm mb-4">
          {stats.uncategorized > 0
            ? <span className="text-amber-700 dark:text-amber-400">{stats.uncategorized} events uncategorized</span>
            : <span className="text-green-700 dark:text-green-400">All events categorized</span>}
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function TimeCard() {
  const { data: events } = useQuery({
    queryKey: ["time-suggestions"],
    queryFn: fetchTimeSuggestions,
  });

  const withSuggestion = events?.filter((e) => e.suggested_start_time).length ?? 0;
  const complex = events?.filter((e) => e.complex).length ?? 0;
  const total = events?.length ?? "—";

  return (
    <CardLink to="/curate/times">
      <h3 className="font-semibold text-lg dark:text-surface-100">Start Times</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Find start times hidden in event descriptions and apply them to the missing start time field.
      </p>

      {events ? (
        <StatBlock lines={[
          { text: `${total} events missing start time`, color: "text-gray-600 dark:text-surface-400" },
          withSuggestion > 0 && { text: `${withSuggestion} with auto-suggestion`, color: "text-blue-700 dark:text-surface-300" },
          complex > 0 && { text: `${complex} complex schedules`, color: "text-orange-700 dark:text-orange-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function PriceCard() {
  const { data: events } = useQuery({
    queryKey: ["price-suggestions"],
    queryFn: fetchPriceSuggestions,
  });

  const withSuggestion = events?.filter((e) => e.suggested_price).length ?? 0;
  const highConfidence = events?.filter((e) => e.confidence === "high").length ?? 0;
  const total = events?.length ?? "—";

  return (
    <CardLink to="/curate/prices">
      <h3 className="font-semibold text-lg dark:text-surface-100">Prices</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Find price information hidden in event descriptions and apply it to events missing a price.
      </p>

      {events ? (
        <StatBlock lines={[
          { text: `${total} events missing price`, color: "text-gray-600 dark:text-surface-400" },
          withSuggestion > 0 && { text: `${withSuggestion} with suggestion`, color: "text-blue-700 dark:text-surface-300" },
          highConfidence > 0 && { text: `${highConfidence} high confidence`, color: "text-green-700 dark:text-green-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function DuplicateCard() {
  const { data: pairs } = useQuery({
    queryKey: ["duplicates"],
    queryFn: fetchDuplicates,
  });

  const high = pairs?.filter((p) => p.score >= 75).length ?? 0;
  const total = pairs?.length ?? "—";

  return (
    <CardLink to="/curate/duplicates">
      <h3 className="font-semibold text-lg dark:text-surface-100">Duplicate Detection</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Find events that appear to be duplicates based on title, date, time, and venue similarity.
      </p>

      {pairs ? (
        <StatBlock lines={[
          { text: `${total} candidate pairs`, color: "text-gray-600 dark:text-surface-400" },
          high > 0 && { text: `${high} high confidence`, color: "text-red-700 dark:text-red-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function ChannelDuplicateCard() {
  const { data: pairs } = useQuery({
    queryKey: ["channel-duplicates"],
    queryFn: fetchChannelDuplicates,
  });

  const high = pairs?.filter((p) => p.score >= 85).length ?? 0;
  const total = pairs?.length ?? "—";

  return (
    <CardLink to="/curate/channel-duplicates">
      <h3 className="font-semibold text-lg dark:text-surface-100">Channel Duplicates</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Find channels that look like duplicates based on name similarity and website domain. Merge them to consolidate events under one channel.
      </p>

      {pairs ? (
        <StatBlock lines={[
          { text: `${total} candidate pairs`, color: "text-gray-600 dark:text-surface-400" },
          high > 0 && { text: `${high} high confidence`, color: "text-red-700 dark:text-red-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function EmptyChannelsCard() {
  const queryClient = useQueryClient();

  const { data: empty } = useQuery({
    queryKey: ["empty-channels"],
    queryFn: fetchEmptyChannels,
  });

  const del = useMutation({
    mutationFn: () => deleteEmptyChannels(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empty-channels"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  const total = empty?.length ?? "—";
  const preview = empty?.slice(0, 4) ?? [];

  function onDelete() {
    if (!empty?.length) return;
    if (!window.confirm(`Delete ${empty.length} empty channel${empty.length === 1 ? "" : "s"}? This cannot be undone, but the channel will be re-created if a matching event is ever imported.`)) return;
    del.mutate();
  }

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-6 flex flex-col">
      <h3 className="font-semibold text-lg dark:text-surface-100">Empty Channels</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Remove channels that have no events. Usually leftovers from merges, renames, or one-off sources.
      </p>

      {empty ? (
        total === 0 ? (
          <div className="text-sm text-green-700 dark:text-green-400 mb-4">No empty channels</div>
        ) : (
          <StatBlock lines={[
            { text: `${total} empty channel${empty.length === 1 ? "" : "s"}`, color: "text-amber-700 dark:text-amber-400" },
            ...preview.map((c) => ({ text: c.name, color: "text-gray-500 dark:text-surface-500" })),
            empty.length > preview.length && { text: `…and ${empty.length - preview.length} more`, color: "text-gray-400 dark:text-surface-600" },
          ].filter(Boolean)} />
        )
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}

      <div className="mt-auto pt-2">
        <button
          onClick={onDelete}
          disabled={del.isPending || !empty?.length}
          className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {del.isPending ? "Deleting..." : `Delete all${empty?.length ? ` (${empty.length})` : ""}`}
        </button>
        {del.data && (
          <p className="text-xs text-gray-500 dark:text-surface-400 mt-2">Deleted {del.data.deleted}.</p>
        )}
      </div>
    </div>
  );
}

function AddressCard() {
  const { data: stats } = useQuery({
    queryKey: ["address-stats"],
    queryFn: fetchAddressStats,
  });

  const gaps = stats ? [
    stats.missingAddress > 0 && `${stats.missingAddress} address`,
    stats.missingCity > 0 && `${stats.missingCity} city`,
    stats.missingState > 0 && `${stats.missingState} state`,
    stats.missingZip > 0 && `${stats.missingZip} zip`,
    stats.missingCoords > 0 && `${stats.missingCoords} coords`,
    stats.missingVenue > 0 && `${stats.missingVenue} venue`,
  ].filter(Boolean) : [];

  const totalGaps = stats ? (stats.missingAddress || 0) + (stats.missingCity || 0) + (stats.missingState || 0) + (stats.missingZip || 0) + (stats.missingCoords || 0) + (stats.missingVenue || 0) : 0;

  return (
    <CardLink to="/curate/addresses">
      <h3 className="font-semibold text-lg dark:text-surface-100">Address Geocoding</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Fill missing address, city, state, zip, and coordinates via OpenStreetMap. Uses lat/lng or venue name to look up missing fields.
      </p>

      {stats ? (
        gaps.length > 0 ? (
          <StatBlock lines={[
            { text: `${totalGaps} total gaps across ${gaps.length} fields`, color: "text-amber-700 dark:text-amber-400" },
            ...gaps.map((g) => ({ text: g, color: "text-amber-600 dark:text-amber-400/80" })),
          ]} />
        ) : (
          <div className="text-sm text-green-700 dark:text-green-400 mb-4">All address fields filled</div>
        )
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function AttractionsCard() {
  const { data: candidates } = useQuery({ queryKey: ["attraction-candidates"], queryFn: fetchAttractionCandidates });
  const { data: dismissed } = useQuery({ queryKey: ["dismissed-events"], queryFn: fetchDismissedEvents });

  const total = candidates?.length ?? "—";
  const dismissedCount = dismissed?.length ?? 0;

  return (
    <CardLink to="/curate/attractions">
      <h3 className="font-semibold text-lg dark:text-surface-100">Possible Attractions</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Events flagged as possible venue attractions or multi-month exhibitions rather than discrete events. Review and dismiss as needed.
      </p>

      {candidates ? (
        <StatBlock lines={[
          { text: `${total} candidates flagged`, color: "text-gray-600 dark:text-surface-400" },
          dismissedCount > 0 && { text: `${dismissedCount} already dismissed`, color: "text-gray-400 dark:text-surface-500" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function ArchiveCard() {
  const { data: stats } = useQuery({
    queryKey: ["archive-stats"],
    queryFn: fetchArchiveStats,
  });

  return (
    <CardLink to="/curate/archive">
      <h3 className="font-semibold text-lg dark:text-surface-100">Archive Past Events</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Hide completed past events from all listings and enrichment queues. Archived events are kept for history but won't appear by default.
      </p>

      {stats ? (
        <div className="text-sm mb-4">
          <span className="text-gray-500 dark:text-surface-400">{stats.archived} events currently archived</span>
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function AvatarCard() {
  const queryClient = useQueryClient();

  const { data: channels } = useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
  });

  const backfill = useMutation({
    mutationFn: runBackfillAvatars,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }),
  });

  const missing = channels?.filter((ch) => !ch.image_url).length ?? "—";
  const total = channels?.length ?? "—";

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-6 flex flex-col">
      <h3 className="font-semibold text-lg dark:text-surface-100">Channel Avatars</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Fetch logos from GoRockford listing pages and Rockbuzz organizer profiles for channels missing avatars.
      </p>

      {channels ? (
        <StatBlock lines={[
          { text: `${total} channels total`, color: "text-gray-600 dark:text-surface-400" },
          missing > 0
            ? { text: `${missing} missing avatar`, color: "text-amber-700 dark:text-amber-400" }
            : { text: "All channels have avatars", color: "text-green-700 dark:text-green-400" },
        ]} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}

      <div className="mt-auto pt-2">
        <button
          onClick={() => backfill.mutate()}
          disabled={backfill.isPending || missing === 0}
          className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {backfill.isPending ? "Fetching logos..." : "Backfill avatars"}
        </button>
        {backfill.data && (
          <p className="text-xs text-gray-500 dark:text-surface-400 mt-2">
            Started — fetching logos for {backfill.data.total} channels.
          </p>
        )}
      </div>
    </div>
  );
}

function SportsFallbackCard() {
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["sports-fallback-stats"],
    queryFn: fetchSportsFallbackStats,
  });

  const apply = useMutation({
    mutationFn: runSportsFallbackImages,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sports-fallback-stats"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  return (
    <div className="bg-white dark:bg-surface-800 rounded-lg shadow p-6 flex flex-col">
      <h3 className="font-semibold text-lg dark:text-surface-100">Fallback Images</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Assign generated cover images to events that don't have one, based on their category. Pushed to Realms as the event cover.
      </p>

      {stats ? (
        <StatBlock lines={[
          { text: `${stats.matched} events matched`, color: "text-gray-600 dark:text-surface-400" },
          stats.applied > 0 && { text: `${stats.applied} already have a fallback`, color: "text-gray-500 dark:text-surface-500" },
          stats.pending > 0
            ? { text: `${stats.pending} need a fallback assigned`, color: "text-amber-700 dark:text-amber-400" }
            : { text: "All matched events have a fallback", color: "text-green-700 dark:text-green-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}

      <div className="mt-auto pt-2">
        <button
          onClick={() => apply.mutate()}
          disabled={apply.isPending || (stats?.pending ?? 0) === 0}
          className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {apply.isPending ? "Assigning..." : "Assign fallback images"}
        </button>
        {apply.data && (
          <p className="text-xs text-gray-500 dark:text-surface-400 mt-2">
            {apply.data.applied} assigned, {apply.data.skipped} skipped{apply.data.errors ? `, ${apply.data.errors} errors` : ""}.
          </p>
        )}
      </div>
    </div>
  );
}


function FeaturedCard() {
  const { data: stats } = useQuery({ queryKey: ["featured-stats"], queryFn: fetchFeaturedStats });

  return (
    <CardLink to="/curate/featured">
      <h3 className="font-semibold text-lg dark:text-surface-100">Featured Events</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Curate a short list of notable events from ticketing sources and channels with external links.
      </p>
      {stats ? (
        <StatBlock lines={[
          { text: `${stats.featured} events currently featured`, color: "text-gray-600 dark:text-surface-400" },
          stats.candidates > 0 && { text: `${stats.candidates} unfeatured candidates`, color: "text-amber-700 dark:text-amber-400" },
        ].filter(Boolean)} />
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

function CityAuditCard() {
  const { data: stats } = useQuery({
    queryKey: ["city-audit-stats"],
    queryFn: fetchCityAuditStats,
  });

  const total = stats?.total ?? "—";

  return (
    <CardLink to="/curate/city-audit">
      <h3 className="font-semibold text-lg dark:text-surface-100">City Audit</h3>
      <p className="text-sm text-gray-500 dark:text-surface-400 mt-1 mb-4">
        Find events from cities outside the Rockford-area whitelist. Accept valid ones or archive out-of-area events.
      </p>

      {stats ? (
        <div className="text-sm mb-4">
          {total > 0
            ? <span className="text-amber-700 dark:text-amber-400">{total} events outside whitelist</span>
            : <span className="text-green-700 dark:text-green-400">All events in whitelisted cities</span>}
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-surface-500 mb-4">Loading...</div>
      )}
    </CardLink>
  );
}

/* ── Compact row variants ── */

function Pill({ color, children }) {
  const cls = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    gray: "bg-gray-100 text-gray-600 dark:bg-surface-700 dark:text-surface-400",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${cls[color] || cls.gray}`}>{children}</span>;
}

function RowAction({ label, onClick, pending, disabled }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      disabled={pending || disabled}
      className="px-2.5 py-1 bg-gray-800 dark:bg-surface-700 text-white text-xs font-medium rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
    >
      {pending ? "..." : label}
    </button>
  );
}

function CompactRow({ name, pills, action, reviewTo, result }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-sm font-medium text-gray-900 dark:text-surface-100 shrink-0">{name}</span>
      <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">{pills}</div>
      {result && <span className="text-xs text-gray-500 dark:text-surface-400 shrink-0">{result}</span>}
      {action}
      {reviewTo && (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-300 dark:text-surface-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );
  if (reviewTo) {
    return <Link to={reviewTo} className="block hover:bg-gray-50 dark:hover:bg-surface-700/50 transition-colors">{inner}</Link>;
  }
  return <div>{inner}</div>;
}

function CompactRows() {
  const queryClient = useQueryClient();

  const { data: rec } = useQuery({ queryKey: ["recurring-events"], queryFn: fetchRecurringEvents });
  const { data: catStats } = useQuery({ queryKey: ["category-stats"], queryFn: fetchCategoryStats });
  const { data: timeSugg } = useQuery({ queryKey: ["time-suggestions"], queryFn: fetchTimeSuggestions });
  const { data: priceSugg } = useQuery({ queryKey: ["price-suggestions"], queryFn: fetchPriceSuggestions });
  const { data: dupes } = useQuery({ queryKey: ["duplicates"], queryFn: fetchDuplicates });
  const { data: chDupes } = useQuery({ queryKey: ["channel-duplicates"], queryFn: fetchChannelDuplicates });
  const { data: empty } = useQuery({ queryKey: ["empty-channels"], queryFn: fetchEmptyChannels });
  const { data: addrStats } = useQuery({ queryKey: ["address-stats"], queryFn: fetchAddressStats });
  const { data: archStats } = useQuery({ queryKey: ["archive-stats"], queryFn: fetchArchiveStats });
  const { data: attr } = useQuery({ queryKey: ["attraction-candidates"], queryFn: fetchAttractionCandidates });
  const { data: chs } = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const { data: cityStats } = useQuery({ queryKey: ["city-audit-stats"], queryFn: fetchCityAuditStats });
  const { data: sportsStats } = useQuery({ queryKey: ["sports-fallback-stats"], queryFn: fetchSportsFallbackStats });
  const { data: featStats } = useQuery({ queryKey: ["featured-stats"], queryFn: fetchFeaturedStats });

  const backfill = useMutation({ mutationFn: runBackfillAvatars, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channels"] }) });
  const delEmpty = useMutation({
    mutationFn: () => deleteEmptyChannels(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empty-channels"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
  const applySports = useMutation({
    mutationFn: runSportsFallbackImages,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sports-fallback-stats"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const canConvert = rec?.filter((e) => !e.rrule && e.suggested_rrule).length ?? 0;
  const missingAv = chs?.filter((ch) => !ch.image_url).length ?? 0;
  const addrGaps = addrStats ? [addrStats.missingAddress, addrStats.missingCity, addrStats.missingZip, addrStats.missingCoords].reduce((a, b) => a + (b || 0), 0) : 0;

  const autoRows = (
    <>
      <CompactRow
        name="Archive"
        pills={archStats ? <Pill color="gray">{archStats.archived} archived</Pill> : null}
        reviewTo="/curate/archive"
      />
      <CompactRow
        name="Recurrence"
        pills={rec ? (<>
          <Pill color="green">{rec.filter((e) => e.rrule).length} done</Pill>
          {canConvert > 0 && <Pill color="amber">{canConvert} convertible</Pill>}
        </>) : null}
        reviewTo="/curate/rrules"
      />
      <CompactRow
        name="Categories"
        pills={catStats ? (
          catStats.uncategorized > 0 ? <Pill color="amber">{catStats.uncategorized} uncategorized</Pill> : <Pill color="green">Done</Pill>
        ) : null}
        reviewTo="/curate/categorize"
      />
      <CompactRow
        name="Addresses"
        pills={addrStats ? (
          addrGaps > 0 ? <Pill color="amber">{addrGaps} gaps</Pill> : <Pill color="green">All filled</Pill>
        ) : null}
        reviewTo="/curate/addresses"
      />
      <CompactRow
        name="Avatars"
        pills={chs ? (
          missingAv > 0 ? <Pill color="amber">{missingAv} missing</Pill> : <Pill color="green">Done</Pill>
        ) : null}
        action={<RowAction label="Backfill" onClick={() => backfill.mutate()} pending={backfill.isPending} disabled={missingAv === 0} />}
      />
      <CompactRow
        name="Fallback Images"
        pills={sportsStats ? (
          sportsStats.pending > 0
            ? <Pill color="amber">{sportsStats.pending} need fallback</Pill>
            : <Pill color="green">Done</Pill>
        ) : null}
        action={<RowAction label="Assign" onClick={() => applySports.mutate()} pending={applySports.isPending} disabled={(sportsStats?.pending ?? 0) === 0} />}
      />
    </>
  );

  const reviewRows = (
    <>
      <CompactRow
        name="Featured"
        pills={featStats ? (<>
          <Pill color="gray">{featStats.featured} featured</Pill>
          {featStats.candidates > 0 && <Pill color="amber">{featStats.candidates} candidates</Pill>}
        </>) : null}
        reviewTo="/curate/featured"
      />
      <CompactRow
        name="Duplicates"
        pills={dupes ? (<>
          <Pill color={dupes.length > 0 ? "amber" : "green"}>{dupes.length} pairs</Pill>
          {dupes.filter((p) => p.score >= 75).length > 0 && <Pill color="red">{dupes.filter((p) => p.score >= 75).length} high</Pill>}
        </>) : null}
        reviewTo="/curate/duplicates"
      />
      <CompactRow
        name="Channel Duplicates"
        pills={chDupes ? (<>
          <Pill color={chDupes.length > 0 ? "amber" : "green"}>{chDupes.length} pairs</Pill>
          {chDupes.filter((p) => p.score >= 85).length > 0 && <Pill color="red">{chDupes.filter((p) => p.score >= 85).length} high</Pill>}
        </>) : null}
        reviewTo="/curate/channel-duplicates"
      />
      <CompactRow
        name="Start Times"
        pills={timeSugg ? (
          <Pill color={timeSugg.length > 0 ? "amber" : "green"}>{timeSugg.length} missing</Pill>
        ) : null}
        reviewTo="/curate/times"
      />
      <CompactRow
        name="Prices"
        pills={priceSugg ? (
          <Pill color={priceSugg.length > 0 ? "amber" : "green"}>{priceSugg.length} missing</Pill>
        ) : null}
        reviewTo="/curate/prices"
      />
      <CompactRow
        name="City Audit"
        pills={cityStats ? (
          cityStats.total > 0 ? <Pill color="amber">{cityStats.total} outside</Pill> : <Pill color="green">All in area</Pill>
        ) : null}
        reviewTo="/curate/city-audit"
      />
      <CompactRow
        name="Attractions"
        pills={attr ? <Pill color={attr.length > 0 ? "amber" : "green"}>{attr.length} flagged</Pill> : null}
        reviewTo="/curate/attractions"
      />
      <CompactRow
        name="Empty Channels"
        pills={empty ? (
          empty.length > 0
            ? <Pill color="amber">{empty.length} empty</Pill>
            : <Pill color="green">None</Pill>
        ) : null}
        action={<RowAction label="Delete" onClick={() => {
          if (!empty?.length) return;
          if (window.confirm(`Delete ${empty.length} empty channel${empty.length === 1 ? "" : "s"}?`)) delEmpty.mutate();
        }} pending={delEmpty.isPending} disabled={!empty?.length} />}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <SectionHeader title="Automated" hint="Runs in the weekly schedule and when you click Run all" />
      <div className="bg-white dark:bg-surface-800 rounded-xl shadow divide-y divide-gray-100 dark:divide-surface-700 overflow-hidden">
        {autoRows}
      </div>
      <SectionHeader title="Needs your review" hint="Per-item decisions — not touched by Run all" />
      <div className="bg-white dark:bg-surface-800 rounded-xl shadow divide-y divide-gray-100 dark:divide-surface-700 overflow-hidden">
        {reviewRows}
      </div>
    </div>
  );
}

function SectionHeader({ title, hint }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-surface-200">{title}</h2>
      {hint && <span className="text-xs text-gray-500 dark:text-surface-400">{hint}</span>}
    </div>
  );
}

/* ── View toggle icons ── */

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

function RunAllBar() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ["run-all-status"],
    queryFn: fetchRunAllStatus,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const run = useMutation({
    mutationFn: runAllEnrichments,
    onSuccess: () => {
      // Invalidate everything the pipeline might touch so cards refresh when it finishes
      queryClient.invalidateQueries({ queryKey: ["run-all-status"] });
      queryClient.invalidateQueries();
    },
  });

  const running = status?.running || run.isPending;

  function onClick() {
    if (running) return;
    const ok = window.confirm(
      "Run all bulk enrichments? This will archive past events, geocode addresses, convert RRULEs, auto-categorize, assign fallback images, and backfill avatars.\n\nChanges are logged and reversible via the enrichment logs page. Review-required steps (duplicates, times/prices, city audit, attractions) are not affected."
    );
    if (ok) run.mutate();
  }

  return (
    <div className="flex items-center gap-3 mb-6 p-4 bg-white dark:bg-surface-800 rounded-lg shadow">
      <div className="flex-1">
        <div className="font-semibold dark:text-surface-100">Run all enrichments</div>
        <p className="text-sm text-gray-500 dark:text-surface-400">
          Runs the bulk steps in the right order. Review-required steps stay manual.
        </p>
      </div>
      <button
        onClick={onClick}
        disabled={running}
        className="px-4 py-2 bg-gray-800 dark:bg-surface-700 text-white text-sm rounded-md hover:bg-gray-900 dark:hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
      >
        {running ? "Running..." : "Run all"}
      </button>
    </div>
  );
}

export default function CurationPage() {
  const [view, setView] = useStickyState("enrich-view", "cards");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold dark:text-surface-100">Enrichment</h1>
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
      <p className="text-gray-500 dark:text-surface-400 mb-6">Clean up and normalize event data before exporting.</p>

      <RunAllBar />

      {view === "cards" ? (
        <div className="space-y-6">
          <SectionHeader title="Automated" hint="Runs in the weekly schedule and when you click Run all" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ArchiveCard />
            <RruleCard />
            <CategoryCard />
            <AddressCard />
            <AvatarCard />
            <SportsFallbackCard />
          </div>
          <SectionHeader title="Needs your review" hint="Per-item decisions — not touched by Run all" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeaturedCard />
            <DuplicateCard />
            <ChannelDuplicateCard />
            <TimeCard />
            <PriceCard />
            <CityAuditCard />
            <AttractionsCard />
            <EmptyChannelsCard />
          </div>
        </div>
      ) : (
        <CompactRows />
      )}
    </div>
  );
}
