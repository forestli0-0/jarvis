import { execFileSync } from 'child_process';
import { AgentTool } from '../agent/types';

const BLOCKED_PATTERNS = [
  /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s/i,
  /\brm\s+--recursive\s+--force/i,
  /\brm\s+\/[sq]\s/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bInvoke-Expression\b/i,
  /\bInvoke-Command\b/i,
  /\bNew-Object\s+Net\.WebClient/i,
  /\bStart-Process\b.*-Verb\s+RunAs/i,
  /\breg\s+delete\b/i,
  /\bnet\s+user\b.*\/add\b/i,
];

function isBlocked(command: string): boolean {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(command)) return true;
  }
  // 通用危险模式：管道到解释器、命令替换
  if (/\|\s*(bash|sh|cmd|powershell|pwsh)\b/i.test(command)) return true;
  if (/\$\(.*\)/.test(command)) return true;
  if (/`[^`]+`/.test(command)) return true;
  return false;
}

export function createShellTool(workspace: string): AgentTool {
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

      if (isBlocked(command)) {
        return JSON.stringify({ error: '该命令被安全策略阻止' });
      }

      try {
        let output: string;

        if (process.platform === 'win32') {
          // Windows: 用 -EncodedCommand 传递命令，避免注入
          const preamble = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ';
          const fullCmd = preamble + command;
          const encoded = Buffer.from(fullCmd, 'utf16le').toString('base64');
          output = execFileSync('powershell', [
            '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded,
          ], {
            cwd: workspace,
            timeout: 30000,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          });
        } else {
          output = execFileSync('sh', ['-c', command], {
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
