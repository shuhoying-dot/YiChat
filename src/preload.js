// 预加载脚本：在隔离上下文中通过 contextBridge 向渲染层暴露安全的 API。
// 渲染层只能调用这里白名单列出的方法，拿不到 Node 能力。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scrm', {
  // 平台：取已注册平台列表
  getPlatforms: () => ipcRenderer.invoke('scrm:list-platforms'),
  // 平台：连接 / 断开（connect 可传 options，如 Signal 号码）
  connectPlatform: (platformId, options) => ipcRenderer.invoke('scrm:connect', platformId, options),
  disconnectPlatform: (platformId) => ipcRenderer.invoke('scrm:disconnect', platformId),
  // 平台：查询连接状态（disconnected / connecting / connected / connected-mock）
  getAdapterStatus: (platformId) => ipcRenderer.invoke('scrm:adapter-status', platformId),

  // 会话：取会话列表
  getConversations: (platformId) => ipcRenderer.invoke('scrm:get-conversations', platformId),
  // 消息：取聊天记录
  getMessages: (platformId, convId) => ipcRenderer.invoke('scrm:get-messages', platformId, convId),
  // 消息：发送
  sendMessage: (platformId, convId, text) => ipcRenderer.invoke('scrm:send-message', platformId, convId, text),

  // 订阅新消息推送（适配器自动回复等场景）
  onMessageReceived: (handler) => {
    const listener = (event, payload) => handler(payload);
    ipcRenderer.on('scrm:message-received', listener);
    // 返回取消订阅函数
    return () => ipcRenderer.removeListener('scrm:message-received', listener);
  },

  // 自动更新：手动检查 / 下载 / 安装重启 / 订阅状态事件
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (handler) => {
    const listener = (event, payload) => handler(payload);
    ipcRenderer.on('app:update-status', listener);
    return () => ipcRenderer.removeListener('app:update-status', listener);
  },

  // webview 会话：取预加载脚本 file:// URL / 配置 partition（userAgent 指纹、代理）
  getWebviewPreloadPath: (name) => ipcRenderer.invoke('wa:preload-path', name),
  configureWebviewPartition: (opts) => ipcRenderer.invoke('wa:configure-partition', opts),

  // 大模型：测试 Key / 聊天补全 / 翻译 / 文本转语音（主进程真实请求）
  llmTestKey: (entry) => ipcRenderer.invoke('llm:test-key', entry),
  llmChat: (entry, messages, maxTokens) => ipcRenderer.invoke('llm:chat', entry, messages, maxTokens),
  llmTranslate: (entry, text, targetLang) => ipcRenderer.invoke('llm:translate', entry, text, targetLang),
  translateGoogle: (text, targetLang, proxy, wcId) => ipcRenderer.invoke('yichat:translate-google', text, targetLang, proxy, wcId),
  llmTts: (entry, text, voice) => ipcRenderer.invoke('llm:tts', entry, text, voice),
  // 语音转文字（2026-11-01）：audioBase64 + mime → { ok, text }
  llmAsr: (entry, audioBase64, mime, lang) => ipcRenderer.invoke('yichat:asr', entry, audioBase64, mime, lang),
});

// 设备信息：本机设备编号（仪表盘展示）。与 window.scrm 分开命名空间，按任务要求暴露为 window.yichat。
contextBridge.exposeInMainWorld('yichat', {
  // 取本机设备编号（主进程按电脑生成，同一台电脑重启不变）
  getDeviceId: () => ipcRenderer.invoke('yichat:get-device-id'),
  // 真正退出应用（退出确认倒数完调用）
  quitApp: () => ipcRenderer.invoke('yichat:quit-app'),
  // 请求主进程 hook 指定 webContents 的回车键（before-input-event），cfg 为发送翻译配置
  hookEnter: (wcId, cfg) => ipcRenderer.invoke('yichat:hook-enter', wcId, cfg || null),
  // 话术一键发送：主进程把话术填入指定 webContents 输入框并走回车翻译发送
  fillAndEnter: (wcId, text) => ipcRenderer.invoke('yichat:fill-and-enter', wcId, String(text || '')),
  // 话术只插入不发送（2026-11-01）：填进输入框后把回车交给用户
  fillText: (wcId, text) => ipcRenderer.invoke('yichat:fill-text', wcId, String(text || '')),
  // 截图当前平台页并复制到剪贴板（2026-11-01）
  capturePage: (wcId) => ipcRenderer.invoke('yichat:capture-page', wcId),
  // 桌面通知（2026-11-01）
  notify: (payload) => ipcRenderer.invoke('yichat:notify', payload || {}),
  // UI 增强脚本诊断日志（2026-10-31）：主进程落盘 ui-diag.log
  logMessage: (msg) => { try { ipcRenderer.send('yichat:ui-log', String(msg || '')); } catch (e) {} },
  // 今日翻译统计（2026-10-31）：主页「今日概览」用，只读本机计数
  getDailyStats: () => ipcRenderer.invoke('yichat:daily-stats'),
  // 翻译节点测速（2026-10-31）：主页「翻译节点」卡片的「重测」
});

// 禁用主窗口 Ctrl+滚轮 缩放（2026-10-31）：
// Chromium 默认会缩放整个主窗口（LOGO、侧栏一起变大变小），与"只缩放平台页"冲突。
// 主窗口内按住 Ctrl 滚动一律不产生缩放效果；平台页的缩放由 webview 内预加载脚本处理。
window.addEventListener('wheel', (e) => {
  try { if (e && e.ctrlKey) e.preventDefault(); } catch (err) {}
}, { passive: false });
