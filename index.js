#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { NodeHtmlMarkdown } from "node-html-markdown";

const SEARCH_URL = process.env.SEARCH_URL || "";
const SEARCH_AUTH = process.env.SEARCH_AUTH || "";
const SEARCH_TIMEOUT = parseInt(process.env.SEARCH_TIMEOUT || "15000", 10);
const FETCH_TIMEOUT = parseInt(process.env.FETCH_TIMEOUT || "15000", 10);
const DEFAULT_COUNT = parseInt(process.env.SEARCH_DEFAULT_COUNT || "10", 10);
const DEFAULT_MAX_LENGTH = parseInt(process.env.SEARCH_MAX_LENGTH || "8000", 10);
const FETCH_UA = process.env.FETCH_USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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

function fetchWithTimeout(url, timeout, withAuth = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { "User-Agent": FETCH_UA };
  if (withAuth && SEARCH_AUTH) {
    headers.Authorization = `Basic ${Buffer.from(SEARCH_AUTH).toString("base64")}`;
  }
  return fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function fetchJson(url) {
  return fetchWithTimeout(url, SEARCH_TIMEOUT, true).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
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

function formatResults(data, count, format = "full") {
  const results = (data.results || []).slice(0, count);
  const lines = [];

  if (format === "compact") {
    if (!results.length) {
      if (data.unresponsive_engines?.length) {
        const msgs = data.unresponsive_engines.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
        return `Unresponsive: ${msgs.join(", ")}. No results.`;
      }
      return "No results.";
    }
    const engines = [...new Set(results.map((r) => r.engine).filter(Boolean))];
    lines.push(`${results.length} results | Sources: ${engines.join(", ") || "unknown"}`);
    results.forEach((r, i) => {
      lines.push(`[${i + 1}] ${safeStr(r.title)} — ${safeStr(r.url)}`);
    });
    if (data.unresponsive_engines?.length) {
      const msgs = data.unresponsive_engines.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
      lines.push(`Unresponsive: ${msgs.join(", ")}`);
    }
    return lines.join("\n");
  }

  if (!results.length) {
    if (data.answers?.length) {
      lines.push("Answer:");
      data.answers.forEach((a) => lines.push(fmtAnswer(a)));
    }
    if (data.unresponsive_engines?.length) {
      const msgs = data.unresponsive_engines.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
      lines.push(`Unresponsive: ${msgs.join(", ")}. No results.`);
    } else {
      lines.push("No results.");
    }
    return lines.join("\n");
  }

  const engines = [...new Set(results.map((r) => r.engine).filter(Boolean))];
  lines.push(`${results.length} results | Sources: ${engines.join(", ") || "unknown"}`);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (i > 0) lines.push("");
    lines.push(`[${i + 1}] ${safeStr(r.title)}`);
    lines.push(`URL: ${safeStr(r.url)}`);
    if (r.engine) lines.push(`Src: ${safeStr(r.engine)}`);
    if (r.publishedDate) lines.push(`Date: ${safeStr(r.publishedDate)}`);
    if (r.content) {
      lines.push("");
      lines.push(safeStr(r.content));
    }
  }

  if (data.answers?.length) {
    lines.push("");
    lines.push("Answer:");
    data.answers.forEach((a) => lines.push(fmtAnswer(a)));
  }

  if (data.infoboxes?.length) {
    const info = data.infoboxes[0];
    lines.push("");
    if (info.title) lines.push(`Info: ${safeStr(info.title)}`);
    if (info.content) lines.push(safeStr(info.content));
    if (info.url) lines.push(`Link: ${safeStr(info.url)}`);
  }

  if (data.unresponsive_engines?.length) {
    const msgs = data.unresponsive_engines.map((e) => Array.isArray(e) ? `${e[0]} (${e[1] || "no response"})` : safeStr(e));
    lines.push(`Unresponsive: ${msgs.join(", ")}`);
  }

  return lines.join("\n");
}

async function fetchPage(url, maxLength) {
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/") && !contentType.includes("html")) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }
  const html = await res.text();
  const md = NodeHtmlMarkdown.translate(html, {
    codeBlockStyle: "fenced",
    ignoreAllLinks: true,
    maxConsecutiveNewlines: 2,
  });
  const cleaned = md.replace(/^\s*\n/gm, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + `\n\n---\n*Truncated. Page is ${cleaned.length} chars; shown ${maxLength}.*`;
}

const server = new Server(
  { name: "mcp-search", version: "1.0.2" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search",
      description: "Web search. Returns ranked results with title, URL, snippet, and source engine.",
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
          format: { type: "string", description: "full (title+URL+snippet) or compact (title+URL only). Default: full" },
        },
        required: ["query"],
      },
    },
    {
      name: "search_result",
      description: "Fetch a URL from search results and return its content as Markdown. Works on blogs, docs, and most sites. May fail on sites with Cloudflare/JS challenges (StackOverflow, Wikipedia). Best for reading articles and documentation.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          max_length: { type: "number", description: "Max chars to return (500-50000). Default: 8000" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_engines",
      description: "Discover available search engines and their categories.",
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
      const format = args?.format === "compact" ? "compact" : "full";

      const data = await performSearch({
        query: query.trim(),
        language: args?.language,
        categories: args?.categories,
        engines: args?.engines,
        time_range: args?.time_range,
        pageno: args?.pageno,
      });

      return {
        content: [{ type: "text", text: formatResults(data, count, format) }],
      };
    }

    if (name === "search_result") {
      const url = args?.url;
      if (!url || typeof url !== "string" || !url.trim()) {
        return { isError: true, content: [{ type: "text", text: "url is required" }] };
      }

      let parsed;
      try {
        parsed = new URL(url.trim());
      } catch {
        return { isError: true, content: [{ type: "text", text: "Invalid URL" }] };
      }

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { isError: true, content: [{ type: "text", text: "Only http/https URLs are supported" }] };
      }

      const maxLength = Math.min(Math.max(parseInt(args?.max_length) || DEFAULT_MAX_LENGTH, 500), 50000);

      const content = await fetchPage(url.trim(), maxLength);
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "list_engines") {
      let engines = {};

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
        // /stats unavailable, fall back to probing
      }

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
          content: [{ type: "text", text: "Unable to retrieve engine list." }],
        };
      }

      const lines = ["## Available Engines\n"];
      for (const [ename, info] of Object.entries(engines).sort()) {
        const status = info.enabled ? "✅" : "❌";
        const cats = Array.isArray(info.categories) ? info.categories.join(", ") : safeStr(info.categories);
        lines.push(`  ${status} **${ename}** — ${cats}`);
      }
      lines.push("");
      lines.push("> Use engines parameter in search, e.g. `engines=\"duckduckgo\"`");
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
