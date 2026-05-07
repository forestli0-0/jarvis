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

export function createEditTool(workspace: string): AgentTool {
  return {
    name: 'edit',
    description: '精确字符串替换工具。在文件中查找 old_string 并替换为 new_string。old_string 必须在文件中唯一匹配，否则报错。适合精确修改代码，避免整体重写文件。',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: '文件路径（相对于工作目录）',
        },
        old_string: {
          type: 'string',
          description: '要查找的原始字符串（必须在文件中唯一）',
        },
        new_string: {
          type: 'string',
          description: '替换后的新字符串',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
    async execute(params) {
      const { file_path, old_string, new_string } = params;

      if (!isWithinWorkspace(file_path, workspace)) {
        return JSON.stringify({ error: '路径超出工作目录范围' });
      }

      const fullPath = path.resolve(workspace, file_path);

      if (!fs.existsSync(fullPath)) {
        return JSON.stringify({ error: `文件不存在: ${file_path}` });
      }

      const content = fs.readFileSync(fullPath, 'utf-8');

      // 计算匹配次数
      let count = 0;
      let pos = content.indexOf(old_string);
      while (pos !== -1) {
        count++;
        pos = content.indexOf(old_string, pos + 1);
      }

      if (count === 0) {
        return JSON.stringify({ error: 'old_string 在文件中未找到匹配' });
      }
      if (count > 1) {
        return JSON.stringify({ error: `old_string 匹配了 ${count} 次，必须唯一。请提供更多上下文使匹配唯一。` });
      }

      const newContent = content.replace(old_string, new_string);
      fs.writeFileSync(fullPath, newContent, 'utf-8');

      return JSON.stringify({ success: true, path: file_path });
    },
  };
}
