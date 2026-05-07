import * as fs from 'fs';
import * as path from 'path';
import { AgentTool } from '../agent/types';

function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      // ** 匹配任意目录深度
      regexStr += '.*';
      i += 2;
      if (pattern[i] === '/') i++; // **/ 吃掉后面的 /
    } else if (ch === '*') {
      // * 匹配路径段内的任意字符（不含路径分隔符）
      regexStr += '[^/\\\\]*';
      i++;
    } else if (ch === '?') {
      regexStr += '[^/\\\\]';
      i++;
    } else if (ch === '.') {
      regexStr += '\\.';
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  return new RegExp('^' + regexStr + '$', 'i');
}

function walkDir(dir: string, baseDir: string, results: string[], maxResults: number): void {
  if (results.length >= maxResults) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      walkDir(fullPath, baseDir, results, maxResults);
    } else {
      results.push(relPath);
    }
  }
}

export function createGlobTool(workspace: string): AgentTool {
  return {
    name: 'glob',
    description: '文件模式匹配工具。根据通配符模式搜索文件。支持 **（任意目录深度）、*（任意字符）、?（单个字符）。返回匹配的文件路径列表。',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '通配符模式，如 **/*.ts, src/**/*.tsx, *.json',
        },
        path: {
          type: 'string',
          description: '搜索的起始目录（相对于工作目录，默认为工作目录根）',
        },
      },
      required: ['pattern'],
    },
    async execute(params) {
      const { pattern, path: searchPath } = params;
      const baseDir = searchPath
        ? path.resolve(workspace, searchPath)
        : path.resolve(workspace);

      // 安全检查
      const normBase = process.platform === 'win32' ? baseDir.toLowerCase() : baseDir;
      const normWs = process.platform === 'win32' ? path.resolve(workspace).toLowerCase() : path.resolve(workspace);
      if (!normBase.startsWith(normWs)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      if (!fs.existsSync(baseDir)) {
        return JSON.stringify({ error: `目录不存在: ${searchPath || '.'}` });
      }

      const regex = globToRegex(pattern);
      const allFiles: string[] = [];
      walkDir(baseDir, baseDir, allFiles, 500);

      const matched = allFiles.filter(f => regex.test(f));

      if (matched.length === 0) {
        return JSON.stringify({ pattern, results: [], message: '未找到匹配的文件' });
      }

      return JSON.stringify({ pattern, count: matched.length, results: matched }, null, 2);
    },
  };
}
