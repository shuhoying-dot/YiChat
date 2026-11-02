// KakaoTalk 扩展模块骨架（演示数据模式）。
// 实现统一平台适配器接口：id / name / icon / connect / disconnect /
// getConversations / getMessages / sendMessage / onMessage。
//
// 路线说明（详见 docs/kakao-接入方案.md）：
//   KakaoTalk 企业官方 API（Alimtalk/通知消息）通常要求韩国事业者登录证
//   及授权经销商资质，且只覆盖企业通知场景；个人号全部会话聚合同样只能
//   走"内嵌官方客户端/扩展"路线，封号与跟版风险最高。本骨架先以 mock
//   数据跑通 UI 全流程，真实内嵌实现待后续阶段接入。

// ---------- mock 数据（演示模式） ----------
// 用户要求：假数据全部清空，添加账户时空白，不放假数据

const MOCK_CONTACTS = [];

const MOCK_MESSAGES = {};

const MOCK_REPLIES = [];

let messageHandlers = [];
let connected = false;

function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function pushMessage(convId, msg) {
  for (const h of messageHandlers) {
    try { h(convId, msg); } catch (e) { /* 忽略单个订阅者异常 */ }
  }
}

function mockAutoReply(convId) {
  const delay = 1000 + Math.floor(Math.random() * 1000);
  setTimeout(() => {
    if (!connected) return;
    const text = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
    const reply = { id: convId + '-' + Date.now() + '-r', from: 'out', text, time: nowTime() };
    if (!MOCK_MESSAGES[convId]) MOCK_MESSAGES[convId] = [];
    MOCK_MESSAGES[convId].push(reply);
    pushMessage(convId, reply);
  }, delay);
}

module.exports = {
  id: 'kakao',
  name: 'KakaoTalk',
  icon: '💛',

  // 当前工作模式：'mock'（真实内嵌实现待后续阶段）
  getMode() { return 'mock'; },

  async connect() {
    connected = true;
    return { ok: true, mock: true, mode: 'mock', message: 'KakaoTalk 扩展为演示数据模式（真实内嵌实现待接入）' };
  },

  async disconnect() {
    connected = false;
    return { ok: true };
  },

  async getConversations() {
    return MOCK_CONTACTS.map((c) => {
      const msgs = MOCK_MESSAGES[c.id] || [];
      const last = msgs[msgs.length - 1];
      return { id: c.id, name: c.name, avatar: c.avatar, lastMessage: last ? last.text : '', lastActive: c.lastActive, unread: 0 };
    });
  },

  async getMessages(convId) {
    return (MOCK_MESSAGES[convId] || []).map((m, i) => ({ id: convId + '-' + i, ...m }));
  },

  async sendMessage(convId, text) {
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
