import { AgentTool } from '../agent/types';

async function searchSogou(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();

  const results: { title: string; snippet: string; url: string }[] = [];

  // 搜狗搜索结果在 <h3> 标签中
  const h3Blocks = html.split(/<h3[^>]*>/);
  for (let i = 1; i < h3Blocks.length && results.length < 5; i++) {
    const block = h3Blocks[i];

    // 提取 <a href="...">title</a>
    const aMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    let link = aMatch[1];
    const title = aMatch[2].replace(/<[^>]*>/g, '').trim();
    if (!title) continue;

    // 搜狗的链接可能是跳转链接，提取真实 URL
    const realUrl = link.match(/url=([^&"]+)/);
    if (realUrl) link = decodeURIComponent(realUrl[1]);

    // 提取摘要
    let snippet = '';
    const snippetMatch = block.match(/<p[^>]*class="[^"]*str[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (snippetMatch) {
      snippet = snippetMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    results.push({ url: link, title, snippet });
  }

  return results;
}

export function createSearchTool(): AgentTool {
  return {
    name: 'web_search',
    description: '网页搜索工具。使用搜索引擎获取实时信息。',
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
        const results = await searchSogou(query);
        if (results.length > 0) {
          return JSON.stringify({ query, source: 'Sogou', results }, null, 2);
        }
        return JSON.stringify({ error: '未找到搜索结果', query });
      } catch (err: any) {
        return JSON.stringify({ error: `搜索失败: ${err.message}`, query });
      }
    },
  };
}
