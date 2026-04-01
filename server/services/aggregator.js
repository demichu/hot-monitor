const webSearch = require('./sources/webSearch');
const twitter = require('./sources/twitter');
const rss = require('./sources/rss');

/**
 * 聚合多来源数据
 * @param {string} query 搜索关键词
 * @param {object} options
 * @returns {Promise<Array<{title,snippet,url,source,engagement,createdAt}>>}
 */
async function aggregate(query, options = {}) {
  const { maxPerSource = 10, twitterQueryType = 'Latest' } = options;

  // 并行从三个来源获取数据
  const [webResults, twitterData, rssResults] = await Promise.allSettled([
    webSearch.search(query, maxPerSource),
    twitter.advancedSearch(query, { queryType: twitterQueryType }),
    rss.fetchAllFeeds(query),
  ]);

  let allItems = [];

  if (webResults.status === 'fulfilled') {
    allItems = allItems.concat(webResults.value);
  }

  if (twitterData.status === 'fulfilled') {
    allItems = allItems.concat(twitter.tweetsToItems(twitterData.value.tweets));
  }

  if (rssResults.status === 'fulfilled') {
    allItems = allItems.concat(rssResults.value);
  }

  // 去重（by URL）
  allItems = deduplicateByUrl(allItems);

  console.log(`[Aggregator] "${query}" → ${allItems.length} unique items from all sources`);
  return allItems;
}

/**
 * 获取热点趋势数据（用于热点发现模式）
 */
async function aggregateForHotspots(scope) {
  const [twitterTrends, webResults, twitterSearch, rssResults] = await Promise.allSettled([
    twitter.getTrends(1, 30),
    webSearch.search(`${scope} latest news today`, 15),
    twitter.advancedSearch(scope, { queryType: 'Top' }),
    rss.fetchAllFeeds(),
  ]);

  let allItems = [];

  // Web 搜索结果
  if (webResults.status === 'fulfilled') {
    allItems = allItems.concat(webResults.value);
  }

  // Twitter 搜索结果（Top推文）
  if (twitterSearch.status === 'fulfilled') {
    allItems = allItems.concat(twitter.tweetsToItems(twitterSearch.value.tweets));
  }

  // RSS 结果
  if (rssResults.status === 'fulfilled') {
    allItems = allItems.concat(rssResults.value);
  }

  allItems = deduplicateByUrl(allItems);

  // Twitter 趋势作为补充信息
  const trends = twitterTrends.status === 'fulfilled' ? twitterTrends.value : [];

  console.log(`[Aggregator] Hotspots for "${scope}" → ${allItems.length} items, ${trends.length} trends`);
  return { items: allItems, trends };
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

module.exports = { aggregate, aggregateForHotspots };
