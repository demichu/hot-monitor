require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: process.env.ARK_API_KEY,
});

const MODEL = 'deepseek-v3-2-251201';

/** 从可能包含 markdown 代码块的文本中提取 JSON */
function extractJSON(text) {
  if (!text || typeof text !== 'string') throw new Error('AI返回内容为空');

  // 清理常见干扰：BOM、零宽字符、前后空白
  text = text.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

  // 1. 直接解析
  try { return JSON.parse(text); } catch (_) {}

  // 2. 去掉 ```json ... ``` 包裹
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try { return JSON.parse(m[1].trim()); } catch (_) {}
  }

  // 3. 找第一个 { ... } 或 [ ... ] 块（支持嵌套）
  let start = -1;
  let openChar = '';
  let closeChar = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') {
      start = i;
      openChar = text[i];
      closeChar = text[i] === '{' ? '}' : ']';
      break;
    }
  }
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === openChar) depth++;
      else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(start, i + 1)); } catch (_) {}
          break;
        }
      }
    }
  }

  // 4. 最后兜底：用 lastIndexOf 粗略截取
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(text.slice(s, e + 1)); } catch (_) {}
  }

  // 5. 打印原始内容辅助排查
  console.error('[AI] extractJSON failed, raw response (first 500 chars):', text.slice(0, 500));
  throw new Error('无法从响应中提取JSON');
}

/**
 * 查询扩展：利用 AI 对关键词生成同义词/上下文限定词
 * 结果会缓存在内存中避免重复调用
 * @param {string} keyword 原始关键词
 * @returns {Promise<{original: string, expanded: string[]}>}
 */
const _expandCache = new Map();

async function expandQuery(keyword) {
  if (_expandCache.has(keyword)) return _expandCache.get(keyword);

  const prompt = `你是搜索优化专家。用户想监控关键词 "${keyword}" 的最新动态/热点/新闻。
请生成3-6个相关的扩展搜索词，帮助更精准匹配直接相关的内容。

规则：
- 扩展词应该是该关键词的常见变体、官方名、缩写、核心关联术语
- 不要生成过于宽泛的词（例如"AI"太宽泛）
- 不要生成与原关键词无直接关系的词

示例：
- "Claude" → ["Anthropic Claude", "Claude AI", "Claude Sonnet", "Claude Opus", "Claude Code"]
- "GPT-5" → ["OpenAI GPT-5", "GPT5", "ChatGPT 5", "OpenAI新模型"]

返回JSON: { "expanded": ["词1", "词2", ...] }`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '只返回纯JSON，不要任何其他文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const parsed = extractJSON(completion.choices[0].message.content);
    const result = { original: keyword, expanded: parsed.expanded || [] };
    _expandCache.set(keyword, result);
    console.log(`[AI] 查询扩展 "${keyword}" → [${result.expanded.join(', ')}]`);
    return result;
  } catch (err) {
    console.warn('[AI] expandQuery failed:', err.message);
    const fallback = { original: keyword, expanded: [] };
    _expandCache.set(keyword, fallback);
    return fallback;
  }
}

/**
 * 验证内容可信度 + 相关性（双评分）
 * @param {Array<{title:string, snippet:string, source:string, url:string}>} items
 * @param {string} keyword 用户的监控关键词
 * @param {string[]} expandedTerms 查询扩展词列表
 * @returns {Promise<Array<{index:number, credibility:number, relevance:number, isReliable:boolean, reason:string}>>}
 */
async function verifyContent(items, keyword = '', expandedTerms = []) {
  if (!items.length) return [];

  const keywordContext = keyword
    ? `\n用户监控的关键词: "${keyword}"${expandedTerms.length ? `\n相关扩展词: ${expandedTerms.join(', ')}` : ''}`
    : '';

  const prompt = `你是一个信息验证与相关性分析专家。请分析以下${items.length}条信息。
${keywordContext}

对每条信息，你需要从两个维度评分:

【相关性 relevance (0-100分)】
- 内容是否直接讨论/报道该关键词的最新动态、发布、更新、事件？
- 90-100: 直接相关的最新新闻/发布/更新（如"Claude发布新版本"）
- 70-89: 高度相关的深度分析/测评/对比
- 40-69: 间接相关，只是顺带提及关键词
- 0-39: 无关内容、科普教程、历史回顾、或关键词只是偶然出现
- 重要：如果内容是"XX入门教程"、"如何学习XX"、"XX是什么"等科普性内容，relevance应≤30
- 重要：如果标题/摘要中关键词只是作为背景提及而非核心话题，relevance应≤40

【可信度 credibility (0-100分)】
- 信息来源是否可靠（官方/知名媒体 > 个人博客/论坛）
- 内容是否有具体细节（时间、版本号、功能描述等）
- 是否存在标题党、夸大、虚假信息的迹象
- 内容是否是最新的（72小时内优先）
- 过时/陈旧的内容应大幅降分

信息列表:
${items.map((it, i) => `[${i + 1}] 标题: ${it.title}\n    摘要: ${it.snippet}\n    来源: ${it.source}\n    链接: ${it.url}`).join('\n\n')}

请返回JSON:
{
  "results": [
    { "index": 1, "relevance": 0到100, "credibility": 0到100, "isReliable": true或false, "reason": "一句话说明相关性和可信度判断理由" }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是信息验证与相关性分析专家。必须只返回纯JSON，禁止使用Markdown代码块包裹，禁止在JSON前后添加任何文字说明。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const text = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = extractJSON(text);
    } catch (jsonErr) {
      console.warn('[AI] JSON解析失败，重试中...', jsonErr.message);
      const retry = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: '只返回纯JSON，不要任何其他文字。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      });
      parsed = extractJSON(retry.choices[0].message.content);
    }
    return parsed.results || [];
  } catch (err) {
    console.error('[AI] verifyContent error:', err.message);
    return items.map((_, i) => ({
      index: i + 1,
      credibility: 50,
      relevance: 50,
      isReliable: true,
      reason: 'AI服务暂不可用，默认通过',
    }));
  }
}

module.exports = { verifyContent, expandQuery };
