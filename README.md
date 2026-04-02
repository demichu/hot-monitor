# Hot Monitor 实现说明

## 1. 项目目标
Hot Monitor 是一个关键词驱动的热点监控工具：
- 用户维护关键词列表。
- 后端定时抓取多来源信息并做 AI 二次筛选。
- 前端展示热点流，并支持筛选/排序。
- 通过 SSE 推送新热点，减少手动刷新。

## 2. 技术栈
- 运行时: Node.js 24+
- 服务框架: Express
- 定时任务: node-cron
- AI: 火山引擎方舟 DeepSeek（OpenAI SDK 兼容接口）
- 抓取: node-fetch + cheerio + RSS
- 存储: SQLite（node:sqlite）
- 前端: 原生 HTML/CSS/JS

## 3. 系统结构
- server/index.js: 应用入口、路由注册、定时任务调度
- server/routes/*: 关键词与通知 API
- server/services/monitor.js: 监控主流程（聚合 -> AI 校验 -> 通知入库 -> SSE 广播）
- server/services/aggregator.js: 多来源聚合、去重、优先级排序、时效过滤
- server/services/ai.js: 查询扩展与双评分验证（匹配度+来源质量）
- server/services/store.js: SQLite KV 存储适配层（保留 readJSON/writeJSON 兼容接口）
- server/services/sources/*: 各数据源抓取模块
- public/*: 前端页面与交互

## 4. 数据存储
当前使用 SQLite 文件:
- server/db/hot-monitor.db

存储方式:
- 表 kv_store(key, value, updatedAt)
- 兼容原 readJSON/writeJSON 调用习惯
- 逻辑键:
  - keywords.json
  - notifications.json
  - seen_urls.json

说明:
- 启动后会自动建表。

## 5. 数据源策略
当前聚合来源:
- 百度搜索（主入口，关键词直搜）
- Web 搜索: DDG + Bing + Google
- RSS 订阅
- Hacker News

来源优先级（高到低）:
1. baidu
2. web-search
3. hackernews

流程中会先去重（按 URL），再按优先级和时间排序。

百度搜索增强策略:
- 多查询词变体回退: 关键词+最新、关键词原词、关键词+热点
- 多入口回退: PC 搜索页 + 移动搜索页
- 反爬/验证码检测后自动重试下一策略
- 解析器多选择器兜底，减少因页面结构变更导致的空结果

## 6. AI 过滤策略
- Query Expansion: 先扩展关键词，提升召回。
- 双评分:
  - 匹配度 relevance（与关键词是否直接相关）
  - 来源质量 credibility（来源可靠性与信息质量）
- 当前阈值:
  - relevance >= 60
  - credibility >= 40

## 7. 前端展示逻辑
热点卡片包含:
- 关键词、来源标签、域名
- 标题、摘要
- 互动指标（如点赞/评论/作者，按来源可用性显示）
- AI 分析理由（常显）
- 匹配度与来源质量分值

筛选和排序:
- 关键词筛选
- 已读/未读
- 来源质量筛选
- 时间范围筛选
- 最新优先 / 最早优先 / 匹配度优先 / 来源质量优先 / 关键词分组

## 8. API 概览
- GET /api/keywords
- POST /api/keywords
- PATCH /api/keywords/:id
- DELETE /api/keywords/:id
- GET /api/notifications
- POST /api/notifications/read-all
- POST /api/notifications/:id/read
- GET /api/status
- GET /api/stats
- POST /api/monitor/run
- GET /api/notifications/stream (SSE)

## 9. 部署说明（服务器）
1. 安装 Node.js 24+
2. 配置 .env（至少包含 ARK_API_KEY）
3. 安装依赖: npm install
4. 启动: npm start
5. 反向代理建议: Nginx
6. 持久化目录建议保留: server/db

## 10. 已知注意事项
- SQLite 当前使用 node:sqlite（Node 实验特性），建议固定 Node 版本以保证行为一致。
- 在 CI 或测试环境中，若同时有残留服务占用测试端口，会导致数据库文件锁（EBUSY）。
- 百度在高频访问时可能触发验证码/访问验证，系统会自动回退到其他查询策略，但仍可能出现短时空结果。
- 某些外部搜索源可能超时或被限流，属于预期降级场景。
