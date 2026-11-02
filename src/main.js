// 主进程：创建窗口、单实例锁、IPC 通道（适配器管理）、自动更新。
const { app, BrowserWindow, ipcMain, session, Menu, webContents } = require('electron');
// 禁用 WebAuthn（通行密钥）：Meta 系平台（Instagram/Facebook）登录时会触发
// Windows 安全中心的安全密钥弹窗，关掉后各平台改走密码/验证码登录，不再弹系统窗。
try { app.commandLine.appendSwitch('disable-features', 'WebAuthentication'); } catch (e) {}
// Windows 桌面通知必须挂 AppUserModelID，否则系统托盘里认不出应用、toast 不弹（2026-11-01 未读汇总用）
try { if (process.platform === 'win32') app.setAppUserModelId(process.execPath); } catch (e) {}

// ---- 统一 User-Agent：去掉 Electron 标识 ----
// Electron 默认 UA 末尾带 "Electron/31.x.x"，Google 一看就判定「这不是 Chrome」，
// 首页会弹一个「选择 Chrome / 下载 Chrome」的推广浮层（就是那个蓝色按钮的卡片）；
// 部分平台（Google 登录、Instagram 等）的风控也会因此多要一次验证。
// 这里把 UA 还原成标准 Chrome 串，其余站点行为不受影响。
function cleanUA(ua) {
  return String(ua || '')
    .replace(/\sElectron\/[^\s]+/gi, '')
    .replace(/\s(open-scrm|YiChat)\/[^\s]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
try { app.userAgentFallback = cleanUA(app.userAgentFallback); } catch (e) {}
// 每个账号的 partition 是独立 session，创建时同样抹掉 Electron 标识
try {
  app.on('session-created', (ses) => {
    try { ses.setUserAgent(cleanUA(ses.getUserAgent())); } catch (e2) {}
  });
} catch (e) {}
const path = require('path');
const { getAdapter, connectAdapter, disconnectAdapter, getAdapterStatus, listAdapters } = require('./adapters');
// 大模型真实请求（主进程 Node fetch，无 CORS 限制；Key 不记日志）
const llm = require('./llm');

// ---- IPC 来源校验（2026-11-01）----
// 只有应用自己的渲染层（打包后 file://，开发时 localhost）能调用敏感通道。
// 平台 webview 里的页面即便拿到 ipcRenderer，也会在这里被挡住。
function isTrustedFrame(event) {
  try {
    const fr = event && event.senderFrame;
    const u = (fr && fr.url) || (event && event.sender && event.sender.getURL ? event.sender.getURL() : '') || '';
    return /^file:\/\//i.test(u) || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i.test(u);
  } catch (e) { return false; }
}
function assertTrusted(event, channel) {
  if (!isTrustedFrame(event)) throw new Error('拒绝调用：来源不可信（' + channel + '）');
}
// 代理串：只允许 http/https/socks5，禁止空白与换行，限制长度
function cleanProxy(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (s.length > 200 || /[\s]/.test(s)) return '';
  if (!/^(https?|socks5h?):\/\/[^\s/]+/i.test(s)) return '';
  return s;
}

// 自动更新：electron-updater。更新服务器地址在 electron-builder.config.js 的
// BRAND.updateUrl 中配置（打包时写入安装包，见 docs/更新发布流程.md）。
// 开发模式（npm start）下没有更新元信息，相关调用会被安全跳过。
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = false; // 先提示用户，由用户确认后再下载
} catch (e) {
  console.warn('[更新] electron-updater 不可用，自动更新已禁用:', e.message);
}

let mainWindow = null;

// ---- 设备编号：按电脑生成 ----
// 优先用 node-machine-id 取机器硬件 ID；取不到则用首次启动生成的随机 UUID，
// 存到 userData 下的 device-id 文件，保证同一台电脑重启不变、换电脑就变。
// 渲染层经 preload 的 window.yichat.getDeviceId() 读取（仪表盘展示用）。
let deviceIdCached = null;
function getDeviceId() {
  if (deviceIdCached) return deviceIdCached;
  try {
    // eslint-disable-next-line global-require
    const { machineIdSync } = require('node-machine-id');
    const id = machineIdSync();
    if (id) {
      deviceIdCached = String(id);
      return deviceIdCached;
    }
  } catch (e) {
    console.warn('[设备] machine-id 获取失败，改用本地生成的 UUID:', e.message);
  }
  const fs = require('fs');
  const { randomUUID } = require('crypto');
  const file = path.join(app.getPath('userData'), 'device-id');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) {
      deviceIdCached = saved;
      return deviceIdCached;
    }
  } catch (e) {
    /* 首次启动，文件不存在 */
  }
  deviceIdCached = randomUUID();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, deviceIdCached, 'utf8');
  } catch (e) {
    /* 写入失败也不影响本次显示 */
  }
  return deviceIdCached;
}
ipcMain.handle('yichat:get-device-id', () => getDeviceId());
// 用户 2026-10-16 要求：退出确认倒数完真正退出应用（不只是退回登录页）
ipcMain.handle('yichat:quit-app', () => { app.quit(); });

// ---- 诊断日志：翻译 overlay 探针（2026-10-31） ----
// webview 里的 overlay 预加载脚本周期性上报扫描状态（平台识别/气泡数/翻译成败/DOM 链），
// 写入 userData/overlay-diag.log。用于远程定位"某平台不翻译"问题，无需开发者工具。
let diagLogBusy = false;
ipcMain.on('yichat:overlay-diag', (event, d) => {
  try {
    if (!d || typeof d !== 'object') return;
    if (diagLogBusy) return;
    diagLogBusy = true;
    const fs = require('fs');
    const file = path.join(app.getPath('userData'), 'overlay-diag.log');
    let url = '';
    try { url = event.sender.getURL ? event.sender.getURL() : ''; } catch (e) {}
    const line = JSON.stringify({ t: new Date().toISOString(), url: String(url).slice(0, 120), ...d }) + '\n';
    // 超过 1MB 清空重写，避免无限增长
    try {
      const st = fs.statSync(file);
      if (st && st.size > 1024 * 1024) fs.writeFileSync(file, '', 'utf8');
    } catch (e) { /* 文件不存在，直接追加 */ }
    fs.appendFile(file, line, () => { diagLogBusy = false; });
  } catch (e) { diagLogBusy = false; }
});
// ---- 今日统计（2026-10-31）：主页「今日概览」用 ----
// overlay 每完成一次翻译上报一条（成功/失败 + 平台），主进程按天累加落盘
// userData/daily-stats.json。只统计本机，不上传。
// 结构：{ days: { 'YYYY-MM-DD': {ok, fail} }, platforms: {key: n} }，另保留最近 8 天供趋势图
let statsData = null;
let statsTimer = null;
function statsFilePath() {
  return path.join(app.getPath('userData'), 'daily-stats.json');
}
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function dayStr(offset) {
  const d = new Date(Date.now() - offset * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function loadStats() {
  const day = todayStr();
  if (statsData && statsData.date === day) return statsData;
  let raw = null;
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    raw = JSON.parse(fs.readFileSync(statsFilePath(), 'utf8'));
  } catch (e) { raw = null; }
  if (!raw || typeof raw !== 'object') raw = {};
  if (!raw.days || typeof raw.days !== 'object') raw.days = {};
  // 兼容旧格式（只有当天 ok/fail）
  if (raw.date && raw.ok != null && !raw.days[raw.date]) {
    raw.days[raw.date] = { ok: raw.ok || 0, fail: raw.fail || 0 };
  }
  if (raw.date !== day) raw.platforms = {}; // 换天：平台分布重新计
  const t = raw.days[day] || { ok: 0, fail: 0 };
  raw.date = day;
  raw.ok = t.ok || 0;
  raw.fail = t.fail || 0;
  if (!raw.platforms || typeof raw.platforms !== 'object') raw.platforms = {};
  // 只保留最近 8 天
  const keys = Object.keys(raw.days).sort();
  while (keys.length > 8) { const k = keys.shift(); delete raw.days[k]; }
  statsData = raw;
  return statsData;
}
function saveStats() {
  try {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    const f = statsFilePath();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(statsData || {}), 'utf8');
  } catch (e) { /* 统计失败不影响功能 */ }
}
ipcMain.on('yichat:stat', (event, d) => {
  try {
    if (!d || typeof d !== 'object') return;
    const s = loadStats();
    const key = String(d.platform || 'unknown').slice(0, 24);
    if (d.ok) {
      s.ok = (s.ok || 0) + 1;
      s.platforms[key] = (s.platforms[key] || 0) + 1;
      if (d.ms > 0) { s.msSum = (s.msSum || 0) + d.ms; s.msCnt = (s.msCnt || 0) + 1; s.lastMs = d.ms; }
    } else {
      s.fail = (s.fail || 0) + 1;
    }
    s.days[s.date] = { ok: s.ok, fail: s.fail };
    // 合并 4 秒内的多次上报再落盘，避免频繁写文件
    if (!statsTimer) {
      statsTimer = setTimeout(() => { statsTimer = null; saveStats(); }, 4000);
    }
  } catch (e) {}
});
ipcMain.handle('yichat:daily-stats', () => {
  try {
    const s = loadStats();
    const ok = s.ok || 0;
    const fail = s.fail || 0;
    const total = ok + fail;
    const history = [];
    for (let i = 6; i >= 0; i--) {
      const dstr = dayStr(i);
      const cell = s.days[dstr] || { ok: 0 };
      history.push({ d: dstr, ok: cell.ok || 0 });
    }
    return {
      date: s.date,
      ok,
      fail,
      total,
      rate: total ? Math.round((ok * 100) / total) : 0,
      platforms: Object.keys(s.platforms || {}).length,
      avgMs: (s.msCnt ? Math.round(s.msSum / s.msCnt) : -1),
      lastMs: (s.lastMs || -1),
      history,
    };
  } catch (e) {
    return { date: todayStr(), ok: 0, fail: 0, total: 0, rate: 0, platforms: 0, history: [] };
  }
});

// 翻译放主进程做（参考 chat-translator 架构）：访客页拦截回车后，把文本发到主进程翻译，
// 主进程走代理请求谷歌，返回译文。避免访客页网络栈的代理/防火墙问题。

// 主进程拦截回车（before-input-event）：<webview> 的 preload 收不到页面 keydown，
// 必须在主进程拦截。逻辑照抄参考代码（chat-translator）：execCommand 填入 + cancelable Enter 发送，不点按钮。
// 关键修正（2026-10-18）：翻译必须跑在访客页里面（走该会话的代理）。
// 主进程直连 translate.google.com 在国内会被墙，回车会被吞掉十几秒无反应——这就是之前"回车没反映"的根因。
const hookedWcIds = new Set();
const enterHookCfg = new Map(); // wcId -> { auto, dst, trPreview, noZh, noZhTr, platformKey, accountId }
const ZH_RE_MAIN = /[\u4e00-\u9fa5]/;
const ENTER_LANG_CODE = {
  '英语': 'en', '简体中文': 'zh-CN', '繁体中文': 'zh-TW', '中文': 'zh-CN',
  '西班牙语': 'es', '法语': 'fr', '德语': 'de', '日语': 'ja', '韩语': 'ko',
  '俄语': 'ru', '葡萄牙语': 'pt', '意大利语': 'it', '阿拉伯语': 'ar',
  '泰语': 'th', '越南语': 'vi', '印尼语': 'id', '马来语': 'ms',
  '荷兰语': 'nl', '土耳其语': 'tr', '波兰语': 'pl', '乌克兰语': 'uk',
  '印地语': 'hi',
};
// 访客页内找聊天输入框（回车时焦点一般就在输入框里，优先 activeElement）
const GUEST_FIND_INPUT = `(function(){
  try {
    var ae = document.activeElement;
    if (ae && ae.closest) {
      var c = ae.closest('[contenteditable="true"],textarea,input[type="text"],input:not([type])');
      if (c) return c;
    }
    var marked = document.querySelector('[data-scrm-chat-input]');
    if (marked) return marked;
    var lex = document.querySelector('div[data-lexical-editor="true"][contenteditable="true"]');
    if (lex) return lex;
    return document.querySelector('div[contenteditable="true"]') || document.querySelector('textarea') || null;
  } catch(e){ return null; }
})()`;
const GUEST_READ_TEXT = `(function(){
  try {
    var el = (${GUEST_FIND_INPUT});
    if (!el) return '';
    var t = el.isContentEditable ? (el.innerText || el.textContent || '') : (el.value || '');
    return String(t).trim();
  } catch(e){ return ''; }
})()`;
const GUEST_RESEND_ENTER = `(function(){
  try {
    var el = (${GUEST_FIND_INPUT});
    if (!el) return false;
    try { el.focus(); } catch(e){}
    var kb = new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true });
    el.dispatchEvent(kb);
    return true;
  } catch(e){ return false; }
})()`;
// "恢复原文"：把输入框内容填回原文。
// 修复（2026-10-19）：之前"恢复原文"按钮只是关闭弹窗，并没有真正把原文填回去。
const GUEST_RESTORE_ORIG = (origText) => `(function(){
  try {
    var el = (${GUEST_FIND_INPUT});
    if (!el) return;
    try { el.focus(); } catch(e){}
    var text = ${JSON.stringify(origText || '')};
    if (el.isContentEditable) {
      try {
        var selection = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      } catch(e){}
      var done = false;
      try { done = document.execCommand('insertText', false, text); } catch(e){}
      if (!done) {
        try { el.textContent = text; } catch(e2){}
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e3){}
        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e4){}
      }
      try {
        var r2 = document.createRange();
        r2.selectNodeContents(el);
        r2.collapse(false);
        var s2 = window.getSelection();
        s2.removeAllRanges();
        s2.addRange(r2);
      } catch(e){}
    } else {
      el.value = text;
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch(e){}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch(e){}
    }
  } catch(e){}
})()`;
const GUEST_PREVIEW_TOAST = (origText, transText) => `(function(){
  try {
    var old = document.getElementById('__yichat_preview_box');
    if (old) { try { old.remove(); } catch(e){} }
    var box = document.createElement('div');
    box.id = '__yichat_preview_box';
    box.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(20,24,32,.92);color:#fff;padding:12px 16px;border-radius:12px;font-size:13px;z-index:2147483647;max-width:80%;box-shadow:0 4px 20px rgba(0,0,0,.3);';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:6px;color:#7eb3ff;';
    title.textContent = '已翻译，请检查';
    var orig = document.createElement('div');
    orig.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:4px;max-height:60px;overflow:auto;';
    orig.textContent = '原文: ' + ${JSON.stringify(origText || '')}.slice(0,200);
    var trans = document.createElement('div');
    trans.style.cssText = 'color:#fff;margin-bottom:10px;max-height:80px;overflow:auto;';
    trans.textContent = '译文: ' + ${JSON.stringify(transText || '')}.slice(0,500);
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';
    var btnSend = document.createElement('button');
    btnSend.textContent = '按回车发送';
    btnSend.style.cssText = 'background:#005dff;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
    btnSend.onclick = function(){ try { box.remove(); } catch(e){} };
    var btnCancel = document.createElement('button');
    btnCancel.textContent = '恢复原文';
    btnCancel.style.cssText = 'background:transparent;color:#aaa;border:1px solid #555;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;';
    btnCancel.onclick = function(){ (${GUEST_RESTORE_ORIG(origText)}); try { box.remove(); } catch(e){} };
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnSend);
    box.appendChild(title);
    box.appendChild(orig);
    box.appendChild(trans);
    box.appendChild(btnRow);
    document.body.appendChild(box);
    // 10秒后自动消失（用户已按回车发送则提前移除）
    setTimeout(function(){ try { var b = document.getElementById('__yichat_preview_box'); if (b) b.remove(); } catch(e){} }, 10000);
  } catch(e){}
})()`;
// 通用提示 toast（拦截原因等，不再静默吞回车）
const GUEST_NOTE_TOAST = (msg) => `(function(){
  try {
    var t = document.getElementById('__yichat_enter_toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '__yichat_enter_toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(20,24,32,.85);color:#fff;padding:8px 18px;border-radius:10px;font-size:13px;z-index:2147483647;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(t);
    }
    t.textContent = ${JSON.stringify(msg)};
    t.style.display = 'block';
    clearTimeout(t.__hideTo);
    t.__hideTo = setTimeout(function(){ try { t.style.display = 'none'; } catch(e){} }, 2600);
  } catch(e){}
})()`;

// 访客页内：读文本 → 翻译（走该会话代理）→ 填入 → 按预览开关决定直接发还是等第二次回车
// 自己补发的回车（可信输入事件）会再次经过 before-input-event，用时间窗放行，避免死循环
const suppressEnterUntil = new Map(); // wcId -> 时间戳
const enterInFlight = new Set(); // wcId：回车翻译处理中（防重复回车并发重填/重发）
// 两次回车流程：第一次回车翻译填入（不发送），第二次回车原生放行发送
const awaitingSecondEnter = new Set(); // wcId
// 可信填字 v2：全程用真实按键走编辑器自己的输入管线，保证内部状态与表面一致。
// 日志实证：编程式填字（execCommand/DOM）只改表面 DOM，WhatsApp 发送读的是 Lexical
// 内部状态——表面 Hello、内部还是原文/空，于是发出原文或空气泡，且表面校验发现不了。
// 步骤：聚焦 → Ctrl+A 全选 + 粘贴替换 → 读回；不行 → Ctrl+A+退格清空 → 逐字键入 → 读回。
// 返回填完后输入框的实际文本（trim）。
async function trustedFillText(wc, text) {
  const target = String(text).trim();
  const read = async () => {
    try { return String((await wc.executeJavaScript(GUEST_READ_TEXT, true).catch(() => '')) || '').trim(); }
    catch (e) { return ''; }
  };
  const ctrlA = () => {
    try { wc.sendInputEvent({ type: 'keyDown', keyCode: 'a', code: 'KeyA', modifiers: ['control'] }); } catch (e) {}
    try { wc.sendInputEvent({ type: 'keyUp', keyCode: 'a', code: 'KeyA', modifiers: ['control'] }); } catch (e) {}
  };
  try {
    await wc.executeJavaScript(`(function(){ try { var el = (${GUEST_FIND_INPUT}); if (el) el.focus(); } catch(e){} return true; })()`, true).catch(() => {});
    // 第一步：全选 + 粘贴替换
    ctrlA();
    try { const { clipboard } = require('electron'); clipboard.writeText(String(text)); } catch (e) {}
    try { wc.paste(); } catch (e) {}
    await new Promise(r => setTimeout(r, 180));
    let now = await read();
    if (now === target) return now;
    // 第二步：清空（全选+退格，最多 3 次）后逐字键入，完全模拟真人打字
    for (let i = 0; i < 3; i++) {
      ctrlA();
      try { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace', code: 'Backspace' }); } catch (e) {}
      try { wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace', code: 'Backspace' }); } catch (e) {}
      await new Promise(r => setTimeout(r, 50));
      now = await read();
      if (!now) break;
    }
    const chars = String(text).replace(/\n/g, ' ');
    for (const ch of chars) {
      try { wc.sendInputEvent({ type: 'char', keyCode: ch }); } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 150));
    now = await read();
    return now;
  } catch (e) { return ''; }
}

async function handleGuestEnter(wc, wcId, cfg) {
  const alive = () => { try { return wc && !wc.isDestroyed(); } catch (e) { return false; } };
  const exec = (js) => wc.executeJavaScript(js, true).catch(() => null);
  // 发可信回车：走系统输入管线，跟手指按下去一模一样（isTrusted=true）。
  // 序列：keyDown → char(\r) → keyUp，缺了 char 有些输入框不认。
  const pressEnter = async () => {
    try {
      if (!alive()) return;
      suppressEnterUntil.set(wcId, Date.now() + 1500);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', code: 'Enter' });
      wc.sendInputEvent({ type: 'char', keyCode: '\r', code: 'Enter' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', code: 'Enter' });
    } catch (e) {
      try { if (alive()) await exec(GUEST_RESEND_ENTER); } catch (e2) {}
    }
  };
  try {
    if (!alive()) return;
    const text = String((await exec(GUEST_READ_TEXT).catch(() => '')) || '');
    // 空输入或无中文：回车直通，平台正常发送（绝不拦截）
    if (!text || !ZH_RE_MAIN.test(text)) { await pressEnter(); return; }
    // "禁止发送含中文的消息"：含中文拦截，提示原因（不再静默）
    if (cfg.noZh) { await exec(GUEST_NOTE_TOAST('已拦截：含中文（可在设置里关闭"禁止发送含中文"）')); return; }
    const tl = ENTER_LANG_CODE[cfg.dst] || 'en';
    const ch = cfg.channel || '谷歌';
    let out = '';
    let usedCh = '';
    // 谷歌通道：优先用访客页 session（该账号自己的代理，与平台页同一出口），失败退全局代理
    const tryGoogle = async () => {
      try {
        let gr = null;
        try { gr = await translateGoogleViaSession(text, tl, wc.session); } catch (e) {}
        if (!gr || !gr.ok) { try { gr = await translateGoogleViaProxy(text, tl, cfg.proxy); } catch (e) {} }
        if (gr && gr.ok && gr.text) return String(gr.text).trim();
      } catch (e) {}
      return '';
    };
    // 大模型通道：主进程直接调用（需已配置 Key，即 cfg.llmEntry）
    const tryLLM = async () => {
      if (!cfg.llmEntry) return '';
      try {
        const lr = await llm.translate(cfg.llmEntry, text, cfg.dst || '英语');
        if (lr && lr.ok && lr.text) return String(lr.text).trim();
      } catch (e) {}
      return '';
    };
    // 通道自动兜底：选定通道失败，自动换另一个通道再试（大模型兜底需已配 Key）
    if (ch === '谷歌') {
      out = await tryGoogle(); if (out) usedCh = '谷歌';
      if (!out) { out = await tryLLM(); if (out) usedCh = '大模型API'; }
    } else {
      out = await tryLLM(); if (out) usedCh = '大模型API';
      if (!out) { out = await tryGoogle(); if (out) usedCh = '谷歌'; }
    }
    if (!out) {
      // 翻译失败："禁止发送含中文的翻译"开 → 拦截（提示原因）；否则发原文（绝不吞回车）
      if (cfg.noZhTr) { await exec(GUEST_NOTE_TOAST('翻译失败，已拦截（含中文翻译被禁止）')); return; }
      await pressEnter();
      return;
    }
    // 译文仍含中文且开了 noZhTr → 拦截不发（提示原因）
    if (cfg.noZhTr && ZH_RE_MAIN.test(out)) { await exec(GUEST_NOTE_TOAST('已拦截：译文含中文')); return; }
    // 填入译文：只走可信管线（真实 Ctrl+A + 粘贴 / 逐字键入）——见 trustedFillText 注释。
    const afterFill = await trustedFillText(wc, String(out));
    const fillOk = afterFill === String(out).trim();
    if (!fillOk) {
      // 填不准：绝不发送（防原文/空气泡/拼接）。译文放剪贴板，提示手动粘贴。
      try { const { clipboard } = require('electron'); clipboard.writeText(String(out)); } catch (e) {}
      await exec(GUEST_NOTE_TOAST('译文已生成但自动填入失败，已复制到剪贴板：全选输入框后粘贴即可发送'));
      return;
    }
    // 照抄参考代码：preview 开 = 两次回车（填入+提示，等用户第二次回车）；
    // preview 关 = 一次回车（填入后自动发可信回车，直接发出）
    if (cfg.trPreview) {
      awaitingSecondEnter.add(wcId);
      try { await exec(GUEST_PREVIEW_TOAST(text, out)); } catch (e) {}
      return;
    } else {
      // 发送前等 250ms 让编辑器状态落定
      await new Promise(r => setTimeout(r, 250));
      await pressEnter();
      return;
    }
  } catch (e) {
    // 任何异常：优先用可信回车把发送还给页面（绝不吞掉用户输入），
    // 不可信回车兜底（部分平台不认不可信事件）
    // 修复（2026-10-19）：之前这里引用了未定义的 GUEST_PRESS_ENTER，
    // 会抛 ReferenceError；改用本作用域的 pressEnter()（自带可信回车+兜底）。
    try {
      await pressEnter();
    } catch (e2) {}
    try { if (wc && !wc.isDestroyed()) await wc.executeJavaScript(GUEST_RESEND_ENTER, true).catch(() => {}); } catch (e3) {}
  }
}

ipcMain.handle('yichat:hook-enter', async (event, wcId, cfg) => {
  try {
    const { webContents } = require('electron');
    const id = Number(wcId);
    if (!id) return false;
    if (cfg && typeof cfg === 'object') enterHookCfg.set(id, { ...cfg });
    const wc = webContents.fromId(id);
    if (!wc || wc.isDestroyed()) return false;
    if (!hookedWcIds.has(id)) {
      hookedWcIds.add(id);
      wc.once('destroyed', () => { hookedWcIds.delete(id); enterHookCfg.delete(id); awaitingSecondEnter.delete(id); });
      wc.on('before-input-event', (ev, input) => {
        try {
          if (!input || input.type !== 'keyDown' || input.key !== 'Enter') return;
          if (input.shift || input.control || input.alt || input.meta) return;
          // 第二次回车：直接放行，原生发送（两次回车流程）
          if (awaitingSecondEnter.has(id)) { awaitingSecondEnter.delete(id); return; }
          // 自己补的可信回车：直接放行，不再拦截（防死循环）
          if (Date.now() < (suppressEnterUntil.get(id) || 0)) return;
          const c = enterHookCfg.get(id) || {};
          if (c.auto === false) return; // 没开"发送自动翻译"：回车直通
          ev.preventDefault();
          // 上一次回车还在翻译/填字：这次回车吞掉，防并发重填（译文叠加）和重复发送
          if (enterInFlight.has(id)) return;
          enterInFlight.add(id);
          handleGuestEnter(wc, id, c).catch(() => {}).finally(() => { enterInFlight.delete(id); });
        } catch (e) {}
      });
    }
    return true;
  } catch (e) { return false; }
});


// 话术一键发送：把话术文本填入访客页输入框，再走回车翻译流程（按该会话配置翻译并发送）
ipcMain.handle('yichat:fill-and-enter', async (event, wcId, text) => {
  try {
    const { webContents } = require('electron');
    const id = Number(wcId);
    const wc = id ? webContents.fromId(id) : null;
    if (!wc || wc.isDestroyed()) return false;
    const t = String(text || '').trim();
    if (!t) return false;
    // 话术填入同样只走可信管线（编程式填字进不了编辑器内部状态，后续读取/发送都会错位）
    const afterPhrase = await trustedFillText(wc, t);
    if (afterPhrase !== t) {
      try { await wc.executeJavaScript(GUEST_NOTE_TOAST('话术填入失败，请重试'), true).catch(() => {}); } catch (e) {}
      return false;
    }
    const cfg = enterHookCfg.get(id) || {};
    await handleGuestEnter(wc, id, cfg);
    return true;
  } catch (e) { return false; }
});

// ================= 工具箱（2026-11-01） =================
// 话术「插入不发」：只把文本放进输入框，回车留给用户自己按。
// 必须走同一条可信管线（trustedFillText）——编程式改 value 进不了平台编辑器的内部状态，
// 用户接着手打或发送时会被判定为空/错位。
ipcMain.handle('yichat:fill-text', async (event, wcId, text) => {
  try {
    const id = Number(wcId);
    const wc = id ? webContents.fromId(id) : null;
    if (!wc || wc.isDestroyed()) return { ok: false, message: '没有可用的平台页' };
    const t = String(text || '').trim();
    if (!t) return { ok: false, message: '话术内容是空的' };
    const after = await trustedFillText(wc, t);
    if (after === t) return { ok: true };
    return { ok: false, message: '插入失败：先点一下平台页的输入框再试' };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
});

// 截图当前平台页 → 直接进系统剪贴板（发给同事看聊天记录最常用）
ipcMain.handle('yichat:capture-page', async (event, wcId) => {
  try {
    const electron = require('electron');
    const clipboard = electron.clipboard;
    const id = Number(wcId);
    const wc = id ? webContents.fromId(id) : null;
    if (!wc || wc.isDestroyed()) return { ok: false, message: '没有可用的平台页' };
    const img = await wc.capturePage();
    if (!img || img.isEmpty()) return { ok: false, message: '页面还没画出来，稍后再试' };
    const size = img.getSize();
    if (typeof electron.ClipboardItem === 'function') {
      // Electron 44+：同步窄助手（writeImage 等）已移除，改走 W3C ClipboardItem 异步写
      const blob = new Blob([Buffer.from(img.toPNG())], { type: 'image/png' });
      await clipboard.write([new electron.ClipboardItem({ 'image/png': blob })]);
    } else if (typeof clipboard.writeImage === 'function') {
      clipboard.writeImage(img); // Electron 43 及以下的同步 API
    } else {
      return { ok: false, message: '当前 Electron 不支持写图片到剪贴板' };
    }
    return { ok: true, width: size.width, height: size.height };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
});

// 桌面通知：新消息汇总（只在窗口不在前台时弹，避免自己看着还被打扰）
ipcMain.handle('yichat:notify', (event, payload) => {
  try {
    const { Notification } = require('electron');
    if (!Notification || !Notification.isSupported || !Notification.isSupported()) return false;
    const p = payload || {};
    const n = new Notification({
      title: String(p.title || 'YiChat'),
      body: String(p.body || ''),
      silent: false,
    });
    n.on('click', () => {
      try {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      } catch (e) {}
    });
    n.show();
    return true;
  } catch (e) { return false; }
});

// 语音转文字：客户发来的语音先转文字，再走翻译通道（拿不到文字就没法翻）
ipcMain.handle('yichat:asr', async (event, entry, audioBase64, mime, lang) => (
  llm.transcribe(entry || {}, audioBase64, mime, lang)
));

// 单实例锁：已有实例运行时，新启动的实例直接聚焦旧窗口后退出
// 访客页（各平台 webview）关掉后台节流：切到后台/被遮住时不冻结页面，
// 否则 Telegram/WhatsApp 长连接被掐断，切换账户回来要重新加载
app.on('web-contents-created', (event, contents) => {
  try {
    if (contents.getType() === 'webview') contents.setBackgroundThrottling(false);
  } catch (e) {}
  // ---- 平台页缩放（2026-10-31） ----
  // 只缩放平台 webview 内容：Ctrl+= / Ctrl+- 步进，Ctrl+0 复位 100%。
  // 主窗口（LOGO、侧栏）不参与缩放——Chromium 默认的 Ctrl+滚轮整页缩放被
  // 各自 preload 拦截/转发，保证缩放后应用界面与 LOGO 保持原样。
  contents.on('before-input-event', (ev, input) => {
    try {
      if (!input || input.type !== 'keyDown' || !input.control) return;
      const k = String(input.key || '');
      let step = 0, reset = false;
      if (k === '=' || k === '+') step = 0.1;
      else if (k === '-' || k === '_') step = -0.1;
      else if (k === '0') reset = true;
      if (!step && !reset) return;
      ev.preventDefault();
      if (contents.getType() !== 'webview') return; // 主窗口只吞键不缩放
      let z = reset ? 1 : contents.getZoomFactor();
      if (!reset) z = Math.round(Math.min(2, Math.max(0.5, z + step)) * 10) / 10;
      contents.setZoomFactor(z);
      persistGuestZoom(contents, z);
      showZoomTip(contents, z);
    } catch (e) {}
  });
});

// 缩放值按账号（partition）保存到渲染层 localStorage 的 yichat-zoom-* 键，
// 与渲染层自带的缩放按钮共用同一套存储，重新打开会话时按保存值恢复。
function persistGuestZoom(guestWc, z) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.executeJavaScript(`(function(){
      try {
        var wvs = document.querySelectorAll('webview');
        for (var i = 0; i < wvs.length; i++) {
          try {
            if (wvs[i].getWebContentsId && wvs[i].getWebContentsId() === ${guestWc.id}) {
              var p = wvs[i].getAttribute('partition') || '';
              localStorage.setItem('yichat-zoom-' + p, '${String(z)}');
              return true;
            }
          } catch (e) {}
        }
      } catch (e) {}
      return false;
    })()`, true).catch(() => {});
  } catch (e) {}
}

// 平台页角落提示当前缩放比例（1.2 秒后淡出）
function showZoomTip(wc, zoomFactor) {
  try {
    wc.executeJavaScript(`(function(){
      try {
        var t = document.getElementById('__yichat_zoom_tip');
        if (!t) {
          t = document.createElement('div');
          t.id = '__yichat_zoom_tip';
          t.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;background:rgba(20,24,32,.85);color:#fff;padding:6px 14px;border-radius:10px;font-size:13px;pointer-events:none;transition:opacity .3s;font-family:sans-serif;';
          (document.body || document.documentElement).appendChild(t);
        }
        t.textContent = '缩放 ' + Math.round(${zoomFactor} * 100) + '%';
        t.style.opacity = '1';
        clearTimeout(t.__zt);
        t.__zt = setTimeout(function(){ t.style.opacity = '0'; }, 1200);
      } catch(e){}
    })()`, true).catch(() => {});
  } catch (e) {}
}

// UI 增强脚本诊断日志（2026-10-31）：写入 userData/ui-diag.log，用于排查注入脚本问题
ipcMain.on('yichat:ui-log', (event, msg) => {
  try {
    const fs = require('fs');
    const path = require('path');
    fs.appendFileSync(path.join(app.getPath('userData'), 'ui-diag.log'),
      new Date().toISOString() + ' ' + String(msg) + '\n');
  } catch (e) {}
});

// Ctrl+滚轮缩放平台页：webview 内的 overlay 预加载脚本拦截滚轮后经此转发，
// 只调整该 webview 自身的 zoomFactor，主界面不受影响
ipcMain.on('yichat:zoom-step', (event, dir) => {
  try {
    const wc = event.sender;
    if (!wc || wc.isDestroyed()) return;
    const d = Number(dir) || (dir > 0 ? 1 : -1);
    let z = wc.getZoomFactor();
    z = Math.round(Math.min(2, Math.max(0.5, z + (d > 0 ? 0.1 : -0.1))) * 10) / 10;
    wc.setZoomFactor(z);
    persistGuestZoom(wc, z);
    showZoomTip(wc, z);
  } catch (e) {}
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'YiChat 译聊 3.5.0',
    webPreferences: {
      // 预加载脚本：通过 contextBridge 安全地暴露 API
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 允许渲染层使用 <webview> 内嵌官方页面（如 web.whatsapp.com）
      webviewTag: true,
    },
  });

  // 渲染层：加载 Vite 构建产物（src/renderer/dist），base './' 保证 file:// 下资源可用
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- IPC 通道：适配器管理 ----

// 列出所有已注册平台
ipcMain.handle('scrm:list-platforms', async () => {
  return listAdapters();
});

// 每个适配器在应用生命周期内只订阅一次新消息推送，避免重复 connect 造成重复转发
const subscribedAdapters = new Set();

// 连接指定平台；连接成功后订阅其新消息并转发给渲染层
// 状态机由适配器注册表跟踪：connecting -> connected / connected-mock
ipcMain.handle('scrm:connect', async (event, platformId, options) => {
  const adapter = getAdapter(platformId);
  const result = await connectAdapter(platformId, options);
  if (result.ok && typeof adapter.onMessage === 'function' && !subscribedAdapters.has(platformId)) {
    subscribedAdapters.add(platformId);
    adapter.onMessage((convId, msg) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scrm:message-received', { platformId, convId, message: msg });
      }
    });
  }
  return result;
});

// 断开指定平台
ipcMain.handle('scrm:disconnect', async (event, platformId) => {
  return disconnectAdapter(platformId);
});

// 查询指定平台的连接状态（disconnected / connecting / connected / connected-mock）
ipcMain.handle('scrm:adapter-status', async (event, platformId) => {
  return getAdapterStatus(platformId);
});

// 取会话列表
ipcMain.handle('scrm:get-conversations', async (event, platformId) => {
  const adapter = getAdapter(platformId);
  return adapter.getConversations();
});

// 取某个会话的聊天记录
ipcMain.handle('scrm:get-messages', async (event, platformId, convId) => {
  const adapter = getAdapter(platformId);
  return adapter.getMessages(convId);
});

// 发送消息
ipcMain.handle('scrm:send-message', async (event, platformId, convId, text) => {
  const adapter = getAdapter(platformId);
  return adapter.sendMessage(convId, text);
});

// ---- IPC 通道：大模型 API（真实请求） ----
// entry = {type, key, baseUrl, model}；主进程只透传结果，不记录 Key。
// 2026-11-01：只允许应用自身页面调用（Key 与出网请求都在这条链上）。
ipcMain.handle('llm:test-key', async (event, entry) => { assertTrusted(event, 'llm:test-key'); return llm.testKey(entry || {}); });
ipcMain.handle('llm:chat', async (event, entry, messages, maxTokens) => { assertTrusted(event, 'llm:chat'); return llm.chat(entry || {}, messages || [], maxTokens); });
ipcMain.handle('llm:translate', async (event, entry, text, targetLang) => { assertTrusted(event, 'llm:translate'); return llm.translate(entry || {}, text, targetLang); });

// 谷歌翻译（主进程，走用户代理，不受 CORS 限制）——发送路径与 IPC 共用
async function translateGoogleViaProxy(text, targetLang, proxy) {
  try {
    const tl = String(targetLang || 'zh-CN');
    const url = 'https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl='
      + encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(String(text || '').slice(0, 1500));
    const ctrl = new AbortController();
    const to = setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 15000);
    const fetchOpts = { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' } };
    const px = cleanProxy(proxy) || cleanProxy(process.env.HTTPS_PROXY) || cleanProxy(process.env.HTTP_PROXY) || '';
    if (px) {
      try {
        const { ProxyAgent } = require('undici');
        fetchOpts.dispatcher = new ProxyAgent(px);
      } catch (e) {}
    }
    const r = await fetch(url, fetchOpts).catch(() => null);
    clearTimeout(to);
    if (!r || !r.ok) return { ok: false };
    const d = await r.json().catch(() => null);
    let s = '';
    if (d && d[0]) { for (const seg of d[0]) { if (seg && typeof seg[0] === 'string') s += seg[0]; } }
    s = String(s || '').trim();
    return s ? { ok: true, text: s } : { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

// 谷歌翻译走 webview 会话自身的 session（自带该账号配置的代理，与平台页同一出口，最可靠）
// 用 net.request({session})：与页面加载完全相同的网络栈，保证走该会话的代理
function sessionGetJson(ses, url, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const { net } = require('electron');
      const req = net.request({ method: 'GET', url, session: ses });
      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const to = setTimeout(() => { try { req.abort(); } catch (e) {} finish(null); }, timeoutMs || 15000);
      req.on('response', (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk.toString('utf8'); });
        res.on('end', () => { clearTimeout(to); finish({ status: res.statusCode, body }); });
        res.on('error', () => { clearTimeout(to); finish(null); });
      });
      req.on('error', () => { clearTimeout(to); finish(null); });
      req.end();
    } catch (e) { resolve(null); }
  });
}

async function translateGoogleViaSession(text, targetLang, ses) {
  try {
    if (!ses) return { ok: false };
    const tl = String(targetLang || 'zh-CN');
    const url = 'https://translate.google.com/translate_a/single?client=gtx&sl=auto&tl='
      + encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(String(text || '').slice(0, 1500));
    const r = await sessionGetJson(ses, url, 15000);
    if (!r || r.status !== 200 || !r.body) return { ok: false };
    let d = null;
    try { d = JSON.parse(r.body); } catch (e) { return { ok: false }; }
    let s = '';
    if (d && d[0]) { for (const seg of d[0]) { if (seg && typeof seg[0] === 'string') s += seg[0]; } }
    s = String(s || '').trim();
    return s ? { ok: true, text: s } : { ok: false };
  } catch (e) {
    return { ok: false };
  }
}

// 谷歌翻译：优先用对应 webview 的 session（账号代理），失败再退全局代理
ipcMain.handle('yichat:translate-google', async (event, text, targetLang, proxy, wcId) => {
  if (wcId) {
    try {
      const { webContents } = require('electron');
      const wc = webContents.fromId(parseInt(wcId, 10));
      if (wc && !wc.isDestroyed() && wc.session) {
        const r = await translateGoogleViaSession(text, targetLang, wc.session);
        if (r && r.ok) return r;
      }
    } catch (e) {}
  }
  return translateGoogleViaProxy(text, targetLang, proxy);
});
ipcMain.handle('llm:tts', async (event, entry, text, voice) => llm.tts(entry || {}, text, voice));

// ---- IPC 通道：webview 会话基础设施 ----

// 取 webview 预加载脚本的 file:// URL（渲染层传给 <webview preload> 属性）
// name 仅允许字母数字与连字符，防止路径穿越
ipcMain.handle('wa:preload-path', async (event, name) => {
  const { pathToFileURL } = require('url');
  const safeName = String(name || '').replace(/[^a-z0-9-]/gi, '');
  if (!safeName) throw new Error('非法预加载脚本名');
  return pathToFileURL(path.join(__dirname, 'webview-preload', safeName + '.js')).href;
});

// 配置指定 partition：userAgent（指纹接入点）/ proxyRules（代理接入点）
// 每个账号使用独立持久化 partition（如 persist:wa-<accountId>），登录态本地持久保存。
// proxyRules 为空时不改动代理设置（保持系统默认），避免误覆盖用户网络。
// ---- IPC 通道：为某个账号的 webview 配置独立 session（UA / 代理）----
// 2026-11-01 加固：来源校验 + 参数白名单。原实现接受任意 partition / proxyRules，
// 等于给了页面「新建任意 session、把其它账号的流量改道」的能力。
const PARTITION_RE = /^persist:[A-Za-z0-9@._-]{1,80}$/;
ipcMain.handle('wa:configure-partition', async (event, opts) => {
  assertTrusted(event, 'wa:configure-partition');
  const { partition, userAgent, proxyRules } = opts || {};
  const pid = String(partition || '');
  if (!PARTITION_RE.test(pid)) throw new Error('partition 名称不合法');
  const ses = session.fromPartition(pid);
  if (userAgent) {
    // 只保留单行、限长，避免往请求头里塞换行做头注入
    const ua = String(userAgent).replace(/[\r\n]/g, ' ').trim().slice(0, 300);
    if (ua) ses.setUserAgent(ua);
  }
  const px = cleanProxy(proxyRules);
  if (proxyRules && !px) throw new Error('代理地址不合法');
  if (px) {
    await ses.setProxy({ proxyRules: px });
  }
  return { ok: true };
});

// ---- IPC 通道：自动更新 ----

// 把更新事件转发给渲染层（设置页展示状态用）
function forwardUpdateEvent(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

if (autoUpdater) {
  autoUpdater.on('checking-for-update', () => forwardUpdateEvent('app:update-status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => forwardUpdateEvent('app:update-status', { state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => forwardUpdateEvent('app:update-status', { state: 'latest' }));
  autoUpdater.on('download-progress', (p) => forwardUpdateEvent('app:update-status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', () => forwardUpdateEvent('app:update-status', { state: 'downloaded' }));
  autoUpdater.on('error', (err) => forwardUpdateEvent('app:update-status', { state: 'error', message: String(err && err.message || err) }));
}

// 渲染层"检查更新"按钮调用：返回检查结果摘要
ipcMain.handle('app:check-update', async () => {
  if (!autoUpdater) return { ok: false, message: '自动更新模块不可用' };
  if (!app.isPackaged) return { ok: false, message: '开发模式下不支持检查更新' };
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result && result.updateInfo;
    return { ok: true, available: !!info && info.version !== app.getVersion(), version: info && info.version };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

// 用户确认后开始下载更新包
ipcMain.handle('app:download-update', async () => {
  if (!autoUpdater) return { ok: false };
  await autoUpdater.downloadUpdate();
  return { ok: true };
});

// 下载完成后：安装并重启应用
ipcMain.handle('app:install-update', async () => {
  if (!autoUpdater) return { ok: false };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
});

app.whenReady().then(() => {
  // 默认 session 早于 session-created 事件，这里补一次
  try { session.defaultSession.setUserAgent(cleanUA(session.defaultSession.getUserAgent())); } catch (e) {}
  // 用户明确要求：去掉窗口顶部 File / Edit / View / Window 原生菜单栏
  Menu.setApplicationMenu(null);
  createWindow();
  // 打包后的应用启动 15 秒后静默检查一次更新（开发模式跳过）
  if (autoUpdater && app.isPackaged) {
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 15000);
  }
});

app.on('window-all-closed', () => {
  // macOS 外的平台：窗口全关即退出
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // macOS：dock 点击且无窗口时重建
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
