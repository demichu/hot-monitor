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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function timestamp() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

/**
 * 关键词监控：搜索关键词 → AI验证 → 发送热点通知
 */
async function runKeywordMonitor() {
  const keywords = readJSON('keywords.json', []);
  const activeKeywords = keywords.filter(k => k.active);

  if (!activeKeywords.length) {
    console.log(`[${timestamp()}] [Monitor] 没有活跃的监控关键词`);
    return;
  }

  console.log(`\n${'█'.repeat(60)}`);
  console.log(`[${timestamp()}] [Monitor] 开始监控 ${activeKeywords.length} 个关键词`);
  console.log(`${'█'.repeat(60)}`);

  const seenUrls = new Set(readJSON('seen_urls.json', []));

  for (const kw of activeKeywords) {
    try {
      console.log(`\n[${timestamp()}] [Monitor] ── 正在搜索: "${kw.keyword}" ──`);

      // 1. 聚合搜索
      const items = await aggregator.aggregate(kw.keyword);
      if (!items.length) {
        console.log(`[${timestamp()}] [Monitor] "${kw.keyword}" → 无结果，跳过`);
        continue;
      }

      // 2. 过滤已见过的
      const newItems = items.filter(it => !seenUrls.has(it.url));
      console.log(`[${timestamp()}] [Monitor] "${kw.keyword}" → ${items.length} 条结果, ${newItems.length} 条新内容`);

      if (!newItems.length) {
        console.log(`[${timestamp()}] [Monitor] "${kw.keyword}" → 全部为已见内容，跳过`);
        continue;
      }

      // 3. AI 验证内容真伪
      const verifyBatch = newItems.slice(0, 10);
      console.log(`[${timestamp()}] [AI] 正在验证 ${verifyBatch.length} 条内容...`);
      const verifyResults = await ai.verifyContent(verifyBatch);

      // 4. 只保留可信的新内容
      const reliableItems = [];
      for (let i = 0; i < verifyBatch.length; i++) {
        const verify = verifyResults.find(v => v.index === i + 1);
        if (verify && verify.isReliable && verify.credibility >= 40) {
          reliableItems.push({
            ...newItems[i],
            credibility: verify.credibility,
            verifyReason: verify.reason,
          });
          console.log(`[${timestamp()}] [AI] ✓ [${verify.credibility}分] ${newItems[i].title.slice(0, 50)}`);
        } else if (verify) {
          console.log(`[${timestamp()}] [AI] ✗ [${verify.credibility}分] ${newItems[i].title.slice(0, 50)} - ${verify.reason}`);
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
        writeJSON('notifications.json', notifications.slice(0, 200));
        console.log(`[${timestamp()}] [Monitor] "${kw.keyword}" → 发送 ${Math.min(reliableItems.length, 5)} 条热点通知`);
      } else {
        console.log(`[${timestamp()}] [Monitor] "${kw.keyword}" → 无可信内容，跳过`);
      }
    } catch (err) {
      console.error(`[${timestamp()}] [Monitor] "${kw.keyword}" 出错:`, err.message);
    }
  }

  // 保存已见URL（限制大小）
  const urlsArr = Array.from(seenUrls).slice(-5000);
  writeJSON('seen_urls.json', urlsArr);

  console.log(`\n[${timestamp()}] [Monitor] ✅ 本轮监控完成\n`);
}

module.exports = {
  runKeywordMonitor,
  addSSEClient,
  broadcastSSE,
};
