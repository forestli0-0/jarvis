import { Router } from 'express';
import { getMemories, searchMemories, deleteMemory, saveMemory } from '../memory';

const router = Router();

// 获取所有记忆
router.get('/', (req, res) => {
  const type = req.query.type as string | undefined;
  const memories = getMemories(type as any);
  res.json(memories);
});

// 搜索记忆
router.get('/search', (req, res) => {
  const query = req.query.q as string;
  if (!query) {
    return res.status(400).json({ error: '请提供搜索关键词' });
  }
  const results = searchMemories(query);
  res.json(results);
});

// 手动添加记忆
router.post('/', (req, res) => {
  const { type, content, importance } = req.body;
  if (!type || !content) {
    return res.status(400).json({ error: '请提供 type 和 content' });
  }
  const id = saveMemory(type, content, undefined, importance);
  res.json({ id, success: true });
});

// 删除记忆
router.delete('/:id', (req, res) => {
  deleteMemory(req.params.id);
  res.json({ success: true });
});

export default router;
