import { AgentTool } from '../agent/types';

async function searchBing(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });
  const html = await response.text();

  const results: { title: string; snippet: string; url: string }[] = [];

  // 提取所有 b_algo 块
  const blocks = html.split('class="b_algo"');
  for (let i = 1; i < blocks.length && results.length < 5; i++) {
    const block = blocks[i];

    // 提取 <a href="...">title</a>
    const aMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const link = aMatch[1];
    const title = aMatch[2].replace(/<[^>]*>/g, '').trim();
    if (!title) continue;

    // 提取摘要（<p> 或 <div class="b_caption"> 后的文本）
    let snippet = '';
    const pMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      snippet = pMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    results.push({ url: link, title, snippet });
  }

  return results;
}

export function createSearchTool(): AgentTool {
  return {
    name: 'web_search',
    description: '网页搜索工具。使用 Bing 搜索互联网获取实时信息。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['query'],
    },
    async execute(params) {
      const { query } = params;

      try {
        const results = await searchBing(query);
        if (results.length > 0) {
          return JSON.stringify({ query, source: 'Bing', results }, null, 2);
        }
        return JSON.stringify({ error: '未找到搜索结果', query });
      } catch (err: any) {
        return JSON.stringify({ error: `搜索失败: ${err.message}`, query });
      }
    },
  };
}
