import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { sendChatStream, createEvent, updateEvent, fetchEvent } from "../api.js";

function extractAssistantText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function renderProposalSummary(proposal) {
  return proposal.input?.summary_for_user || (
    proposal.tool_name === "propose_create_event"
      ? `Create "${proposal.input?.title}" on ${proposal.input?.start_date}`
      : `Update event ${proposal.input?.event_id}`
  );
}

function ProposalCard({ proposal, onConfirm, onCancel, busy, result }) {
  const isCreate = proposal.tool_name === "propose_create_event";
  const fields = isCreate ? proposal.input : proposal.input?.changes || {};
  const filteredKeys = Object.keys(fields).filter(
    (k) => k !== "summary_for_user" && fields[k] !== undefined && fields[k] !== null && fields[k] !== ""
  );

  return (
    <div className="border border-blue-300 dark:border-accent-700 bg-blue-50 dark:bg-accent-900/30 rounded-lg p-4 my-2">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700 dark:text-accent-300 mb-1">
            {isCreate ? "Proposed new event" : `Proposed change to event #${proposal.input?.event_id}`}
          </p>
          <p className="text-sm text-gray-900 dark:text-surface-100">
            {renderProposalSummary(proposal)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
        {filteredKeys.map((k) => (
          <div key={k} className="flex gap-2">
            <dt className="text-gray-500 dark:text-surface-400 min-w-24">{k}:</dt>
            <dd className="text-gray-900 dark:text-surface-200 break-words">
              {typeof fields[k] === "object" ? JSON.stringify(fields[k]) : String(fields[k])}
            </dd>
          </div>
        ))}
      </dl>
      {result ? (
        <div className={`mt-3 text-xs font-medium ${result.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {result.ok ? (
            <>
              ✓ {result.message}{" "}
              {result.eventId && (
                <Link to={`/events/${result.eventId}`} className="underline">View event →</Link>
              )}
            </>
          ) : (
            <>✕ {result.message}</>
          )}
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {busy ? "Working…" : isCreate ? "Create event" : "Apply change"}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-200 dark:bg-surface-700 text-gray-700 dark:text-surface-200 hover:bg-gray-300 dark:hover:bg-surface-600 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function formatEventDate(dateStr, timeStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  if (!timeStr) return label;
  const [h, min] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${label} · ${hour}:${String(min).padStart(2, "0")} ${ampm}`;
}

function EventCard({ event }) {
  const href = `/events/${event.id}`;
  const dateLabel = formatEventDate(event.start_date, event.start_time);
  const tags = event.tags ? event.tags.split(";").map((t) => t.trim()).filter(Boolean).slice(0, 2) : [];

  return (
    <a
      href={href}
      className="flex gap-3 p-3 rounded-lg border border-gray-200 dark:border-surface-600 bg-white dark:bg-surface-800 hover:border-blue-300 dark:hover:border-accent-500 transition-colors no-underline"
    >
      {event.image_url ? (
        <img
          src={event.image_url}
          alt=""
          className="w-14 h-14 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-14 h-14 rounded bg-gray-100 dark:bg-surface-700 shrink-0 flex items-center justify-center text-gray-400 text-xl">
          📅
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-surface-100 truncate">{event.title}</p>
        {dateLabel && <p className="text-xs text-blue-600 dark:text-accent-400 mt-0.5">{dateLabel}</p>}
        {(event.venue || event.city) && (
          <p className="text-xs text-gray-500 dark:text-surface-400 truncate mt-0.5">
            {[event.venue, event.city].filter(Boolean).join(", ")}
          </p>
        )}
        {(event.price || tags.length > 0) && (
          <div className="flex gap-1.5 mt-1 flex-wrap">
            {event.price && event.price !== "Free" && (
              <span className="text-xs text-green-700 dark:text-green-400 font-medium">{event.price}</span>
            )}
            {tags.map((t) => (
              <span key={t} className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-surface-700 text-gray-600 dark:text-surface-300">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </a>
  );
}

function EventResultsBlock({ results }) {
  if (!results?.events?.length) return null;
  const { events, total } = results;
  return (
    <div className="my-2 space-y-2">
      <p className="text-xs text-gray-500 dark:text-surface-400 font-medium">
        {total > events.length ? `Showing ${events.length} of ${total} events` : `${events.length} event${events.length !== 1 ? "s" : ""}`}
      </p>
      {events.map((ev) => (
        <EventCard key={ev.id} event={ev} />
      ))}
    </div>
  );
}

function normalizeAssistantText(text) {
  // Gemini streams with soft line-breaks at column boundaries. Collapse single
  // newlines within a paragraph to spaces; keep double newlines as breaks.
  return text
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function MessageBubble({ role, text }) {
  if (!text) return null;
  const isUser = role === "user";
  const display = isUser ? text : normalizeAssistantText(text);
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 dark:bg-surface-700 text-gray-900 dark:text-surface-100"
        }`}
      >
        {display}
      </div>
    </div>
  );
}

const CHAT_STORAGE_KEY = "chat_session";

function loadChatSession() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveChatSession(state) {
  try {
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const LOADING_MESSAGES = [
  "Thinking",
  "Finding events",
  "Checking the calendar",
  "Looking for fun things",
  "Sorting through options",
  "Scoring funness",
  "Asking around",
  "Checking what's on",
  "Browsing the listings",
  "Calculating fun levels",
  "Checking the weekend forecast",
  "Finding hidden gems",
  "Scanning for adventures",
  "Cross-referencing fun",
  "Consulting the event oracle",
  "Sifting through events",
  "Looking for family activities",
  "Filtering by awesome",
  "Measuring fun potential",
  "Checking dates",
  "Searching Rockford",
  "Building your weekend",
  "Loading the good stuff",
  "Almost there",
  "Pulling results",
];

export default function ChatPage() {
  const [messages, setMessages] = useState(() => loadChatSession()?.messages ?? []);
  const [proposals, setProposals] = useState(() => loadChatSession()?.proposals ?? []);
  const [proposalResults, setProposalResults] = useState(() => loadChatSession()?.proposalResults ?? {});
  const [eventSearchResults, setEventSearchResults] = useState(() => loadChatSession()?.eventSearchResults ?? null);
  const [streamingText, setStreamingText] = useState("");
  const [msgIdx, setMsgIdx] = useState(0);
  const [dotCount, setDotCount] = useState(1);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyToolId, setBusyToolId] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, proposals]);

  useEffect(() => {
    saveChatSession({ messages, proposals, proposalResults, eventSearchResults });
  }, [messages, proposals, proposalResults, eventSearchResults]);

  useEffect(() => {
    if (!loading || streamingText) return;
    const msgTimer = setInterval(
      () => setMsgIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      3000
    );
    const dotTimer = setInterval(
      () => setDotCount((d) => (d % 3) + 1),
      400
    );
    return () => { clearInterval(msgTimer); clearInterval(dotTimer); };
  }, [loading, streamingText]);

  async function postAndHandle(nextMessages) {
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");
    setMsgIdx(0);
    setDotCount(1);
    await sendChatStream(nextMessages, {
      signal: controller.signal,
      onDelta: (text) => {
        setLoading(false);
        setStreamingText((prev) => prev + text);
      },
      onDone: (data) => {
        setStreamingText("");
        setMessages(data.messages);
        setProposals(data.pending_proposals || []);
        setEventSearchResults(data.event_search_results ?? null);
        setLoading(false);
      },
      onError: (err) => {
        setStreamingText("");
        setError(err.message);
        setLoading(false);
      },
    });
  }

  function handleCancel() {
    abortRef.current?.abort();
    setLoading(false);
    setStreamingText("");
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setEventSearchResults(null);
    await postAndHandle(next);
  }

  async function handleProposalConfirm(proposal) {
    setBusyToolId(proposal.tool_use_id);
    setError(null);
    try {
      let event;
      let successMsg;
      if (proposal.tool_name === "propose_create_event") {
        const { summary_for_user, ...fields } = proposal.input;
        event = await createEvent(fields);
        successMsg = `Created "${event.title}" (id ${event.id})`;
      } else {
        const { event_id, changes } = proposal.input;
        event = await updateEvent(event_id, changes);
        successMsg = `Updated "${event.title}"`;
      }

      setProposalResults((r) => ({
        ...r,
        [proposal.tool_use_id]: { ok: true, message: successMsg, eventId: event.id },
      }));

      const toolResultMsg = {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: proposal.tool_use_id,
            content: JSON.stringify({ ok: true, event_id: event.id, message: successMsg }),
          },
        ],
      };
      const next = [...messages, toolResultMsg];
      setProposals([]);
      await postAndHandle(next);
    } catch (err) {
      setProposalResults((r) => ({
        ...r,
        [proposal.tool_use_id]: { ok: false, message: err.message },
      }));
    } finally {
      setBusyToolId(null);
    }
  }

  async function handleProposalCancel(proposal) {
    setBusyToolId(proposal.tool_use_id);
    setProposalResults((r) => ({
      ...r,
      [proposal.tool_use_id]: { ok: false, message: "Cancelled." },
    }));
    const toolResultMsg = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: proposal.tool_use_id,
          content: JSON.stringify({ ok: false, message: "User cancelled. Do not retry automatically." }),
        },
      ],
    };
    const next = [...messages, toolResultMsg];
    setProposals([]);
    setBusyToolId(null);
    await postAndHandle(next);
  }

  function resetConversation() {
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
    setMessages([]);
    setProposals([]);
    setProposalResults({});
    setEventSearchResults(null);
    setStreamingText("");
    setMsgIdx(0);
    setDotCount(1);
    setError(null);
  }

  const renderedMessages = messages
    .map((m, i) => {
      if (m.role === "user" && typeof m.content === "string") {
        return { key: `u-${i}`, role: "user", text: m.content };
      }
      if (m.role === "assistant" && Array.isArray(m.content)) {
        const text = extractAssistantText(m.content);
        if (!text) return null;
        return { key: `a-${i}`, role: "assistant", text };
      }
      return null;
    })
    .filter(Boolean);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] md:h-[calc(100vh-10rem)] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold dark:text-surface-100">Chat</h1>
        {messages.length > 0 && (
          <button
            onClick={resetConversation}
            className="text-sm text-gray-500 dark:text-surface-400 hover:text-gray-700 dark:hover:text-surface-200 cursor-pointer"
          >
            New conversation
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-white dark:bg-surface-800 rounded-lg shadow p-4 mb-3"
      >
        {renderedMessages.length === 0 && proposals.length === 0 && !loading && (
          <div className="text-sm text-gray-500 dark:text-surface-400 space-y-2">
            <p className="font-medium text-gray-700 dark:text-surface-200">
              Search for events or add and edit them.
            </p>
            <p>Examples:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>"Show me events this weekend for me and the kids."</li>
              <li>"What music events are coming up in May?"</li>
              <li>"Add an event at the Hard Rock Casino this Saturday at 7pm — blues night."</li>
              <li>"Update the Maze Books Chess Event to start at 6pm instead of 5pm."</li>
              <li>"Add this event: https://example.com/event-page"</li>
            </ul>
            <p className="text-xs text-gray-400 dark:text-surface-500 pt-2">
              Paste a URL to import an event from a web page. Create/update actions show a confirmation card before writing.
            </p>
          </div>
        )}

        {(() => {
          const hasInline = !!eventSearchResults && renderedMessages.some(
            (m) => m.role === "assistant" && m.text.includes("[EVENTS]")
          );
          return renderedMessages.map((m) => {
            if (m.role === "assistant" && hasInline && m.text.includes("[EVENTS]")) {
              const [before, ...rest] = m.text.split("[EVENTS]");
              const after = rest.join("[EVENTS]").trim();
              return (
                <div key={m.key}>
                  {before.trim() && <MessageBubble role="assistant" text={before.trim()} />}
                  <EventResultsBlock results={eventSearchResults} />
                  {after && <MessageBubble role="assistant" text={after} />}
                </div>
              );
            }
            return <MessageBubble key={m.key} role={m.role} text={m.text} />;
          });
        })()}

        {!renderedMessages.some((m) => m.role === "assistant" && m.text.includes("[EVENTS]")) && (
          <EventResultsBlock results={eventSearchResults} />
        )}

        {proposals.map((p) => (
          <ProposalCard
            key={p.tool_use_id}
            proposal={p}
            busy={busyToolId === p.tool_use_id}
            result={proposalResults[p.tool_use_id]}
            onConfirm={() => handleProposalConfirm(p)}
            onCancel={() => handleProposalCancel(p)}
          />
        ))}

        {streamingText && (
          <MessageBubble role="assistant" text={streamingText.replace(/\s*\[EVENTS\]\s*/g, "")} />
        )}

        {loading && !streamingText && (
          <div className="text-xs text-gray-400 dark:text-surface-500 italic my-2">
            {LOADING_MESSAGES[msgIdx]}{".".repeat(dotCount)}
          </div>
        )}
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 my-2">Error: {error}</div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Search events, add one from a URL, or ask me to edit one…"
          disabled={loading}
          className="flex-1 border border-gray-300 dark:border-surface-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-surface-700 dark:text-surface-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none overflow-y-auto max-h-40"
        />
        {loading ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 dark:bg-surface-600 text-gray-700 dark:text-surface-200 hover:bg-gray-300 dark:hover:bg-surface-500 cursor-pointer shrink-0"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            Send
          </button>
        )}
      </form>
    </div>
  );
}
