const { readJSON, writeJSON } = require('./store');
const aggregator = require('./aggregator');
const ai = require('./ai');

// SSE 客户端管理
const sseClients = new Set();

function addSSEClient(res) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

function generateId() {
  // 简单的唯一ID生成
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 关键词监控：检查所有关键词，发现新内容时发送通知
 */
async function runKeywordMonitor() {
  const keywords = readJSON('keywords.json', []);
  const activeKeywords = keywords.filter(k => k.active);

  if (!activeKeywords.length) {
    console.log('[Monitor] No active keywords to monitor');
    return;
  }

  console.log(`[Monitor] Checking ${activeKeywords.length} keywords...`);
  const seenUrls = new Set(readJSON('seen_urls.json', []));

  for (const kw of activeKeywords) {
    try {
      // 1. 聚合搜索
      const items = await aggregator.aggregate(kw.keyword);
      if (!items.length) continue;

      // 2. 过滤已见过的
      const newItems = items.filter(it => !seenUrls.has(it.url));
      if (!newItems.length) continue;

      // 3. AI 验证内容真伪
      const verifyResults = await ai.verifyContent(newItems.slice(0, 10));

      // 4. 只保留可信的新内容
      const reliableItems = [];
      for (let i = 0; i < Math.min(newItems.length, 10); i++) {
        const verify = verifyResults.find(v => v.index === i + 1);
        if (verify && verify.isReliable && verify.credibility >= 40) {
          reliableItems.push({
            ...newItems[i],
            credibility: verify.credibility,
            verifyReason: verify.reason,
          });
        }
      }

      // 5. 记录已见URL
      for (const item of newItems) {
        seenUrls.add(item.url);
      }

      // 6. 发送通知
      if (reliableItems.length > 0) {
        const notifications = readJSON('notifications.json', []);
        for (const item of reliableItems.slice(0, 5)) {
          const notif = {
            id: generateId(),
            type: 'keyword_alert',
            keyword: kw.keyword,
            title: item.title,
            snippet: item.snippet,
            url: item.url,
            source: item.source,
            credibility: item.credibility,
            read: false,
            createdAt: new Date().toISOString(),
          };
          notifications.unshift(notif);
          broadcastSSE('notification', notif);
        }
        // 只保留最近 200 条通知
        writeJSON('notifications.json', notifications.slice(0, 200));
        console.log(`[Monitor] "${kw.keyword}" → ${reliableItems.length} new reliable items`);
      }
    } catch (err) {
      console.error(`[Monitor] Error for "${kw.keyword}":`, err.message);
    }
  }

  // 保存已见URL（限制大小）
  const urlsArr = Array.from(seenUrls).slice(-5000);
  writeJSON('seen_urls.json', urlsArr);
}

/**
 * 热点发现：搜集指定范围的热点
 */
async function runHotspotDiscovery() {
  const keywords = readJSON('keywords.json', []);
  const scopes = keywords.filter(k => k.type === 'scope' && k.active);

  if (!scopes.length) {
    // 使用默认范围
    scopes.push({ keyword: 'AI artificial intelligence', scope: 'AI' });
  }

  console.log(`[Hotspot] Discovering hotspots for ${scopes.length} scopes...`);

  for (const scope of scopes) {
    try {
      const { items } = await aggregator.aggregateForHotspots(scope.keyword);
      if (!items.length) continue;

      // AI 提取热点
      const hotspots = await ai.extractHotspots(scope.keyword, items);
      if (!hotspots.length) continue;

      // 保存热点
      const allHotspots = readJSON('hotspots.json', []);
      const newEntry = {
        id: generateId(),
        scope: scope.keyword,
        hotspots,
        updatedAt: new Date().toISOString(),
      };

      // 替换同 scope 的旧数据
      const idx = allHotspots.findIndex(h => h.scope === scope.keyword);
      if (idx >= 0) {
        allHotspots[idx] = newEntry;
      } else {
        allHotspots.push(newEntry);
      }
      writeJSON('hotspots.json', allHotspots);

      // 通知前端刷新
      broadcastSSE('hotspots_updated', { scope: scope.keyword, count: hotspots.length });
      console.log(`[Hotspot] "${scope.keyword}" → ${hotspots.length} hotspots`);
    } catch (err) {
      console.error(`[Hotspot] Error for "${scope.keyword}":`, err.message);
    }
  }
}

module.exports = {
  runKeywordMonitor,
  runHotspotDiscovery,
  addSSEClient,
  broadcastSSE,
};
