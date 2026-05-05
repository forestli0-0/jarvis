import { ChatMessage } from '../agent/types';
import { ModelAdapter } from '../agent/model';
import { saveMemory, getMemories } from './store';

const SUMMARIZE_PROMPT = `你是一个记忆管理助手。分析以下对话，提取值得长期记忆的信息。

已有的记忆（避免重复）：
{existing_memories}

请按以下格式输出（每条一行，没有则留空）：
[FACT] 用户相关的事实信息（职业、背景、技能等）——限 3 条
[PREFERENCE] 用户的偏好（喜欢什么、不喜欢什么）——限 2 条
[TASK] 用户提到的待办事项或项目——限 2 条
[SUMMARY] 对话的简要摘要（一句话）——限 1 条

规则：
- 只输出新信息，不要重复已有的记忆
- 只提取用户明确表达的信息，不要推测
- 每条记忆限 50 字以内
- 总共不超过 5 条
- 没有新信息就什么都不输出`;

export async function summarizeConversation(
  model: ModelAdapter,
  conversationId: string,
  messages: ChatMessage[]
): Promise<{ type: string; content: string }[]> {
  const newMemories: { type: string; content: string }[] = [];

  if (messages.length < 2) return newMemories;

  // 加载已有记忆，告知 LLM 避免重复
  const existingFacts = getMemories('fact', 20);
  const existingPrefs = getMemories('preference', 20);
  const existingTasks = getMemories('task', 20);
  const existingList = [
    ...existingFacts.map(m => `[已有FACT] ${m.content}`),
    ...existingPrefs.map(m => `[已有PREFERENCE] ${m.content}`),
    ...existingTasks.map(m => `[已有TASK] ${m.content}`),
  ].join('\n');

  const recentMessages = messages.slice(-20);
  const conversationText = recentMessages
    .map((m) => `${m.role}: ${m.content || JSON.stringify(m.tool_calls)}`)
    .join('\n');

  const prompt = SUMMARIZE_PROMPT.replace('{existing_memories}', existingList || '（暂无）');

  try {
    const response = await model.chat([
      { role: 'system', content: prompt },
      { role: 'user', content: conversationText },
    ]);

    if (!response.content) return newMemories;

    const lines = response.content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const trimmed = line.trim();
      let type: 'fact' | 'preference' | 'task' | 'summary' | null = null;
      let content = '';

      if (trimmed.startsWith('[FACT]')) {
        type = 'fact';
        content = trimmed.replace('[FACT]', '').trim();
      } else if (trimmed.startsWith('[PREFERENCE]')) {
        type = 'preference';
        content = trimmed.replace('[PREFERENCE]', '').trim();
      } else if (trimmed.startsWith('[TASK]')) {
        type = 'task';
        content = trimmed.replace('[TASK]', '').trim();
      } else if (trimmed.startsWith('[SUMMARY]')) {
        type = 'summary';
        content = trimmed.replace('[SUMMARY]', '').trim();
      }

      if (type && content && content.length >= 3 && content.length <= 200) {
        const importanceMap = { fact: 0.7, preference: 0.6, task: 0.8, summary: 0.3 };
        const id = saveMemory(type, content, conversationId, importanceMap[type]);
        if (id) newMemories.push({ type, content });
      }
    }
  } catch {
    // 摘要失败不影响主流程
  }

  return newMemories;
}
