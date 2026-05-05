import { Router } from 'express';
import { Server as SocketServer } from 'socket.io';
import { Agent } from '../agent';
import { createConversation, getConversation } from '../db/conversations';

let agent: Agent;

export function setAgent(a: Agent) {
  agent = a;
}

export function setupSocketHandlers(io: SocketServer) {
  io.on('connection', (socket) => {
    console.log('客户端已连接:', socket.id);

    socket.on('chat', async (data: { conversationId?: string; message: string }) => {
      let conversationId = data.conversationId;

      // 如果没有对话 ID，自动创建新对话
      if (!conversationId) {
        const conv = createConversation(data.message.slice(0, 30));
        conversationId = conv.id;
        socket.emit('conversation_created', { id: conversationId, title: conv.title });
      }

      // 通知前端开始生成
      socket.emit('chat_start', { conversationId });

      try {
        await agent.chat(conversationId, data.message, {
          onToken: (token) => {
            socket.emit('chat_token', { token });
          },
          onToolCall: (toolCall) => {
            socket.emit('tool_call', {
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            });
          },
          onToolResult: (toolCallId, result) => {
            socket.emit('tool_result', { id: toolCallId, result });
          },
          onDone: (fullResponse) => {
            socket.emit('chat_done', { conversationId, content: fullResponse });
          },
        });
      } catch (err: any) {
        socket.emit('chat_error', { error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('客户端已断开:', socket.id);
    });
  });
}

const router = Router();

// HTTP 聊天接口（非流式，备用）
router.post('/', async (req, res) => {
  const { conversationId, message } = req.body;
  if (!message) {
    return res.status(400).json({ error: '请提供消息内容' });
  }

  let cid = conversationId;
  if (!cid) {
    const conv = createConversation(message.slice(0, 30));
    cid = conv.id;
  }

  try {
    const response = await agent.chat(cid, message);
    res.json({ conversationId: cid, response });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
