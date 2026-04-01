require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: process.env.ARK_API_KEY,
});

const MODEL = 'deepseek-v3-2-251201';

/** 从可能包含 markdown 代码块的文本中提取 JSON */
function extractJSON(text) {
  // 先尝试直接解析
  try { return JSON.parse(text); } catch (_) {}
  // 去掉 ```json ... ``` 包裹
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) return JSON.parse(m[1].trim());
  // 最后尝试找第一个 { ... } 块
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return JSON.parse(text.slice(start, end + 1));
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
        { role: 'system', content: '你是信息真伪验证专家。只返回JSON，不要Markdown代码块。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const text = completion.choices[0].message.content;
    const parsed = extractJSON(text);
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
