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
 * 验证内容可信度
 * @param {Array<{title:string, snippet:string, source:string, url:string}>} items
 * @returns {Promise<Array<{title:string, credibility:number, isReliable:boolean, reason:string}>>}
 */
async function verifyContent(items) {
  if (!items.length) return [];
  const prompt = `你是一个信息验证专家。请分析以下${items.length}条信息的可信度。
对每条信息，判断:
1. 信息来源是否可靠（官方/知名媒体优于个人博客）
2. 内容是否有具体细节（时间、版本号、功能描述等）
3. 是否存在标题党、夸大、虚假信息的迹象
4. 内容是否是最新的（优先最近24-72小时内的新闻）
5. 多条信息之间是否可以交叉验证

重要：过时的、陈旧的内容应大幅降低可信度分数。

信息列表:
${items.map((it, i) => `[${i + 1}] 标题: ${it.title}\n    摘要: ${it.snippet}\n    来源: ${it.source}\n    链接: ${it.url}`).join('\n\n')}

请返回JSON格式:
{
  "results": [
    { "index": 1, "credibility": 0到100的数字, "isReliable": true或false, "reason": "简短原因" }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是信息真伪验证专家。必须只返回纯JSON，禁止使用Markdown代码块包裹，禁止在JSON前后添加任何文字说明。' },
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
      // JSON 解析失败，重试一次
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
      isReliable: true,
      reason: 'AI服务暂不可用，默认通过',
    }));
  }
}

module.exports = { verifyContent };
