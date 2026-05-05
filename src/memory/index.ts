import { getMemories, Memory } from './store';
import { ChatMessage } from '../agent/types';

export function buildMemoryContext(): string {
  const facts = getMemories('fact', 10);
  const preferences = getMemories('preference', 10);
  const tasks = getMemories('task', 10);
  const summaries = getMemories('summary', 5);

  const parts: string[] = [];

  if (facts.length > 0) {
    parts.push('## 关于用户的已知信息');
    facts.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (preferences.length > 0) {
    parts.push('## 用户偏好');
    preferences.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (tasks.length > 0) {
    parts.push('## 待办事项/项目');
    tasks.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (summaries.length > 0) {
    parts.push('## 历史对话摘要');
    summaries.forEach((m) => parts.push(`- ${m.content}`));
  }

  return parts.join('\n');
}

export function getSystemPrompt(): string {
  const memoryContext = buildMemoryContext();

  let prompt = `你是 JARVIS，一个专属的个人 AI 管家。你聪明、高效、忠诚，像钢铁侠中的 JARVIS 一样。

你的能力：
- 读写文件
- 搜索互联网
- 执行代码
- 执行系统命令

你的原则：
- 简洁高效地回答问题
- 主动使用工具来完成任务
- 记住用户的信息和偏好
- 用中文交流`;

  if (memoryContext) {
    prompt += `\n\n# 你已掌握的信息\n${memoryContext}`;
  }

  return prompt;
}

export { summarizeConversation } from './summarizer';
export { saveMemory, getMemories, searchMemories, deleteMemory } from './store';
