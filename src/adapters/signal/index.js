// Signal 适配器：优先走 signal-cli（Java 命令行），不可用时自动降级为 mock 模式。
// 对外实现统一平台适配器接口：
//   id / name / icon / connect / disconnect / getConversations / getMessages /
//   sendMessage / onMessage
// connect() 返回 { ok, message, mock, mode }，mock=true 表示当前为演示数据模式。
//
// 真实模式设计（signal-cli 未安装/无账号时不会进入，仅作代码实现，不做真机测试）：
//   - connect({ phoneNumber })：用 `signal-cli -u <号码> listAccounts` 确认账号已注册；
//     成功后启动 receive 轮询，把收到的消息写入内存并经 onMessage 推送。
//   - sendMessage：`signal-cli -u <号码> send -m <文本> <对方号码>`。
//   - getConversations：`listContacts --output=json` 与内存中的最近会话合并。
//
// 注意：signal-cli 的 receive 是追加式拉取，历史记录依赖本地同步，
// 首次使用前请按 docs/signal-真机测试指南.md 完成注册与首次同步。

const { execFile } = require('child_process');

// ---------- mock 数据（演示模式） ----------
// 用户要求：假数据全部清空，添加账户时空白，不放假数据
const MOCK_CONTACTS = [];

const MOCK_MESSAGES = {};

const MOCK_REPLIES = [];

// ---------- signal-cli 调用封装 ----------

// 检查 signal-cli 是否可用，返回版本号或 null
function cliVersion() {
  return new Promise((resolve) => {
    execFile('signal-cli', ['--version'], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || '').trim());
    });
  });
}

// 运行一条 signal-cli 命令，返回 { ok, stdout, stderr }
function cliRun(args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile('signal-cli', args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, stdout: String(stdout || ''), stderr: String(stderr || err.message) });
      resolve({ ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

// ---------- 适配器状态 ----------

let mode = 'mock';            // 'mock' | 'real'
let phoneNumber = null;       // 真实模式下绑定的号码
let cliVer = null;
let connected = false;
let receiveTimer = null;
let messageHandlers = [];
const memMessages = {};       // 真实模式内存消息：convId -> [msg]
const memConvs = new Map();   // 真实模式最近会话：convId -> { id, name, lastMessage, lastActive }

function pushMessage(convId, msg) {
  for (const h of messageHandlers) {
    try { h(convId, msg); } catch (e) { /* 忽略单个订阅者异常 */ }
  }
}

function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// 真实模式：轮询 receive，把新消息写入内存并推送
function startReceiveLoop() {
  stopReceiveLoop();
  const poll = async () => {
    if (!connected || mode !== 'real') return;
    // --timeout 10：最多阻塞 10 秒；--output=json：逐行 JSON
    const r = await cliRun(['-u', phoneNumber, 'receive', '--timeout', '10', '--output=json', '--ignore-attachments'], 20000);
    if (r.ok && r.stdout.trim()) {
      for (const line of r.stdout.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const env = JSON.parse(t);
          const dm = env.envelope && (env.envelope.dataMessage || env.envelope.syncMessage);
          const from = env.envelope && (env.envelope.source || (env.envelope.sourceNumber));
          if (dm && dm.message && from) {
            const convId = String(from);
            const msg = { id: convId + '-' + Date.now(), from: 'out', text: String(dm.message), time: nowTime() };
            if (!memMessages[convId]) memMessages[convId] = [];
            memMessages[convId].push(msg);
            memConvs.set(convId, { id: convId, name: convId, lastMessage: msg.text, lastActive: '刚刚' });
            pushMessage(convId, msg);
          }
        } catch (e) { /* 跳过解析失败的行 */ }
      }
    }
    receiveTimer = setTimeout(poll, 1000);
  };
  poll();
}

function stopReceiveLoop() {
  if (receiveTimer) { clearTimeout(receiveTimer); receiveTimer = null; }
}

// mock 模式：发送后 1-2 秒自动回复一条
function mockAutoReply(convId) {
  const delay = 1000 + Math.floor(Math.random() * 1000);
  setTimeout(() => {
    if (!connected || mode !== 'mock') return;
    const text = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
    const reply = { id: convId + '-' + Date.now() + '-r', from: 'out', text, time: nowTime() };
    if (!MOCK_MESSAGES[convId]) MOCK_MESSAGES[convId] = [];
    MOCK_MESSAGES[convId].push(reply);
    pushMessage(convId, reply);
  }, delay);
}

module.exports = {
  id: 'signal',
  name: 'Signal',
  icon: '🔵',

  // 当前工作模式：'mock' | 'real'（供注册表/ UI 展示"演示数据"用）
  getMode() { return mode; },

  // 连接：options = { phoneNumber }（真实模式需要）
  // 无 signal-cli 或无已注册账号时自动降级为 mock，保证 UI 全流程可走。
  async connect(options = {}) {
    cliVer = await cliVersion();
    if (!cliVer) {
      mode = 'mock';
      connected = true;
      return { ok: true, mock: true, mode, message: '未检测到 signal-cli，已进入演示数据模式' };
    }
    const num = options.phoneNumber || process.env.SCRM_SIGNAL_NUMBER || '';
    if (!num) {
      mode = 'mock';
      connected = true;
      return { ok: true, mock: true, mode, message: '未配置 Signal 号码，已进入演示数据模式（signal-cli ' + cliVer + ' 可用）' };
    }
    // 确认该号码已在 signal-cli 注册
    const r = await cliRun(['-u', num, 'listAccounts', '--output=json']);
    let registered = false;
    if (r.ok) {
      try {
        const accounts = JSON.parse(r.stdout || '[]');
        registered = Array.isArray(accounts) && accounts.some((a) => String(a.number || a) === String(num));
      } catch (e) { registered = false; }
    }
    if (!registered) {
      mode = 'mock';
      connected = true;
      return { ok: true, mock: true, mode, message: '号码 ' + num + ' 未在 signal-cli 注册，已进入演示数据模式' };
    }
    // 真实模式
    mode = 'real';
    phoneNumber = num;
    connected = true;
    startReceiveLoop();
    return { ok: true, mock: false, mode, message: '已连接 Signal（' + num + '，signal-cli ' + cliVer + '）' };
  },

  async disconnect() {
    connected = false;
    stopReceiveLoop();
    phoneNumber = null;
    return { ok: true };
  },

  async getConversations() {
    if (mode === 'real') {
      // 真实模式：联系人 + 最近会话合并
      const r = await cliRun(['-u', phoneNumber, 'listContacts', '--output=json']);
      const list = [];
      if (r.ok) {
        try {
          const contacts = JSON.parse(r.stdout || '[]');
          for (const c of contacts) {
            const num = String(c.number || '');
            if (!num) continue;
            const recent = memConvs.get(num);
            list.push({
              id: num,
              name: c.name || num,
              avatar: '👤',
              lastMessage: recent ? recent.lastMessage : '',
              lastActive: recent ? recent.lastActive : '',
              unread: 0,
            });
          }
        } catch (e) { /* 解析失败则只返回内存会话 */ }
      }
      for (const [id, c] of memConvs) {
        if (!list.some((x) => x.id === id)) {
          list.push({ id, name: c.name, avatar: '👤', lastMessage: c.lastMessage, lastActive: c.lastActive, unread: 0 });
        }
      }
      return list;
    }
    return MOCK_CONTACTS.map((c) => {
      const msgs = MOCK_MESSAGES[c.id] || [];
      const last = msgs[msgs.length - 1];
      return { id: c.id, name: c.name, avatar: c.avatar, lastMessage: last ? last.text : '', lastActive: c.lastActive, unread: 0 };
    });
  },

  async getMessages(convId) {
    const store = mode === 'real' ? memMessages : MOCK_MESSAGES;
    return (store[convId] || []).map((m, i) => ({ id: convId + '-' + i, ...m }));
  },

  async sendMessage(convId, text) {
    if (mode === 'real') {
      const r = await cliRun(['-u', phoneNumber, 'send', '-m', text, convId], 20000);
      if (!r.ok) return { ok: false, message: 'signal-cli 发送失败：' + r.stderr.slice(0, 200) };
      const msg = { id: convId + '-' + Date.now(), from: 'in', text, time: nowTime() };
      if (!memMessages[convId]) memMessages[convId] = [];
      memMessages[convId].push(msg);
      memConvs.set(convId, { id: convId, name: convId, lastMessage: text, lastActive: '刚刚' });
      return { ok: true, message: msg };
    }
    if (!MOCK_MESSAGES[convId]) MOCK_MESSAGES[convId] = [];
    const msg = { id: convId + '-' + Date.now(), from: 'in', text, time: nowTime() };
    MOCK_MESSAGES[convId].push(msg);
    mockAutoReply(convId);
    return { ok: true, message: msg };
  },

  onMessage(handler) {
    messageHandlers.push(handler);
    return () => { messageHandlers = messageHandlers.filter((h) => h !== handler); };
  },
};
