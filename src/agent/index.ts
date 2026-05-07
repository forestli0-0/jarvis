import { ModelAdapter } from './model';
import { ChatMessage, AgentCallbacks, ToolCall } from './types';
import { ToolRegistry } from '../tools/registry';
import { getSystemPrompt, summarizeConversation } from '../memory';
import { saveMessage, getMessages } from '../db/messages';
import { touchConversation } from '../db/conversations';

function sanitizeContent(text: string | null): string | null {
  if (!text) return null;
  // 移除 Unicode 控制字符和替换字符（U+FFFD），保留正常文本
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F�]/g, '').trim() || null;
}

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

      // 最后一轮：强制要求模型生成最终回答，不再调用工具
      const isLastRound = round >= MAX_TOOL_ROUNDS;
      const toolDefs = isLastRound ? [] : this.tools.getDefinitions();

      const response = await this.model.chat(
        messages,
        toolDefs,
        !isLastRound,
        {
          onToken: (token: string) => callbacks?.onToken?.(token),
          onToolCall: (tc: ToolCall) => callbacks?.onToolCall?.(tc),
        }
      );

      // 如果没有工具调用，直接返回
      if (response.toolCalls.length === 0) {
        finalContent = sanitizeContent(response.content) || '';
        // 保存助手回复
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: finalContent,
        };
        saveMessage(conversationId, assistantMsg);
        break;
      }

      // 有工具调用：保存助手消息（含工具调用，清空 content 避免存储无意义的前缀文本）
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: null,
        tool_calls: response.toolCalls,
      };
      saveMessage(conversationId, assistantMsg);
      // 保持原始 content 用于模型上下文（不存入数据库）
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      });

      // 执行所有工具调用
      for (const toolCall of response.toolCalls) {
        let args: any = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          console.error(`[Agent] 工具参数解析失败: ${toolCall.function.name}`, toolCall.function.arguments);
          const errMsg = JSON.stringify({ error: `工具参数格式错误，无法解析 JSON: ${toolCall.function.arguments.slice(0, 200)}` });
          callbacks?.onToolResult?.(toolCall.id, errMsg);
          const toolResultMsg: ChatMessage = {
            role: 'tool',
            content: errMsg,
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
          };
          saveMessage(conversationId, toolResultMsg);
          messages.push(toolResultMsg);
          continue;
        }

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
