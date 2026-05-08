# @caikiji/mcp-search

MCP server for web search powered by [SearXNG](https://docs.searxng.org/) — a privacy-respecting, self-hosted metasearch engine.

## Features

- Single tool: `search` — search the web and get formatted results with titles, URLs, and snippets
- Multi-engine aggregation (Brave, DuckDuckGo, Bing News, and more)
- Language, category, time range, and engine filtering
- Works with any SearXNG instance

## Installation

```bash
npm install -g @caikiji/mcp-search
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `SEARCH_URL` | — (required) | Your SearXNG instance URL, e.g. `https://search.example.com` |
| `SEARCH_AUTH` | — | Basic auth credentials (`user:pass`), if your instance is behind nginx auth |
| `SEARCH_TIMEOUT` | `15000` | Request timeout in ms |
| `SEARCH_DEFAULT_COUNT` | `10` | Default results per search |

## Usage

### MCP Client Config

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

### Tools

#### `search`

Search the web via SearXNG.

Parameters:
- `query` (required) — Search query
- `language` — Language code (e.g. `zh-CN`, `en-US`, `auto`)
- `categories` — Comma-separated: `general`, `news`, `images`, `video`, `music`, `it`, `science`, `files`, `social media`
- `time_range` — `day`, `week`, `month`, `year`
- `engines` — Comma-separated engine names
- `pageno` — Page number (default: 1)
- `count` — Results to return (1-50, default: 10)

## License

MIT
