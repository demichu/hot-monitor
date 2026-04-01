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
4. 多条信息之间是否可以交叉验证

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

/**
 * 从多来源内容中提取热点
 * @param {string} scope 监控范围
 * @param {Array<{title:string, snippet:string, source:string, url:string, engagement?:number}>} items
 * @returns {Promise<Array<{title:string, summary:string, heat:number, sources:Array, category:string}>>}
 */
async function extractHotspots(scope, items) {
  if (!items.length) return [];
  const prompt = `你是一个热点趋势分析专家。请从以下关于"${scope}"领域的${items.length}条信息中提取热点话题。

信息列表:
${items.map((it, i) => `[${i + 1}] 标题: ${it.title}\n    摘要: ${it.snippet}\n    来源: ${it.source}\n    互动量: ${it.engagement || '未知'}`).join('\n\n')}

要求:
1. 识别出最重要的 5-10 个热点话题（合并相同话题）
2. 按热度排序（综合互动量、来源数量、时效性）
3. 为每个热点生成简短中文摘要（30字以内）
4. 分类标签: breaking(突发), update(更新), trend(趋势), release(发布), opinion(观点)

返回JSON:
{
  "hotspots": [
    {
      "title": "热点标题",
      "summary": "简短摘要",
      "heat": 0到100,
      "category": "分类标签",
      "sourceIndices": [1, 3, 5]
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是热点趋势分析专家。只返回JSON，不要Markdown代码块。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const text = completion.choices[0].message.content;
    const parsed = extractJSON(text);

    // 将 sourceIndices 映射回实际来源
    return (parsed.hotspots || []).map(h => ({
      ...h,
      sources: (h.sourceIndices || [])
        .map(i => items[i - 1])
        .filter(Boolean)
        .map(it => ({ title: it.title, url: it.url, source: it.source })),
    }));
  } catch (err) {
    console.error('[AI] extractHotspots error:', err.message);
    return [];
  }
}

module.exports = { verifyContent, extractHotspots };
