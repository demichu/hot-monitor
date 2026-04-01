const { searchBaidu } = require('./chinaSearch');

const PLATFORM_QUERIES = [
  { key: 'bilibili', source: 'cn:bilibili', query: (keyword) => `site:bilibili.com ${keyword}` },
  { key: 'zhihu', source: 'cn:zhihu', query: (keyword) => `site:zhihu.com ${keyword}` },
  { key: 'xiaohongshu', source: 'cn:xiaohongshu', query: (keyword) => `site:xiaohongshu.com ${keyword}` },
  { key: 'tieba', source: 'cn:tieba', query: (keyword) => `site:tieba.baidu.com ${keyword}` },
];

/**
 * 中国主流媒体关键词搜索（优先级：B站 > 知乎 > 小红书 > 贴吧）
 * 基于站内域名约束，从百度检索关键词相关帖子。
 */
async function search(keyword, maxPerSource = 10) {
  const perPlatformLimit = Math.max(2, Math.ceil(maxPerSource / 2));
  const all = [];

  for (const p of PLATFORM_QUERIES) {
    try {
      const query = p.query(keyword);
      const results = await searchBaidu(query, perPlatformLimit);
      const mapped = results.map((item) => ({
        ...item,
        source: p.source,
      }));
      all.push(...mapped);
      console.log(`[ChinaMainstream] ${p.key} "${keyword}" → ${mapped.length} results`);
    } catch (err) {
      console.warn(`[ChinaMainstream] ${p.key} failed: ${err.message}`);
    }
  }

  return deduplicateByUrl(all);
}

function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter((it) => {
    if (!it.url || seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });
}

module.exports = { search };
