const express = require('express');
const { readJSON, writeJSON } = require('../services/store');
const { addSSEClient } = require('../services/monitor');
const router = express.Router();

// GET /api/notifications - 获取通知列表
router.get('/', (req, res) => {
  const notifications = readJSON('notifications.json', []);
  const unreadCount = notifications.filter(n => !n.read).length;
  res.json({ notifications: notifications.slice(0, 50), unreadCount });
});

// POST /api/notifications/:id/read - 标记已读
router.post('/:id/read', (req, res) => {
  const notifications = readJSON('notifications.json', []);
  const notif = notifications.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: '通知不存在' });

  notif.read = true;
  writeJSON('notifications.json', notifications);
  res.json({ success: true });
});

// POST /api/notifications/read-all - 全部已读
router.post('/read-all', (req, res) => {
  const notifications = readJSON('notifications.json', []);
  notifications.forEach(n => { n.read = true; });
  writeJSON('notifications.json', notifications);
  res.json({ success: true });
});

// GET /api/notifications/stream - SSE 实时通知流
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // 发送心跳
  res.write('event: connected\ndata: {"status":"ok"}\n\n');

  addSSEClient(res);

  // 心跳保活
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

module.exports = router;
