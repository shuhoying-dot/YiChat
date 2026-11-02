// 模拟适配器：用于 Phase 1 本地演示，不连接任何真实平台。
// 实现平台适配器接口：id / name / icon / connect / getConversations /
// getMessages / sendMessage / disconnect，外加 onMessage 用于推送新消息。

// 模拟联系人数据：5 个联系人
const CONTACTS = []; // 用户要求：假数据全部清空

// 每个联系人 6-10 条中文聊天记录（out = 对方发来，in = 我方发出）
const MESSAGES = {}; // 用户要求：假数据全部清空

// 模拟自动回复语料：收到用户消息后随机挑一条回复
const AUTO_REPLIES = []; // 用户要求：假数据全部清空

let messageHandlers = []; // 新消息订阅者
let connected = false;

function pushMessage(convId, msg) {
  for (const h of messageHandlers) {
    try { h(convId, msg); } catch (e) { /* 忽略单个订阅者异常 */ }
  }
}

module.exports = {
  id: 'mock',
  name: 'Mock 演示平台',
  icon: '💬',

  // 建立连接（模拟：直接成功）
  async connect() {
    connected = true;
    return { ok: true, message: '已连接到 Mock 演示平台' };
  },

  // 断开连接
  async disconnect() {
    connected = false;
    return { ok: true };
  },

  // 会话列表：返回 5 个联系人
  async getConversations() {
    return CONTACTS.map((c) => {
      const msgs = MESSAGES[c.id] || [];
      const last = msgs[msgs.length - 1];
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        lastMessage: last ? last.text : '',
        lastActive: c.lastActive,
        unread: 0,
      };
    });
  },

  // 取某个会话的聊天记录
  async getMessages(convId) {
    return (MESSAGES[convId] || []).map((m, i) => ({ id: convId + '-' + i, ...m }));
  },

  // 发送消息：先记下我方消息，1-2 秒后模拟对方自动回复一条
  async sendMessage(convId, text) {
    if (!MESSAGES[convId]) MESSAGES[convId] = [];
    const now = new Date();
    const time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const mine = { id: convId + '-' + Date.now(), from: 'in', text, time };
    MESSAGES[convId].push(mine);

    // 1-2 秒后自动回复一条模拟消息
    const delay = 1000 + Math.floor(Math.random() * 1000);
    setTimeout(() => {
      const replyText = AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)];
      const reply = {
        id: convId + '-' + Date.now() + '-r',
        from: 'out',
        text: replyText,
        time: String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'),
      };
      MESSAGES[convId].push(reply);
      pushMessage(convId, reply);
    }, delay);

    return { ok: true, message: mine };
  },

  // 订阅新消息（接口之外的辅助方法，供主进程转发到渲染层）
  onMessage(handler) {
    messageHandlers.push(handler);
    return () => { messageHandlers = messageHandlers.filter((h) => h !== handler); };
  },
};
