import { AgentTool } from '../agent/types';

function extractReadableText(html: string): string {
  // 移除无关标签
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');

  // 尝试提取 article 或 main 内容
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const content = articleMatch?.[1] || mainMatch?.[1] || cleaned;

  // 提取标题
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';

  // 提取 meta description
  const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)
    || html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"[^>]*>/i);
  const metaDesc = metaMatch?.[1]?.trim() || '';

  // 将块级标签转换为换行
  const withNewlines = content
    .replace(/<\/?(h[1-6]|p|div|br|li|tr|blockquote)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');

  // 解码 HTML 实体
  const decoded = withNewlines
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, '');

  // 清理空白
  const lines = decoded.split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0);

  // 去重连续相同行
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  let result = deduped.join('\n');

  // 添加标题和描述
  const header = [title, metaDesc].filter(Boolean).join(' — ');
  if (header) {
    result = header + '\n\n' + result;
  }

  // 限制长度（约 8000 字符，避免 token 过多）
  if (result.length > 8000) {
    result = result.substring(0, 8000) + '\n\n[内容已截断]';
  }

  return result;
}

export function createWebFetchTool(): AgentTool {
  return {
    name: 'web_fetch',
    description: '抓取指定网页的正文内容。用于深入阅读搜索结果中的链接页面。返回网页的可读文本。',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: '要抓取的网页 URL',
        },
      },
      required: ['url'],
    },
    async execute(params) {
      const { url } = params;

      // 校验 URL 协议，只允许 http/https
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return JSON.stringify({ error: `不支持的协议: ${parsed.protocol}，仅支持 http/https`, url });
        }
      } catch {
        return JSON.stringify({ error: `无效的 URL: ${url}`, url });
      }

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
          return JSON.stringify({ error: `不支持的内容类型: ${contentType}`, url });
        }

        const html = await response.text();
        const text = extractReadableText(html);

        if (!text || text.length < 50) {
          return JSON.stringify({ error: '页面内容过少或无法解析', url });
        }

        return JSON.stringify({ url, content: text }, null, 2);
      } catch (err: any) {
        return JSON.stringify({ error: `抓取失败: ${err.message}`, url });
      }
    },
  };
}
