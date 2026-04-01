const fetch = require('node-fetch');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
];

let lastRequestTime = 0;
const MIN_INTERVAL = 3000;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * 百度搜索（HTML 爬取，无需 API Key）
 */
async function searchBaidu(query, maxResults = 10) {
  await throttle();
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      timeout: 10000,
    });

    if (!resp.ok) {
      console.warn(`[ChinaSearch] Baidu returned ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    const results = [];

    // Baidu 搜索结果容器
    $('div.result, div.c-container').each((i, el) => {
      if (results.length >= maxResults) return false;
      const $el = $(el);
      const titleEl = $el.find('h3 a').first();
      const title = titleEl.text().trim();
      const snippet = $el.find('.c-abstract, .content-right_8Zs40').first().text().trim();
      const href = titleEl.attr('href') || '';

      if (title && href) {
        results.push({
          title,
          snippet: snippet || title,
          url: href, // 百度重定向 URL，点击可正常跳转
          source: 'baidu',
        });
      }
    });

    console.log(`[ChinaSearch] Baidu "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error('[ChinaSearch] Baidu error:', err.message);
    return [];
  }
}

/**
 * 聚合国内搜索
 */
async function search(query, maxResults = 10) {
  return searchBaidu(query, maxResults);
}

module.exports = { search, searchBaidu };
