require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { runKeywordMonitor } = require('./services/monitor');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/keywords', require('./routes/keywords'));
app.use('/api/notifications', require('./routes/notifications'));

// 系统状态
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    monitorInterval: `${process.env.MONITOR_INTERVAL_MINUTES || 5}min`,
  });
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 定时任务：关键词监控
const monitorMin = process.env.MONITOR_INTERVAL_MINUTES || 5;
cron.schedule(`*/${monitorMin} * * * *`, () => {
  console.log(`[Cron] 触发关键词监控 (每 ${monitorMin} 分钟)...`);
  runKeywordMonitor().catch(err => console.error('[Cron] Monitor error:', err.message));
});

app.listen(PORT, () => {
  console.log(`\n🔥 Hot Monitor 已启动: http://localhost:${PORT}`);
  console.log(`   关键词监控间隔: 每 ${monitorMin} 分钟`);
  console.log(`   数据源: Web搜索 | 百度 | RSS | Hacker News`);
  console.log(`   AI: 火山引擎方舟 DeepSeek V3\n`);
});
