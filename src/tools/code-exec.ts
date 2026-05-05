import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentTool } from '../agent/types';

function findPython(): string {
  // 依次尝试常见 Python 路径
  const candidates = [
    'python',
    'python3',
    'C:/msys64/ucrt64/bin/python.exe',
    'C:/msys64/usr/bin/python3.exe',
    'C:/Python312/python.exe',
    'C:/Python311/python.exe',
    'C:/Python310/python.exe',
  ];
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { timeout: 3000, encoding: 'utf-8', stdio: 'pipe' });
      return cmd;
    } catch {}
  }
  return 'python'; // fallback
}

export function createCodeExecTool(): AgentTool {
  const execOpts = {
    timeout: 30000,
    encoding: 'utf-8' as const,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  };

  return {
    name: 'code_exec',
    description: '代码执行工具。可以执行 JavaScript 或 Python 代码片段并返回结果。',
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['javascript', 'python'],
          description: '编程语言',
        },
        code: {
          type: 'string',
          description: '要执行的代码',
        },
      },
      required: ['language', 'code'],
    },
    async execute(params) {
      const { language, code } = params;
      const tmpDir = os.tmpdir();

      try {
        if (language === 'javascript') {
          const tmpFile = path.join(tmpDir, `jarvis_exec_${Date.now()}.js`);
          fs.writeFileSync(tmpFile, code, 'utf-8');
          try {
            const output = execSync(`node "${tmpFile}"`, execOpts);
            return output;
          } finally {
            fs.unlinkSync(tmpFile);
          }
        }

        if (language === 'python') {
          const pythonCmd = findPython();
          const tmpFile = path.join(tmpDir, `jarvis_exec_${Date.now()}.py`);
          fs.writeFileSync(tmpFile, code, 'utf-8');
          try {
            let cmd: string;
            if (process.platform === 'win32') {
              // Windows: 用 PowerShell 执行，确保 UTF-8 输出
              cmd = `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; & '${pythonCmd}' '${tmpFile}'"`;
            } else {
              cmd = `${pythonCmd} "${tmpFile}"`;
            }
            const output = execSync(cmd, execOpts);
            return output;
          } finally {
            fs.unlinkSync(tmpFile);
          }
        }

        return JSON.stringify({ error: `不支持的语言: ${language}` });
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
