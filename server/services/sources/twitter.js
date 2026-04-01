const fetch = require('node-fetch');

const BASE_URL = 'https://api.twitterapi.io';

// 严格过滤阈值 — 只保留热门原创推文
const FILTERS = {
  keyword: { minEngagement: 10, minFollowers: 200, minTextLength: 30 },
  hotspot: { minEngagement: 50, minFollowers: 500, minTextLength: 30 },
};

function getApiKey() {
  return process.env.TWITTER_API_KEY;
}

/**
 * 判断推文是否为原创（非转推、非回复、非引用）
 */
function isOriginalTweet(rawTweet) {
  // 转推
  if (rawTweet.retweetedTweet || (rawTweet.text || '').startsWith('RT @')) return false;
  // 回复
  if (rawTweet.inReplyToTweetId || rawTweet.inReplyToId) return false;
  // 引用推文
  if (rawTweet.quotedTweet || rawTweet.isQuoteStatus) return false;
  return true;
}

/**
 * 过滤推文：仅保留高质量原创
 */
function filterTweets(tweets, level = 'keyword') {
  const f = FILTERS[level] || FILTERS.keyword;
  const before = tweets.length;
  const filtered = tweets.filter(t => {
    if (t.text.length < f.minTextLength) return false;
    if (t.engagement < f.minEngagement) return false;
    if (t.author && t.author.followers < f.minFollowers) return false;
    return true;
  });
  console.log(`[Twitter] Filter (${level}): ${before} → ${filtered.length} tweets`);
  return filtered;
}

/**
 * Twitter 高级搜索
 * @param {string} query 搜索查询（支持Twitter高级搜索语法）
 * @param {object} options
 * @param {'Latest'|'Top'} options.queryType 排序方式
 * @param {string} [options.cursor] 分页游标
 * @param {boolean} [options.noFilter] 跳过质量过滤（用于指定账号搜索）
 * @returns {Promise<{tweets: Array, hasNextPage: boolean, nextCursor: string}>}
 */
async function advancedSearch(query, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your_twitter_api_key') {
    console.warn('[Twitter] API key not configured, skipping');
    return { tweets: [], hasNextPage: false, nextCursor: '' };
  }

  const { queryType = 'Latest', cursor = '' } = options;
  const params = new URLSearchParams({
    query,
    queryType,
  });
  if (cursor) params.set('cursor', cursor);

  try {
    const resp = await fetch(`${BASE_URL}/twitter/tweet/advanced_search?${params}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 15000,
    });

    if (!resp.ok) {
      console.warn(`[Twitter] Search returned ${resp.status}: ${await resp.text()}`);
      return { tweets: [], hasNextPage: false, nextCursor: '' };
    }

    const data = await resp.json();

    // 映射并仅保留原创推文
    let tweets = (data.tweets || [])
      .filter(t => isOriginalTweet(t))
      .map(t => ({
        id: t.id,
        text: t.text,
        url: t.url,
        author: t.author ? {
          userName: t.author.userName,
          name: t.author.name,
          verified: t.author.isBlueVerified,
          followers: t.author.followers,
          avatar: t.author.profilePicture,
        } : null,
        engagement: (t.likeCount || 0) + (t.retweetCount || 0) + (t.replyCount || 0),
        likeCount: t.likeCount || 0,
        retweetCount: t.retweetCount || 0,
        replyCount: t.replyCount || 0,
        viewCount: t.viewCount || 0,
        createdAt: t.createdAt,
        lang: t.lang,
      }));

    // 质量过滤（除非指定 noFilter）
    if (!options.noFilter) {
      const level = queryType === 'Top' ? 'hotspot' : 'keyword';
      tweets = filterTweets(tweets, level);
    }

    console.log(`[Twitter] "${query}" → ${tweets.length} tweets (filtered)`);
    return {
      tweets,
      hasNextPage: data.has_next_page || false,
      nextCursor: data.next_cursor || '',
    };
  } catch (err) {
    console.error('[Twitter] Search error:', err.message);
    return { tweets: [], hasNextPage: false, nextCursor: '' };
  }
}

/**
 * 获取 Twitter 趋势
 * @param {number} woeid 地区 WOEID (1=全球, 23424977=美国, 23424781=中国)
 * @param {number} count 数量
 */
async function getTrends(woeid = 1, count = 30) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your_twitter_api_key') {
    console.warn('[Twitter] API key not configured, skipping trends');
    return [];
  }

  const params = new URLSearchParams({
    woeid: String(woeid),
    count: String(count),
  });

  try {
    const resp = await fetch(`${BASE_URL}/twitter/trends?${params}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 15000,
    });

    if (!resp.ok) {
      console.warn(`[Twitter] Trends returned ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    console.log(`[Twitter] Trends → ${(data.trends || data || []).length} items`);
    return data.trends || data || [];
  } catch (err) {
    console.error('[Twitter] Trends error:', err.message);
    return [];
  }
}

/**
 * 将推文转为标准信息条目
 */
function tweetsToItems(tweets) {
  return tweets.map(t => ({
    title: t.text.slice(0, 120),
    snippet: t.text,
    url: t.url,
    source: 'twitter',
    engagement: t.engagement,
    author: t.author?.name || t.author?.userName || 'unknown',
    createdAt: t.createdAt,
  }));
}

/**
 * 搜索指定用户的原创推文（用于关键词是博主/官方账号的情况）
 * @param {string} username Twitter 用户名（不含 @）
 */
async function searchUserTweets(username, options = {}) {
  return advancedSearch(`from:${username}`, {
    queryType: options.queryType || 'Latest',
    noFilter: true, // 指定账号不做质量过滤
  });
}

/**
 * 检测查询是否为账号名（以 @ 开头）
 * @returns {string|null} 用户名或 null
 */
function extractUsername(query) {
  const trimmed = query.trim();
  if (trimmed.startsWith('@') && /^@[a-zA-Z0-9_]{1,30}$/.test(trimmed)) {
    return trimmed.slice(1);
  }
  return null;
}

module.exports = { advancedSearch, getTrends, tweetsToItems, searchUserTweets, extractUsername };
