const webSearch = require('./sources/webSearch');
const twitter = require('./sources/twitter');
const rss = require('./sources/rss');
const hackerNews = require('./sources/hackerNews');
const chinaSearch = require('./sources/chinaSearch');

/**
 * 聚合多来源数据
 * @param {string} query 搜索关键词
 * @param {object} options
 * @returns {Promise<Array<{title,snippet,url,source,engagement,createdAt}>>}
 */
async function aggregate(query, options = {}) {
  const { maxPerSource = 10, twitterQueryType = 'Latest' } = options;

  // 检测是否为账号查询（以 @ 开头）
  const username = twitter.extractUsername(query);

  // 并行从所有来源获取数据
  const promises = [
    webSearch.search(query, maxPerSource),
    rss.fetchAllFeeds(query),
    hackerNews.searchHN(query, maxPerSource),
    chinaSearch.search(query, maxPerSource),
  ];

  // Twitter：如果是账号则获取该用户推文，否则普通搜索
  if (username) {
    promises.push(twitter.searchUserTweets(username, { queryType: twitterQueryType }));
  } else {
    promises.push(twitter.advancedSearch(query, { queryType: twitterQueryType }));
  }

  const [webResults, rssResults, hnResults, cnResults, twitterData] = await Promise.allSettled(promises);

  let allItems = [];

  if (webResults.status === 'fulfilled') {
    allItems = allItems.concat(webResults.value);
  }

  if (rssResults.status === 'fulfilled') {
    allItems = allItems.concat(rssResults.value);
  }

  if (hnResults.status === 'fulfilled') {
    allItems = allItems.concat(hnResults.value);
  }

  if (cnResults.status === 'fulfilled') {
    allItems = allItems.concat(cnResults.value);
  }

  if (twitterData.status === 'fulfilled') {
    allItems = allItems.concat(twitter.tweetsToItems(twitterData.value.tweets));
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
  const username = twitter.extractUsername(scope);

  const promises = [
    twitter.getTrends(1, 30),
    webSearch.search(`${scope} latest news today`, 15),
    rss.fetchAllFeeds(),
    hackerNews.getFrontPage(20),
    chinaSearch.search(`${scope} 最新消息`, 10),
  ];

  // Twitter：账号则搜其推文，否则按范围搜 Top
  if (username) {
    promises.push(twitter.searchUserTweets(username, { queryType: 'Top' }));
  } else {
    promises.push(twitter.advancedSearch(scope, { queryType: 'Top' }));
  }

  const [twitterTrends, webResults, rssResults, hnResults, cnResults, twitterSearch] =
    await Promise.allSettled(promises);

  let allItems = [];

  // Web 搜索结果（DDG + Bing + Google 并行）
  if (webResults.status === 'fulfilled') {
    allItems = allItems.concat(webResults.value);
  }

  // RSS 结果
  if (rssResults.status === 'fulfilled') {
    allItems = allItems.concat(rssResults.value);
  }

  // Hacker News 首页热门
  if (hnResults.status === 'fulfilled') {
    allItems = allItems.concat(hnResults.value);
  }

  // 百度搜索结果
  if (cnResults.status === 'fulfilled') {
    allItems = allItems.concat(cnResults.value);
  }

  // Twitter 搜索结果（Top推文 / 指定账号）
  if (twitterSearch.status === 'fulfilled') {
    allItems = allItems.concat(twitter.tweetsToItems(twitterSearch.value.tweets));
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
