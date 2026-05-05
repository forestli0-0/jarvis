# JARVIS

Just A Rather Very Intelligent System — 个人 AI 管家

基于 TypeScript + Node.js 构建的本地 AI 助手，支持工具调用、联网搜索、记忆系统和流式对话。

## 功能

- **流式对话** — 实时逐字输出，支持 Markdown 渲染
- **工具调用** — Agent 循环，支持多轮工具调用
  - `web_search` — 联网搜索（Tavily / Serper / Bing / 百度 多级回退）
  - `web_fetch` — 抓取网页正文内容，用于深入阅读搜索结果
  - `file` — 读写文件
  - `shell` — 执行系统命令
  - `code_exec` — 执行代码
  - `memory_trace` — 追溯记忆源头，查看记忆来自哪次对话
- **分层记忆系统**
  - 短期记忆（short）/ 长期记忆（long）双层结构
  - 基于 Jaccard 相似度的记忆去重（中文 bigram 支持）
  - 自动整合：短期记忆超过 1 天或命中 3 次后提升为长期
  - 记忆源头追溯：每条记忆关联来源对话
- **深色科技风 UI** — 钢铁侠 JARVIS 风格，扫描线动画

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

复制并编辑配置文件：

```bash
cp jarvis.config.example.json jarvis.config.json
```

```json
{
  "model": {
    "provider": "openai-compatible",
    "base_url": "https://your-api-endpoint/v1",
    "api_key": "your-api-key",
    "model_name": "your-model-name"
  },
  "server": {
    "port": 3000
  },
  "search": {
    "provider": "tavily",
    "api_key": "your-tavily-api-key"
  },
  "workspace": "./data/workspace"
}
```

**模型**：支持任何 OpenAI 兼容 API（OpenAI、Mimo、Deepseek 等）

**搜索**（可选）：推荐 [Tavily](https://tavily.com)（免费 1000 次/月）或 [Serper](https://serper.dev)（免费 2500 次/月）。不配置则回退到 Bing 爬虫。

### 3. 构建 & 运行

```bash
npm run build
npm start
```

开发模式（热重载）：

```bash
npm run dev
```

访问 http://localhost:3000

## 项目结构

```
src/
  agent/          # Agent 核心循环、模型适配、类型定义
  db/             # SQLite 数据库（better-sqlite3, WAL 模式）
  memory/         # 记忆系统（存储、摘要、上下文构建）
  routes/         # Express API 路由
  tools/          # 工具实现（搜索、文件、Shell、代码执行等）
  config.ts       # 配置加载
  server.ts       # 服务器入口
web/
  dist/           # 前端静态文件（单 HTML，内联 CSS/JS）
```

## API

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/chat` | WebSocket | 流式对话 |
| `/api/conversations` | GET | 会话列表 |
| `/api/conversations/:id` | GET | 会话详情 |
| `/api/memory` | GET | 记忆列表（支持 `?tier=short\|long`） |
| `/api/memory/:id/chain` | GET | 记忆源头链 |
| `/api/memory/consolidate` | POST | 手动触发记忆整合 |
| `/api/config` | GET | 当前配置（API key 脱敏） |

## 技术栈

- **后端**：TypeScript, Express, Socket.IO, better-sqlite3
- **前端**：原生 HTML/CSS/JS, Socket.IO client, marked.js
- **模型**：OpenAI 兼容 API
- **搜索**：Tavily API / Serper API / Bing 爬虫 / 百度爬虫

## License

MIT
