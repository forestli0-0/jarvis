import { v4 as uuidv4 } from 'uuid';
import { getDb } from './index';

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function createConversation(title: string = '新对话'): Conversation {
  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO conversations (id, title) VALUES (?, ?)').run(id, title);
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation;
}

export function getConversations(): Conversation[] {
  const db = getDb();
  return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as Conversation[];
}

export function getConversation(id: string): Conversation | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation | undefined;
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, id);
}

export function touchConversation(id: string): void {
  const db = getDb();
  db.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function deleteConversation(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}
