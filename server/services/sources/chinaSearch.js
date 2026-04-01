const fetch = require('node-fetch');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
];

let lastRequestTime = 0;
const MIN_INTERVAL = 1200;

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

function buildSearchUrls(query, maxResults) {
  const q = encodeURIComponent(query);
  return [
    `https://www.baidu.com/s?wd=${q}&rn=${maxResults}&ie=utf-8`,
    `https://www.baidu.com/s?word=${q}&rn=${maxResults}&ie=utf-8`,
    `https://m.baidu.com/s?word=${q}`,
  ];
}

function isCaptchaOrBlocked(html = '') {
  const signals = ['百度安全验证', '请输入验证码', '网络不给力', '访问验证'];
  return signals.some(s => html.includes(s));
}

function parseBaiduResults(html, maxResults = 10) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  const pushResult = (title, snippet, href) => {
    const t = (title || '').trim();
    const u = (href || '').trim();
    if (!t || !u) return;
    if (seen.has(u)) return;
    seen.add(u);
    results.push({
      title: t,
      snippet: (snippet || '').trim() || t,
      url: u,
      source: 'baidu',
    });
  };

  // PC 端主要结构
  $('div.result, div.c-container, div.c-result').each((i, el) => {
    if (results.length >= maxResults) return false;
    const $el = $(el);
    const titleEl = $el.find('h3 a, a.c-title').first();
    const title = titleEl.text();
    const href = titleEl.attr('href') || '';
    const snippet = $el.find('.c-abstract, .c-font-normal, .content-right_8Zs40').first().text();
    pushResult(title, snippet, href);
    return undefined;
  });

  // 兜底：移动端/结构变更时抓显著标题链接
  if (results.length === 0) {
    $('a').each((i, el) => {
      if (results.length >= maxResults) return false;
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.text();
      if (!/^https?:\/\//.test(href)) return undefined;
      if (title.trim().length < 8) return undefined;
      if (title.includes('百度首页') || title.includes('百度一下')) return undefined;
      pushResult(title, title, href);
      return undefined;
    });
  }

  return results.slice(0, maxResults);
}

/**
 * 百度搜索（HTML 爬取，无需 API Key）
 */
async function searchBaidu(query, maxResults = 10) {
  const queryVariants = [`${query} 最新`, query, `${query} 热点`];

  for (const q of queryVariants) {
    const urls = buildSearchUrls(q, maxResults);
    for (const url of urls) {
      try {
        await throttle();
        const resp = await fetch(url, {
          headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Referer': 'https://www.baidu.com/',
          },
          timeout: 12000,
        });

        if (!resp.ok) {
          console.warn(`[ChinaSearch] Baidu returned ${resp.status} for ${q}`);
          continue;
        }

        const html = await resp.text();
        if (isCaptchaOrBlocked(html)) {
          console.warn(`[ChinaSearch] Baidu blocked/captcha for ${q}`);
          continue;
        }

        const results = parseBaiduResults(html, maxResults);
        if (results.length > 0) {
          console.log(`[ChinaSearch] Baidu "${query}"(hit="${q}") → ${results.length} results`);
          return results;
        }
      } catch (err) {
        console.error(`[ChinaSearch] Baidu error for ${q}:`, err.message);
      }
    }
  }

  console.warn(`[ChinaSearch] Baidu "${query}" → 0 results after retries`);
  return [];
}

/**
 * 聚合国内搜索
 */
async function search(query, maxResults = 10) {
  return searchBaidu(query, maxResults);
}

module.exports = { search, searchBaidu };
