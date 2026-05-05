import { AgentTool } from '../agent/types';
import { SearchConfig } from '../config';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

// ─── Tavily Search API ───
async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      include_answer: false,
      search_depth: 'basic',
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json() as any;
  if (data.detail) return [];

  return (data.results || []).map((r: any) => ({
    title: r.title || '',
    snippet: r.content || '',
    url: r.url || '',
  }));
}

// ─── Serper (Google) API ───
async function searchSerper(query: string, apiKey: string): Promise<SearchResult[]> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, gl: 'cn', hl: 'zh-cn', num: 5 }),
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json() as any;
  return (data.organic || []).map((r: any) => ({
    title: r.title || '',
    snippet: r.snippet || '',
    url: r.link || '',
  }));
}

// ─── Bing Scraping (fallback) ───
async function searchBing(query: string): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();

  const results: SearchResult[] = [];
  const liRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null && results.length < 5) {
    const li = match[1];
    const h2Match = li.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (!h2Match) continue;

    const aMatch = h2Match[1].match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const link = aMatch[1];
    const title = aMatch[2].replace(/<[^>]*>/g, '').trim();
    if (title.length < 3) continue;

    let snippet = '';
    const captionMatch = li.match(/<div[^>]*class="[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (captionMatch) {
      const pMatch = captionMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      if (pMatch) {
        snippet = pMatch[1].replace(/<[^>]*>/g, '').replace(/&ensp;/g, ' ').trim();
      }
    }

    results.push({ url: link, title, snippet });
  }

  return results;
}

// ─── Baidu Scraping (fallback) ───
async function searchBaidu(query: string): Promise<SearchResult[]> {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();

  if (html.includes('antispider') || html.includes('安全验证') || html.length < 3000) {
    return [];
  }

  const results: SearchResult[] = [];
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;

  while ((match = h3Regex.exec(html)) !== null && results.length < 5) {
    const h3Content = match[1];
    const aMatch = h3Content.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!aMatch) continue;

    const link = aMatch[1];
    const title = aMatch[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (title.length < 3) continue;
    if (title.includes('相关搜索') || title.includes('其他人还搜') || title.includes('百度首页')) continue;

    let snippet = '';
    const afterH3 = html.slice(match.index + match[0].length, match.index + match[0].length + 5000);
    const spanRegex = /<span[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanRegex.exec(afterH3)) !== null) {
      const cls = spanMatch[1];
      const text = spanMatch[2].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      if (cls.includes('cu-color') || cls.includes('link-pre') || cls.includes('c-color')) continue;
      if (text.includes('个回答') || text.includes('回答时间')) continue;
      if (text.includes('更多关于') && text.includes('问题')) continue;
      if (text.length > 30 && text.length < 500) {
        snippet = text;
        break;
      }
    }

    results.push({ url: link, title, snippet });
  }

  return results;
}

export function createSearchTool(searchConfig?: SearchConfig): AgentTool {
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
        let results: SearchResult[] = [];

        // 1. 优先使用配置的 API 搜索引擎
        if (searchConfig?.provider === 'tavily' && searchConfig.api_key) {
          results = await searchTavily(query, searchConfig.api_key);
        } else if (searchConfig?.provider === 'serper' && searchConfig.api_key) {
          results = await searchSerper(query, searchConfig.api_key);
        }

        // 2. API 无结果时回退到 Bing 爬虫
        if (results.length === 0) {
          results = await searchBing(query);
        }

        // 3. Bing 也无结果时回退到百度爬虫
        if (results.length === 0) {
          results = await searchBaidu(query);
        }

        if (results.length > 0) {
          return JSON.stringify({ query, results }, null, 2);
        }
        return JSON.stringify({ error: '未找到搜索结果', query });
      } catch (err: any) {
        return JSON.stringify({ error: `搜索失败: ${err.message}`, query });
      }
    },
  };
}
