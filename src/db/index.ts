import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'jarvis.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables(db);
  }
  return db;
}

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls TEXT,
      tool_call_id TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      source_conversation_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_accessed DATETIME,
      importance REAL DEFAULT 0.5
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
  `);

  // 迁移：新增分层记忆字段和源头关联表
  migrateDb(db);
}

function migrateDb(db: Database.Database) {
  const columns = db.prepare("PRAGMA table_info(memories)").all() as { name: string }[];
  const colNames = new Set(columns.map(c => c.name));

  if (!colNames.has('tier')) {
    db.exec("ALTER TABLE memories ADD COLUMN tier TEXT DEFAULT 'short'");
  }
  if (!colNames.has('hit_count')) {
    db.exec("ALTER TABLE memories ADD COLUMN hit_count INTEGER DEFAULT 0");
  }
  if (!colNames.has('consolidated_from')) {
    db.exec("ALTER TABLE memories ADD COLUMN consolidated_from TEXT");
  }

  // 记忆源头关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_sources (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL,
      message_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_memory_sources_memory ON memory_sources(memory_id);
    CREATE INDEX IF NOT EXISTS idx_memory_sources_conv ON memory_sources(conversation_id);
  `);

  // 回填：超过 7 天的旧记忆标记为 long
  db.exec(`
    UPDATE memories SET tier = 'long'
    WHERE tier IS NULL AND created_at < datetime('now', '-7 days')
  `);
  db.exec(`UPDATE memories SET tier = 'short' WHERE tier IS NULL`);
  db.exec(`UPDATE memories SET hit_count = 0 WHERE hit_count IS NULL`);

  // 回填旧记忆的 source_conversation_id 到 memory_sources
  db.exec(`
    INSERT OR IGNORE INTO memory_sources (id, memory_id, conversation_id)
    SELECT hex(randomblob(16)), id, source_conversation_id
    FROM memories
    WHERE source_conversation_id IS NOT NULL
      AND id NOT IN (SELECT memory_id FROM memory_sources)
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
    CREATE INDEX IF NOT EXISTS idx_memories_tier_importance ON memories(tier, importance DESC, hit_count DESC);
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
