import OpenAI from 'openai';
import { ChatMessage, ToolDefinition, ToolCall } from './types';
import { ModelConfig } from '../config';

export interface ModelResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
}

export class ModelAdapter {
  private client: OpenAI;
  private modelName: string;

  constructor(config: ModelConfig) {
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url,
    });
    this.modelName = config.model_name;
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    stream: boolean = false,
    callbacks?: StreamCallbacks
  ): Promise<ModelResponse> {
    const params: any = {
      model: this.modelName,
      messages,
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = 'auto';
    }

    if (stream) {
      return this.streamChat(params, callbacks);
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: message.content,
      toolCalls,
    };
  }

  private async streamChat(
    params: any,
    callbacks?: StreamCallbacks
  ): Promise<ModelResponse> {
    params.stream = true;
    const stream = await this.client.chat.completions.create(params);

    let content = '';
    const toolCallsMap = new Map<number, ToolCall>();

    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        callbacks?.onToken(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          if (!toolCallsMap.has(index)) {
            toolCallsMap.set(index, {
              id: tc.id || '',
              type: 'function',
              function: { name: '', arguments: '' },
            });
          }
          const existing = toolCallsMap.get(index)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        }
      }
    }

    const toolCalls = Array.from(toolCallsMap.values());
    for (const tc of toolCalls) {
      callbacks?.onToolCall(tc);
    }

    return {
      content: content || null,
      toolCalls,
    };
  }
}
