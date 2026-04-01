const express = require('express');
const { readJSON, writeJSON } = require('../services/store');
const router = express.Router();

// 简单Id生成
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// GET /api/keywords - 获取所有关键词
router.get('/', (req, res) => {
  const keywords = readJSON('keywords.json', []);
  res.json({ keywords });
});

// POST /api/keywords - 添加关键词
router.post('/', (req, res) => {
  const { keyword, type = 'keyword' } = req.body;
  if (!keyword || typeof keyword !== 'string' || keyword.trim().length === 0) {
    return res.status(400).json({ error: '关键词不能为空' });
  }

  const sanitized = keyword.trim().slice(0, 200);
  const keywords = readJSON('keywords.json', []);

  // 检查是否已存在
  if (keywords.some(k => k.keyword.toLowerCase() === sanitized.toLowerCase())) {
    return res.status(409).json({ error: '该关键词已存在' });
  }

  const newKeyword = {
    id: generateId(),
    keyword: sanitized,
    type, // 'keyword' = 关键词监控, 'scope' = 热点范围
    active: true,
    createdAt: new Date().toISOString(),
  };

  keywords.push(newKeyword);
  writeJSON('keywords.json', keywords);
  res.status(201).json({ keyword: newKeyword });
});

// PATCH /api/keywords/:id - 更新关键词（启用/禁用）
router.patch('/:id', (req, res) => {
  const keywords = readJSON('keywords.json', []);
  const idx = keywords.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '关键词不存在' });

  const { active } = req.body;
  if (typeof active === 'boolean') {
    keywords[idx].active = active;
  }

  writeJSON('keywords.json', keywords);
  res.json({ keyword: keywords[idx] });
});

// DELETE /api/keywords/:id - 删除关键词
router.delete('/:id', (req, res) => {
  const keywords = readJSON('keywords.json', []);
  const idx = keywords.findIndex(k => k.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '关键词不存在' });

  keywords.splice(idx, 1);
  writeJSON('keywords.json', keywords);
  res.json({ success: true });
});

module.exports = router;
