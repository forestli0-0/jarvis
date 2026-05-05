import { AgentTool } from '../agent/types';

async function search360(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const url = `https://www.so.com/s?q=${encodeURIComponent(query)}`;
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

  // 360 搜索结果在 <h3> 标签中，每个 h3 后面可能有摘要
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;
  while ((match = h3Regex.exec(html)) !== null && results.length < 5) {
    const h3Content = match[1];

    // 提取链接和标题
    const aMatch = h3Content.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    let link = aMatch[1];
    let title = aMatch[2].replace(/<[^>]*>/g, '').trim();
    if (!title || title.length < 2) continue;

    // 跳过"其他人还搜了"等非结果标题
    if (title.includes('其他人还搜') || title.includes('相关视频')) continue;

    // 提取摘要（在 h3 后面的 <p> 或 <div> 中）
    let snippet = '';
    const afterH3 = html.slice(match.index + match[0].length, match.index + match[0].length + 1000);
    const pMatch = afterH3.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
      || afterH3.match(/<div[^>]*class="[^"]*desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
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
        const results = await search360(query);
        if (results.length > 0) {
          return JSON.stringify({ query, source: '360 Search', results }, null, 2);
        }
        return JSON.stringify({ error: '未找到搜索结果', query });
      } catch (err: any) {
        return JSON.stringify({ error: `搜索失败: ${err.message}`, query });
      }
    },
  };
}
