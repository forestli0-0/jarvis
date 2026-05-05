import { Router } from 'express';
import {
  createConversation,
  getConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
} from '../db/conversations';
import { getMessages, deleteMessages } from '../db/messages';

const router = Router();

// 获取所有对话
router.get('/', (_req, res) => {
  const conversations = getConversations();
  res.json(conversations);
});

// 创建新对话
router.post('/', (req, res) => {
  const { title } = req.body;
  const conversation = createConversation(title);
  res.json(conversation);
});

// 获取单个对话及其消息
router.get('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: '对话不存在' });
  }
  const messages = getMessages(req.params.id);
  res.json({ ...conversation, messages });
});

// 更新对话标题
router.patch('/:id', (req, res) => {
  const { title } = req.body;
  updateConversationTitle(req.params.id, title);
  res.json({ success: true });
});

// 删除对话
router.delete('/:id', (req, res) => {
  deleteConversation(req.params.id);
  res.json({ success: true });
});

export default router;
