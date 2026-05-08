#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFileSync } from "fs";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const SEARCH_URL = process.env.SEARCH_URL || "";
const SEARCH_AUTH = process.env.SEARCH_AUTH || "";
const SEARCH_TIMEOUT = parseInt(process.env.SEARCH_TIMEOUT || "15000", 10);
const SEARCH_FETCH_TIMEOUT = parseInt(process.env.SEARCH_FETCH_TIMEOUT || "15000", 10);
const SEARCH_DEFAULT_COUNT = parseInt(process.env.SEARCH_DEFAULT_COUNT || "10", 10);
const SEARCH_MAX_LENGTH = parseInt(process.env.SEARCH_MAX_LENGTH || "8000", 10);
const SEARCH_SNIPPET_LENGTH = parseInt(process.env.SEARCH_SNIPPET_LENGTH || "300", 10);
const SEARCH_FETCH_UA = process.env.SEARCH_FETCH_UA || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

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
    if (a.url) parts.push(a.url);
    return parts.filter(Boolean).join("\n") || safeStr(a);
  }
  return String(a);
}

function fetchWithTimeout(url, timeout, withAuth = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { "User-Agent": SEARCH_FETCH_UA };
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
  let q = params.query;
  if (params.site) q = `site:${params.site} ${q}`;
  url.searchParams.set("q", q);
  for (const key of ["language", "categories", "engines", "time_range", "pageno"]) {
    if (params[key]) url.searchParams.set(key, String(params[key]));
  }
  return url.toString();
}

async function performSearch(params) {
  return fetchJson(buildSearchUrl(params));
}

function truncateSnippet(text, max) {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.lastIndexOf(" ");
  return (last > max * 0.7 ? cut.slice(0, last) : cut) + "...";
}

function processResults(rawResults) {
  const seen = new Map();
  for (const r of rawResults) {
    const url = r.url || "";
    if (seen.has(url)) {
      seen.get(url).dedupedCount = (seen.get(url).dedupedCount || 0) + 1;
      continue;
    }
    seen.set(url, {
      ...r,
      content: truncateSnippet(r.content, SEARCH_SNIPPET_LENGTH) || "No preview.",
      dedupedCount: 0,
    });
  }
  return [...seen.values()];
}

function formatResults(data, count, format = "full") {
  const results = processResults((data.results || []).slice(0, count));
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
    if (data.suggestions?.length) {
      lines.push(`Suggestions: ${data.suggestions.map((s) => safeStr(s)).join(" | ")}`);
    }
    if (data.corrections?.length) {
      lines.push(`Did you mean: ${data.corrections.map((s) => safeStr(s)).join(" | ")}`);
    }
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
    lines.push(`[${i + 1}] ${safeStr(r.title)}`);
    lines.push(`URL: ${safeStr(r.url)}`);
    if (r.img_src) lines.push(`Image: ${safeStr(r.img_src)}`);
    if (r.engine) {
      const src = safeStr(r.engine);
      lines.push(`Src: ${src}${r.dedupedCount ? ` +${r.dedupedCount}` : ""}`);
    }
    if (r.publishedDate) lines.push(`Date: ${safeStr(r.publishedDate)}`);
    if (r.content) {
      lines.push("");
      lines.push(safeStr(r.content));
    }
  }

  if (data.suggestions?.length) {
    lines.push("");
    lines.push(`Suggestions: ${data.suggestions.map((s) => safeStr(s)).join(" | ")}`);
  }

  if (data.corrections?.length) {
    lines.push("");
    lines.push(`Did you mean: ${data.corrections.map((s) => safeStr(s)).join(" | ")}`);
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

async function fetchPage(url, maxLength, mode = "markdown") {
  const res = await fetchWithTimeout(url, SEARCH_FETCH_TIMEOUT);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/") && !contentType.includes("html")) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }
  const html = await res.text();

  if (mode === "reader") {
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article) throw new Error("Reader mode: could not extract content");
    const md = NodeHtmlMarkdown.translate(article.content, {
      codeBlockStyle: "fenced",
      ignoreAllLinks: true,
      maxConsecutiveNewlines: 2,
    });
    const cleaned = md.replace(/^\s*\n/gm, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const header = `# ${article.title}\n\n`;
    const maxBody = maxLength - header.length;
    if (cleaned.length <= maxBody) return header + cleaned;
    return header + cleaned.slice(0, maxBody) + `\n\n---\n*Truncated. Page is ${cleaned.length} chars; shown ${maxLength}.*`;
  }

  const md = NodeHtmlMarkdown.translate(html, {
    codeBlockStyle: "fenced",
    ignoreAllLinks: true,
    maxConsecutiveNewlines: 2,
  });
  const cleaned = md.replace(/^\s*\n/gm, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength) + `\n\n---\n*Truncated. Page is ${cleaned.length} chars; shown ${maxLength}.*`;
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const server = new Server(
  { name: "mcp-search", version: pkg.version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "query",
      description: "Web search. Returns ranked results with title, URL, snippet, and source engine.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          site: { type: "string", description: "Restrict to domain, e.g. github.com. Appends site: operator to query." },
          language: { type: "string", description: "Language code (zh-CN, en-US, auto). Default: auto" },
          categories: { type: "string", description: "Comma-separated: general, news, images, video, music, it, science, files, social media" },
          time_range: { type: "string", description: "day, week, month, year" },
          engines: { type: "string", description: "Comma-separated engines. Use info scope=engines to list available ones." },
          pageno: { type: "number", description: "Page number. Default: 1" },
          count: { type: "number", description: "Results to return (1-50). Default: 10" },
          format: { type: "string", description: "full (title+URL+snippet) or compact (title+URL only). Default: full" },
          depth: { type: "boolean", description: "When true, forces count=1 and fetches the top result's full content via reader mode. Saves the query→pick→fetch round trip. Default: false" },
        },
        required: ["query"],
      },
    },
    {
      name: "result",
      description: "Fetch a URL and return content as Markdown. mode: \"markdown\" (full page) or \"reader\" (extracted article, strips nav/ads, saves tokens). May fail on Cloudflare/JS-challenged sites.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to fetch" },
          max_length: { type: "number", description: "Max chars (500-50000). Default: 8000" },
          mode: { type: "string", description: "markdown (default, full page) or reader (extract article body, strips nav/ads/sidebars). reader may fail on pages without clear article structure (homepages, dashboards). On fetch-blocked sites (Cloudflare, Wikipedia) it fails the same as markdown mode." },
        },
        required: ["url"],
      },
    },
    {
      name: "info",
      description: "Instance info: engines, categories, settings. Default shows counts summary. Use scope=\"engines\" to list all available engine names for the engines parameter.",
      inputSchema: {
        type: "object",
        properties: {
          scope: { type: "string", description: "Scope: all (default, summary) or engines (full list with categories)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "query") {
      const query = args?.query;
      if (!query || typeof query !== "string" || !query.trim()) {
        return {
          isError: true,
          content: [{ type: "text", text: "query is required and must be a non-empty string" }],
        };
      }

      const depth = args?.depth === true;
      const count = depth ? 1 : Math.min(Math.max(parseInt(args?.count) || SEARCH_DEFAULT_COUNT, 1), 50);
      const format = args?.format === "compact" ? "compact" : "full";

      const data = await performSearch({
        query: query.trim(),
        site: args?.site,
        language: args?.language,
        categories: args?.categories,
        engines: args?.engines,
        time_range: args?.time_range,
        pageno: args?.pageno,
      });

      let text = formatResults(data, count, format);

      if (depth && data.results?.length) {
        const top = data.results[0];
        if (top.url) {
          try {
            const page = await fetchPage(top.url, SEARCH_MAX_LENGTH, "reader");
            text += `\n\nContent: (fetched from ${top.url})\n\n${page}`;
          } catch (e) {
            text += `\n\nContent: (fetch failed — ${e.message})`;
          }
        }
      }

      return {
        content: [{ type: "text", text }],
      };
    }

    if (name === "result") {
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

      const maxLength = Math.min(Math.max(parseInt(args?.max_length) || SEARCH_MAX_LENGTH, 500), 50000);
      const mode = args?.mode === "reader" ? "reader" : "markdown";

      const content = await fetchPage(url.trim(), maxLength, mode);
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "info") {
      const data = await fetchJson(new URL("/config", SEARCH_URL).toString());
      const scope = args?.scope || "all";
      const lines = [];

      if (scope === "all" || scope === "engines") {
        const enabled = [];
        const disabled = [];
        for (const e of data.engines || []) {
          (e.enabled ? enabled : disabled).push(e);
        }
        enabled.sort((a, b) => a.name.localeCompare(b.name));
        disabled.sort((a, b) => a.name.localeCompare(b.name));

        if (scope === "all") {
          lines.push(`Enabled: ${enabled.length} | Disabled: ${disabled.length}`);
        } else {
          lines.push(`Enabled (${enabled.length}):`);
          for (const e of enabled) lines.push(`  ${e.name} — ${(e.categories || []).join(", ")}`);
          if (disabled.length) {
            lines.push(`\nDisabled (${disabled.length}) — first 30:`);
            for (const e of disabled.slice(0, 30)) lines.push(`  ${e.name} — ${(e.categories || []).join(", ")}`);
            if (disabled.length > 30) lines.push(`  ... and ${disabled.length - 30} more`);
          }
          lines.push("\nUsage: engines parameter — comma-separated names, e.g. engines=\"duckduckgo,bing\"");
        }
      }

      if (scope === "all") {
        lines.push(`Safe search: ${data.safe_search} | v${data.version}`);
        const activePlugins = (data.plugins || []).filter(p => p.enabled).map(p => p.name);
        if (activePlugins.length) lines.push(`Plugins: ${activePlugins.join(", ")}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") || "No info available." }] };
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
