import * as fs from 'fs';
import * as path from 'path';
import { AgentTool } from '../agent/types';

export function createFileTool(workspace: string): AgentTool {
  return {
    name: 'file',
    description: '文件操作工具。可以读取文件内容、写入文件、列出目录内容。',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'write', 'list'],
          description: '操作类型：read 读取文件，write 写入文件，list 列出目录',
        },
        path: {
          type: 'string',
          description: '文件或目录路径（相对于工作目录）',
        },
        content: {
          type: 'string',
          description: '写入文件时的内容',
        },
      },
      required: ['action', 'path'],
    },
    async execute(params) {
      const { action, path: filePath, content } = params;
      const fullPath = path.resolve(workspace, filePath);
      const resolvedWorkspace = path.resolve(workspace);

      // 安全检查：确保路径在工作目录内（统一小写比较，兼容 Windows）
      const normalizedFull = process.platform === 'win32' ? fullPath.toLowerCase() : fullPath;
      const normalizedWorkspace = process.platform === 'win32' ? resolvedWorkspace.toLowerCase() : resolvedWorkspace;
      if (!normalizedFull.startsWith(normalizedWorkspace)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      switch (action) {
        case 'read': {
          if (!fs.existsSync(fullPath)) {
            return JSON.stringify({ error: '文件不存在' });
          }
          const stat = fs.statSync(fullPath);
          if (stat.size > 1024 * 1024) {
            return JSON.stringify({ error: '文件过大（超过 1MB），请指定读取范围' });
          }
          return fs.readFileSync(fullPath, 'utf-8');
        }

        case 'write': {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, content || '', 'utf-8');
          return JSON.stringify({ success: true, path: filePath });
        }

        case 'list': {
          if (!fs.existsSync(fullPath)) {
            return JSON.stringify({ error: '目录不存在' });
          }
          const entries = fs.readdirSync(fullPath, { withFileTypes: true });
          const items = entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? 'directory' : 'file',
          }));
          return JSON.stringify(items, null, 2);
        }

        default:
          return JSON.stringify({ error: `未知操作: ${action}` });
      }
    },
  };
}
