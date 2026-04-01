const express = require('express');
const { readJSON } = require('../services/store');
const { runKeywordMonitor } = require('../services/monitor');
const router = express.Router();

// GET /api/hotspots - 获取热点列表
router.get('/', (req, res) => {
  const { scope } = req.query;
  let hotspots = readJSON('hotspots.json', []);

  if (scope) {
    hotspots = hotspots.filter(h =>
      h.scope.toLowerCase().includes(scope.toLowerCase())
    );
  }

  res.json({ hotspots });
});

// POST /api/hotspots/refresh - 手动触发刷新
router.post('/refresh', async (req, res) => {
  res.json({ message: '关键词监控已触发，热点将自动更新', status: 'processing' });
  runKeywordMonitor().catch(err => {
    console.error('[Hotspot] Manual refresh error:', err.message);
  });
});

module.exports = router;
