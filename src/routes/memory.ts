import { Router } from 'express';
import { getMemories, searchMemories, deleteMemory, saveMemory, getMemoryChain, consolidateMemories } from '../memory';
import { getMemoriesByTier } from '../memory/store';

const router = Router();

// 获取所有记忆（支持 ?type= 和 ?tier= 过滤）
router.get('/', (req, res) => {
  const type = req.query.type as string | undefined;
  const tier = req.query.tier as string | undefined;

  if (tier === 'short' || tier === 'long') {
    const memories = getMemoriesByTier(tier, type as any);
    res.json(memories);
  } else {
    const memories = getMemories(type as any);
    res.json(memories);
  }
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

// 获取记忆的源头链
router.get('/:id/chain', (req, res) => {
  const chain = getMemoryChain(req.params.id);
  if (!chain) {
    return res.status(404).json({ error: '记忆不存在' });
  }
  res.json(chain);
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

// 手动触发记忆整合
router.post('/consolidate', (req, res) => {
  try {
    const count = consolidateMemories();
    res.json({ consolidated: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除记忆
router.delete('/:id', (req, res) => {
  deleteMemory(req.params.id);
  res.json({ success: true });
});

export default router;
