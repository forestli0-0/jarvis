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
  // Bing 结果: <li class="b_algo"><h2><a href="...">title</a></h2><div class="b_caption"><p>snippet</p></div>
  const regex = /<li class="b_algo">[\s\S]*?<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p>([\s\S]*?)<\/p>/gi;

  let match;
  while ((match = regex.exec(html)) !== null && results.length < 5) {
    results.push({
      url: match[1],
      title: match[2].replace(/<[^>]*>/g, '').trim(),
      snippet: match[3].replace(/<[^>]*>/g, '').trim(),
    });
  }
  return results;
}

async function searchBaidu(query: string): Promise<{ title: string; snippet: string; url: string }[]> {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    signal: AbortSignal.timeout(10000),
  });
  const html = await response.text();

  const results: { title: string; snippet: string; url: string }[] = [];
  // 百度结果: <div class="result c-container ..."><h3><a href="...">title</a></h3><span class="content-right_8Zs40">snippet</span>
  const regex = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi;

  let match;
  while ((match = regex.exec(html)) !== null && results.length < 5) {
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    if (title) {
      results.push({
        url: match[1],
        title,
        snippet: '',
      });
    }
  }
  return results;
}

export function createSearchTool(): AgentTool {
  return {
    name: 'web_search',
    description: '网页搜索工具。可以搜索互联网获取实时信息。支持 Bing 和百度。',
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

      // 依次尝试 Bing → 百度
      for (const [name, searchFn] of [['Bing', searchBing], ['百度', searchBaidu]] as const) {
        try {
          const results = await searchFn(query);
          if (results.length > 0) {
            return JSON.stringify({ query, source: name, results }, null, 2);
          }
        } catch {
          continue;
        }
      }

      return JSON.stringify({ error: '所有搜索引擎均不可用', query });
    },
  };
}
