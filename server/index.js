require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { runKeywordMonitor, runKeywordMonitorForIds } = require('./services/monitor');
const { readJSON } = require('./services/store');

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

// 统计数据（热点雷达）
app.get('/api/stats', (req, res) => {
  const keywords = readJSON('keywords.json', []);
  const notifications = readJSON('notifications.json', []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayNew = notifications.filter(n => new Date(n.createdAt) >= today).length;
  const unread = notifications.filter(n => !n.read).length;
  res.json({
    totalHotspots: notifications.length,
    todayNew,
    keywordCount: keywords.filter(k => k.active).length,
    unread,
  });
});

// 立即监控（指定关键词ID列表）
let isMonitorRunning = false;
app.post('/api/monitor/run', async (req, res) => {
  if (isMonitorRunning) {
    return res.status(429).json({ error: '监控正在进行中，请稍后再试' });
  }
  const { keywordIds } = req.body;
  if (!keywordIds || !Array.isArray(keywordIds) || keywordIds.length === 0) {
    return res.status(400).json({ error: '请提供要监控的关键词ID列表' });
  }
  isMonitorRunning = true;
  res.json({ success: true, message: '监控已启动' });
  try {
    await runKeywordMonitorForIds(keywordIds);
  } catch (err) {
    console.error('[API] Monitor run error:', err.message);
  } finally {
    isMonitorRunning = false;
  }
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

module.exports = app;
