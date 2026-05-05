import { getMemories, getMemoriesByTier, touchMemory, Memory } from './store';

function dedupeById(memories: Memory[]): Memory[] {
  const seen = new Set<string>();
  return memories.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export function buildMemoryContext(): string {
  // 长期记忆优先
  const longFacts = getMemoriesByTier('long', 'fact', 10);
  const longPrefs = getMemoriesByTier('long', 'preference', 5);
  const longTasks = getMemoriesByTier('long', 'task', 5);

  // 短期记忆补充
  const shortFacts = getMemoriesByTier('short', 'fact', 5);
  const shortPrefs = getMemoriesByTier('short', 'preference', 3);
  const shortTasks = getMemoriesByTier('short', 'task', 3);
  const summaries = getMemories('summary', 5);

  const parts: string[] = [];

  const allFacts = dedupeById([...longFacts, ...shortFacts]);
  const allPrefs = dedupeById([...longPrefs, ...shortPrefs]);
  const allTasks = dedupeById([...longTasks, ...shortTasks]);

  if (allFacts.length > 0) {
    parts.push('## 关于用户的已知信息');
    allFacts.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (allPrefs.length > 0) {
    parts.push('## 用户偏好');
    allPrefs.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (allTasks.length > 0) {
    parts.push('## 待办事项/项目');
    allTasks.forEach((m) => parts.push(`- ${m.content}`));
  }

  if (summaries.length > 0) {
    parts.push('## 历史对话摘要');
    summaries.forEach((m) => parts.push(`- ${m.content}`));
  }

  // 触碰所有注入的记忆（增加 hit_count）
  const allInjected = [...allFacts, ...allPrefs, ...allTasks, ...summaries];
  for (const m of allInjected) {
    touchMemory(m.id);
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
- 追溯记忆源头（使用 memory_trace 工具）

你的原则：
- 简洁高效地回答问题
- 只在用户明确要求或问题确实需要时才使用工具（比如用户说"帮我搜索"、"帮我执行"、"帮我读取文件"等）
- 日常闲聊、问答、提供建议时不要使用任何工具
- 记住用户的信息和偏好
- 当用户询问你记住了什么、或提到之前对话中的信息时，使用 memory_trace 工具追溯源头
- 用中文交流`;

  if (memoryContext) {
    prompt += `\n\n# 你已掌握的信息\n${memoryContext}`;
  }

  return prompt;
}

export { summarizeConversation } from './summarizer';
export { saveMemory, getMemories, searchMemories, deleteMemory, getMemoryChain, consolidateMemories } from './store';
