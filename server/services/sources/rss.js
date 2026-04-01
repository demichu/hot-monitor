const RssParser = require('rss-parser');

const parser = new RssParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Hot-Monitor/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

const DEFAULT_FEEDS = [
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'tech' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', category: 'ai' },
  { name: 'The Verge AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'ai' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', category: 'tech' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', category: 'ai' },
];

/**
 * 从单个 RSS Feed 获取文章
 * @param {string} feedUrl
 * @param {string} feedName
 * @param {number} maxItems
 */
async function fetchFeed(feedUrl, feedName = 'RSS', maxItems = 10) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || []).slice(0, maxItems).map(item => ({
      title: item.title || '',
      snippet: (item.contentSnippet || item.content || '').slice(0, 300),
      url: item.link || '',
      source: `rss:${feedName}`,
      createdAt: item.isoDate || item.pubDate || '',
      engagement: 0,
    }));

    console.log(`[RSS] ${feedName} → ${items.length} items`);
    return items;
  } catch (err) {
    console.error(`[RSS] ${feedName} error:`, err.message);
    return [];
  }
}

/**
 * 获取所有默认 RSS 源的内容
 * @param {string} [keyword] 可选，按关键词过滤
 */
async function fetchAllFeeds(keyword, customFeeds) {
  const feeds = customFeeds || DEFAULT_FEEDS;
  const allPromises = feeds.map(f => fetchFeed(f.url, f.name, 10));
  const results = await Promise.allSettled(allPromises);

  let allItems = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems = allItems.concat(result.value);
    }
  }

  // 如果有关键词，按关键词过滤
  if (keyword) {
    const lower = keyword.toLowerCase();
    allItems = allItems.filter(item =>
      item.title.toLowerCase().includes(lower) ||
      item.snippet.toLowerCase().includes(lower)
    );
  }

  console.log(`[RSS] Total: ${allItems.length} items${keyword ? ` (filtered by "${keyword}")` : ''}`);
  return allItems;
}

module.exports = { fetchFeed, fetchAllFeeds, DEFAULT_FEEDS };
