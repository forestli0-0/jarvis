import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface Memory {
  id: string;
  type: 'fact' | 'preference' | 'task' | 'summary';
  content: string;
  source_conversation_id: string | null;
  created_at: string;
  last_accessed: string | null;
  importance: number;
}

export function saveMemory(
  type: Memory['type'],
  content: string,
  sourceConversationId?: string,
  importance: number = 0.5
): string {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO memories (id, type, content, source_conversation_id, importance) VALUES (?, ?, ?, ?, ?)'
  ).run(id, type, content, sourceConversationId || null, importance);
  return id;
}

export function getMemories(type?: Memory['type'], limit: number = 50): Memory[] {
  const db = getDb();
  if (type) {
    return db.prepare(
      'SELECT * FROM memories WHERE type = ? ORDER BY importance DESC, created_at DESC LIMIT ?'
    ).all(type, limit) as Memory[];
  }
  return db.prepare(
    'SELECT * FROM memories ORDER BY importance DESC, created_at DESC LIMIT ?'
  ).all(limit) as Memory[];
}

export function touchMemory(id: string): void {
  const db = getDb();
  db.prepare('UPDATE memories SET last_accessed = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

export function searchMemories(query: string): Memory[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM memories WHERE content LIKE ? ORDER BY importance DESC LIMIT 20"
  ).all(`%${query}%`) as Memory[];
}
