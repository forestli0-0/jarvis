import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import * as path from 'path';

import { loadConfig } from './config';
import { ModelAdapter } from './agent/model';
import { Agent } from './agent';
import { ToolRegistry } from './tools/registry';
import { createSearchTool } from './tools/search';
import { createCodeExecTool } from './tools/code-exec';
import { createShellTool } from './tools/shell';
import { createMemoryTraceTool } from './tools/memory-trace';
import { createWebFetchTool } from './tools/web-fetch';
import { createReadTool } from './tools/read';
import { createWriteTool } from './tools/write';
import { createEditTool } from './tools/edit';
import { createGlobTool } from './tools/glob';
import { createGrepTool } from './tools/grep';
import { closeDb } from './db';
import { consolidateMemories } from './memory';

import chatRouter, { setAgent, setupSocketHandlers } from './routes/chat';
import conversationsRouter from './routes/conversations';
import memoryRouter from './routes/memory';

const config = loadConfig();

// 初始化工具注册中心
const toolRegistry = new ToolRegistry();
const workspace = path.resolve(config.workspace);
toolRegistry.register(createReadTool(workspace));
toolRegistry.register(createWriteTool(workspace));
toolRegistry.register(createEditTool(workspace));
toolRegistry.register(createGlobTool(workspace));
toolRegistry.register(createGrepTool(workspace));
toolRegistry.register(createSearchTool(config.search));
toolRegistry.register(createCodeExecTool());
toolRegistry.register(createShellTool(workspace));
toolRegistry.register(createMemoryTraceTool());
toolRegistry.register(createWebFetchTool());

// 初始化模型和 Agent
const model = new ModelAdapter(config.model);
const agent = new Agent(model, toolRegistry);
setAgent(agent);

// 创建 Express 应用
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// 静态文件服务（前端）
app.use(express.static(path.join(__dirname, '../web/dist')));

// API 路由
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/memory', memoryRouter);

// 配置接口
app.get('/api/config', (_req, res) => {
  const safeConfig = {
    ...config,
    model: { ...config.model, api_key: '***' },
  };
  res.json(safeConfig);
});

// 兜底：返回前端页面
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

// Socket.IO 处理
setupSocketHandlers(io);

// 启动服务器
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`\n🤖 JARVIS 已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   模型: ${config.model.model_name}`);
  console.log(`   工作目录: ${workspace}\n`);
});

// 每小时自动整合记忆
setInterval(() => {
  try {
    const count = consolidateMemories();
    if (count > 0) {
      console.log(`[Memory] 已整合 ${count} 条记忆`);
    }
  } catch (err) {
    console.error('[Memory] 整合失败:', err);
  }
}, 60 * 60 * 1000);

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭 JARVIS...');
  closeDb();
  process.exit(0);
});
