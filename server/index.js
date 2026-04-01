require('dotenv').config();
const express = require('express');
const path = require('path');
const cron = require('node-cron');
const { runKeywordMonitor, runHotspotDiscovery } = require('./services/monitor');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/keywords', require('./routes/keywords'));
app.use('/api/hotspots', require('./routes/hotspots'));
app.use('/api/notifications', require('./routes/notifications'));

// 系统状态
app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    uptime: process.uptime(),
    monitorInterval: `${process.env.MONITOR_INTERVAL_MINUTES || 5}min`,
    hotspotInterval: `${process.env.HOTSPOT_INTERVAL_MINUTES || 30}min`,
  });
});

// SPA fallback
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 定时任务：关键词监控
const monitorMin = process.env.MONITOR_INTERVAL_MINUTES || 5;
cron.schedule(`*/${monitorMin} * * * *`, () => {
  console.log(`[Cron] Running keyword monitor (every ${monitorMin}min)...`);
  runKeywordMonitor().catch(err => console.error('[Cron] Monitor error:', err.message));
});

// 定时任务：热点发现
const hotspotMin = process.env.HOTSPOT_INTERVAL_MINUTES || 30;
cron.schedule(`*/${hotspotMin} * * * *`, () => {
  console.log(`[Cron] Running hotspot discovery (every ${hotspotMin}min)...`);
  runHotspotDiscovery().catch(err => console.error('[Cron] Hotspot error:', err.message));
});

app.listen(PORT, () => {
  console.log(`\n🔥 Hot Monitor running at http://localhost:${PORT}`);
  console.log(`   Keyword monitor: every ${monitorMin} minutes`);
  console.log(`   Hotspot discovery: every ${hotspotMin} minutes\n`);
});
