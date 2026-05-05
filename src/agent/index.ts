import { ModelAdapter } from './model';
import { ChatMessage, AgentCallbacks, ToolCall } from './types';
import { ToolRegistry } from '../tools/registry';
import { getSystemPrompt, summarizeConversation } from '../memory';
import { saveMessage, getMessages } from '../db/messages';
import { touchConversation } from '../db/conversations';

const MAX_TOOL_ROUNDS = 10;

export class Agent {
  private model: ModelAdapter;
  private tools: ToolRegistry;

  constructor(model: ModelAdapter, tools: ToolRegistry) {
    this.model = model;
    this.tools = tools;
  }

  async chat(
    conversationId: string,
    userMessage: string,
    callbacks?: AgentCallbacks
  ): Promise<string> {
    // 保存用户消息
    const userMsg: ChatMessage = { role: 'user', content: userMessage };
    saveMessage(conversationId, userMsg);
    touchConversation(conversationId);

    // 加载历史消息
    const history = getMessages(conversationId);

    // 构建完整消息列表（系统提示 + 历史）
    const systemPrompt = getSystemPrompt();
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
    ];

    // Agent 循环
    let round = 0;
    let finalContent = '';

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const response = await this.model.chat(
        messages,
        this.tools.getDefinitions(),
        true,
        {
          onToken: (token) => callbacks?.onToken?.(token),
          onToolCall: (tc) => callbacks?.onToolCall?.(tc),
        }
      );

      // 如果没有工具调用，直接返回
      if (response.toolCalls.length === 0) {
        finalContent = response.content || '';
        // 保存助手回复
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: finalContent,
        };
        saveMessage(conversationId, assistantMsg);
        break;
      }

      // 有工具调用：保存助手消息（含工具调用）
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      };
      saveMessage(conversationId, assistantMsg);
      messages.push(assistantMsg);

      // 执行所有工具调用
      for (const toolCall of response.toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {}

        const result = await this.tools.execute(toolCall.function.name, args);
        callbacks?.onToolResult?.(toolCall.id, result);

        // 将工具结果加入消息列表
        const toolResultMsg: ChatMessage = {
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
        };
        saveMessage(conversationId, toolResultMsg);
        messages.push(toolResultMsg);
      }
    }

    // 异步触发记忆整理（不阻塞返回）
    const allMessages = getMessages(conversationId);
    callbacks?.onMemoryStart?.();
    summarizeConversation(this.model, conversationId, allMessages)
      .then((newMemories) => {
        callbacks?.onMemoryDone?.(newMemories);
      })
      .catch(() => {
        callbacks?.onMemoryDone?.([]);
      });

    callbacks?.onDone?.(finalContent);
    return finalContent;
  }
}
