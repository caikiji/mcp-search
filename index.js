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
  const url = buildSearchUrl(params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { ...authHeaders, "User-Agent": "mcp-search/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function formatResults(data, count) {
  const results = (data.results || []).slice(0, count);
  const lines = [];

  lines.push(`## 搜索结果: ${data.query}\n`);

  if (!results.length) {
    if (data.answers?.length) {
      lines.push("**直接回答:**\n" + data.answers.join("\n") + "\n");
    }
    lines.push("未找到相关网页结果。\n");
    return lines.join("\n");
  }

  const engines = [...new Set(results.map((r) => r.engine).filter(Boolean))];
  lines.push(`共 ${results.length} 条结果 | 来源: ${engines.join(", ") || "未知"}\n`);

  for (const r of results) {
    lines.push(`### ${r.title}`);
    lines.push(`🔗 ${r.url}`);
    if (r.engine) lines.push(`📡 ${r.engine}`);
    if (r.publishedDate) lines.push(`📅 ${r.publishedDate}`);
    if (r.content) lines.push(`\n${r.content}`);
    lines.push("---");
  }

  if (data.answers?.length) {
    lines.push("**直接回答:**\n" + data.answers.join("\n"));
    lines.push("---");
  }

  if (data.infoboxes?.length) {
    const info = data.infoboxes[0];
    lines.push(`**信息: ${info.title}**`);
    if (info.content) lines.push(info.content);
    if (info.url) lines.push(info.url);
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
      description: `Search the web via SearXNG metasearch engine. Returns formatted results with titles, URLs, and snippets from multiple search engines.

Examples:
- query="2026 AI trends" → general search
- query="今天天气" language="zh-CN" → Chinese results
- query="Nvidia stock" time_range="week" → recent
- query="AI framework" categories="news" → news only
- query="machine learning" engines="google,brave" → specific engines`,
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (required)" },
          language: { type: "string", description: "Language code: 'zh-CN', 'en-US', 'auto' (default: auto)" },
          categories: { type: "string", description: "Comma-separated: general, news, images, video, music, it, science, files, social media" },
          time_range: { type: "string", description: "day, week, month, year" },
          engines: { type: "string", description: "Comma-separated engine names: brave, duckduckgo, google, bing, etc." },
          pageno: { type: "number", description: "Page number (default: 1)" },
          count: { type: "number", description: "Results to return (1-50, default: 10)" },
        },
        required: ["query"],
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

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: "text", text: `Search error: ${err.message}` }],
    };
  }
});

async function main() {
  if (!SEARCH_URL) {
    console.error("[mcp-search] SEARCH_URL is not set. Please set the SEARCH_URL environment variable to your SearXNG instance URL.");
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
