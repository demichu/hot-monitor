const fetch = require('node-fetch');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
];

let lastRequestTime = 0;
const MIN_INTERVAL = 3000; // 最小 3 秒间隔

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
 * 通过 DuckDuckGo HTML 搜索
 * @param {string} query 搜索关键词
 * @param {number} maxResults 最大结果数
 * @returns {Promise<Array<{title:string, snippet:string, url:string, source:string}>>}
 */
async function searchDuckDuckGo(query, maxResults = 10) {
  await throttle();
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      },
      timeout: 10000,
    });

    if (!resp.ok) {
      console.warn(`[WebSearch] DuckDuckGo returned ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (i >= maxResults) return false;
      const $el = $(el);
      const title = $el.find('.result__title a').text().trim();
      const snippet = $el.find('.result__snippet').text().trim();
      const rawUrl = $el.find('.result__title a').attr('href') || '';

      // DuckDuckGo 的链接通过重定向，提取真实 URL
      let url = rawUrl;
      const udMatch = rawUrl.match(/uddg=([^&]+)/);
      if (udMatch) {
        url = decodeURIComponent(udMatch[1]);
      }

      if (title && url) {
        results.push({ title, snippet, url, source: 'web-search' });
      }
    });

    console.log(`[WebSearch] "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error('[WebSearch] Error:', err.message);
    return [];
  }
}

/**
 * 通过 Bing 搜索
 */
async function searchBing(query, maxResults = 10) {
  await throttle();
  const encoded = encodeURIComponent(query);
  const searchUrl = `https://www.bing.com/search?q=${encoded}&setlang=en`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });

    if (!resp.ok) {
      console.warn(`[WebSearch] Bing returned ${resp.status}`);
      return [];
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    const results = [];

    $('li.b_algo').each((i, el) => {
      if (i >= maxResults) return false;
      const $el = $(el);
      const title = $el.find('h2 a').text().trim();
      const snippet = $el.find('.b_caption p').text().trim();
      const url = $el.find('h2 a').attr('href') || '';

      if (title && url && url.startsWith('http')) {
        results.push({ title, snippet, url, source: 'web-search' });
      }
    });

    console.log(`[WebSearch] Bing "${query}" → ${results.length} results`);
    return results;
  } catch (err) {
    console.error('[WebSearch] Bing Error:', err.message);
    return [];
  }
}

/**
 * 聚合搜索：优先 DuckDuckGo，备选 Bing
 */
async function search(query, maxResults = 10) {
  let results = await searchDuckDuckGo(query, maxResults);
  if (results.length < 3) {
    const bingResults = await searchBing(query, maxResults);
    results = deduplicateByUrl([...results, ...bingResults]).slice(0, maxResults);
  }
  return results;
}

function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter(it => {
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });
}

module.exports = { search };
