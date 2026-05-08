#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SEARCH_URL = process.env.SEARCH_URL || "";
const SEARCH_AUTH = process.env.SEARCH_AUTH || "";
const SEARCH_TIMEOUT = parseInt(process.env.SEARCH_TIMEOUT || "15000", 10);
const DEFAULT_COUNT = parseInt(process.env.SEARCH_DEFAULT_COUNT || "10", 10);

const authHeaders = SEARCH_AUTH
  ? { Authorization: `Basic ${Buffer.from(SEARCH_AUTH).toString("base64")}` }
  : {};

function safeStr(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.url) return `${v.title || ""} — ${v.url}`;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function fmtAnswer(a) {
  if (a === null || a === undefined) return "";
  if (typeof a === "object") {
    const parts = [];
    if (a.title) parts.push(a.title);
    if (a.content) parts.push(a.content);
    if (a.url && !a.title) parts.push(a.url);
    return parts.filter(Boolean).join("\n") || safeStr(a);
  }
  return String(a);
}

function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
  return fetch(url, {
    headers: { ...authHeaders, "User-Agent": "mcp-search/1.0" },
    signal: controller.signal,
  }).then(async (res) => {
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }).catch((err) => {
    clearTimeout(timer);
    throw err;
  });
}

function buildSearchUrl(params) {
  const url = new URL("/search", SEARCH_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", params.query);
  for (const key of ["language", "categories", "engines", "time_range", "pageno"]) {
    if (params[key]) url.searchParams.set(key, String(params[key]));
  }
  return url.toString();
}

async function performSearch(params) {
  return fetchJson(buildSearchUrl(params));
}

function formatResults(data, count) {
  const results = (data.results || []).slice(0, count);
  const lines = [];

  lines.push(`## Search: ${safeStr(data.query)}\n`);

  if (!results.length) {
    if (data.answers?.length) {
      const answers = data.answers.map((a) => fmtAnswer(a)).join("\n\n");
      lines.push("**Answer:**\n" + answers + "\n");
    }
    const unresponsive = data.unresponsive_engines;
    if (unresponsive?.length) {
      const msgs = unresponsive.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
      lines.push(`⚠️ Unresponsive engines: ${msgs.join(", ")}`);
    }
    lines.push("No results found.\n");
    return lines.join("\n");
  }

  const engines = [...new Set(results.map((r) => r.engine).filter(Boolean))];
  lines.push(`${results.length} results | Sources: ${engines.join(", ") || "unknown"}\n`);

  for (const r of results) {
    lines.push(`### ${safeStr(r.title)}`);
    lines.push(`🔗 ${safeStr(r.url)}`);
    if (r.engine) lines.push(`📡 ${safeStr(r.engine)}`);
    if (r.publishedDate) lines.push(`📅 ${safeStr(r.publishedDate)}`);
    if (r.content) lines.push(`\n${safeStr(r.content)}`);
    lines.push("---");
  }

  if (data.answers?.length) {
    const answers = data.answers.map((a) => fmtAnswer(a)).join("\n\n");
    lines.push("**Answer:**\n" + answers);
    lines.push("---");
  }

  if (data.infoboxes?.length) {
    const info = data.infoboxes[0];
    lines.push(`**Info: ${safeStr(info.title)}**`);
    if (info.content) lines.push(safeStr(info.content));
    if (info.url) lines.push(`Link: ${safeStr(info.url)}`);
    lines.push("---");
  }

  const unresponsive = data.unresponsive_engines;
  if (unresponsive?.length) {
    const msgs = unresponsive.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
    lines.push(`⚠️ Unresponsive engines: ${msgs.join(", ")}`);
  }

  return lines.join("\n");
}

const server = new Server(
  { name: "mcp-search", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description: "Web search via SearXNG metasearch. Returns ranked results with title, URL, snippet, and source engine.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          language: { type: "string", description: "Language code (zh-CN, en-US, auto). Default: auto" },
          categories: { type: "string", description: "Comma-separated: general, news, images, video, music, it, science, files, social media" },
          time_range: { type: "string", description: "day, week, month, year" },
          engines: { type: "string", description: "Comma-separated engines. Use list_engines to discover available ones" },
          pageno: { type: "number", description: "Page number. Default: 1" },
          count: { type: "number", description: "Results to return (1-50). Default: 10" },
        },
        required: ["query"],
      },
    },
    {
      name: "list_engines",
      description: "Discover available search engines and their categories on this SearXNG instance.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "search") {
      const query = args?.query;
      if (!query || typeof query !== "string" || !query.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "query is required and must be a non-empty string" }],
        };
      }

      const count = Math.min(Math.max(parseInt(args?.count) || DEFAULT_COUNT, 1), 50);

      const data = await performSearch({
        query: query.trim(),
        language: args?.language,
        categories: args?.categories,
        engines: args?.engines,
        time_range: args?.time_range,
        pageno: args?.pageno,
      });

      return {
        content: [{ type: "text", text: formatResults(data, count) }],
      };
    }

    if (name === "list_engines") {
      let engines = {};

      // Try /stats API first
      const statsUrl = new URL("/stats", SEARCH_URL).toString();
      try {
        const stats = await fetchJson(statsUrl);
        if (stats?.engines) {
          for (const [name, info] of Object.entries(stats.engines)) {
            engines[name] = {
              categories: info.categories || info.category || [],
              enabled: info.enabled !== false,
            };
          }
        }
      } catch {
        // /stats unavailable (404/403/500), fall back to probing
      }

      // If /stats didn't work, probe with a lightweight general search
      if (!Object.keys(engines).length) {
        try {
          const probe = await performSearch({ query: "a", count: 50 });
          const seen = new Set();
          for (const r of probe.results || []) {
            if (r.engine && !seen.has(r.engine)) {
              seen.add(r.engine);
              engines[r.engine] = {
                categories: [r.category || "general"],
                enabled: true,
              };
            }
          }
          if (probe.unresponsive_engines?.length) {
            for (const entry of probe.unresponsive_engines) {
              if (!Array.isArray(entry)) continue;
              const [ename, reason] = entry;
              if (ename && !engines[ename]) {
                engines[ename] = { categories: [reason || "unresponsive"], enabled: false };
              }
            }
          }
        } catch {
          // probe failed too
        }
      }

      if (!Object.keys(engines).length) {
        return {
          content: [{ type: "text", text: "Unable to retrieve engine list (/stats unavailable, probe returned no results)" }],
        };
      }

      const lines = ["## Available Engines\n"];
      for (const [ename, info] of Object.entries(engines).sort()) {
        const status = info.enabled ? "✅" : "❌";
        const cats = Array.isArray(info.categories) ? info.categories.join(", ") : safeStr(info.categories);
        lines.push(`  ${status} **${ename}** — ${cats}`);
      }
      lines.push("");
      lines.push("> Use engines parameter in search tool, e.g. `engines=\"brave,duckduckgo\"`");
      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message}` }],
    };
  }
});

async function main() {
  if (!SEARCH_URL) {
    console.error("[mcp-search] SEARCH_URL is not set.");
    process.exit(1);
  }

  process.on("uncaughtException", (err) => {
    console.error("[mcp-search] UNCAUGHT:", err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("[mcp-search] UNHANDLED REJECTION:", err?.stack || err);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
