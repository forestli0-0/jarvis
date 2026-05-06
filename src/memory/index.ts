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

  return parts.join('\n');
}

export function getSystemPrompt(): string {
  const memoryContext = buildMemoryContext();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const days = ['日','一','二','三','四','五','六'];
  const currentTime = `${now.getFullYear()}年${pad(now.getMonth()+1)}月${pad(now.getDate())}日 星期${days[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let prompt = `你是 JARVIS，一个专属的个人 AI 管家。你聪明、高效、忠诚，像钢铁侠中的 JARVIS 一样。

当前时间：${currentTime}

你的能力：
- 读写文件
- 搜索互联网（web_search）
- 抓取网页正文内容（web_fetch）——搜索到有价值的结果后，用此工具深入阅读原文
- 执行代码
- 执行系统命令
- 追溯记忆源头（memory_trace）

你的原则：
- 简洁高效地回答问题
- 只在用户明确要求或问题确实需要时才使用工具（比如用户说"帮我搜索"、"帮我执行"、"帮我读取文件"等）
- 日常闲聊、问答、提供建议时不要使用任何工具
- 记住用户的信息和偏好
- 当用户询问你记住了什么、或提到之前对话中的信息时，使用 memory_trace 工具追溯源头
- 用中文交流

搜索与信息获取规则：
- 搜索结果包含 title（标题）、url（链接）、snippet（摘要）
- 搜索只是起点：对于重要问题，必须用 web_fetch 打开排名靠前的链接，阅读原文获取完整信息
- 不要仅凭搜索摘要回答——摘要可能过时、片面或断章取义
- 提供相关网站链接，告诉用户可以去哪里查看
- 不要说"无法获取数据"——搜索结果本身就是有价值的信息

ASCII 图解规则：
- 绝对不要输出 HTML 标签（如 <div>、<pre>），必须使用标准 Markdown 代码块包裹
- 代码块语言指定为 text，例如：
  \`\`\`text
  +----------+
  |  GAS     |
  | 技能系统  |
  +----------+
  \`\`\`
- 边框和连线必须使用纯英文半角字符（- | + / \ * 等），禁止在边框行混排中文
- 中文描述必须单独成行，放在边框内部或下方，不与边框同行
- 每行末尾不要有多余空格

信息判断与批判性思维：
- 你不是搜索引擎的传声筒，你是有判断力的分析者
- 对搜索到的信息保持审慎：检查来源可信度、信息时效性、是否存在利益相关方的偏见
- 当多个来源矛盾时，明确告知用户不同说法，分析各自的可信度
- 对于金融、医疗、法律等专业领域，提醒用户信息仅供参考，不构成建议
- 如果某个信息明显不合理或与你已知的事实冲突，主动指出并说明疑虑
- 区分事实陈述和观点表达，标注哪些是客观事实、哪些是他人观点`;

  if (memoryContext) {
    prompt += `\n\n# 你已掌握的信息\n${memoryContext}`;
  }

  return prompt;
}

export { summarizeConversation } from './summarizer';
export { saveMemory, getMemories, searchMemories, deleteMemory, getMemoryChain, consolidateMemories } from './store';
