import * as fs from 'fs';
import * as path from 'path';
import { AgentTool } from '../agent/types';

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.css', '.html',
  '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.sh', '.yaml',
  '.yml', '.toml', '.xml', '.csv', '.env', '.conf', '.cfg', '.ini',
]);

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // 无扩展名的文件尝试读取
  if (!ext) return true;
  return false;
}

function grepInFile(filePath: string, regex: RegExp, maxMatches: number): { line: number; text: string }[] {
  const results: { line: number; text: string }[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length && results.length < maxMatches; i++) {
      if (regex.test(lines[i])) {
        results.push({ line: i + 1, text: lines[i].trim() });
      }
    }
  } catch {
    // 跳过无法读取的文件
  }
  return results;
}

function walkAndGrep(
  dir: string,
  baseDir: string,
  regex: RegExp,
  fileGlob: string | undefined,
  results: { file: string; matches: { line: number; text: string }[] }[],
  maxFiles: number,
  maxMatchesPerFile: number,
): void {
  if (results.length >= maxFiles) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxFiles) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkAndGrep(fullPath, baseDir, regex, fileGlob, results, maxFiles, maxMatchesPerFile);
      continue;
    }

    if (!isTextFile(entry.name)) continue;

    // 简单的 glob 过滤
    if (fileGlob) {
      const globRegex = globToRegex(fileGlob);
      if (!globRegex.test(entry.name)) continue;
    }

    const matches = grepInFile(fullPath, regex, maxMatchesPerFile);
    if (matches.length > 0) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ file: relPath, matches });
    }
  }
}

function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') {
      regexStr += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
    } else if (ch === '*') {
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

export function createGrepTool(workspace: string): AgentTool {
  return {
    name: 'grep',
    description: '内容搜索工具。在文件中搜索匹配正则表达式的内容。返回匹配的文件路径、行号和行内容。支持按文件名 glob 过滤。',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '正则表达式（如 function\\s+\\w+, TODO, import.*from）',
        },
        path: {
          type: 'string',
          description: '搜索目录（相对于工作目录，默认为工作目录根）',
        },
        glob: {
          type: 'string',
          description: '文件名过滤（如 *.ts, *.tsx），可选',
        },
      },
      required: ['pattern'],
    },
    async execute(params) {
      const { pattern, path: searchPath, glob: fileGlob } = params;

      const baseDir = searchPath
        ? path.resolve(workspace, searchPath)
        : path.resolve(workspace);

      const normBase = process.platform === 'win32' ? baseDir.toLowerCase() : baseDir;
      const normWs = process.platform === 'win32' ? path.resolve(workspace).toLowerCase() : path.resolve(workspace);
      if (!normBase.startsWith(normWs)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      if (!fs.existsSync(baseDir)) {
        return JSON.stringify({ error: `目录不存在: ${searchPath || '.'}` });
      }

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return JSON.stringify({ error: `无效的正则表达式: ${pattern}` });
      }

      const results: { file: string; matches: { line: number; text: string }[] }[] = [];
      walkAndGrep(baseDir, baseDir, regex, fileGlob, results, 50, 10);

      if (results.length === 0) {
        return JSON.stringify({ pattern, results: [], message: '未找到匹配内容' });
      }

      const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);
      return JSON.stringify({ pattern, files: results.length, matches: totalMatches, results }, null, 2);
    },
  };
}
