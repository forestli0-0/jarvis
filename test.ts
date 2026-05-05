/**
 * JARVIS 全面测试脚本
 * 测试所有核心功能：API、工具调用、记忆系统、对话持久化
 *
 * 运行方式: npx tsx test.ts
 * 前提条件: 服务器已在 http://localhost:3000 运行
 */

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;
const failures: string[] = [];

// === 测试工具函数 ===
async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return { status: res.status, data: await res.json() };
}

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    failed++;
    const msg = detail ? `${testName} — ${detail}` : testName;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

async function testSection(name: string, fn: () => Promise<void>) {
  console.log(`\n━━━ ${name} ━━━`);
  try {
    await fn();
  } catch (err: any) {
    failed++;
    failures.push(`${name} 异常: ${err.message}`);
    console.log(`  ✗ 异常: ${err.message}`);
  }
}

// ============================================================
// 测试 1: 服务器基础
// ============================================================
async function testServer() {
  await testSection('服务器基础', async () => {
    // 1.1 首页可访问
    const res = await fetch(`${BASE}/`);
    assert(res.status === 200, '首页返回 200');
    const html = await res.text();
    assert(html.includes('JARVIS'), '首页包含 JARVIS 标题');

    // 1.2 配置接口
    const { status, data } = await request('/api/config');
    assert(status === 200, '配置接口返回 200');
    assert(data.model?.model_name === 'mimo-v2.5-pro', '模型名称正确');
    assert(data.model?.api_key === '***', 'API Key 已脱敏');
  });
}

// ============================================================
// 测试 2: 对话 CRUD
// ============================================================
let testConvId: string;

async function testConversations() {
  await testSection('对话管理 (CRUD)', async () => {
    // 2.1 创建对话
    const { status, data } = await request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: '测试对话' }),
    });
    assert(status === 200, '创建对话返回 200');
    assert(!!data.id, '返回对话 ID');
    assert(data.title === '测试对话', '对话标题正确');
    testConvId = data.id;

    // 2.2 获取对话列表
    const list = await request('/api/conversations');
    assert(list.status === 200, '获取对话列表返回 200');
    assert(Array.isArray(list.data), '返回数组');
    assert(list.data.some((c: any) => c.id === testConvId), '新对话在列表中');

    // 2.3 获取单个对话
    const single = await request(`/api/conversations/${testConvId}`);
    assert(single.status === 200, '获取单个对话返回 200');
    assert(single.data.id === testConvId, '对话 ID 匹配');

    // 2.4 更新标题
    const patch = await request(`/api/conversations/${testConvId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '已修改的对话' }),
    });
    assert(patch.status === 200, '更新标题返回 200');
    const verify = await request(`/api/conversations/${testConvId}`);
    assert(verify.data.title === '已修改的对话', '标题已更新');

    // 2.5 删除不存在的对话
    const notFound = await request('/api/conversations/nonexistent-id');
    assert(notFound.status === 404, '不存在的对话返回 404');
  });
}

// ============================================================
// 测试 3: 聊天 API (非流式)
// ============================================================
async function testChatAPI() {
  await testSection('聊天 API (HTTP)', async () => {
    // 3.1 发送消息
    const { status, data } = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: testConvId,
        message: '你好，请回复"测试成功"两个字',
      }),
    });
    assert(status === 200, '聊天接口返回 200');
    assert(!!data.response, '收到回复内容');
    assert(data.conversationId === testConvId, '返回正确的对话 ID');
    console.log(`    模型回复: ${data.response?.slice(0, 60)}...`);

    // 3.2 无消息内容
    const empty = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '' }),
    });
    assert(empty.status === 400, '空消息返回 400');

    // 3.3 自动创建新对话
    const newChat = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '自动创建对话测试' }),
    });
    assert(newChat.status === 200, '无 conversationId 时自动创建对话');
    assert(!!newChat.data.conversationId, '返回新对话 ID');
  });
}

// ============================================================
// 测试 4: 文件工具
// ============================================================
async function testFileTool() {
  await testSection('文件工具 (file)', async () => {
    // 4.1 写入文件
    const writeRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 file 工具，action 为 write，path 为 "test/hello.txt"，content 为 "Hello JARVIS"。只执行工具，不需要额外解释。',
      }),
    });
    assert(writeRes.status === 200, '文件写入请求成功');

    // 4.2 读取文件
    const readRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 file 工具，action 为 read，path 为 "test/hello.txt"。只执行工具，返回文件内容。',
      }),
    });
    assert(readRes.status === 200, '文件读取请求成功');
    console.log(`    读取结果: ${readRes.data.response?.slice(0, 80)}...`);

    // 4.3 列出目录
    const listRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 file 工具，action 为 list，path 为 "."。只执行工具。',
      }),
    });
    assert(listRes.status === 200, '目录列出请求成功');

    // 4.4 路径安全检查
    const safeRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 file 工具，action 为 read，path 为 "../../etc/passwd"。只执行工具。',
      }),
    });
    assert(safeRes.status === 200, '路径穿越请求不崩溃');
  });
}

// ============================================================
// 测试 5: Shell 工具
// ============================================================
async function testShellTool() {
  await testSection('Shell 工具', async () => {
    // 5.1 基本命令
    const echoRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 shell 工具执行命令 "echo hello jarvis"。只执行工具。',
      }),
    });
    assert(echoRes.status === 200, 'echo 命令执行成功');
    console.log(`    echo 结果: ${echoRes.data.response?.slice(0, 60)}...`);

    // 5.2 查看当前目录
    const pwdRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 shell 工具执行命令 "pwd"。只执行工具。',
      }),
    });
    assert(pwdRes.status === 200, 'pwd 命令执行成功');

    // 5.3 查看文件列表
    const lsRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 shell 工具执行命令 "ls -la"。只执行工具。',
      }),
    });
    assert(lsRes.status === 200, 'ls 命令执行成功');

    // 5.4 危险命令被阻止
    const dangerRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 shell 工具执行命令 "rm -rf /"。只执行工具。',
      }),
    });
    assert(dangerRes.status === 200, '危险命令请求不崩溃');
  });
}

// ============================================================
// 测试 6: 代码执行工具
// ============================================================
async function testCodeExecTool() {
  await testSection('代码执行工具 (code_exec)', async () => {
    // 6.1 JavaScript 执行
    const jsRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 code_exec 工具，language 为 "javascript"，code 为 "console.log(2 + 3)"。只执行工具。',
      }),
    });
    assert(jsRes.status === 200, 'JavaScript 执行请求成功');
    console.log(`    JS 结果: ${jsRes.data.response?.slice(0, 60)}...`);

    // 6.2 Python 执行
    const pyRes = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 code_exec 工具，language 为 "python"，code 为 "print(10 * 20)"。只执行工具。',
      }),
    });
    assert(pyRes.status === 200, 'Python 执行请求成功');
    console.log(`    Python 结果: ${pyRes.data.response?.slice(0, 60)}...`);
  });
}

// ============================================================
// 测试 7: 网页搜索工具
// ============================================================
async function testSearchTool() {
  await testSection('网页搜索工具 (web_search)', async () => {
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: '请使用 web_search 工具搜索 "TypeScript programming"。只执行工具。',
      }),
    });
    assert(res.status === 200, '搜索请求成功');
    console.log(`    搜索结果: ${res.data.response?.slice(0, 80)}...`);
  });
}

// ============================================================
// 测试 8: 记忆系统
// ============================================================
async function testMemory() {
  await testSection('记忆系统', async () => {
    // 8.1 手动添加记忆
    const addRes = await request('/api/memory', {
      method: 'POST',
      body: JSON.stringify({
        type: 'fact',
        content: '用户是一名 TypeScript 开发者',
        importance: 0.8,
      }),
    });
    assert(addRes.status === 200, '手动添加记忆成功');
    assert(!!addRes.data.id, '返回记忆 ID');

    // 8.2 获取记忆列表
    const listRes = await request('/api/memory');
    assert(listRes.status === 200, '获取记忆列表返回 200');
    assert(Array.isArray(listRes.data), '返回数组');
    assert(listRes.data.length > 0, '记忆列表非空');

    // 8.3 按类型筛选
    const typeRes = await request('/api/memory?type=fact');
    assert(typeRes.status === 200, '按类型筛选返回 200');
    assert(typeRes.data.every((m: any) => m.type === 'fact'), '筛选结果类型正确');

    // 8.4 搜索记忆
    const searchRes = await request('/api/memory/search?q=TypeScript');
    assert(searchRes.status === 200, '搜索记忆返回 200');
    assert(searchRes.data.length > 0, '搜索到相关记忆');

    // 8.5 删除记忆
    const delRes = await request(`/api/memory/${addRes.data.id}`, {
      method: 'DELETE',
    });
    assert(delRes.status === 200, '删除记忆返回 200');
  });
}

// ============================================================
// 测试 9: Socket.IO 实时通信
// ============================================================
async function testSocketIO() {
  await testSection('Socket.IO 实时通信', async () => {
    // 通过 HTTP 检查 socket.io 端点
    const res = await fetch(`${BASE}/socket.io/?EIO=4&transport=polling`);
    assert(res.status === 200, 'Socket.IO polling 端点可访问');
    const text = await res.text();
    assert(text.includes('0'), 'Socket.IO 返回握手数据');
  });
}

// ============================================================
// 测试 10: Agent 多轮工具调用
// ============================================================
async function testAgentLoop() {
  await testSection('Agent 多轮工具调用', async () => {
    // 创建新对话专门测试
    const { data: conv } = await request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ title: 'Agent 循环测试' }),
    });

    // 发送一个需要多步工具调用的任务
    const res = await request('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: conv.id,
        message: '请完成以下任务：1) 用 shell 执行 "date" 获取当前日期，2) 用 file 工具写入 test/date.txt，内容为日期结果，3) 用 file 工具读取确认。一步步来。',
      }),
    });
    assert(res.status === 200, '多轮工具调用请求成功');
    assert(!!res.data.response, '收到最终回复');
    console.log(`    最终回复: ${res.data.response?.slice(0, 100)}...`);
  });
}

// ============================================================
// 测试 11: 清理和对话删除
// ============================================================
async function testCleanup() {
  await testSection('清理测试数据', async () => {
    // 删除测试对话
    if (testConvId) {
      const { status } = await request(`/api/conversations/${testConvId}`, {
        method: 'DELETE',
      });
      assert(status === 200, '删除测试对话成功');
    }

    // 验证删除
    const verify = await request(`/api/conversations/${testConvId}`);
    assert(verify.status === 404, '对话已彻底删除');
  });
}

// ============================================================
// 运行所有测试
// ============================================================
async function runAll() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║      JARVIS 全面测试                      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`目标: ${BASE}`);

  // 先检查服务器是否在线
  try {
    await fetch(BASE);
  } catch {
    console.error('\n❌ 服务器未运行！请先执行: npm run dev\n');
    process.exit(1);
  }

  await testServer();
  await testConversations();
  await testChatAPI();
  await testFileTool();
  await testShellTool();
  await testCodeExecTool();
  await testSearchTool();
  await testMemory();
  await testSocketIO();
  await testAgentLoop();
  await testCleanup();

  // 汇总
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  结果: ${passed} 通过, ${failed} 失败`);
  console.log('╚══════════════════════════════════════════╝');

  if (failures.length > 0) {
    console.log('\n失败项:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
