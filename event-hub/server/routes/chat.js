import { Router } from "express";
import { GoogleGenAI, ApiError } from "@google/genai";
import { randomUUID } from "crypto";
import { searchEvents, getEventWithSources, getChannels, getCategoryBySlug } from "../db.js";

const router = Router();

const MODEL = "gemini-flash-lite-latest";

function getClient() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    const err = new Error("GEMINI_API_KEY is not set on the server");
    err.status = 500;
    throw err;
  }
  return new GoogleGenAI({ apiKey: key });
}

const TOOL_SCHEMAS = [
  {
    name: "fetch_url",
    description:
      "Fetch the HTML content of a web page and return its extracted text, title, and meta tags. Use this when the user provides a URL and wants to create an event from it — read the page first, then extract fields and propose creation. If the page content is empty or unhelpful (JS-rendered), tell the user and ask them to paste the relevant text instead.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The full URL to fetch" },
      },
      required: ["url"],
    },
  },
  {
    name: "query_events",
    description:
      "Search and browse events to show to the user. Use this when the user wants to discover or view events (e.g. 'show me events this weekend', 'what's happening for families', 'find music events in May'). Returns up to 20 events with display fields. The UI renders results as visual cards — you do not need to list every event in prose; a brief summary like 'Found 8 family events this weekend' is enough. This is different from find_events, which is only for resolving an event id when you need to edit something.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD (inclusive)" },
        end_date: { type: "string", description: "YYYY-MM-DD (inclusive)" },
        category_slug: {
          type: "string",
          description:
            "Category slug to filter by. Top-level: music, sports, performances, festivals, classes, outdoors, nightlife, date-night, friends-groups, family-kids, school, professional. Sports sub-slugs: baseball-softball, basketball, cross-country, football, golf, soccer, swimming-diving, tennis, track-field, volleyball, wrestling, cheerleading, bowling, hockey, lacrosse, pickleball, motorsports. Omit for all categories.",
        },
        search: { type: "string", description: "Optional free-text search on title, venue, description" },
      },
      required: [],
    },
  },
  {
    name: "find_events",
    description:
      "Search the event database by a free-text query (matches title, venue, description). Optionally restrict to a date range. Returns up to 10 matching events. Use this when the user refers to an existing event by name so you can resolve it to an id.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search" },
        start_date: { type: "string", description: "YYYY-MM-DD (inclusive)" },
        end_date: { type: "string", description: "YYYY-MM-DD (inclusive)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_event",
    description:
      "Fetch the full current fields of a single event by id. Use this right before proposing an update so you can show the user exactly what will change.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "integer" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "list_channels",
    description:
      "List all channels (organizations/venues) with their ids. Use this to resolve a venue/org name to a channel_id when creating or updating events.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "propose_create_event",
    description:
      "Propose creating a new event. The user will review your proposal and confirm before it is written. Fill in as many fields as you can from the user's request. title and start_date are required. Times must be 24h HH:MM format. Dates must be YYYY-MM-DD.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        start_time: { type: "string", description: "24h HH:MM, e.g. 19:00" },
        end_date: { type: "string" },
        end_time: { type: "string" },
        description: { type: "string" },
        venue: { type: "string" },
        address: { type: "string" },
        city: { type: "string" },
        state: { type: "string" },
        zip: { type: "string" },
        price: { type: "string" },
        organizer: { type: "string" },
        contact: { type: "string" },
        url: { type: "string" },
        external_url: { type: "string" },
        image_url: { type: "string" },
        tags: { type: "string", description: "semicolon-separated" },
        channel_id: { type: "integer" },
        is_online: { type: "boolean" },
        summary_for_user: {
          type: "string",
          description:
            "One-sentence human summary of what will be created, so the user knows what they're confirming.",
        },
      },
      required: ["title", "start_date", "summary_for_user"],
    },
  },
  {
    name: "propose_update_event",
    description:
      "Propose updating fields on an existing event. The user will review and confirm before it is written. Only include fields in `changes` that should actually change. Times in 24h HH:MM, dates YYYY-MM-DD.",
    parameters: {
      type: "object",
      properties: {
        event_id: { type: "integer" },
        changes: {
          type: "object",
          description: "Map of field -> new value. Only changed fields.",
          properties: {
            title: { type: "string" },
            start_date: { type: "string" },
            start_time: { type: "string" },
            end_date: { type: "string" },
            end_time: { type: "string" },
            description: { type: "string" },
            venue: { type: "string" },
            address: { type: "string" },
            city: { type: "string" },
            state: { type: "string" },
            zip: { type: "string" },
            price: { type: "string" },
            organizer: { type: "string" },
            contact: { type: "string" },
            url: { type: "string" },
            external_url: { type: "string" },
            image_url: { type: "string" },
            tags: { type: "string" },
            channel_id: { type: "integer" },
            is_online: { type: "boolean" },
          },
        },
        summary_for_user: {
          type: "string",
          description: "One-sentence summary of what will change.",
        },
      },
      required: ["event_id", "changes", "summary_for_user"],
    },
  },
];

const GEMINI_TOOLS = [{ functionDeclarations: TOOL_SCHEMAS }];
const PROPOSAL_TOOLS = new Set(["propose_create_event", "propose_update_event"]);

function systemInstruction() {
  const today = new Date().toISOString().slice(0, 10);
  return `You are an assistant that helps users discover, add, and edit community events in a Rockford-area event database. You work through tools — you do not write to the database directly. Your two write tools (propose_create_event, propose_update_event) only *propose* a change; the user confirms every write.

Event field format:
- Dates are YYYY-MM-DD.
- Times are 24-hour HH:MM (e.g. 19:00 for 7pm).
- Channels are organizations or venues. Channel ids come from list_channels. When the user names a venue (e.g. "Hard Rock Casino"), try list_channels to match it; if no close match, leave channel_id unset and mention it in summary_for_user.
- State defaults to IL, country to US, for the Rockford region.

Workflow rules:
- When the user wants to discover or browse events ("show me", "what's happening", "find events", "what can I do"), use query_events. After getting results, write a warm conversational response in this exact structure: (1) an enthusiastic intro paragraph that acknowledges the user's request and teases what you found, then on its own line write exactly [EVENTS], then (2) a short follow-up paragraph inviting them to pick something or ask for something more specific. The UI renders the event cards in place of [EVENTS] — do not list the events by name in your text.
- To update an existing event, call find_events first to resolve the name to an id. If there's ambiguity (multiple matches), ask the user which one rather than guessing.
- Before proposing an update, call get_event so you know the current values and can write a precise summary.
- Resolve relative dates against today: ${today}. "Saturday" means the next upcoming Saturday. "This weekend" means the upcoming Saturday and Sunday. If the user says "May 2nd" without a year, assume the next occurrence (this year if still upcoming, otherwise next year).
- Interpret intent for category_slug: "for kids" / "family" / "for the kids" → family-kids. "music" / "concert" / "live music" → music. "sports" → sports. "outdoors" / "hiking" → outdoors. "nightlife" / "bar" / "drinks" → nightlife. "date night" → date-night.
- If the user's message is ambiguous on a required field (title, date), ask for clarification instead of guessing.
- Keep responses short. When you call a propose_* tool, the UI renders a confirmation card — don't restate the details in prose afterward.
- You cannot delete events. If asked, say so.
- URL-to-event workflow: When the user provides a URL and asks to add or import an event from it, call fetch_url first to read the page. Extract as many event fields as possible from the returned content, then call propose_create_event. After the proposal tool call, always append a brief "Missing info:" line listing which of these fields you could not determine from the page: start_time, end_time, end_date, venue, address, city, zip, price, image_url, description, tags, organizer. Format it compactly, e.g. "Missing info: end time, image, tags." Only list fields that are actually blank in your proposal. If you filled everything, say "All key fields found." If fetch_url returns an error or empty content, tell the user and ask them to paste the relevant text.`;
}

function runQueryEvents({ search, category_slug, start_date, end_date }) {
  const taxonomy = category_slug ? getCategoryBySlug(category_slug)?.id : undefined;
  const result = searchEvents({
    search: search || undefined,
    taxonomy: taxonomy ?? undefined,
    startDate: start_date,
    endDate: end_date,
    limit: 5,
    page: 1,
    sort: "start_date",
  });
  return {
    total: result.total,
    events: result.events.map((e) => ({
      id: e.id,
      title: e.title,
      start_date: e.start_date,
      start_time: e.start_time,
      end_date: e.end_date,
      end_time: e.end_time,
      venue: e.venue,
      city: e.city,
      price: e.price,
      image_url: e.image_url,
      url: e.url,
      external_url: e.external_url,
      tags: e.tags,
    })),
  };
}

function runFindEvents({ query, start_date, end_date }) {
  const result = searchEvents({
    search: query,
    startDate: start_date,
    endDate: end_date,
    limit: 10,
    page: 1,
    sort: "start_date",
  });
  return {
    total: result.total,
    events: result.events.map((e) => ({
      id: e.id,
      title: e.title,
      start_date: e.start_date,
      start_time: e.start_time,
      venue: e.venue,
      city: e.city,
    })),
  };
}

function runGetEvent({ event_id }) {
  const ev = getEventWithSources(event_id);
  if (!ev) return { error: `No event with id ${event_id}` };
  const keep = [
    "id", "title", "start_date", "start_time", "end_date", "end_time",
    "description", "venue", "address", "city", "state", "zip",
    "price", "organizer", "contact", "url", "external_url", "image_url",
    "tags", "channel_id", "is_online", "recurring", "recurrence_frequency",
  ];
  const out = {};
  for (const k of keep) out[k] = ev[k];
  return out;
}

function runListChannels() {
  return getChannels().map((c) => ({ id: c.id, name: c.name, type: c.type, event_count: c.event_count }));
}

function extractPageContent(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

  const metaLines = [];
  for (const m of html.matchAll(/<meta\s+([^>]+)>/gi)) {
    const tag = m[1];
    const nameMatch = tag.match(/(?:name|property)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/content\s*=\s*["']([^"']*?)["']/i);
    if (nameMatch && contentMatch && contentMatch[1].trim()) {
      metaLines.push(`${nameMatch[1]}: ${contentMatch[1].trim()}`);
    }
  }

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 6000);

  const parts = [];
  if (title) parts.push(`Page title: ${title}`);
  if (metaLines.length) parts.push(`Meta tags:\n${metaLines.join("\n")}`);
  parts.push(`Page text:\n${bodyText}`);
  return parts.join("\n\n");
}

async function runFetchUrl({ url }) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}: ${res.statusText}` };
    const html = await res.text();
    const content = extractPageContent(html);
    if (content.length < 100) return { error: "Page returned no readable content — it may require JavaScript to render. Ask the user to paste the relevant text instead." };
    return { url, content };
  } catch (err) {
    return { error: err.message };
  }
}

async function executeServerTool(name, input) {
  try {
    if (name === "query_events") return runQueryEvents(input);
    if (name === "find_events") return runFindEvents(input);
    if (name === "get_event") return runGetEvent(input);
    if (name === "list_channels") return runListChannels();
    if (name === "fetch_url") return await runFetchUrl(input);
    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err.message };
  }
}

// Look backward from `fromIndex` in Claude-style messages to find the tool_use
// block whose id matches `toolUseId` and return its name.
function resolveToolName(messages, fromIndex, toolUseId) {
  for (let i = fromIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const block of m.content) {
      if (block.type === "tool_use" && block.id === toolUseId) return block.name;
    }
  }
  return "unknown_tool";
}

// Convert Claude-style wire-format messages into Gemini `contents`.
function toGeminiContents(messages) {
  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") {
      if (typeof m.content === "string") {
        out.push({ role: "user", parts: [{ text: m.content }] });
      } else if (Array.isArray(m.content)) {
        const parts = [];
        for (const block of m.content) {
          if (block.type === "tool_result") {
            const name = resolveToolName(messages, i, block.tool_use_id);
            let response;
            try {
              const parsed = JSON.parse(block.content);
              response = parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? parsed
                : { result: parsed };
            } catch {
              response = { result: String(block.content) };
            }
            parts.push({ functionResponse: { name, response } });
          } else if (block.type === "text" && block.text) {
            parts.push({ text: block.text });
          }
        }
        if (parts.length) out.push({ role: "user", parts });
      }
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      const parts = [];
      for (const block of m.content) {
        if (block.type === "text" && block.text) {
          const part = { text: block.text };
          if (block._thought_signature) part.thoughtSignature = block._thought_signature;
          parts.push(part);
        } else if (block.type === "tool_use") {
          const part = { functionCall: { name: block.name, args: block.input || {} } };
          if (block._thought_signature) part.thoughtSignature = block._thought_signature;
          parts.push(part);
        }
      }
      if (parts.length) out.push({ role: "model", parts });
    }
  }
  return out;
}

// Convert a Gemini response candidate into a Claude-style assistant content array.
function fromGeminiResponse(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const blocks = [];
  let stopReason = "end_turn";
  for (const p of parts) {
    if (p.text) {
      const block = { type: "text", text: p.text };
      if (p.thoughtSignature) block._thought_signature = p.thoughtSignature;
      blocks.push(block);
    } else if (p.functionCall) {
      const block = {
        type: "tool_use",
        id: `toolu_${randomUUID().replace(/-/g, "").slice(0, 22)}`,
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      };
      if (p.thoughtSignature) block._thought_signature = p.thoughtSignature;
      blocks.push(block);
      stopReason = "tool_use";
    }
  }
  return { content: blocks, stopReason };
}

async function streamWithRetry(ai, params, maxRetries = 3) {
  let delay = 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContentStream(params);
    } catch (err) {
      const isRetryable = err instanceof ApiError && (err.status === 503 || err.status === 429);
      if (!isRetryable || attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

router.post("/", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const ai = getClient();
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      send({ type: "error", error: "messages[] required" });
      return res.end();
    }

    const convo = [...messages];
    const MAX_ITERATIONS = 8;
    let eventSearchResults = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const stream = await streamWithRetry(ai, {
        model: MODEL,
        contents: toGeminiContents(convo),
        config: {
          systemInstruction: systemInstruction(),
          tools: GEMINI_TOOLS,
          temperature: 0.2,
        },
      });

      // Collect all parts while streaming text tokens live to the client.
      // Function calls arrive without text preamble, so we can stream text
      // immediately — if a function call does appear, stop streaming text.
      const allParts = [];
      let sawFunctionCall = false;

      for await (const chunk of stream) {
        const parts = chunk?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          allParts.push(part);
          if (part.functionCall) {
            sawFunctionCall = true;
          } else if (part.text && !sawFunctionCall) {
            send({ type: "delta", text: part.text });
          }
        }
      }

      // Reconstruct a full response object so fromGeminiResponse can parse it.
      const { content, stopReason } = fromGeminiResponse({
        candidates: [{ content: { parts: allParts } }],
      });

      if (content.length === 0) {
        send({ type: "done", messages: convo, pending_proposals: [], event_search_results: eventSearchResults });
        return res.end();
      }

      convo.push({ role: "assistant", content });

      if (stopReason !== "tool_use") {
        send({ type: "done", messages: convo, pending_proposals: [], event_search_results: eventSearchResults });
        return res.end();
      }

      const toolUses = content.filter((b) => b.type === "tool_use");
      const proposals = toolUses.filter((t) => PROPOSAL_TOOLS.has(t.name));

      if (proposals.length > 0) {
        send({
          type: "done",
          messages: convo,
          pending_proposals: proposals.map((p) => ({
            tool_use_id: p.id,
            tool_name: p.name,
            input: p.input,
          })),
          event_search_results: eventSearchResults,
        });
        return res.end();
      }

      const STATUS = {
        query_events: "Finding events…",
        find_events: "Looking up events…",
        get_event: "Pulling up event details…",
        list_channels: "Checking organizations…",
        fetch_url: "Reading the page…",
      };
      const statusMsg = STATUS[toolUses[0]?.name] ?? "Working on it…";
      send({ type: "status", message: statusMsg });

      const toolResults = await Promise.all(toolUses.map(async (t) => {
        const result = await executeServerTool(t.name, t.input);
        if (t.name === "query_events") eventSearchResults = result;
        return {
          type: "tool_result",
          tool_use_id: t.id,
          content: JSON.stringify(result),
        };
      }));
      convo.push({ role: "user", content: toolResults });
    }

    send({ type: "error", error: "Max tool iterations reached" });
    res.end();
  } catch (err) {
    console.error("[/api/chat] error:", err);
    send({ type: "error", error: err.message });
    res.end();
  }
});

export default router;
