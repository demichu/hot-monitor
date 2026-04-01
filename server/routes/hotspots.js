const express = require('express');
const { readJSON } = require('../services/store');
const { runHotspotDiscovery } = require('../services/monitor');
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

// POST /api/hotspots/refresh - 手动触发热点刷新
router.post('/refresh', async (req, res) => {
  res.json({ message: '热点刷新已触发', status: 'processing' });
  // 异步执行，不阻塞响应
  runHotspotDiscovery().catch(err => {
    console.error('[Hotspot] Manual refresh error:', err.message);
  });
});

module.exports = router;
