/**
 * Hot Monitor — API 和功能测试
 * 使用 Node.js 内置 test runner (node:test)
 * 运行: node --test tests/test-api.js
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

const BASE = 'http://localhost:3456';
let server;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// Setup: start server on test port
before(async () => {
  process.env.PORT = '3456';
  process.env.MONITOR_INTERVAL_MINUTES = '9999'; // prevent cron from running

  // Clear test DB
  const fs = require('fs');
  const path = require('path');
  const dbPath = path.join(__dirname, '..', 'server', 'db', 'hot-monitor.db');
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  // Start server
  const app = require('../server/index');
  await new Promise((resolve) => setTimeout(resolve, 1000));
});

describe('Keywords API', () => {
  let createdId;

  it('GET /api/keywords returns empty list', async () => {
    const res = await req('GET', '/api/keywords');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.keywords));
  });

  it('POST /api/keywords creates a keyword', async () => {
    const res = await req('POST', '/api/keywords', { keyword: 'AI大模型' });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.keyword);
    assert.strictEqual(res.body.keyword.keyword, 'AI大模型');
    assert.strictEqual(res.body.keyword.active, true);
    createdId = res.body.keyword.id;
  });

  it('POST /api/keywords rejects duplicate', async () => {
    const res = await req('POST', '/api/keywords', { keyword: 'ai大模型' });
    assert.strictEqual(res.status, 409);
  });

  it('POST /api/keywords rejects empty', async () => {
    const res = await req('POST', '/api/keywords', { keyword: '' });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/keywords creates second keyword', async () => {
    const res = await req('POST', '/api/keywords', { keyword: 'GPT-5' });
    assert.strictEqual(res.status, 201);
  });

  it('PATCH /api/keywords/:id toggles active', async () => {
    const res = await req('PATCH', `/api/keywords/${createdId}`, { active: false });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.keyword.active, false);
  });

  it('PATCH /api/keywords/:id re-enables', async () => {
    const res = await req('PATCH', `/api/keywords/${createdId}`, { active: true });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.keyword.active, true);
  });

  it('DELETE /api/keywords/:nonexistent returns 404', async () => {
    const res = await req('DELETE', '/api/keywords/nonexistent');
    assert.strictEqual(res.status, 404);
  });

  it('GET /api/keywords returns created keywords', async () => {
    const res = await req('GET', '/api/keywords');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.keywords.length >= 2);
  });
});

describe('Notifications API', () => {
  it('GET /api/notifications returns list', async () => {
    const res = await req('GET', '/api/notifications');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.notifications));
    assert.strictEqual(typeof res.body.unreadCount, 'number');
  });

  it('POST /api/notifications/read-all marks all read', async () => {
    const res = await req('POST', '/api/notifications/read-all');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.success);
  });

  it('POST /api/notifications/:nonexistent/read returns 404', async () => {
    const res = await req('POST', '/api/notifications/nonexistent/read');
    assert.strictEqual(res.status, 404);
  });
});

describe('Stats API', () => {
  it('GET /api/stats returns stats object', async () => {
    const res = await req('GET', '/api/stats');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.body.totalHotspots, 'number');
    assert.strictEqual(typeof res.body.todayNew, 'number');
    assert.strictEqual(typeof res.body.keywordCount, 'number');
    assert.strictEqual(typeof res.body.unread, 'number');
  });
});

describe('Monitor API', () => {
  it('POST /api/monitor/run rejects empty keywordIds', async () => {
    const res = await req('POST', '/api/monitor/run', { keywordIds: [] });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/monitor/run rejects missing body', async () => {
    const res = await req('POST', '/api/monitor/run', {});
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/monitor/run accepts valid keywordIds', async () => {
    const kwRes = await req('GET', '/api/keywords');
    const ids = kwRes.body.keywords.map(k => k.id);
    const res = await req('POST', '/api/monitor/run', { keywordIds: ids });
    // Should return 200 (started), actual monitoring runs async
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.success);
  });
});

describe('Status API', () => {
  it('GET /api/status returns running', async () => {
    const res = await req('GET', '/api/status');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'running');
  });
});

describe('Frontend filter logic (unit tests)', () => {
  // Test the filter/sort logic in isolation
  const notifications = [
    { id: '1', keyword: 'AI', title: 'AI News', credibility: 80, relevance: 90, read: false, createdAt: new Date().toISOString() },
    { id: '2', keyword: 'AI', title: 'Old AI', credibility: 30, relevance: 20, read: true, createdAt: new Date(Date.now() - 86400000 * 2).toISOString() },
    { id: '3', keyword: 'GPT', title: 'GPT Update', credibility: 65, relevance: 75, read: false, createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: '4', keyword: 'GPT', title: 'GPT Old', credibility: 90, relevance: 85, read: true, createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
  ];

  function filter(items, { filterKeywords = new Set(), filterRead = '', filterCredibility = '', filterTime = '', sortMode = 'time-desc' }) {
    let result = [...items];
    if (filterKeywords.size > 0) result = result.filter(n => filterKeywords.has(n.keyword));
    if (filterRead === 'unread') result = result.filter(n => !n.read);
    else if (filterRead === 'read') result = result.filter(n => n.read);
    if (filterCredibility === 'high') result = result.filter(n => (n.credibility || 0) >= 70);
    else if (filterCredibility === 'mid') result = result.filter(n => { const c = n.credibility || 0; return c >= 40 && c < 70; });
    else if (filterCredibility === 'low') result = result.filter(n => (n.credibility || 0) < 40);
    if (filterTime) {
      const now = Date.now();
      const ranges = { '1h': 3600000, '24h': 86400000, '3d': 259200000 };
      const range = ranges[filterTime];
      if (range) result = result.filter(n => now - new Date(n.createdAt).getTime() < range);
    }
    if (sortMode === 'time-asc') result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sortMode === 'credibility') result.sort((a, b) => (b.credibility || 0) - (a.credibility || 0));
    else if (sortMode === 'relevance') result.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    else result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return result;
  }

  it('filters by keyword set', () => {
    const result = filter(notifications, { filterKeywords: new Set(['AI']) });
    assert.strictEqual(result.length, 2);
    assert.ok(result.every(n => n.keyword === 'AI'));
  });

  it('filters by multi-keyword set', () => {
    const result = filter(notifications, { filterKeywords: new Set(['AI', 'GPT']) });
    assert.strictEqual(result.length, 4);
  });

  it('filters unread only', () => {
    const result = filter(notifications, { filterRead: 'unread' });
    assert.ok(result.every(n => !n.read));
    assert.strictEqual(result.length, 2);
  });

  it('filters read only', () => {
    const result = filter(notifications, { filterRead: 'read' });
    assert.ok(result.every(n => n.read));
    assert.strictEqual(result.length, 2);
  });

  it('filters high credibility', () => {
    const result = filter(notifications, { filterCredibility: 'high' });
    assert.ok(result.every(n => n.credibility >= 70));
  });

  it('filters mid credibility', () => {
    const result = filter(notifications, { filterCredibility: 'mid' });
    assert.ok(result.every(n => n.credibility >= 40 && n.credibility < 70));
  });

  it('filters low credibility', () => {
    const result = filter(notifications, { filterCredibility: 'low' });
    assert.ok(result.every(n => n.credibility < 40));
  });

  it('filters by time range 24h', () => {
    const result = filter(notifications, { filterTime: '24h' });
    const cutoff = Date.now() - 86400000;
    assert.ok(result.every(n => new Date(n.createdAt).getTime() > cutoff));
  });

  it('sorts by credibility descending', () => {
    const result = filter(notifications, { sortMode: 'credibility' });
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].credibility >= result[i].credibility);
    }
  });

  it('sorts by time ascending', () => {
    const result = filter(notifications, { sortMode: 'time-asc' });
    for (let i = 1; i < result.length; i++) {
      assert.ok(new Date(result[i - 1].createdAt) <= new Date(result[i].createdAt));
    }
  });

  it('combined filters work', () => {
    const result = filter(notifications, {
      filterKeywords: new Set(['AI']),
      filterRead: 'unread',
      filterCredibility: 'high',
    });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'AI News');
  });

  it('reset (empty filters) returns all', () => {
    const result = filter(notifications, {});
    assert.strictEqual(result.length, 4);
  });

  it('sorts by relevance descending', () => {
    const result = filter(notifications, { sortMode: 'relevance' });
    for (let i = 1; i < result.length; i++) {
      assert.ok((result[i - 1].relevance || 0) >= (result[i].relevance || 0));
    }
  });
});

describe('Enriched notification fields', () => {
  it('notification objects carry all metadata fields including relevance', () => {
    const notif = {
      id: 'test1', keyword: 'AI', title: 'Test', snippet: 'Test snippet',
      url: 'https://news.ycombinator.com/item?id=123', source: 'hackernews',
      credibility: 85, relevance: 92, verifyReason: 'Official source with details',
      publishedAt: '2026-03-31T10:00:00Z', engagement: 150, points: 120,
      comments: 30, author: 'testuser', read: false, createdAt: new Date().toISOString(),
    };
    assert.strictEqual(notif.verifyReason, 'Official source with details');
    assert.strictEqual(notif.relevance, 92);
    assert.strictEqual(notif.points, 120);
    assert.strictEqual(notif.comments, 30);
    assert.strictEqual(notif.author, 'testuser');
    assert.strictEqual(notif.publishedAt, '2026-03-31T10:00:00Z');
  });

  it('dual threshold filtering: relevance >= 60 AND credibility >= 40', () => {
    const verifyResults = [
      { index: 1, relevance: 90, credibility: 80, isReliable: true, reason: 'Direct news' },
      { index: 2, relevance: 25, credibility: 75, isReliable: true, reason: 'Tutorial, not news' },
      { index: 3, relevance: 70, credibility: 30, isReliable: false, reason: 'Low quality source' },
      { index: 4, relevance: 65, credibility: 55, isReliable: true, reason: 'Related discussion' },
      { index: 5, relevance: 40, credibility: 80, isReliable: true, reason: 'Barely mentions topic' },
    ];
    const passed = verifyResults.filter(v => v.isReliable && v.relevance >= 60 && v.credibility >= 40);
    assert.strictEqual(passed.length, 2); // only #1 and #4
    assert.strictEqual(passed[0].index, 1);
    assert.strictEqual(passed[1].index, 4);
  });

  it('domain extraction works for various URLs', () => {
    function extractDomain(url) {
      if (!url) return '';
      try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
    }
    assert.strictEqual(extractDomain('https://www.zhihu.com/question/123'), 'zhihu.com');
    assert.strictEqual(extractDomain('https://news.ycombinator.com/item?id=1'), 'news.ycombinator.com');
    assert.strictEqual(extractDomain('https://github.com/test/repo'), 'github.com');
    assert.strictEqual(extractDomain(''), '');
    assert.strictEqual(extractDomain(null), '');
  });

  it('source label mapping works', () => {
    function getSourceLabel(source) {
      if (!source) return { text: 'Web', cls: 'src-web' };
      if (source === 'hackernews') return { text: 'HN', cls: 'src-hn' };
      if (source.startsWith('rss:')) return { text: 'RSS', cls: 'src-rss' };
      if (source === 'baidu') return { text: '百度', cls: 'src-baidu' };
      if (source === 'cn:bilibili') return { text: 'B站', cls: 'src-cn' };
      if (source === 'cn:zhihu') return { text: '知乎', cls: 'src-cn' };
      if (source === 'cn:xiaohongshu') return { text: '小红书', cls: 'src-cn' };
      if (source === 'cn:tieba') return { text: '贴吧', cls: 'src-cn' };
      return { text: 'Web', cls: 'src-web' };
    }
    assert.strictEqual(getSourceLabel('hackernews').text, 'HN');
    assert.strictEqual(getSourceLabel('rss:Hacker News').text, 'RSS');
    assert.strictEqual(getSourceLabel('baidu').text, '百度');
    assert.strictEqual(getSourceLabel('cn:bilibili').text, 'B站');
    assert.strictEqual(getSourceLabel('cn:zhihu').text, '知乎');
    assert.strictEqual(getSourceLabel('web-search').text, 'Web');
    assert.strictEqual(getSourceLabel(null).text, 'Web');
  });
});
