import { ChatMessage } from '../agent/types';
import { ModelAdapter } from '../agent/model';
import { saveMemory } from './store';

const SUMMARIZE_PROMPT = `你是一个记忆管理助手。分析以下对话，提取值得长期记忆的信息。

请按以下格式输出（每条一行，没有则留空）：
[FACT] 用户相关的事实信息（职业、背景、技能等）
[PREFERENCE] 用户的偏好（喜欢什么、不喜欢什么）
[TASK] 用户提到的待办事项或项目
[SUMMARY] 对话的简要摘要

只输出以上格式的内容，不要有其他文字。`;

export async function summarizeConversation(
  model: ModelAdapter,
  conversationId: string,
  messages: ChatMessage[]
): Promise<void> {
  // 只处理有意义的对话（至少 2 条消息）
  if (messages.length < 2) return;

  // 取最近 20 条消息进行分析
  const recentMessages = messages.slice(-20);
  const conversationText = recentMessages
    .map((m) => `${m.role}: ${m.content || JSON.stringify(m.tool_calls)}`)
    .join('\n');

  try {
    const response = await model.chat([
      { role: 'system', content: SUMMARIZE_PROMPT },
      { role: 'user', content: conversationText },
    ]);

    if (!response.content) return;

    const lines = response.content.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[FACT]')) {
        saveMemory('fact', trimmed.replace('[FACT]', '').trim(), conversationId, 0.7);
      } else if (trimmed.startsWith('[PREFERENCE]')) {
        saveMemory('preference', trimmed.replace('[PREFERENCE]', '').trim(), conversationId, 0.6);
      } else if (trimmed.startsWith('[TASK]')) {
        saveMemory('task', trimmed.replace('[TASK]', '').trim(), conversationId, 0.8);
      } else if (trimmed.startsWith('[SUMMARY]')) {
        saveMemory('summary', trimmed.replace('[SUMMARY]', '').trim(), conversationId, 0.3);
      }
    }
  } catch {
    // 摘要失败不影响主流程
  }
}
