const fetch = require('node-fetch');

const BASE_URL = 'https://api.twitterapi.io';

function getApiKey() {
  return process.env.TWITTER_API_KEY;
}

/**
 * Twitter 高级搜索
 * @param {string} query 搜索查询（支持Twitter高级搜索语法）
 * @param {object} options
 * @param {'Latest'|'Top'} options.queryType 排序方式
 * @param {string} [options.cursor] 分页游标
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
    const tweets = (data.tweets || []).map(t => ({
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

    console.log(`[Twitter] "${query}" → ${tweets.length} tweets`);
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

module.exports = { advancedSearch, getTrends, tweetsToItems };
