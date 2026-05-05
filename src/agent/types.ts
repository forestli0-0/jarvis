export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute(params: any): Promise<string>;
}

export interface AgentCallbacks {
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolResult?: (toolCallId: string, result: string) => void;
  onDone?: (fullResponse: string) => void;
  onMemoryStart?: () => void;
  onMemoryDone?: (memories: { type: string; content: string }[]) => void;
}
