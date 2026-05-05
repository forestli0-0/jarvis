import { AgentTool } from '../agent/types';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function extractKeywords(query: string): string[] {
  // 先按空格/标点分段
  const segments = query.split(/[\s,，。、；;！!？?]+/).filter(s => s.length > 0);
  const keywords: string[] = [];

  for (const seg of segments) {
    if (seg.length <= 2) {
      // 短段直接作为关键词
      keywords.push(seg);
    } else {
      // 长段提取 2-gram 作为关键词（中文需要 n-gram 因为没有空格分词）
      for (let i = 0; i <= seg.length - 2; i++) {
        const gram = seg.substring(i, i + 2);
        // 跳过纯停用词 bigram
        if (/^[的了在是我有和就不人都一也很到说要去你会着没有看]$/.test(gram)) continue;
        keywords.push(gram);
      }
    }
  }
  return [...new Set(keywords)];
}

function isRelevantResult(title: string, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  let matchCount = 0;
  for (const kw of keywords) {
    if (title.includes(kw)) matchCount++;
  }
  // 至少匹配 40% 的关键词才算相关
  return matchCount >= Math.ceil(keywords.length * 0.4);
}

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

  // 百度验证码
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

    // 提取摘要
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
        const keywords = extractKeywords(query);

        // 1. 优先 Bing（稳定，不会被验证码拦截）
        let results = await searchBing(query);
        let relevant = results.filter(r => isRelevantResult(r.title, keywords));

        // 2. Bing 结果不相关时，尝试百度
        if (relevant.length < 2) {
          const baiduResults = await searchBaidu(query);
          if (baiduResults.length > 0) {
            results = baiduResults;
            relevant = baiduResults.filter(r => isRelevantResult(r.title, keywords));
          }
        } else {
          results = relevant;
        }

        // 3. 使用相关结果，或在完全无相关结果时用百度原始结果（避免什么都拿不到）
        const finalResults = relevant.length > 0 ? relevant : results;

        if (finalResults.length > 0) {
          return JSON.stringify({ query, results: finalResults }, null, 2);
        }
        return JSON.stringify({ error: '未找到搜索结果', query });
      } catch (err: any) {
        return JSON.stringify({ error: `搜索失败: ${err.message}`, query });
      }
    },
  };
}
