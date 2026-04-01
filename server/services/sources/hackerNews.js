const fetch = require('node-fetch');

const HN_API = 'https://hn.algolia.com/api/v1';

/**
 * 通过 Hacker News Algolia API 搜索
 * @param {string} query 搜索关键词
 * @param {number} maxResults 最大结果数
 */
async function searchHN(query, maxResults = 15) {
  try {
    const params = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: String(maxResults),
    });

    const resp = await fetch(`${HN_API}/search?${params}`, {
      timeout: 10000,
    });

    if (!resp.ok) {
      console.warn(`[HN] Search returned ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const items = (data.hits || []).map(hit => ({
      title: hit.title || '',
      snippet: hit.title || '',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: 'hackernews',
      engagement: (hit.points || 0) + (hit.num_comments || 0),
      points: hit.points || 0,
      comments: hit.num_comments || 0,
      author: hit.author || '',
      createdAt: hit.created_at || '',
    }));

    console.log(`[HN] "${query}" → ${items.length} stories`);
    return items;
  } catch (err) {
    console.error('[HN] Search error:', err.message);
    return [];
  }
}

/**
 * 获取 HN 首页热门文章（用于热点发现）
 */
async function getFrontPage(maxResults = 30) {
  try {
    const params = new URLSearchParams({
      tags: 'front_page',
      hitsPerPage: String(maxResults),
    });

    const resp = await fetch(`${HN_API}/search?${params}`, {
      timeout: 10000,
    });

    if (!resp.ok) {
      console.warn(`[HN] Front page returned ${resp.status}`);
      return [];
    }

    const data = await resp.json();
    const items = (data.hits || []).map(hit => ({
      title: hit.title || '',
      snippet: hit.title || '',
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      source: 'hackernews',
      engagement: (hit.points || 0) + (hit.num_comments || 0),
      points: hit.points || 0,
      comments: hit.num_comments || 0,
      author: hit.author || '',
      createdAt: hit.created_at || '',
    }));

    console.log(`[HN] Front page → ${items.length} stories`);
    return items;
  } catch (err) {
    console.error('[HN] Front page error:', err.message);
    return [];
  }
}

module.exports = { searchHN, getFrontPage };
