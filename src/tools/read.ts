import * as fs from 'fs';
import * as path from 'path';
import { AgentTool } from '../agent/types';

function isWithinWorkspace(filePath: string, workspace: string): boolean {
  const full = path.resolve(workspace, filePath);
  const ws = path.resolve(workspace);
  const normFull = process.platform === 'win32' ? full.toLowerCase() : full;
  const normWs = process.platform === 'win32' ? ws.toLowerCase() : ws;
  return normFull.startsWith(normWs);
}

export function createReadTool(workspace: string): AgentTool {
  return {
    name: 'read',
    description: '读取文件内容。支持指定行范围（offset/limit），返回带行号的内容。大文件应分段读取。',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件路径（相对于工作目录）',
        },
        offset: {
          type: 'number',
          description: '起始行号（从 0 开始，可选）',
        },
        limit: {
          type: 'number',
          description: '读取行数（可选，默认读取全部）',
        },
      },
      required: ['file_path'],
    },
    async execute(params) {
      const { file_path, offset, limit } = params;

      if (!isWithinWorkspace(file_path, workspace)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      const fullPath = path.resolve(workspace, file_path);

      if (!fs.existsSync(fullPath)) {
        return JSON.stringify({ error: `文件不存在: ${file_path}` });
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return JSON.stringify({ error: `${file_path} 是目录，请使用 glob 工具列出文件` });
      }
      if (stat.size > 1024 * 1024) {
        return JSON.stringify({ error: '文件过大（超过 1MB），请使用 offset/limit 分段读取' });
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');

      const start = Math.max(0, offset || 0);
      const end = limit ? Math.min(lines.length, start + limit) : lines.length;
      const selected = lines.slice(start, end);

      const numbered = selected.map((line, i) => {
        const lineNum = start + i + 1;
        return `${lineNum}\t${line}`;
      }).join('\n');

      return numbered || '(空文件)';
    },
  };
}
