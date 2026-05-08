<p align="center">
  <br/>
  <h1 align="center">🔎 @caikiji/mcp-search</h1>
  <p align="center">MCP server for web search — privacy-respecting, self-hosted metasearch</p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@caikiji/mcp-search"><img src="https://img.shields.io/npm/v/@caikiji/mcp-search?style=flat-square&logo=npm" alt="npm version"/></a>
    <a href="https://www.npmjs.com/package/@caikiji/mcp-search"><img src="https://img.shields.io/npm/dm/@caikiji/mcp-search?style=flat-square" alt="npm downloads"/></a>
    <a href="https://github.com/caikiji/mcp-search"><img src="https://img.shields.io/github/stars/caikiji/mcp-search?style=flat-square&logo=github" alt="github stars"/></a>
    <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/文档-中文-blue?style=flat-square" alt="中文文档"/></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js" alt="node version"/>
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license"/>
  </p>
  <p align="center">
    <b><a href="#installation">Installation</a></b>
    ·
    <b><a href="#configuration">Configuration</a></b>
    ·
    <b><a href="#tools">Tools</a></b>
    ·
    <b><a href="./README.zh-CN.md">中文文档</a></b>
  </p>
  <br/>
</p>

## ✨ Features

- **🌐 Web search** — aggregates results from multiple engines (Brave, DuckDuckGo, Bing News, etc.)
- **📄 Page fetch** — read full page content from search results as Markdown
- **🔍 Engine discovery** — `list_engines` to see what's available on your instance
- **🎯 Token efficient** — compact mode, smart snippet truncation, deduplicated results
- **🔒 Self-hosted** — works with your own SearXNG instance, full privacy control

## Installation

```bash
npm install -g @caikiji/mcp-search
```

## Configuration

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_URL` | — | Your SearXNG instance URL (required) |
| `SEARCH_AUTH` | — | Basic auth credentials (`user:pass`). Leave empty if your instance is public. |
| `SEARCH_TIMEOUT` | `15000` | SearXNG API timeout (ms) |
| `SEARCH_FETCH_TIMEOUT` | `15000` | Page fetch timeout (ms) |
| `SEARCH_DEFAULT_COUNT` | `10` | Default results per search (1–50) |
| `SEARCH_MAX_LENGTH` | `8000` | Max chars for `result` content (500–50000) |
| `SEARCH_SNIPPET_LENGTH` | `300` | Max chars for result snippet (truncated at word boundary) |
| `SEARCH_FETCH_UA` | Chrome UA | User-Agent for page fetching |

### MCP Client config

```json
{
  "mcpServers": {
    "search": {
      "command": "npx",
      "args": ["-y", "@caikiji/mcp-search"],
      "env": {
        "SEARCH_URL": "https://search.example.com",
        "SEARCH_AUTH": "user:password"
      }
    }
  }
}
```

## Tools

### Search

| Tool | Arguments | Description |
|------|-----------|-------------|
| `query` | `query`, `[language]`, `[categories]`, `[time_range]`, `[engines]`, `[pageno]`, `[count]`, `[format]` | Web search with dedup, snippet, and source info. `format: "compact"` for minimal token usage. |
| `result` | `url`, `[max_length]` | Fetch a URL from results and return as Markdown. Works on most blogs/docs sites. |
| `list_engines` | — | Discover which engines are available and their categories. |

### `query` parameters

| Param | Description |
|-------|-------------|
| `query` | Search query (required) |
| `site` | Restrict to domain, e.g. `github.com`. Prepends `site:` to the query. |
| `language` | Language code (`zh-CN`, `en-US`, `auto`). Default: `auto` |
| `categories` | Comma-separated: `general`, `news`, `images`, `video`, `music`, `it`, `science`, `files`, `social media` |
| `time_range` | `day`, `week`, `month`, `year` |
| `engines` | Comma-separated engine names. Use `list_engines` to see available ones |
| `pageno` | Page number. Default: `1` |
| `count` | Results to return (1–50). Default: `10` |
| `format` | `full` (title+URL+snippet) or `compact` (title+URL only, minimal tokens). Default: `full` |
| `depth` | When `true`, forces `count=1` and fetches the top result's full content via reader mode. Saves the query→pick→fetch round trip. Default: `false` |

### Output format

**Full mode:**
```
5 results | Sources: duckduckgo,brave
[1] Title
URL: https://...
Src: duckduckgo

Snippet text here (truncated to 300 chars)...

[2] Next Title
URL: https://...
Src: google +2
```

**Compact mode:**
```
5 results | Sources: duckduckgo
[1] Title — https://...
[2] Next Title — https://...
```

---

<p align="center">
  <a href="./README.zh-CN.md">📖 中文文档</a>
</p>
