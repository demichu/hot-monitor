const webSearch = require('./sources/webSearch');
const rss = require('./sources/rss');
const hackerNews = require('./sources/hackerNews');
const chinaSearch = require('./sources/chinaSearch');

/**
 * 聚合多来源数据（专注中文源）
 * @param {string} query 搜索关键词
 * @param {object} options
 * @returns {Promise<Array<{title,snippet,url,source,createdAt}>>}
 */
async function aggregate(query, options = {}) {
  const { maxPerSource = 10 } = options;
  const startTime = Date.now();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Aggregator] 开始聚合搜索: "${query}"`);
  console.log(`${'='.repeat(60)}`);

  // 并行从所有来源获取数据
  const [webResults, rssResults, hnResults, cnResults] = await Promise.allSettled([
    webSearch.search(query, maxPerSource),
    rss.fetchAllFeeds(query),
    hackerNews.searchHN(query, maxPerSource),
    chinaSearch.search(query, maxPerSource),
  ]);

  let allItems = [];

  // 逐源统计
  const sources = [
    { name: 'Web搜索(DDG+Bing+Google)', result: webResults },
    { name: 'RSS订阅', result: rssResults },
    { name: 'Hacker News', result: hnResults },
    { name: '百度搜索', result: cnResults },
  ];

  for (const src of sources) {
    if (src.result.status === 'fulfilled') {
      const items = src.result.value;
      allItems = allItems.concat(items);
      console.log(`  ✓ ${src.name}: ${items.length} 条结果`);
      // 打印每条结果的标题
      items.forEach((it, i) => {
        console.log(`    [${i + 1}] ${it.title.slice(0, 60)}${it.title.length > 60 ? '...' : ''}`);
      });
    } else {
      console.log(`  ✗ ${src.name}: 失败 - ${src.result.reason?.message || '未知错误'}`);
    }
  }

  // 去重（by URL）
  allItems = deduplicateByUrl(allItems);

  // 过滤过时内容（超过72小时的内容降低优先级）
  allItems = filterByFreshness(allItems);

  const elapsed = Date.now() - startTime;
  console.log(`${'─'.repeat(60)}`);
  console.log(`[Aggregator] "${query}" → 去重后 ${allItems.length} 条, 耗时 ${elapsed}ms`);
  console.log(`${'─'.repeat(60)}\n`);

  return allItems;
}

/**
 * 按新鲜度过滤和排序
 * - 有日期的：72小时内优先，超过72小时排后面
 * - 无日期的：保留但排在有日期的后面
 */
function filterByFreshness(items) {
  const now = Date.now();
  const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72小时

  const fresh = [];
  const stale = [];
  const noDate = [];

  for (const item of items) {
    if (item.createdAt) {
      const age = now - new Date(item.createdAt).getTime();
      if (age <= MAX_AGE_MS) {
        fresh.push(item);
      } else {
        stale.push(item);
      }
    } else {
      noDate.push(item);
    }
  }

  if (stale.length > 0) {
    console.log(`  ⏳ 过滤掉 ${stale.length} 条超过72小时的过时内容`);
  }

  // 新鲜内容优先，无日期次之，过时内容不返回
  return [...fresh, ...noDate];
}

function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = it.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { aggregate };
