# @caikiji/mcp-search

基于 [SearXNG](https://docs.searxng.org/) 的 MCP 网页搜索服务器 — 隐私友好的自建元搜索引擎。

## 特性

- 单一工具：`search` — 搜索网页，返回标题、链接和摘要
- 多引擎聚合（Brave、DuckDuckGo、Bing News 等）
- 支持语言、分类、时间范围、指定引擎过滤
- 适用于任何 SearXNG 实例

## 安装

```bash
npm install -g @caikiji/mcp-search
```

## 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `SEARCH_URL` | —（必填） | SearXNG 实例地址，例如 `https://search.example.com` |
| `SEARCH_AUTH` | — | Basic 认证凭据（`user:pass`），如果实例在 nginx 后面需要认证 |
| `SEARCH_TIMEOUT` | `15000` | 请求超时时间（毫秒） |
| `SEARCH_DEFAULT_COUNT` | `10` | 默认返回结果数 |

## 使用

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

### 工具

#### `search`

通过 SearXNG 搜索网页。

参数：
- `query`（必填）— 搜索关键词
- `language` — 语言代码，如 `zh-CN`、`en-US`、`auto`
- `categories` — 逗号分隔：`general`、`news`、`images`、`video`、`music`、`it`、`science`、`files`、`social media`
- `time_range` — `day`、`week`、`month`、`year`
- `engines` — 逗号分隔的搜索引擎名称
- `pageno` — 页码（默认 1）
- `count` — 返回结果数（1-50，默认 10）

## License

MIT
