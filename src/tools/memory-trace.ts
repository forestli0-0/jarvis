import { AgentTool } from '../agent/types';
import { getMemoryChain, searchMemories } from '../memory/store';
import { getMessages } from '../db/messages';

export function createMemoryTraceTool(): AgentTool {
  return {
    name: 'memory_trace',
    description: '追溯记忆源头。通过记忆 ID 或搜索关键词查找记忆，并加载源头对话的相关消息。当用户询问你记住了什么、或提到之前对话中的信息时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        memory_id: {
          type: 'string',
          description: '记忆 ID（精确查找）',
        },
        query: {
          type: 'string',
          description: '搜索关键词（模糊查找，当不知道记忆 ID 时使用）',
        },
      },
    },
    async execute(params) {
      const { memory_id, query } = params;

      try {
        let targetId = memory_id;

        // 如果没有 memory_id，通过搜索找到
        if (!targetId && query) {
          const results = searchMemories(query);
          if (results.length === 0) {
            return JSON.stringify({ error: `未找到与"${query}"相关的记忆` });
          }
          // 取最相关的
          targetId = results[0].id;
        }

        if (!targetId) {
          return JSON.stringify({ error: '请提供 memory_id 或 query 参数' });
        }

        const chain = getMemoryChain(targetId);
        if (!chain) {
          return JSON.stringify({ error: `记忆 ${targetId} 不存在` });
        }

        const { memory, sources } = chain;

        // 加载每个源头对话的相关消息
        const sourceDetails = [];
        for (const src of sources) {
          const messages = getMessages(src.conversation_id);
          // 取最近 10 条消息作为上下文
          const recentMsgs = messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content || '(工具调用)',
          }));

          sourceDetails.push({
            conversation_id: src.conversation_id,
            conversation_title: src.conversation_title || '未知对话',
            messages: recentMsgs,
          });
        }

        return JSON.stringify({
          memory: {
            id: memory.id,
            type: memory.type,
            content: memory.content,
            tier: memory.tier,
            hit_count: memory.hit_count,
            importance: memory.importance,
            created_at: memory.created_at,
          },
          sources: sourceDetails,
        }, null, 2);
      } catch (err: any) {
        return JSON.stringify({ error: `追溯失败: ${err.message}` });
      }
    },
  };
}
