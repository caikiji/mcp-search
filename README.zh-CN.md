<p align="center">
  <br/>
  <h1 align="center">🔎 @caikiji/mcp-search</h1>
  <p align="center">MCP 网页搜索服务器 — 隐私友好、自建的元搜索</p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@caikiji/mcp-search"><img src="https://img.shields.io/npm/v/@caikiji/mcp-search?style=flat-square&logo=npm" alt="npm version"/></a>
    <a href="https://www.npmjs.com/package/@caikiji/mcp-search"><img src="https://img.shields.io/npm/dm/@caikiji/mcp-search?style=flat-square" alt="npm downloads"/></a>
    <a href="https://github.com/caikiji/mcp-search"><img src="https://img.shields.io/github/stars/caikiji/mcp-search?style=flat-square&logo=github" alt="github stars"/></a>
    <a href="./README.md"><img src="https://img.shields.io/badge/docs-English-blue?style=flat-square" alt="English docs"/></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square&logo=node.js" alt="node version"/>
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="license"/>
  </p>
  <p align="center">
    <b><a href="#安装">安装</a></b>
    ·
    <b><a href="#配置">配置</a></b>
    ·
    <b><a href="#工具">工具</a></b>
    ·
    <b><a href="./README.md">English Docs</a></b>
  </p>
  <br/>
</p>

## ✨ 特性

- **🌐 网页搜索** — 聚合多引擎结果（Brave、DuckDuckGo、Bing News 等）
- **📄 内容抓取** — 搜索结果中直接点开链接，转 Markdown
- **🔍 引擎发现** — `info` 查看引擎数量；`info scope: "engines"` 查看完整列表
- **🎯 Token 高效** — compact 模式、智能截断、去重
- **🔒 自建** — 配合自己的 SearXNG 实例，完全隐私可控

## 安装

```bash
npm install -g @caikiji/mcp-search
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|----------|---------|------|
| `SEARCH_URL` | — | SearXNG 实例地址（必填） |
| `SEARCH_AUTH` | — | Basic 认证凭据（`user:pass`）。如果实例是公开的，留空即可。 |
| `SEARCH_TIMEOUT` | `15000` | SearXNG API 超时（毫秒） |
| `SEARCH_FETCH_TIMEOUT` | `15000` | 页面抓取超时（毫秒） |
| `SEARCH_DEFAULT_COUNT` | `10` | 默认返回结果数（1–50） |
| `SEARCH_MAX_LENGTH` | `8000` | 页面抓取最大字符数（500–50000） |
| `SEARCH_SNIPPET_LENGTH` | `300` | 搜索结果片段截断长度 |
| `SEARCH_FETCH_UA` | Chrome UA | 页面抓取的 User-Agent |

### MCP 客户端配置

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

## 工具

### 搜索

| 工具 | 参数 | 说明 |
|------|------|------|
| `query` | `query`, `[language]`, `[categories]`, `[time_range]`, `[engines]`, `[pageno]`, `[count]`, `[format]` | 网页搜索，自动去重 + 智能截断。`format: "compact"` 最小 token 消耗。 |
| `result` | `url`, `[max_length]` | 打开搜索结果中的链接，返回 Markdown 正文。 |
| `info` | `[scope]` | 实例信息。默认显示数量摘要。`scope: "engines"` 列出所有引擎及分类。 |

### `query` 参数

| 参数 | 说明 |
|------|------|
| `query` | 搜索关键词（必填） |
| `site` | 限定域名，如 `github.com`。会在查询前追加 `site:`。 |
| `language` | 语言代码（`zh-CN`、`en-US`、`auto`）。默认：`auto` |
| `categories` | 逗号分隔：`general`, `news`, `images`, `video`, `music`, `it`, `science`, `files`, `social media` |
| `time_range` | `day`, `week`, `month`, `year` |
| `engines` | 逗号分隔引擎名。用 `info` 查看可用项 |
| `pageno` | 页码。默认：`1` |
| `count` | 返回结果数（1–50）。默认：`10` |
| `format` | `full`（标题+URL+摘要）或 `compact`（仅标题+URL，最少 token）。默认：`full` |
| `depth` | `true` 时强制 `count=1`，自动抓取首条结果的 reader 正文。省掉搜索→挑选→打开的往返。默认：`false` |

### 输出格式

**Full 模式：**
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

**Compact 模式：**
```
5 results | Sources: duckduckgo
[1] Title — https://...
[2] Next Title — https://...
```

---

<p align="center">
  <a href="./README.md">📖 English Docs</a>
</p>
