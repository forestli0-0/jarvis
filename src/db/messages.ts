import { v4 as uuidv4 } from 'uuid';
import { getDb } from './index';
import { ChatMessage } from '../agent/types';

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  created_at: string;
}

export function saveMessage(conversationId: string, msg: ChatMessage): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, name) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    conversationId,
    msg.role,
    msg.content ?? null,
    msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
    msg.tool_call_id ?? null,
    msg.name ?? null
  );
  return id;
}

export function getMessages(conversationId: string): ChatMessage[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as StoredMessage[];

  return rows.map((row) => ({
    role: row.role as ChatMessage['role'],
    content: row.content,
    tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    tool_call_id: row.tool_call_id ?? undefined,
    name: row.name ?? undefined,
  }));
}

export function deleteMessages(conversationId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
}
