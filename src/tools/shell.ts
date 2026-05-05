import { execSync } from 'child_process';
import { AgentTool } from '../agent/types';

export function createShellTool(workspace: string): AgentTool {
  const BLOCKED = ['rm -rf /', 'format', 'mkfs', 'dd if='];

  return {
    name: 'shell',
    description: '系统命令执行工具。可以在工作目录下执行 shell 命令。',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令',
        },
      },
      required: ['command'],
    },
    async execute(params) {
      const { command } = params;

      for (const blocked of BLOCKED) {
        if (command.toLowerCase().includes(blocked)) {
          return JSON.stringify({ error: '该命令被安全策略阻止' });
        }
      }

      try {
        let output: string;

        if (process.platform === 'win32') {
          // Windows: 用 PowerShell 执行，UTF-8 输出
          const psCmd = `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${command.replace(/"/g, '\\"')}"`;
          output = execSync(psCmd, {
            cwd: workspace,
            timeout: 30000,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          });
        } else {
          output = execSync(command, {
            cwd: workspace,
            timeout: 30000,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          });
        }

        return output;
      } catch (err: any) {
        return JSON.stringify({
          error: err.message,
          stdout: err.stdout || '',
          stderr: err.stderr || '',
        });
      }
    },
  };
}
