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
  tier: 'short' | 'long';
  hit_count: number;
  consolidated_from: string | null;
}

export interface MemorySource {
  id: string;
  memory_id: string;
  conversation_id: string;
  message_ids: string | null;
  created_at: string;
}

export interface MemoryChain {
  memory: Memory;
  sources: (MemorySource & { conversation_title: string })[];
}

// === 去重工具函数 ===

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w一-鿿]/g, '').trim();
}

function getBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) {
    bigrams.add(text.slice(i, i + 2));
  }
  return bigrams;
}

function jaccardSimilarity(a: string, b: string): number {
  // 中文用字符 bigram，英文用词级
  const hasChinese = /[一-鿿]/.test(a) || /[一-鿿]/.test(b);
  if (hasChinese) {
    const setA = getBigrams(a);
    const setB = getBigrams(b);
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 1;
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

function findSimilarMemory(type: Memory['type'], content: string): Memory | null {
  const db = getDb();
  const candidates = db.prepare(
    'SELECT * FROM memories WHERE type = ? ORDER BY created_at DESC LIMIT 50'
  ).all(type) as Memory[];

  const normalized = normalizeText(content);
  if (normalized.length < 2) return null;

  for (const candidate of candidates) {
    const candidateNorm = normalizeText(candidate.content);
    if (candidateNorm.length < 2) continue;

    if (normalized === candidateNorm) return candidate;

    if (normalized.includes(candidateNorm) || candidateNorm.includes(normalized)) {
      const shorter = Math.min(normalized.length, candidateNorm.length);
      const longer = Math.max(normalized.length, candidateNorm.length);
      if (shorter / longer > 0.5) return candidate;
    }

    if (jaccardSimilarity(normalized, candidateNorm) > 0.6) return candidate;
  }

  return null;
}

// === 核心操作 ===

export function saveMemory(
  type: Memory['type'],
  content: string,
  sourceConversationId?: string,
  importance: number = 0.5
): string | null {
  const db = getDb();

  // 验证内容非空
  const trimmed = content.trim();
  if (!trimmed || trimmed.length < 3) return null;

  const existing = findSimilarMemory(type, trimmed);

  if (existing) {
    const newImportance = Math.min(1.0, existing.importance + 0.05);
    const newHitCount = (existing.hit_count || 0) + 1;
    db.prepare(`
      UPDATE memories
      SET importance = ?, hit_count = ?, last_accessed = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newImportance, newHitCount, existing.id);

    // 记录新源头关联
    if (sourceConversationId) {
      db.prepare(`
        INSERT INTO memory_sources (id, memory_id, conversation_id)
        VALUES (?, ?, ?)
      `).run(uuidv4(), existing.id, sourceConversationId);
    }
    return existing.id;
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO memories (id, type, content, source_conversation_id, importance, tier, hit_count)
    VALUES (?, ?, ?, ?, ?, 'short', 0)
  `).run(id, type, trimmed, sourceConversationId || null, importance);

  // 记录源头
  if (sourceConversationId) {
    db.prepare(`
      INSERT INTO memory_sources (id, memory_id, conversation_id)
      VALUES (?, ?, ?)
    `).run(uuidv4(), id, sourceConversationId);
  }

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

export function getMemoriesByTier(
  tier: 'short' | 'long',
  type?: Memory['type'],
  limit: number = 50
): Memory[] {
  const db = getDb();
  if (type) {
    return db.prepare(`
      SELECT * FROM memories
      WHERE tier = ? AND type = ?
      ORDER BY importance DESC, hit_count DESC, created_at DESC
      LIMIT ?
    `).all(tier, type, limit) as Memory[];
  }
  return db.prepare(`
    SELECT * FROM memories
    WHERE tier = ?
    ORDER BY importance DESC, hit_count DESC, created_at DESC
    LIMIT ?
  `).all(tier, limit) as Memory[];
}

export function touchMemory(id: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE memories SET last_accessed = CURRENT_TIMESTAMP, hit_count = hit_count + 1
    WHERE id = ?
  `).run(id);
}

export function deleteMemory(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM memories WHERE id = ?').run(id);
}

export function searchMemories(query: string): Memory[] {
  const db = getDb();
  const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
  return db.prepare(
    "SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\' ORDER BY importance DESC LIMIT 20"
  ).all(`%${escaped}%`) as Memory[];
}

// === 记忆链追溯 ===

export function getMemoryChain(memoryId: string): MemoryChain | null {
  const db = getDb();
  const memory = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId) as Memory | undefined;
  if (!memory) return null;

  const sources = db.prepare(`
    SELECT ms.*, c.title as conversation_title
    FROM memory_sources ms
    LEFT JOIN conversations c ON ms.conversation_id = c.id
    WHERE ms.memory_id = ?
    ORDER BY ms.created_at DESC
  `).all(memoryId) as (MemorySource & { conversation_title: string })[];

  return { memory, sources };
}

// === 记忆整合 ===

export function consolidateMemories(): number {
  const db = getDb();
  // 超过 1 天的短期记忆，或命中次数 >= 3 的短期记忆，纳入整合
  const staleShort = db.prepare(`
    SELECT * FROM memories
    WHERE tier = 'short'
      AND (created_at < datetime('now', '-1 day') OR hit_count >= 3)
    ORDER BY created_at ASC
    LIMIT 50
  `).all() as Memory[];

  if (staleShort.length === 0) return 0;

  const byType = new Map<string, Memory[]>();
  for (const m of staleShort) {
    if (!byType.has(m.type)) byType.set(m.type, []);
    byType.get(m.type)!.push(m);
  }

  let consolidated = 0;

  for (const [type, memories] of byType) {
    for (const mem of memories) {
      const longTermCandidates = db.prepare(`
        SELECT * FROM memories
        WHERE tier = 'long' AND type = ?
        ORDER BY importance DESC LIMIT 20
      `).all(type) as Memory[];

      let merged = false;
      for (const lt of longTermCandidates) {
        if (jaccardSimilarity(normalizeText(mem.content), normalizeText(lt.content)) > 0.5) {
          let sourceIds: string[];
          try {
            sourceIds = lt.consolidated_from
              ? JSON.parse(lt.consolidated_from)
              : [lt.id];
          } catch {
            sourceIds = [lt.id];
          }
          sourceIds.push(mem.id);

          db.prepare(`
            UPDATE memories
            SET hit_count = hit_count + ?, importance = MIN(1.0, importance + 0.02),
                consolidated_from = ?, last_accessed = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(mem.hit_count || 0, JSON.stringify(sourceIds), lt.id);

          // 将短期记忆的源头关联转移到长期记忆
          db.prepare(`
            UPDATE memory_sources SET memory_id = ? WHERE memory_id = ?
          `).run(lt.id, mem.id);

          db.prepare('DELETE FROM memories WHERE id = ?').run(mem.id);
          consolidated++;
          merged = true;
          break;
        }
      }

      if (!merged) {
        db.prepare(`UPDATE memories SET tier = 'long' WHERE id = ?`).run(mem.id);
        consolidated++;
      }
    }
  }

  return consolidated;
}
