# Hot Monitor - 技术方案

## 1. 技术架构

```
┌─────────────────────────────────────────────────────┐
│                    前端 (public/)                     │
│        原生 HTML + CSS + JS（赛博朋克风格）             │
│   Bento Grid 布局 · 响应式 · Browser Notifications    │
└────────────────────────┬────────────────────────────┘
                         │ REST API
┌────────────────────────┴────────────────────────────┐
│                  后端 (server/)                       │
│              Node.js + Express                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 路由层    │  │ 定时任务  │  │ 通知管理器        │  │
│  │ routes/  │  │ node-cron│  │ SSE 实时推送       │  │
│  └────┬─────┘  └────┬─────┘  └───────────────────┘  │
│       │              │                               │
│  ┌────┴──────────────┴──────────────────────────┐   │
│  │              服务层 services/                   │   │
│  │                                               │   │
│  │  ┌─────────────┐ ┌──────────┐ ┌───────────┐  │   │
│  │  │ 数据源聚合器 │ │ AI 服务  │ │ 存储服务  │  │   │
│  │  │ sources/    │ │ OpenRouter│ │ JSON 文件 │  │   │
│  │  └──────┬──────┘ └──────────┘ └───────────┘  │   │
│  │         │                                     │   │
│  │  ┌──────┴──────────────────────────────┐      │   │
│  │  │           数据源适配器               │      │   │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐  │      │   │
│  │  │  │Web爬虫 │ │Twitter │ │ RSS    │  │      │   │
│  │  │  │Scraper │ │API.io  │ │Parser  │  │      │   │
│  │  │  └────────┘ └────────┘ └────────┘  │      │   │
│  │  └────────────────────────────────────┘      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 2. 技术选型

| 层级 | 技术 | 版本/说明 |
|------|------|----------|
| 运行时 | Node.js | 18+ |
| 后端框架 | Express | 4.x |
| 前端 | 原生 HTML/CSS/JS | 无框架，轻量 |
| AI 服务 | OpenRouter API | 通过 OpenAI SDK 对接 |
| Twitter 数据 | TwitterAPI.io | 第三方 REST API |
| RSS 解析 | rss-parser | npm 包 |
| 定时任务 | node-cron | 周期性监控 |
| 实时推送 | SSE (Server-Sent Events) | 服务端推送通知 |
| 存储 | JSON 文件 | 本地持久化 |

## 3. API 对接详情

### 3.1 OpenRouter API（AI 服务）

**用途**: 内容真伪识别、热点提取和排序、信息摘要生成

**接入方式**: 通过 OpenAI SDK 兼容接口

```
// 基本配置
Base URL: https://openrouter.ai/api/v1
Endpoint: POST /chat/completions
Auth: Bearer <OPENROUTER_API_KEY>

// 可选 Headers
HTTP-Referer: <YOUR_SITE_URL>
X-OpenRouter-Title: Hot Monitor
```

**请求格式**:
```json
{
  "model": "google/gemini-2.5-flash",  // 选用性价比高的模型
  "messages": [
    { "role": "system", "content": "你是热点分析助手..." },
    { "role": "user", "content": "分析以下内容的真实性..." }
  ],
  "temperature": 0.3,
  "max_tokens": 2000,
  "response_format": { "type": "json_object" }
}
```

**响应格式**:
```json
{
  "id": "gen-xxx",
  "choices": [{
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "content": "{...JSON结果...}"
    }
  }],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150
  }
}
```

**模型选择策略**:
- 热点分析/摘要: `google/gemini-2.5-flash`（低成本、快速）
- 内容真伪判断: `google/gemini-2.5-flash`（需要推理能力时）

### 3.2 TwitterAPI.io（Twitter 数据源）

**用途**: 从 Twitter/X 获取实时推文和趋势数据

**认证方式**:
```
Header: x-api-key: <TWITTER_API_KEY>
注册: https://twitterapi.io/dashboard
```

#### 3.2.1 推文高级搜索

```
GET https://api.twitterapi.io/twitter/tweet/advanced_search
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 搜索查询，支持高级语法。如 `"AI" OR "GPT" since:2026-03-30_00:00:00_UTC` |
| queryType | enum | 是 | `Latest`（最新）或 `Top`（热门） |
| cursor | string | 否 | 分页游标，首页为空 |

**响应格式**:
```json
{
  "tweets": [
    {
      "type": "tweet",
      "id": "123456",
      "url": "https://x.com/user/status/123456",
      "text": "推文内容...",
      "retweetCount": 100,
      "replyCount": 50,
      "likeCount": 500,
      "quoteCount": 20,
      "viewCount": 10000,
      "createdAt": "2026-03-31T10:00:00.000Z",
      "lang": "en",
      "author": {
        "userName": "user",
        "name": "User Name",
        "isBlueVerified": true,
        "followers": 50000,
        "profilePicture": "https://..."
      }
    }
  ],
  "has_next_page": true,
  "next_cursor": "cursor_string"
}
```

**高级搜索语法** (参考 twitter-advanced-search):
- `"exact phrase"` - 精确匹配
- `from:username` - 指定用户
- `since:YYYY-MM-DD_HH:MM:SS_UTC` - 时间范围
- `min_faves:100` - 最低点赞数
- `lang:en` - 语言过滤
- `OR` / `AND` - 逻辑运算

#### 3.2.2 获取趋势

```
GET https://api.twitterapi.io/twitter/trends
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| woeid | integer | 是 | 地区 WOEID。全球=1，美国=23424977，中国=23424781 |
| count | integer | 否 | 返回趋势数量，默认 30 |

### 3.3 网页搜索爬虫（自建）

**用途**: 从搜索引擎抓取关键词相关结果，无需 API Key

**实现方式**:
- 使用 `node-fetch` 请求 Bing/DuckDuckGo 搜索结果页
- 使用 `cheerio` 解析 HTML 提取搜索结果
- User-Agent 轮换 + 请求间隔控制（≥3秒/次）
- 提取: 标题、摘要、链接、发布时间

**频率控制策略**:
```
- 单次爬取间隔: ≥ 3 秒
- 同一域名 24h 最多: 50 次
- 全局并发: 最多 2 个请求
- 出现 429/403 时自动退避
```

### 3.4 RSS 订阅源

**用途**: 订阅科技媒体的 RSS/Atom Feed 获取最新文章

**使用库**: `rss-parser`

**预置 RSS 源**:
```javascript
const DEFAULT_RSS_FEEDS = [
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'Ars Technica AI', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/' },
];
```

## 4. 目录结构

```
hot-monitor/
├── docs/
│   ├── REQUIREMENTS.md      # 需求文档
│   └── DESIGN.md             # 本技术方案
├── server/
│   ├── index.js              # Express 入口 + 定时任务
│   ├── routes/
│   │   ├── keywords.js       # 关键词 CRUD API
│   │   ├── hotspots.js       # 热点查询 API
│   │   └── notifications.js  # 通知 + SSE API
│   ├── services/
│   │   ├── ai.js             # OpenRouter AI 服务
│   │   ├── aggregator.js     # 数据源聚合器
│   │   ├── monitor.js        # 监控调度逻辑
│   │   └── sources/
│   │       ├── webSearch.js   # 网页搜索爬虫
│   │       ├── twitter.js     # TwitterAPI.io
│   │       └── rss.js         # RSS 解析
│   └── data/                  # JSON 存储目录
│       ├── keywords.json      # 用户关键词
│       ├── hotspots.json      # 热点缓存
│       └── notifications.json # 通知记录
├── public/
│   ├── index.html            # 主页面
│   ├── css/
│   │   └── style.css         # 赛博朋克样式
│   └── js/
│       └── app.js            # 前端逻辑
├── skills/                    # Agent Skills (后续)
├── package.json
├── .env.example              # 环境变量模板
└── .gitignore
```

## 5. API 路由设计

### 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/keywords` | 获取所有监控关键词 |
| POST | `/api/keywords` | 添加监控关键词 |
| DELETE | `/api/keywords/:id` | 删除监控关键词 |
| GET | `/api/hotspots` | 获取热点列表（支持 ?scope= 过滤） |
| POST | `/api/hotspots/refresh` | 手动触发热点刷新 |
| GET | `/api/notifications` | 获取通知列表 |
| POST | `/api/notifications/:id/read` | 标记通知已读 |
| GET | `/api/notifications/stream` | SSE 实时通知流 |
| GET | `/api/status` | 系统状态（监控运行情况） |

## 6. 核心流程

### 6.1 关键词监控流程

```
node-cron (每 5 分钟) 
  → 遍历用户关键词列表
  → 并行从 3 个数据源搜索
  → 聚合去重结果
  → AI 验证内容真伪（OpenRouter）
  → 对比历史记录，发现新内容
  → 生成通知 → SSE 推送到前端
```

### 6.2 热点发现流程

```
node-cron (每 30 分钟)
  → 获取用户设定的监控范围
  → 从 Twitter 获取趋势 + 搜索相关推文
  → 从 RSS 获取最新文章
  → 从网页搜索获取相关新闻
  → AI 聚合分析（提取热点、排序、生成摘要）
  → 更新热点列表 → 通知前端刷新
```

### 6.3 AI 验证 Prompt 设计

**内容真伪识别**:
```
你是一个信息验证专家。请分析以下内容的可信度:
1. 信息来源是否可靠（官方/知名媒体/个人）
2. 内容是否有具体细节（时间、版本号、功能描述）
3. 是否存在标题党/夸大/虚假信息的迹象
4. 其他来源是否有交叉验证

返回 JSON: { "credibility": 0-100, "isReliable": bool, "reason": "..." }
```

**热点提取**:
```
请从以下多个来源的内容中提取热点话题:
1. 识别出最重要的 5-10 个热点
2. 按热度排序（综合互动量、来源数量、时效性）
3. 为每个热点生成简短摘要

返回 JSON: { "hotspots": [{ "title": "...", "summary": "...", "heat": 0-100, "sources": [...] }] }
```

## 7. .env 配置

```bash
# OpenRouter AI
OPENROUTER_API_KEY=sk-or-v1-xxxx

# TwitterAPI.io
TWITTER_API_KEY=your_twitter_api_key

# 服务配置
PORT=3000
MONITOR_INTERVAL_MINUTES=5
HOTSPOT_INTERVAL_MINUTES=30
```
