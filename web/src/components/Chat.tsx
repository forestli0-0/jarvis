import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Conversation } from '../App';
import MessageBubble from './Message';
import ToolCallBox from './ToolCall';

interface Props {
  socket: Socket;
  conversationId: string | null;
  onConversationCreated: (conv: Conversation) => void;
}

interface DisplayMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: { id: string; name: string; args: string }[];
  toolResults?: { id: string; result: string }[];
}

export default function Chat({ socket, conversationId, onConversationCreated }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<{ id: string; name: string; done: boolean }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 加载对话历史
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          const displayMessages: DisplayMessage[] = data.messages
            .filter((m: any) => m.role !== 'system')
            .map((m: any) => ({
              role: m.role,
              content: m.content || '',
            }));
          setMessages(displayMessages);
        }
      })
      .catch(() => {});
  }, [conversationId]);

  // Socket 事件监听
  useEffect(() => {
    const handleConversationCreated = (data: { id: string; title: string }) => {
      onConversationCreated({
        id: data.id,
        title: data.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    };

    const handleChatStart = () => {
      setLoading(true);
      setStreamingContent('');
      setActiveToolCalls([]);
    };

    const handleChatToken = (data: { token: string }) => {
      setStreamingContent((prev) => prev + data.token);
    };

    const handleToolCall = (data: { id: string; name: string; arguments: string }) => {
      setActiveToolCalls((prev) => [...prev, { id: data.id, name: data.name, done: false }]);
    };

    const handleToolResult = (data: { id: string; result: string }) => {
      setActiveToolCalls((prev) =>
        prev.map((tc) => (tc.id === data.id ? { ...tc, done: true } : tc))
      );
    };

    const handleChatDone = () => {
      setLoading(false);
      // 重新加载对话以获取完整消息
      if (conversationId) {
        fetch(`/api/conversations/${conversationId}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.messages) {
              const displayMessages: DisplayMessage[] = data.messages
                .filter((m: any) => m.role !== 'system')
                .map((m: any) => ({
                  role: m.role,
                  content: m.content || '',
                }));
              setMessages(displayMessages);
            }
          });
      }
      setStreamingContent('');
      setActiveToolCalls([]);
    };

    const handleChatError = (data: { error: string }) => {
      setLoading(false);
      setStreamingContent('');
      setActiveToolCalls([]);
      setMessages((prev) => [...prev, { role: 'assistant', content: `错误: ${data.error}` }]);
    };

    socket.on('conversation_created', handleConversationCreated);
    socket.on('chat_start', handleChatStart);
    socket.on('chat_token', handleChatToken);
    socket.on('tool_call', handleToolCall);
    socket.on('tool_result', handleToolResult);
    socket.on('chat_done', handleChatDone);
    socket.on('chat_error', handleChatError);

    return () => {
      socket.off('conversation_created', handleConversationCreated);
      socket.off('chat_start', handleChatStart);
      socket.off('chat_token', handleChatToken);
      socket.off('tool_call', handleToolCall);
      socket.off('tool_result', handleToolResult);
      socket.off('chat_done', handleChatDone);
      socket.off('chat_error', handleChatError);
    };
  }, [socket, conversationId, onConversationCreated]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent, activeToolCalls]);

  const handleSend = () => {
    if (!input.trim() || loading) return;

    const message = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: message }]);

    socket.emit('chat', {
      conversationId,
      message,
    });

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // 自动调整高度
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  if (!conversationId && messages.length === 0) {
    return (
      <div className="chat">
        <div className="welcome">
          <h2>JARVIS</h2>
          <p>有什么我能帮你的？</p>
        </div>
        <div className="chat-input">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            发送
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {activeToolCalls.length > 0 && (
          <div className="message assistant">
            {activeToolCalls.map((tc) => (
              <ToolCallBox key={tc.id} name={tc.name} done={tc.done} />
            ))}
          </div>
        )}
        {streamingContent && (
          <div className="message assistant">
            <div className="role">JARVIS</div>
            <div className="content">{streamingContent}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          rows={1}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          发送
        </button>
      </div>
    </div>
  );
}
