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

export function createWriteTool(workspace: string): AgentTool {
  return {
    name: 'write',
    description: '写入文件。创建新文件或覆盖已有文件，自动创建父目录。',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件路径（相对于工作目录）',
        },
        content: {
          type: 'string',
          description: '要写入的内容',
        },
      },
      required: ['file_path', 'content'],
    },
    async execute(params) {
      const { file_path, content } = params;

      if (!isWithinWorkspace(file_path, workspace)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      const fullPath = path.resolve(workspace, file_path);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content, 'utf-8');
      return JSON.stringify({ success: true, path: file_path, bytes: Buffer.byteLength(content, 'utf-8') });
    },
  };
}
