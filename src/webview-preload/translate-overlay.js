// 通用翻译 overlay 预加载脚本：用于 WhatsApp 之外各平台 webview 内嵌。
//
// 在访客页消息气泡下方追加"原文 / — 译聊 YiChat — / 译文"双层显示，
// 译文的文字颜色与字号由宿主按显示设置传入（setStyle），实时生效。
// 译文走真实通道：谷歌免费通道（免 Key 开箱即用）、DeepL、大模型 API（需 Key）。
// 通道与目标语言由宿主按翻译设置经 setTransConfig 下发，注入逻辑不变。
// 全部原创实现。
(function () {
  'use strict';

  // 与宿主（渲染层）通信：资料回填 / 真实翻译请求
  var ipc = null;
  try { ipc = require('electron').ipcRenderer; } catch (e) { ipc = null; }

  // 注：WebAuthn（通行密钥）已在主进程用 disable-features=WebAuth 全局关闭，
  // 页面侧不再做任何 API 篡改——篡改 PublicKeyCredential 会挂掉部分平台的页面脚本。

  // —— 弹窗登录接力（2026-11-21 定版）——
  // webview 访客页的 window.open 会被 Electron 默认吞掉（disablePopups 在访客创建时
  // 就定死，事后给元素加 allowpopups 也来不及），Meta Business 的「用 Facebook 继续」
  // 这类按钮因此点了没反应。这里在页面主世界把 window.open 与 target=_blank 链接
  // 拦下来，把地址经宿主桥交给主进程，由主进程开一个继承本账号 session 的真窗口
  // 完成登录；登录态落回账号分区，关窗刷新即已登录。
  // 跨世界传址两条路并行（属性标记＋CustomEvent），任一通即可，1.5 秒内同址去重：
  // 预加载刚跑时 documentElement 可能还不存在，观察者必须等 DOM 就绪再挂
  // （首版直接 observe(documentElement) 在真机实测中静默失败，整条链断在这里）。
  var __popupLast = { url: '', t: 0 };
  function relayPopup(u) {
    try {
      if (!u || !/^https?:\/\//i.test(u)) return;
      var now = Date.now();
      if (__popupLast.url === u && now - __popupLast.t < 1500) return;
      __popupLast = { url: u, t: now };
      if (ipc) ipc.sendToHost('yichat:popup-req', { url: u });
    } catch (e) {}
  }
  try {
    var wf2 = require('electron').webFrame;
    if (wf2 && wf2.executeJavaScript) {
      var pr2 = wf2.executeJavaScript('(function(){try{' +
        'var _o = window.open;' +
        'window.open = function(u){' +
        'try{' +
        'if(u){var abs = new URL(String(u), location.href);' +
        'if(/^https?:$/.test(abs.protocol)){' +
        'document.documentElement.setAttribute("data-yichat-popup", abs.href + "|" + Date.now());' +
        'window.dispatchEvent(new CustomEvent("yichat:popup", { detail: abs.href }));' +
        'return null;}}' +
        '}catch(e){}' +
        'return _o ? _o.apply(window, arguments) : null;' +
        '};' +
        '}catch(e){}})();', true);
      if (pr2 && pr2.catch) pr2.catch(function () {});
    }
  } catch (e) {}
  try {
    window.addEventListener('yichat:popup', function (e) {
      relayPopup(e && e.detail ? String(e.detail) : '');
    });
  } catch (e) {}
  function armPopupRelay() {
    try {
      // 主世界写下的标记属性 → 转成宿主桥消息
      var po = new MutationObserver(function () {
        try {
          var v = document.documentElement.getAttribute('data-yichat-popup');
          if (!v) return;
          document.documentElement.removeAttribute('data-yichat-popup');
          relayPopup(v.slice(0, v.lastIndexOf('|')));
        } catch (e) {}
      });
      po.observe(document.documentElement, { attributes: true, attributeFilter: ['data-yichat-popup'] });
    } catch (e) {}
    try {
      // target=_blank 链接：隔离世界直接拦点击（与主世界共享同一 DOM 事件流）
      document.addEventListener('click', function (e) {
        try {
          var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
          if (!a) return;
          var href = a.href || '';
          if (!/^https?:\/\//i.test(href)) return;
          e.preventDefault(); e.stopPropagation();
          relayPopup(href);
        } catch (err) {}
      }, true);
    } catch (e) {}
  }
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armPopupRelay);
    else armPopupRelay();
  } catch (e) {}

  var OVERLAY_CLASS = 'scrm-trans-overlay';
  var enabled = true;
  // 注入参考代码的译文样式（虚线分隔）：照抄，只换品牌字
  (function injectTransStyle() {
    try {
      // 每次都重写内容（不早退）：升级后旧 CSS 不会残留
      var st = document.getElementById('scrm-trans-style');
      if (!st) {
        st = document.createElement('style');
        st.id = 'scrm-trans-style';
        (document.head || document.documentElement).appendChild(st);
      }
      // 2026-11-20 v7 译文格式（用户最终选定 C 分隔线式）：不要卡片不要标签，原文与译文之间一条虚线，译文字号 13、蓝灰色。
      // 已读勾：2026-10-31 曾按用户要求隐藏，2026-11-20 用户要求恢复——不再藏 .time-sending-status。
      st.textContent = '.scrm-trans-overlay{margin-top:7px!important;background:transparent!important;border:none!important;border-top:1px dashed rgba(0,0,0,.18)!important;border-radius:0!important;padding:6px 0 2px!important;position:relative!important;box-shadow:none!important}' +
        '.scrm-kw-hit{outline:2px solid #faad14!important;outline-offset:-2px!important}' +
        '.scrm-kw-badge{margin-top:4px!important;font-size:11px!important;color:#ad6800!important;background:#fffbe6!important;border:1px solid #ffe58f!important;border-radius:4px!important;padding:1px 6px!important;display:inline-block!important}' +
        // 译文正文：深蓝灰，和原文清晰区分
        'div.scrm-trans-overlay div.scrm-trans-text{font-size:13px!important;line-height:1.65!important;color:#3d5a80!important;padding-left:1px!important}' +
        // 深色主题（跟随网页/系统）：深色底浅色字
        '@media (prefers-color-scheme:dark){.scrm-trans-overlay{background:transparent!important;border-top-color:rgba(255,255,255,.22)!important}' +
        'div.scrm-trans-overlay div.scrm-trans-text{color:#cdd6e4!important}}';
    } catch (e) {}
  })();
  // 显示设置：文字颜色 / 字号（宿主通过 configure / setStyle 推送）
  var style = { color: '#000000', size: 14 };
  // 是否用户自定义过：默认（黑/14）时不写内联样式，让 CSS 控制 refined 格式；
  // 用户在显示设置里改过颜色或字号后，才用内联样式覆盖。
  var styleCustomized = false;
  // 气泡选择器（宿主按平台配置），尽量通用
  // 新版 Telegram Web K (SolidJS)：div[role="article"][data-mid] 是消息容器，
  // 文本在 div.message.spoilers-container 里
  // 各平台选择器（照抄参考代码 chat-translator v130 实测配置）：
  // 通用逻辑 + 平台相关选择器，都在通用模板里。profilePlatformKey 从 URL 自动识别。
  var PLATFORM_CFGS = {
    telegram: {
      containers: ['.bubble'],
      texts: ['div.message', '.message-text']
    },
    whatsapp: {
      strict: true, scope: '#main',
      // 容器：新版 WA Web 消息行是 div[data-id]（带 message-in/out 类），旧版有 data-testid
      // 文本：.selectable-text（span，稳定类名）；data-testid 已大面积下线，只作兜底
      containers: ['[data-testid="msg-container"]', 'div[data-id]', '.message-in', '.message-out'],
      texts: ['.selectable-text', '[data-testid="selectable-text"]']
    },
    // ===== 2026-10-24 全平台对接（YiChat 自有实现，按各平台网页公开 DOM 锚点） =====
    x: {
      // X 私信：消息行 data-testid=messageEntry，文本 data-testid=tweetText（官方前端稳定锚点）
      containers: ['[data-testid="messageEntry"]'],
      texts: ['[data-testid="tweetText"]'],
      composers: ['[data-testid="dmComposerTextInput"]']
    },
    tiktok: {
      // TikTok 私信：消息项 data-e2e=chat-item；文本在其内部段落/文本 span
      containers: ['[data-e2e="chat-item"]'],
      texts: ['[data-e2e="chat-item"] [class*="SpanText"]', '[data-e2e="chat-item"] p'],
      composers: ['[data-e2e="chat-input"]']
    },
    instagram: {
      // 2026-10-31 诊断日志实测：新版 IG 私信已不用 role=row（roleRows=0），
      // 全页 div[dir="auto"] 恰好只有消息文本（左侧列表预览是 span，天然隔离），
      // 因此无需会话区限定（scopeFree），直接按文本翻译。实测输入框定位失败
      // （composerFound=false），发送翻译待后续拿到输入框 DOM 再补 composers。
      scopeFree: true,
      texts: ['div[dir="auto"]']
    },
    messenger: {
      containers: ['div[role="row"]'],
      needScope: true,
      composers: ['div[contenteditable="true"][data-lexical-editor="true"]', 'div[role="textbox"][data-lexical-editor="true"]'],
      texts: ['div[dir="auto"]', 'span[dir="auto"]']
    },
    facebook: {
      containers: ['div[role="row"]'],
      needScope: true,
      composers: ['div[contenteditable="true"][data-lexical-editor="true"]', 'div[role="textbox"][data-lexical-editor="true"]'],
      texts: ['div[dir="auto"]', 'span[dir="auto"]']
    },
    metabiz: {
      containers: ['div[role="row"]'],
      needScope: true,
      composers: ['div[contenteditable="true"][data-lexical-editor="true"]', 'div[role="textbox"][data-lexical-editor="true"]'],
      texts: ['div[dir="auto"]', 'span[dir="auto"]']
    },
    line: {
      containers: ['li[class*="msg"]', 'div[class*="chatMsg"]', 'div[class*="message"]'],
      texts: ['span[class*="text"]', 'div[dir="auto"]']
    },
    linebiz: {
      containers: ['div[role="row"]', 'li[class*="message"]'],
      texts: ['div[dir="auto"]', 'span[class*="text"]']
    },
    zalo: {
      containers: ['div[class*="msg-item"]', 'div[class*="message"]'],
      texts: ['div[class*="text"]', 'span[dir="auto"]']
    },
    textnow: {
      containers: ['div[class*="message"]'],
      texts: ['div[class*="message-text"]', 'span[class*="text"]']
    },
    gmessages: {
      containers: ['mws-message-bubble', '[class*="message-bubble"]'],
      texts: ['[class*="msg-text"]', 'span[dir="ltr"]']
    },
    gvoice: {
      containers: ['[class*="bubble"]', 'div[class*="message"]'],
      texts: ['[class*="message-text"]', 'span[dir="auto"]']
    },
    gchat: {
      containers: ['[data-message-id]'],
      texts: ['span[dir="ltr"]', '[dir="ltr"] span']
    },
    snapchat: {
      containers: ['li[class*="Message"]', 'div[class*="message"]'],
      texts: ['span[class*="Text"]', 'span[dir="auto"]']
    }
  };
  function currentCfg() {
    try {
      var k = String(profilePlatformKey || '').toLowerCase();
      if (PLATFORM_CFGS[k]) return PLATFORM_CFGS[k];
    } catch (e) {}
    return null;
  }
  // 参考代码 pick 逻辑：按顺序试每个选择器，返回第一个命中的（不合并）
  function pick(sels, root) {
    var r = root || document;
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = r.querySelectorAll(sels[i]);
        if (els && els.length) return els;
      } catch (e) {}
    }
    return [];
  }
  var bubbleSelectors = ['div[role="article"][data-mid]', '.bubbles-group div[role="article"]', '[data-testid="msg-container"]', '.bubble',
    'div[data-id]',
    'div[class*="message-in"], div[class*="message-out"]'];
  var textSelectors = ['div.message', '.selectable-text', '.message-text', '.text',
    'span[dir="ltr"], span[dir="auto"]'];




  function safe(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  // ================= 诊断探针（2026-10-31） =================
  // 用途：定位"某平台不翻译"。周期性把扫描各环节真实状态发给主进程，
  // 主进程写入 userData/overlay-diag.log，无需开发者工具即可远程诊断。
  var diagStats = { bubbles: 0, transReq: 0, transOk: 0, transFail: 0, lastSkips: [], skipCounts: {} };
  function noteSkip(reason) {
    try {
      // 3.6.8：跳过原因带计数——原来只留最近 6 个不重复原因、无次数，
      // 「偶发一次」和「全军覆没」在日志里长得一模一样
      diagStats.skipCounts[reason] = (diagStats.skipCounts[reason] || 0) + 1;
      if (diagStats.lastSkips.indexOf(reason) < 0) {
        diagStats.lastSkips.push(reason);
        if (diagStats.lastSkips.length > 6) diagStats.lastSkips.shift();
      }
    } catch (e) {}
  }
  function dumpAncestorChain(el) {
    var parts = [];
    var n = el;
    for (var d = 0; d < 10 && n && n !== document.body; d++) {
      var s = String(n.tagName || '').toLowerCase();
      try {
        if (n.id) s += '#' + n.id;
        var cls = (n.getAttribute && n.getAttribute('class')) || '';
        if (cls) s += '.' + String(cls).split(/\s+/).slice(0, 3).join('.');
        var role = n.getAttribute && n.getAttribute('role');
        if (role) s += '[role=' + role + ']';
      } catch (e2) {}
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' < ').slice(0, 400);
  }
  function collectDiag() {
    var cfg = null;
    try { cfg = currentCfg(); } catch (e0) {}
    var textsFound = 0, roleRows = 0;
    try { if (cfg && cfg.texts) textsFound = document.querySelectorAll(cfg.texts.join(',')).length; } catch (e1) {}
    try { roleRows = document.querySelectorAll('div[role="row"]').length; } catch (e2) {}
    var composer = false, scope = false;
    try { composer = !!findComposerEl(); } catch (e3) {}
    try { scope = !!resolveScope(); } catch (e4) {}
    // 3.6.9：被认出的输入框的祖先链——真实页面 scope 定位失败时，
    // 靠它看清输入框到底住在哪个子树、离线程气泡有多深
    var composerChain = '';
    try { var cel9 = findComposerEl(); if (cel9) composerChain = dumpAncestorChain(cel9); } catch (e9) {}
    // 输入框候选元素详情（诊断发送翻译为何失效）
    var composerInfo = '';
    try {
      var ces = document.querySelectorAll('div[contenteditable="true"], textarea, input[type="text"]');
      var cparts = [];
      for (var cj = 0; cj < ces.length && cj < 8; cj++) {
        var cr = ces[cj].getBoundingClientRect();
        var tag = String(ces[cj].tagName).toLowerCase();
        var role2 = ces[cj].getAttribute('role');
        var lex = ces[cj].getAttribute('data-lexical-editor');
        var ph = ces[cj].getAttribute('placeholder') || ces[cj].getAttribute('aria-label') || '';
        cparts.push(tag + (role2 ? '[role=' + role2 + ']' : '') + (lex ? '[lex]' : '') + '(' + Math.round(cr.width) + 'x' + Math.round(cr.height) + '@y' + Math.round(cr.top) + ')' + (ph ? '"' + String(ph).slice(0, 12) + '"' : ''));
      }
      composerInfo = cparts.join(' | ').slice(0, 300);
    } catch (e4b) {}
    var overlays = 0, pending = 0;
    try { overlays = document.querySelectorAll('[data-scrm="trans-overlay"]').length; } catch (e5) {}
    try { pending = document.querySelectorAll('[data-scrm-trans-pending]').length; } catch (e6) {}
    var sample = '', chain = '';
    try {
      var cands = document.querySelectorAll('div[dir="auto"], span[dir="auto"], .message, .selectable-text');
      for (var i = 0; i < cands.length; i++) {
        var t = String(cands[i].textContent || '').trim();
        var nested = 0;
        try { nested = cands[i].querySelectorAll('div[dir="auto"]').length; } catch (e7) {}
        if (t.length > 15 && t.length < 300 && nested === 0) { sample = t.slice(0, 80); chain = dumpAncestorChain(cands[i]); break; }
      }
    } catch (e8) {}
    return {
      url: String(location.href || '').slice(0, 120),
      platformKey: profilePlatformKey,
      hasCfg: !!cfg,
      cfgTextsFound: textsFound,
      roleRows: roleRows,
      composerFound: composer,
      composerInfo: composerInfo,
      composerChain: composerChain,
      scopeFound: scope,
      scopeStrategy: rScopeStrategy,
      climbMax: scopeClimbMax,
      overlays: overlays,
      pending: pending,
      bubblesLastScan: diagStats.bubbles,
      transReq: diagStats.transReq,
      transOk: diagStats.transOk,
      transFail: diagStats.transFail,
      lastSkips: diagStats.lastSkips.slice(),
      skipCounts: diagStats.skipCounts,
      // 3.6.8：配置快照——原来日志里没有，「没开自动翻译」「没配默认 Key」
      // 「平台识别失败」三种故障长得一模一样（都是 transReq=0），无法远程区分
      cfgSnap: {
        enabled: !!enabled,
        auto: !!transCfg.auto,
        channel: transCfg.channel || '',
        sendChannel: transCfg.sendChannel || '',
        hasKey: !!transCfg.hasKey,
        targetLang: transCfg.targetLang || ''
      },
      sampleText: sample,
      sampleChain: chain
    };
  }
  function sendDiag() {
    var d = null;
    try { d = collectDiag(); } catch (e) {}
    // 3.6.10：健康自检与诊断共用同一份周期数据（评估在上报之前做，互不影响）
    try { if (d) evalHealth(d); } catch (e) {}
    try { if (ipc && ipc.send && d) ipc.send('yichat:overlay-diag', d); } catch (e) {}
  }
  setInterval(sendDiag, 8000);
  setTimeout(sendDiag, 2500);

  // ================= 健康自检（3.6.10） =================
  // 教训（3.6.7→3.6.9 三版连环修）：功能靠猜 DOM、坏了静默，用户先发现。
  // 探针数据其实齐全，只是没浮出来。这里在 diag 周期内评估「翻译是否在真工作」：
  // 有待译内容、翻译已开、却持续发不出请求（或请求全失败），连续 ≥3 个周期后
  // 经宿主桥报给宿主，宿主在工作台异常条里说清「哪个平台、什么原因」。
  // 判定从严：没开会话、刚打开页面（宽限期 15 秒）、样本已是目标语言，一律不报。
  var healthState = { navAt: Date.now(), lastUrl: '', prev: null, streak: 0, bad: null, okResend: null, healthyStreak: 0, clearedOk: false };
  var HEALTH_REASONS = ['找不到输入框', '找不到会话区', '翻译请求失败', '有消息未被翻译'];
  // 抗污染版样本判断：译文盒绘在气泡内时，diag 样本的 textContent 会把译文连进来
  // （如 'What are the fees?这是模拟译文'），整段判定会被目标语言占比冲掉。按 CJK
  // 分段，只要有一段含 ≥4 个拉丁字母，就认为样本里还有外语原文（部分已译也算有内容）
  function sampleHasForeign(sample) {
    if (!sample) return false;
    var segs = String(sample).split(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/);
    for (var i = 0; i < segs.length; i++) {
      if ((segs[i].match(/[A-Za-z]/g) || []).length >= 4) return true;
    }
    return sampleIsForeign(sample);
  }
  function skipTotal(counts) {
    var n = 0;
    try { for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) n += counts[k] || 0; } catch (e) {}
    return n;
  }
  // 样本是否为「非目标语言」（待译）：只看文字构成比例，宁可漏报不可误报
  function sampleIsForeign(txt) {
    if (!txt) return false;
    var s = String(txt);
    var cjk = (s.match(/[\u3400-\u9fff]/g) || []).length;
    var letters = (s.match(/[A-Za-z\u00c0-\u024f\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\uac00-\ud7af]/g) || []).length;
    var targetIsZh = /中文|chinese/i.test(String(transCfg.targetLang || ''));
    if (targetIsZh) return letters >= 4 && cjk <= Math.max(1, letters * 0.25);
    if (cjk >= 2) return true;
    var latin = (s.match(/[A-Za-z]/g) || []).length;
    return letters >= 4 && latin <= letters * 0.3;
  }
  function sendHealth(payload) {
    try { if (ipc && ipc.sendToHost) ipc.sendToHost('yichat:health', payload); } catch (e) {}
  }
  function pickHealthReason(d, cur) {
    // 请求在发、却全失败（且从没成功过）→ 通道/Key 层面的失败，不是 DOM 问题
    if (d.transReq > 0 && d.transOk === 0 && d.transFail >= 3) return '翻译请求失败';
    // 输入框都找不到（3.6.7 的真实故障签名）→ 级联无从谈起，先报它
    if (!d.composerFound) return '找不到输入框';
    // 输入框在、会话区定位失败（3.6.8 的真实故障签名）
    var sc = d.skipCounts || {};
    if (d.scopeFound === false || (sc['scope-block'] || 0) > 0 || (sc['gen-scope-block'] || 0) > 0 || (sc['no-scope-unknown'] || 0) > 0) return '找不到会话区';
    if (d.transFail > 0 && d.transOk === 0) return '翻译请求失败';
    return '有消息未被翻译';
  }
  function evalHealth(d) {
    var now = Date.now();
    var url = String(d.url || '');
    if (healthState.lastUrl && url && url !== healthState.lastUrl) {
      // 页内导航（SPA 切会话/切页面）：宽限期与基线重计，避免拿旧页面数据误判
      healthState.navAt = now;
      healthState.prev = null;
      healthState.streak = 0;
    }
    if (url) healthState.lastUrl = url;
    // 恢复通知重发（60 秒内每周期一次）：ok 是边沿事件，宿主在视图切换/重绑
    // webview 的空窗里可能错过单次发送——错过一次，签名就永远清不掉、同因再犯也不再出现
    if (healthState.okResend) {
      if (now - healthState.okResend.at < 60000) {
        for (var oi = 0; oi < healthState.okResend.items.length; oi++) {
          var oit = healthState.okResend.items[oi];
          sendHealth({ platform: d.platformKey || '', reason: oit.reason, signature: oit.signature, state: 'ok' });
        }
      } else healthState.okResend = null;
    }
    var cur = {
      req: d.transReq || 0, ok: d.transOk || 0, fail: d.transFail || 0,
      skips: skipTotal(d.skipCounts)
    };
    var cfgOk = !!(d.cfgSnap && d.cfgSnap.enabled && d.cfgSnap.auto && d.cfgSnap.hasKey);
    // 恢复信号一：翻译又成功了（transOk 增长）→ 撤下并通知宿主清签名
    if (healthState.bad && healthState.prev && cur.ok > healthState.prev.ok) {
      healthState.okResend = { items: [{ reason: healthState.bad.reason, signature: healthState.bad.signature }], at: now };
      sendHealth({ platform: d.platformKey || '', reason: healthState.bad.reason, signature: healthState.bad.signature, state: 'ok' });
      healthState.bad = null;
      healthState.streak = 0;
    }
    // 恢复信号二：用户把自动翻译关了 / 配置变了 → 不是静默失效，同样撤下
    if (healthState.bad && !cfgOk) {
      healthState.okResend = { items: [{ reason: healthState.bad.reason, signature: healthState.bad.signature }], at: now };
      sendHealth({ platform: d.platformKey || '', reason: healthState.bad.reason, signature: healthState.bad.signature, state: 'ok' });
      healthState.bad = null;
      healthState.streak = 0;
    }
    var prev = healthState.prev;
    healthState.prev = cur;
    if (!prev) return;                    // 首个周期只记基线
    if (now - healthState.navAt < 15000) return;  // 宽限期：刚打开的页面不许报
    // 陈旧警报清场（放在 hasContent 判定之前）：本实例已有成功翻译这一硬证据时，
    // 宿主侧可能还挂着上一个实例（页面重载后旧实例的 bad 状态随之消失、永远发不出 ok）
    // 留下的条目——主动为本平台全部已知原因发 ok 清掉。仍在故障中的实例 transOk 恒为 0
    // （或同实例恢复走上面的一对一 ok），不会误清；万一清早了，随后的 bad 重报会再挂回来
    if (!healthState.bad && !healthState.clearedOk && (cur.ok > 0 || healthState.healthyStreak >= 3)) {
      healthState.clearedOk = true;
      var cItems = [];
      for (var ci = 0; ci < HEALTH_REASONS.length; ci++) {
        cItems.push({ reason: HEALTH_REASONS[ci], signature: String(d.platformKey || 'unknown') + '+' + HEALTH_REASONS[ci] });
      }
      healthState.okResend = { items: cItems, at: now };
      for (var cj = 0; cj < cItems.length; cj++) {
        sendHealth({ platform: d.platformKey || '', reason: cItems[cj].reason, signature: cItems[cj].signature, state: 'ok' });
      }
    }
    var hasContent = (d.bubblesLastScan || 0) > 0 && sampleHasForeign(d.sampleText);
    if (!hasContent || !cfgOk) { if (!healthState.bad) healthState.streak = 0; return; }
    var dReq = cur.req - prev.req, dOk = cur.ok - prev.ok, dFail = cur.fail - prev.fail, dSkips = cur.skips - prev.skips;
    var cycleBad = false;
    if (dOk === 0 && dReq === 0 && dSkips > 0) cycleBad = true;             // 有跳过、无请求：静默失效
    else if (dOk === 0 && dReq === 0 && d.scopeFound === false) cycleBad = true; // 会话区恒为空
    else if (dOk === 0 && dReq > 0 && dFail > 0) cycleBad = true;           // 请求在发、全失败
    if (cycleBad) { healthState.streak++; healthState.healthyStreak = 0; }
    else {
      if (!healthState.bad) healthState.streak = 0;
      if (dOk > 0 || (dReq === 0 && dSkips === 0)) healthState.healthyStreak++;
    }
    if (healthState.streak >= 3) {
      var reason = pickHealthReason(d, cur);
      var signature = String(d.platformKey || 'unknown') + '+' + reason;
      // 同因复发：停掉上一轮恢复的 ok 重发，别让新旧状态在宿主侧打架
      if (healthState.okResend) {
        healthState.okResend.items = healthState.okResend.items.filter(function (it) { return it.signature !== signature; });
        if (!healthState.okResend.items.length) healthState.okResend = null;
      }
      healthState.bad = { reason: reason, signature: signature };
      // 每周期重发（幂等）：宿主迟绑/工作台重建时也能补上
      sendHealth({ platform: d.platformKey || '', reason: reason, signature: signature, state: 'bad' });
    }
  }

  // ================= 页面结构快照（3.6.10） =================
  // 为「真页面回归基线」铺路：把当前页面结构脱敏导出——只留 tag / class / role /
  // 几何尺寸 / 关键存在性标记（lexical、contenteditable、dir），严禁任何文本内容、
  // 输入值、href/src 原值（URL 只留 host+path 骨架）。宿主经 executeJavaScript 调用。
  function buildSnapshot() {
    var MAX_DEPTH = 24, MAX_NODES = 4000;  // 深度按真页面实测留余量（商务套件输入框在 15 层深处，14 会把关键区截在门外）
    var count = 0, truncated = false;
    function walk(el, depth) {
      if (!el) return null;
      if (count >= MAX_NODES) { truncated = true; return null; }
      count++;
      var node = { t: String(el.tagName || '').toLowerCase() };
      try {
        var cls = el.getAttribute && el.getAttribute('class');
        if (cls) {
          var toks = String(cls).split(/\s+/).filter(Boolean).slice(0, 4).map(function (x) { return x.slice(0, 48); });
          if (toks.length) node.c = toks.join(' ');
        }
        var role = el.getAttribute && el.getAttribute('role');
        if (role) node.r = String(role).slice(0, 30);
        var r = el.getBoundingClientRect();
        var w = Math.round(r.width), h = Math.round(r.height);
        if (w || h) node.g = w + 'x' + h;
        var f = [];
        if (el.hasAttribute && el.hasAttribute('data-lexical-editor')) f.push('lex');
        var ce = el.getAttribute && el.getAttribute('contenteditable');
        if (ce !== null && ce !== undefined && ce !== 'false') f.push('ce');
        var dir = el.getAttribute && el.getAttribute('dir');
        if (dir) f.push('dir=' + String(dir).slice(0, 8));
        if (f.length) node.f = f;
      } catch (e) {}
      var kids = [];
      var noDescend = node.t === 'script' || node.t === 'style' || node.t === 'link' || node.t === 'meta';
      if (!noDescend && depth < MAX_DEPTH) {
        var ch = el.children || [];
        for (var i = 0; i < ch.length; i++) {
          if (count >= MAX_NODES) { truncated = true; break; }
          var kn = walk(ch[i], depth + 1);
          if (kn) kids.push(kn);
        }
      } else if (!noDescend && el.children && el.children.length) truncated = true;
      if (kids.length) node.k = kids;
      return node;
    }
    var tree = null;
    try { tree = walk(document.documentElement, 0); } catch (e) {}
    var urlSkel = '';
    try { urlSkel = location.protocol + '//' + location.host + location.pathname; } catch (e) {}
    return {
      kind: 'yichat-page-snapshot', v: 1,
      platform: profilePlatformKey || '',
      url: urlSkel,
      capturedAt: new Date().toISOString(),
      nodes: count, truncated: truncated,
      tree: tree
    };
  }

  // ================= Ctrl+滚轮缩放平台页（2026-10-31） =================
  // 拦截访客页内的 Ctrl+滚轮（阻止 Chromium 默认缩放行为），转发给主进程，
  // 由主进程 setZoomFactor 只缩放本 webview——主窗口 LOGO/侧栏不受影响。
  safe(function () {
    window.addEventListener('wheel', function (e) {
      try {
        if (!e || !e.ctrlKey) return;
        e.preventDefault();
        if (ipc && ipc.send) ipc.send('yichat:zoom-step', e.deltaY > 0 ? -1 : 1);
      } catch (e2) {}
    }, { passive: false });
  }, null);

  function findBubbles() {
    return safe(function () {
      var cfg = currentCfg();
      // 通用逻辑：优先用文本元素反推气泡（最可靠，不依赖容器选择器）
      // v130 和商用版都用此思路：先找文本，再找其容器
      if (cfg && cfg.texts) {
        var textEls = pick(cfg.texts);
        if (textEls && textEls.length) {
          var bubbles = [];
          for (var i = 0; i < textEls.length; i++) {
            var te = textEls[i];
            try { if (te.closest('[data-scrm="trans-overlay"]')) continue; } catch (e) {}
            try { if (te.closest('[data-testid="quoted-message"]')) continue; } catch (e2) {}
            // 向上找气泡容器：优先用平台容器选择器定位，否则用父元素
            var bubble = null;
            if (cfg.containers) {
              for (var ci = 0; ci < cfg.containers.length; ci++) {
                try { bubble = te.closest(cfg.containers[ci]); if (bubble) break; } catch (e3) {}
              }
            }
            if (!bubble) bubble = te.parentElement;
            if (bubble && bubbles.indexOf(bubble) < 0) bubbles.push(bubble);
          }
          if (bubbles.length) return bubbles;
        }
      }
      // 兜底：用容器选择器直接找
      if (cfg && cfg.containers) {
        var els = pick(cfg.containers);
        if (els && els.length) {
          var arr = Array.prototype.slice.call(els);
          // 去重：去掉嵌套
          return arr.filter(function (el) {
            for (var i = 0; i < arr.length; i++) {
              if (arr[i] !== el && arr[i].contains(el)) return false;
            }
            return true;
          });
        }
      }
      // 兜底：通用选择器
      var out = [];
      bubbleSelectors.forEach(function (sel) {
        Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
          if (out.indexOf(el) < 0) out.push(el);
        });
      });
      var deduped = out.filter(function (el) {
        for (var i = 0; i < out.length; i++) {
          if (out[i] !== el && out[i].contains(el)) return false;
        }
        return true;
      });
      if (deduped.length < 3) {
        var structural = findBubblesStructural();
        structural.forEach(function (el) {
          if (deduped.indexOf(el) < 0) deduped.push(el);
        });
        deduped = deduped.filter(function (el) {
          for (var i = 0; i < deduped.length; i++) {
            if (deduped[i] !== el && deduped[i].contains(el)) return false;
          }
          return true;
        });
      }
      return deduped;
    }, []);
  }

  // 结构化气泡发现（通用，不依赖类名）：
  // 找看起来像聊天消息的文本节点，反推其块级容器作为气泡。
  // 消息文本特征：长度 1~500，不在输入框/按钮/导航里。
  function findBubblesStructural() {
    return safe(function () {
      var out = [];
      var seen = [];
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      var tn;
      var count = 0;
      while ((tn = walker.nextNode()) && count < 2000) {
        count++;
        var v = (tn.nodeValue || '').trim();
        // 太短或太长的不像消息
        if (v.length < 1 || v.length > 500) continue;
        var pel = tn.parentElement;
        if (!pel) continue;
        // 跳过输入框、按钮、脚本样式
        try {
          if (pel.closest('input, textarea, button, [contenteditable="true"], script, style, nav, header')) continue;
        } catch (e) {}
        // 跳过已有译文的
        try {
          if (pel.closest('[data-scrm="trans-overlay"]')) continue;
        } catch (e) {}
        // 往上找块级容器：div/li/article/section，宽度合理（不占满全屏）
        var c = pel;
        var depth = 0;
        while (c && c !== document.body && depth < 6) {
          var tag = (c.tagName || '').toLowerCase();
          if (tag === 'div' || tag === 'li' || tag === 'article' || tag === 'section') {
            try {
              var r = c.getBoundingClientRect();
              // 消息气泡一般不会太宽（小于视口 90%），也不会太小
              if (r.width > 40 && r.width < window.innerWidth * 0.92 && r.height > 16 && r.height < window.innerHeight * 0.8) {
                break;
              }
            } catch (e) { break; }
          }
          c = c.parentElement;
          depth++;
        }
        if (c && c !== document.body && seen.indexOf(c) < 0) {
          seen.push(c);
          out.push(c);
        }
      }
      return out;
    }, []);
  }

  function bubbleText(bubble) {
    return safe(function () {
      var cfg = currentCfg();
      // 商用版逻辑（WhatsApp）：找 [data-testid~="selectable-text"]，排除引用消息
      var sels = (cfg && cfg.texts) ? cfg.texts : textSelectors;
      var els = pick(sels, bubble);
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        // 跳过已注入的译文
        try { if (el.closest && el.closest('[data-scrm="trans-overlay"]')) continue; } catch (e) {}
        // 商用版：排除引用消息内的文本
        try { if (el.closest && el.closest('[data-testid="quoted-message"]')) continue; } catch (e) {}
        // 克隆后剔除译文、时间戳和表情回应区，取纯文本
        // 回应区里有回应者的小头像（无照片时是名字首字母，如 Hello 的「H」），
        // 不剔除会被当成正文送去翻译、原样剩在译文末尾（2026-10-25 用户实测）
        try {
          var c = el.cloneNode(true);
          var rm = c.querySelectorAll('[data-scrm="trans-overlay"], .scrm-voice-btn, .scrm-voice-text, .scrm-img-btn, .scrm-img-text, .time, .message-time, [data-scrm-hidden], .reactions, [class*="reaction"], [class*="Reaction"]');
          for (var j = 0; j < rm.length; j++) { try { rm[j].remove(); } catch (e2) {} }
          var t = (c.innerText || '').trim();
          if (t && t.length >= 1 && t.length < 2000) return t;
        } catch (e) {
          var t2 = (el.innerText || '').trim();
          if (t2 && t2.length >= 1) return t2;
        }
      }
      // 兜底：气泡整体文本（同样先克隆剔除译文/时间戳/表情回应区，避免回应头像字母混入）
      try {
        var bc = bubble.cloneNode(true);
        var brm = bc.querySelectorAll('[data-scrm="trans-overlay"], .scrm-voice-btn, .scrm-voice-text, .scrm-img-btn, .scrm-img-text, .time, .message-time, [data-scrm-hidden], .reactions, [class*="reaction"], [class*="Reaction"]');
        for (var bj = 0; bj < brm.length; bj++) { try { brm[bj].remove(); } catch (e3) {} }
        var t3 = (bc.innerText || '').trim();
        if (t3 && t3.length < 2000) return t3;
      } catch (e) {}
      var t4 = (bubble.innerText || '').trim();
      return t4.length > 0 && t4.length < 2000 ? t4 : '';
    }, '');
  }

  // 关键词提醒：客户消息命中关键词时给气泡加黄框 + ⚠ 标记（只对收到的消息）
  function markKeyword(bubble, content) {
    try {
      var kws = transCfg.keywords || [];
      if (!kws.length || !content) return;
      var cls = (bubble.className || '').toString();
      if (/is-out|message-out|outgoing/.test(cls)) return;
      if (bubble.querySelector('.scrm-kw-badge')) return;
      var low = content.toLowerCase(), hit = '';
      for (var i = 0; i < kws.length; i++) {
        if (kws[i] && low.indexOf(kws[i].toLowerCase()) >= 0) { hit = kws[i]; break; }
      }
      if (!hit) return;
      bubble.classList.add('scrm-kw-hit');
      var badge = document.createElement('div');
      badge.className = 'scrm-kw-badge';
      badge.setAttribute('data-scrm', 'trans-overlay');
      badge.textContent = '⚠ 关键词：' + hit;
      bubble.appendChild(badge);
    } catch (e) {}
  }

  // ============ 通用会话区限定（全平台） ============
  // 规律：真正的会话区里有消息输入框，列表页/落地页没有。
  // 找到输入框 → 只处理输入框所在会话区（向上首个含 ≥3 个消息容器的祖先）内的气泡；
  // 找不到输入框（没打开会话）→ 只认带明确消息容器类名的气泡，结构猜测的一律不翻。
  var cachedScope = null, scopeAt = 0;
  var scopeClimbMax = 0; // 最近一次一级攀爬中见过的最大容器数（诊断用）
  var rScopeEl = null, rScopeAt = 0, rScopeStrategy = null; // resolveScope 级联缓存（3.6.9）
  function findComposerEl() {
    var marked = document.querySelector('[data-scrm-chat-input]');
    if (marked) return marked;
    // 平台专属输入区锚点（cfg.composers）：命中且几何合理时优先用它定位会话区
    try {
      var ccfg = currentCfg();
      if (ccfg && ccfg.composers) {
        for (var ci = 0; ci < ccfg.composers.length; ci++) {
          var cel = document.querySelector(ccfg.composers[ci]);
          if (cel) {
            var cr = cel.getBoundingClientRect();
            if (cr.height > 8 && cr.width > 100 && cr.top > window.innerHeight * 0.3) return cel;
          }
        }
      }
    } catch (e) {}
    var cands = document.querySelectorAll('div[contenteditable="true"][data-lexical-editor], div[contenteditable="true"].selectable-text, div[contenteditable="true"][role="textbox"], textarea[data-testid*="chat"], input[data-testid*="chat"]');
    for (var i = 0; i < cands.length; i++) {
      try {
        var r = cands[i].getBoundingClientRect();
        if (r.height >= 14 && r.width > 200 && r.top > window.innerHeight * 0.4) return cands[i];
      } catch (e) {}
    }
    return null;
  }
  function knownContainerSels() {
    var arr = [];
    try { var c = currentCfg(); if (c && c.containers) arr = arr.concat(c.containers); } catch (e) {}
    return arr.concat(bubbleSelectors || []);
  }
  function conversationScope() {
    var now = Date.now();
    if (cachedScope && cachedScope.isConnected && now - scopeAt < 3000) return cachedScope;
    if (!cachedScope && now - scopeAt < 3000) return null;
    scopeAt = now;
    var input = findComposerEl();
    if (!input) { cachedScope = null; return null; }
    var sels = knownContainerSels();
    var node = input, best = null;
    scopeClimbMax = 0;
    for (var d = 0; d < 10 && node && node !== document.body; d++) {
      node = node.parentElement;
      if (!node) break;
      var cnt = 0;
      for (var i = 0; i < sels.length; i++) { try { cnt += node.querySelectorAll(sels[i]).length; } catch (e) {} }
      if (cnt > scopeClimbMax) scopeClimbMax = cnt;
      if (cnt >= 3) { best = node; break; }
    }
    cachedScope = best;
    return cachedScope;
  }
  function matchesKnownContainer(bubble) {
    var sels = knownContainerSels();
    for (var i = 0; i < sels.length; i++) { try { if (bubble.matches && bubble.matches(sels[i])) return true; } catch (e) {} }
    return false;
  }

  // 候选文本节点数：当前平台 cfg.texts 在 node 子树内的命中数
  function candidateTextCount(node) {
    try {
      var cfg = currentCfg();
      if (!cfg || !cfg.texts || !cfg.texts.length || !node || !node.querySelectorAll) return 0;
      return node.querySelectorAll(cfg.texts.join(',')).length;
    } catch (e) { return 0; }
  }

  // 会话区解析级联（3.6.9）：needScope 门与通用 scope 门共用，结果带 3 秒缓存。
  // 一级 containers：conversationScope()——输入框向上找含 ≥3 已知容器的祖先；
  //   结构浅的页面工作正常，保持原样不动。
  // 二级 candidate：真实 Meta 页面 DOM 深（共同祖先在 12 层以上）、线程消息未必是
  //   已知容器，一级必空——改为从输入框向上一直爬到 body，取含 ≥3 个候选文本
  //   节点的最小祖先（全程达不到 3 时降级取含 ≥1 的最小祖先）。
  // 三级 height：原 applyOverlay 内的高度兜底（>40% 视口、≤8 层、取最高合格者），
  //   3.6.9 起加条件：祖先必须含 ≥1 个候选文本节点，杜绝选到输入框所在的独立面板。
  function resolveScope() {
    var now = Date.now();
    if (rScopeEl && rScopeEl.isConnected && now - rScopeAt < 3000) return rScopeEl;
    if (!rScopeEl && rScopeAt && now - rScopeAt < 3000) return null;
    rScopeAt = now; rScopeEl = null; rScopeStrategy = null;
    var s1 = conversationScope();
    if (s1) { rScopeEl = s1; rScopeStrategy = 'containers'; return s1; }
    var input = findComposerEl();
    if (!input) return null;
    try {
      var node = input, best3 = null, best1 = null;
      while (node && node.parentElement) {
        node = node.parentElement;
        var cc = candidateTextCount(node);
        if (cc >= 1 && !best1) best1 = node;
        if (cc >= 3) { best3 = node; break; }
        if (node === document.body) break;
      }
      if (best3 || best1) { rScopeEl = best3 || best1; rScopeStrategy = 'candidate'; return rScopeEl; }
    } catch (e) {}
    try {
      var hn = input, hBest = null, climb = 0;
      while (hn && hn !== document.body && climb < 8) {
        hn = hn.parentElement; climb++;
        if (!hn) break;
        var hr = null;
        try { hr = hn.getBoundingClientRect(); } catch (e2) {}
        if (hr && hr.height > window.innerHeight * 0.4 && candidateTextCount(hn) >= 1) hBest = hn;
      }
      if (hBest) { rScopeEl = hBest; rScopeStrategy = 'height'; return hBest; }
    } catch (e) {}
    return null;
  }

  function applyOverlay(bubble) {
    if (!enabled) { noteSkip('disabled'); return; }
    // 平台严格模式（如 WhatsApp）：只处理会话区（scope）内、本身就是消息容器的气泡；
    // 会话列表行/落地页元素被塞译文盒会溢出重叠，一律不碰
    try {
      var sc = currentCfg();
      if (sc && sc.strict) {
        if (sc.scope && !(bubble.closest && bubble.closest(sc.scope))) { noteSkip('strict-scope'); return; }
        var okC = false;
        var scs = sc.containers || [];
        for (var si = 0; si < scs.length; si++) { try { if (bubble.matches && bubble.matches(scs[si])) { okC = true; break; } } catch (e) {} }
        if (!okC) { noteSkip('strict-not-container'); return; }
      }
    } catch (e) {}
    // needScope 平台（Meta 系）：必须落在会话区内才翻——列表页预览文本结构与消息相同，无此门必误译；
    // 会话区由 resolveScope() 级联解析（containers → candidate → height，见其注释，3.6.9）
    try {
      var nc = currentCfg();
      if (nc && nc.needScope) {
        var nsc = resolveScope();
        if (!nsc || !nsc.contains(bubble)) { noteSkip('scope-block'); return; }
      }
    } catch (e) {}
    // 通用会话区限定（全平台）：有输入框时只处理会话区内的气泡；
    // 没打开会话（无输入框）时，只认带明确消息类名的气泡。
    // scopeFree 平台（如新版 Instagram）：文本选择器天然只命中消息（列表预览是
    // 别的标签），无需会话区限定，直接放行。
    try {
      var gc0 = currentCfg();
      if (!(gc0 && gc0.scopeFree) && !matchesKnownContainer(bubble)) {
        var scp2 = resolveScope();
        if (scp2) { if (!scp2.contains(bubble)) { noteSkip('gen-scope-block'); return; } }
        else { noteSkip('no-scope-unknown'); return; }
      }
    } catch (e) {}
    // 已有译文时：检查气泡文本是否变化（虚拟列表会复用 DOM 节点，文本变了要重新翻译）
    var existingOverlay = bubble.querySelector('[data-scrm="trans-overlay"]');
    var content = bubbleText(bubble);
    if (!content) { noteSkip('empty-text'); return; }
    // 列表页/整页容器误判防护：内部套着多个消息容器、子树庞大或文本行数离谱的，
    // 是会话列表/整页容器而非单条消息（曾把 Telegram 整个会话列表当一条消息翻译：污染历史且白烧额度）
    var isContainer = false;
    try {
      var csN = (currentCfg() && currentCfg().containers) || [];
      var nNested = 0;
      for (var ni = 0; ni < csN.length; ni++) { nNested += bubble.querySelectorAll(csN[ni]).length; }
      if (nNested >= 3) isContainer = true;
      if (!isContainer && bubble.querySelectorAll('*').length > 400) isContainer = true;
      if (!isContainer && content.split('\n').length > 80) isContainer = true;
    } catch (e) {}
    if (isContainer) { noteSkip('is-container'); return; }
    if (existingOverlay) {
      var prevText = safe(function () { return bubble.getAttribute('data-scrm-trans-src'); }, '');
      if (prevText === content) return; // 文本没变，跳过
      // 文本变了：移除旧译文，重新翻译
      safe(function () { existingOverlay.remove(); bubble.removeAttribute('data-scrm-trans-src'); }, null);
    }
    // 祖先已挂译文则跳过（防嵌套重复）——只认本身是气泡容器的祖先；
    // 共享列表容器/页面容器下挂着的译文节点不能把全部气泡误判为嵌套（曾导致 dup 误杀全部气泡）
    var p = bubble.parentElement, dup = false;
    var contSels = [];
    try { var cc = currentCfg(); contSels = (cc && cc.containers) || bubbleSelectors || []; } catch (e) {}
    while (p && p !== document.documentElement) {
      var isBubbleAnc = false;
      for (var ci2 = 0; ci2 < contSels.length; ci2++) { try { if (p.matches && p.matches(contSels[ci2])) { isBubbleAnc = true; break; } } catch (e) {} }
      if (isBubbleAnc && p.querySelector && p.querySelector(':scope > [data-scrm="trans-overlay"]')) { dup = true; break; }
      p = p.parentElement;
    }
    if (dup) { noteSkip('dup-ancestor'); return; }
    // 翻译中的气泡打标记，避免并发重复请求同一文本
    if (safe(function () { return bubble.getAttribute('data-scrm-trans-pending'); }, null)) { noteSkip('in-pending'); return; }
    // 纯日期文本不翻译
    if (/^(today|yesterday|今天|昨天)$/i.test(content.trim())) { noteSkip('date-text'); return; }
    // 月份+日期格式不翻译（如 "September 30"）
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}$/i.test(content.trim())) { noteSkip('date-text'); return; }
    // Telegram 系统服务消息不翻译（如自动删除通知）
    if (/set messages to auto-delete|disabled the auto-delete|enabled the auto-delete|将消息设置为.*自动删除|禁用自动删除/i.test(content)) { noteSkip('system-msg'); return; }
    // 已译快速通道（3.6.10）：src 属性与原文一致、译文还在缓存里时——
    // 译文盒可能已被 refresh 清理段或页面重渲染摘掉，直接同步补绘，不发请求、不占并发槽。
    // 原逻辑把「已译」判定挂在 overlay 元素存在上：盒子一被摘，气泡每轮都靠缓存命中
    // 补绘，而缓存命中的 Promise 异步落定，同步的一轮扫描里会假占满全部并发槽，
    // 排在后面的真未译气泡每轮撞 inflight-full、永久饿死（真机实测 req 冻结、fail=0）。
    var srcAttr = safe(function () { return bubble.getAttribute('data-scrm-trans-src'); }, '');
    if (srcAttr && srcAttr === content && transCache[content]) {
      if (!existingOverlay) paintTranslation(bubble, content, transCache[content]);
      return;
    }
    if (inFlight >= 6) {
      noteSkip('inflight-full');
      // 3.6.10：满载不再直接丢弃——入队，槽位腾出时由 drainQueue 补翻
      if (transQueue.indexOf(bubble) < 0) transQueue.push(bubble);
      return;
    }
    inFlight++;
    safe(function () {
      bubble.setAttribute('data-scrm-trans-pending', '1');
      bubble.setAttribute('data-scrm-trans-pending-at', String(Date.now()));
    }, null);
    markKeyword(bubble, content);
    // 真实通道：按翻译设置通道分流（谷歌免费 / DeepL / 大模型API），见 translateReal
    translateReal(content).then(function (translated) {
      inFlight--;
      safe(function () {
        if (bubble.removeAttribute) {
          bubble.removeAttribute('data-scrm-trans-pending');
          bubble.removeAttribute('data-scrm-trans-pending-at');
        }
      }, null);
      // 槽位已腾出：先补翻排队中的气泡，再处理自己这条的绘制
      try { drainQueue(); } catch (e) {}
      if (!translated) { noteSkip('trans-empty'); return; }
      if (!enabled) return;
      if (!bubble.isConnected) return;
      paintTranslation(bubble, content, translated);
    });
  }

  // 把译文绘进气泡（3.6.10 从 applyOverlay 的请求回调里抽出，已译补绘与新译共用）：
  // 记录源文本（虚拟列表 DOM 复用时的变化检测）→ 优先插到文字元素内原文正下方，
  // 找不到插入点时兜底追加到气泡末尾。
  function paintTranslation(bubble, content, translated) {
    // 记录翻译源文本，用于虚拟列表 DOM 复用时的变化检测
    safe(function () { bubble.setAttribute('data-scrm-trans-src', content); }, null);
      // 直接把译文追加到文字元素内部，确保在气泡里面、原文正下方
      // 用 <br> + 行内元素，避免块级 div 在行内文本容器中布局错乱
      // 修复（2026-10-31）：插入点必须优先用各平台自己的 cfg.texts（如 Meta 系的
      // div[dir="auto"]、X 的 [data-testid=tweetText]），之前写死用通用 textSelectors，
      // 非 WA/TG 平台永远匹配不上，只能走气泡末尾兜底（位置错乱/不显示）。
      var inserted = safe(function () {
        var insSels = (currentCfg() && currentCfg().texts) ? currentCfg().texts.concat(textSelectors) : textSelectors;
        for (var i = 0; i < insSels.length; i++) {
          var tel = bubble.querySelector(insSels[i]);
          if (tel && !tel.querySelector('[data-scrm="trans-overlay"]')) {
            // 照抄参考格式：虚线分隔 + 品牌 + 译文（块级 div）
            var box = document.createElement('div');
            box.className = 'scrm-trans-overlay';
            box.setAttribute('data-scrm', 'trans-overlay');
            var trans = document.createElement('div');
            trans.className = 'scrm-trans-text';
            trans.setAttribute('data-scrm', 'trans-overlay');
            trans.textContent = translated;
            styleTransEl(trans);
            box.appendChild(trans);
            // 找到时间戳，插到它前面
            // Telegram Web K 真实结构：span.time 是 div.message 的直接子节点（稳定类名，
            // 内含 SVG 已读勾 + 时间文本），优先用 :scope > .time 精确命中
            var timeEl = null;
            try { timeEl = tel.querySelector(':scope > span.time, :scope > .time'); } catch (e) {}
            if (!timeEl) timeEl = tel.querySelector('.time, .message-time, span.time, .time-inner, [class*="time"]');
            if (!timeEl && tel.parentElement) {
              try { timeEl = tel.parentElement.querySelector(':scope > .time, :scope > .message-time, :scope > span.time, :scope > .time-inner, :scope > [class*="time"]'); } catch (e) {}
            }
            if (timeEl && timeEl.parentNode === tel) {
              tel.insertBefore(box, timeEl);
            } else {
              tel.appendChild(box);
            }
            // 已读勾保留显示（2026-11-20 用户要求恢复；原「小勾隐藏」逻辑已移除）
            return true;
          }
        }
        return false;
      }, false);
      if (!inserted) safe(function () {
        // 兜底：追加到气泡末尾（照抄参考格式）
        var box2 = document.createElement('div');
        box2.className = 'scrm-trans-overlay';
        box2.setAttribute('data-scrm', 'trans-overlay');
        var trans2 = document.createElement('div');
        trans2.className = 'scrm-trans-text';
        trans2.setAttribute('data-scrm', 'trans-overlay');
        trans2.textContent = translated;
        styleTransEl(trans2);
        box2.appendChild(trans2);
        bubble.appendChild(box2);
      }, null);
  }

  function refresh() {
    try {
      var cs = [];
      try { var cc2 = currentCfg(); cs = (cc2 && cc2.containers) || bubbleSelectors || []; } catch (e) {}
      if (cs.length) {
        var sel = cs.join(',');
        document.querySelectorAll('[data-scrm="trans-overlay"]').forEach(function (bx) {
          try { if (!bx.closest(sel) || (cc2 && cc2.scope && !bx.closest(cc2.scope))) bx.remove(); } catch (e) {}
        });
      }
    } catch (e) {}
    reclaimStalePending(); // 3.6.10：先回收孤儿 pending，免得死标记把气泡永久挡在门外
    var __bubbles = findBubbles();
    diagStats.bubbles = __bubbles.length;
    __bubbles.forEach(applyOverlay);
    try { drainQueue(); } catch (e) {} // 3.6.10：本轮过后若有空槽，补翻排队气泡
    restoreTimes(); // 把历史版本误藏的时间恢复到可见
  }

  // 恢复被旧版本隐藏的发送时间（data-scrm-hidden = time/ts/time-row）
  function restoreTimes() {
    try {
      var els = document.querySelectorAll('[data-scrm-hidden]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var mark = el.getAttribute('data-scrm-hidden');
        if (mark !== 'time' && mark !== 'ts' && mark !== 'time-row') continue;
        el.style.removeProperty('display');
        el.style.removeProperty('visibility');
        el.style.removeProperty('height');
        el.style.removeProperty('overflow');
        el.removeAttribute('data-scrm-hidden');
      }
    } catch (e) {}
  }

  // 深色主题判定（Telegram Web K 的 <html class="theme-dark"> / body.night）
  function isDarkPage() {
    try {
      var h = document.documentElement, b = document.body;
      var cls = ((h && h.className) || '') + ' ' + ((b && b.className) || '');
      if (/theme-dark|night|dark/i.test(cls)) return true;
      var bg = getComputedStyle(b).backgroundColor || '';
      var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3 < 110;
    } catch (e) {}
    return false;
  }
  // 直接把卡片样式写成内联（!important）：不依赖注入 CSS，任何主题/页面结构都能生效
  function paintCard(card) {
    if (!card || !card.classList || !card.classList.contains('scrm-trans-overlay')) return;
    var dark = isDarkPage();
    var set = function (k, v) { try { card.style.setProperty(k, v, 'important'); } catch (e) {} };
    set('margin', '7px 0 2px');
    set('padding', '6px 0 2px');
    set('background', 'transparent');
    set('border', 'none');
    set('border-top', dark ? '1px dashed rgba(255,255,255,0.22)' : '1px dashed rgba(0,0,0,0.18)');
    set('border-left', 'none');
    set('border-radius', '0');
    set('box-shadow', 'none');
    set('box-sizing', 'border-box');
    set('display', 'block');
    set('width', 'auto');
    set('max-width', '100%');
  }
  // 译文样式（版本三）：左侧竖线 + 颜色稍深保证可读
  function styleTransEl(trans) {
    // 卡片本体一律内联上色（不依赖注入 CSS，避免 Telegram 主题/样式表把它盖掉导致"没变化"）
    try { paintCard(trans.parentElement); } catch (e0) {}
    if (styleCustomized) {
      trans.style.setProperty('font-size', style.size + 'px', 'important');
      trans.style.setProperty('line-height', '1.6', 'important');
      trans.style.setProperty('color', style.color, 'important');
    } else {
      trans.style.setProperty('font-size', '13px', 'important');
      trans.style.setProperty('line-height', '1.65', 'important');
      trans.style.setProperty('color', isDarkPage() ? '#cdd6e4' : '#3d5a80', 'important');
    }
  }

  function restyle() {
    // 颜色/字号变化时：把新样式重刷到已存在的译文文本元素上
    // 只刷 .scrm-trans-text（译文本体），不碰外层盒子和关键词徽章；
    // 统一走 styleTransEl，保证与新建译文同一套优先级逻辑
    safe(function () {
      Array.prototype.forEach.call(
        document.querySelectorAll('.scrm-trans-text'),
        function (el) { styleTransEl(el); }
      );
    }, null);
  }

  // DOM 变化时增量扫描（节流）
  var timer = null;

  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      refresh();
      // 会话列表/当前会话上报跟着页面变化走（上报内部有去重，不会刷屏）
      try { reportChats(); } catch (e) {}
      try { reportOpenChat(); } catch (e) {}
    }, 800);
  }
  safe(function () {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true,
    });
  }, null);
  setInterval(function () { if (enabled) refresh(); }, 5000);
  // 兜底重扫（3.6.10）：15 秒一轮，只在「页面可见且确有未译气泡」时才真正干活——
  // 页面隐藏、全译完都不空转。专治各种「被跳过后没人再喊它」的静默落下：
  // 回收孤儿 pending、补翻排队、仍有没挂译文的气泡就整页重扫一次。
  setInterval(function () {
    try {
      if (!enabled || document.hidden) return;
      reclaimStalePending();
      drainQueue();
      if (inFlight > 0) return; // 还有请求在飞，队列会在落定时自己 drain
      var bs = findBubbles();
      for (var i = 0; i < bs.length; i++) {
        if (bs[i] && bs[i].querySelector && !bs[i].querySelector('[data-scrm="trans-overlay"]')) { refresh(); return; }
      }
    } catch (e) {}
  }, 15000);
  // 语音气泡的「转文字」按钮：独立节流，跟翻译开关无关（关掉翻译也可能只是想听写）
  setInterval(function () { ensureVoiceButtons(); }, 4000);
  setInterval(function () { ensureImgButtons(); }, 4000);


  // 当前平台标识：宿主经 setTransConfig 下发；没下发时从网址自动识别
  var profilePlatformKey = '';
  safe(function () {
    var href = String(location.href || '').toLowerCase();
    if (/telegram|t\.me|webk/i.test(href)) profilePlatformKey = 'telegram';
    else if (/whatsapp/i.test(href)) profilePlatformKey = 'whatsapp';
    else if (/line\.biz/i.test(href)) profilePlatformKey = /manager|account/i.test(href) ? 'linebiz' : 'line';
    else if (/instagram/i.test(href)) profilePlatformKey = 'instagram';
    else if (/messenger/i.test(href)) profilePlatformKey = 'messenger';
    else if (/business\.facebook/i.test(href)) profilePlatformKey = 'metabiz';
    else if (/facebook/i.test(href)) profilePlatformKey = 'facebook';
    else if (/tiktok/i.test(href)) profilePlatformKey = 'tiktok';
    else if (/(^|\/\/|www\.)x\.com|twitter/i.test(href)) profilePlatformKey = 'x';
    else if (/zalo/i.test(href)) profilePlatformKey = 'zalo';
    else if (/textnow/i.test(href)) profilePlatformKey = 'textnow';
    else if (/messages\.google/i.test(href)) profilePlatformKey = 'gmessages';
    else if (/voice\.google/i.test(href)) profilePlatformKey = 'gvoice';
    else if (/chat\.google/i.test(href)) profilePlatformKey = 'gchat';
    else if (/snapchat/i.test(href)) profilePlatformKey = 'snapchat';
  }, null);

  // ================= 真实聊天列表（会话管理面板用） =================
  // 只取名字 + 类型（私聊/群聊） + 未读数，绝不伪造号码/ID。
  // 提不到（未登录/结构变化）就返回空数组，host 显示空状态，绝不用 mock 填充。
  function extractChats() {
    return safe(function () {
      var out = [];
      if (profilePlatformKey === 'telegram') {
        // Telegram K：左侧 .chatlist，行内 .dialog-title 为名，data-peer-id 负数为群组/频道
        var list = document.querySelector('.chatlist');
        if (!list) return [];
        var rows = list.querySelectorAll('.row, .dialog, [data-peer-id]');
        for (var i = 0; i < rows.length && out.length < 100; i++) {
          var row = rows[i];
          var titleEl = row.querySelector('.dialog-title, .peer-title');
          var name = titleEl ? (titleEl.innerText || titleEl.textContent || '').trim().split('\n')[0].trim() : '';
          if (!name) continue;
          var peerId = row.getAttribute('data-peer-id') || '';
          var isGroup = (peerId && parseInt(peerId, 10) < 0) ||
            !!row.querySelector('.icon-group, .is-group, [data-icon="group"]');
          var badge = row.querySelector('.badge, .unread-badge');
          var unread = 0;
          if (badge) {
            var bt = (badge.innerText || badge.textContent || '').trim();
            var n = parseInt(bt, 10);
            if (!isNaN(n)) unread = n; else if (bt) unread = 1;
          }
          out.push({ id: 'tg-' + (peerId || i) + '-' + name, name: name.slice(0, 64), kind: isGroup ? 'group' : 'private', unread: unread });
        }
        return out;
      }
      // 其他平台：暂无可靠的聊天列表结构，返回空（显示空状态，不伪造）
      return [];
    }, []);
  }
  var lastChatsSent = '';
  function reportChats() {
    if (!ipc) return;
    var chats = extractChats();
    var key = JSON.stringify(chats.map(function (c) { return c.id + ':' + c.name + ':' + c.unread; }));
    if (key === lastChatsSent) return;
    lastChatsSent = key;
    try { ipc.sendToHost('scrm:chats', { chats: chats }); } catch (e) {}
  }
  setInterval(function () { reportChats(); }, 10000);

  // ================= 当前打开的聊天对象（用户画像面板用） =================
  // 注意：这是联系人（当前正在聊天的对象），与本人资料回填严格区分。
  // 识别不到就返回 null，画像面板显示空占位，绝不填别人的。
  function detectOpenChat() {
    return safe(function () {
      if (profilePlatformKey === 'whatsapp') {
        // WhatsApp：打开的会话在 #main 顶部栏，联系人名在 header 的 span[title] 上
        var wmn = document.querySelector('#main');
        if (wmn) {
          var whs = wmn.querySelectorAll('header span[title]');
          for (var wi = 0; wi < whs.length; wi++) {
            var wt = String(whs[wi].getAttribute('title') || '').trim();
            if (wt && wt.length > 1 && wt.length < 80) return { name: wt.slice(0, 64), peerId: '' };
          }
        }
        return null;
      }
      if (profilePlatformKey === 'telegram' || profilePlatformKey === 'telegramk') {
        // 优先：聊天列表中高亮的活跃行（tweb 当前打开的会话行带 active 类）
        var activeRow = document.querySelector('.chatlist .row.active, .chatlist .active, .chatlist [data-peer-id].active');
        if (activeRow) {
          var t = activeRow.querySelector('.dialog-title, .peer-title');
          var nm = t ? (t.innerText || t.textContent || '').trim().split('\n')[0].trim() : '';
          if (nm) {
            return { name: nm.slice(0, 64), peerId: activeRow.getAttribute('data-peer-id') || '' };
          }
        }
        // 兜底1：中间列聊天头（多种可能的选择器）
        var headerSels = [
          '.chat-info .peer-title',
          '.chat-header .peer-title',
          '.im-header .peer-title',
          'header .peer-title'
        ];
        for (var hi = 0; hi < headerSels.length; hi++) {
          var h = document.querySelector(headerSels[hi]);
          if (h) {
            var hn = (h.innerText || h.textContent || '').trim().split('\n')[0].trim();
            if (hn && hn.length > 0 && hn.length < 100) return { name: hn.slice(0, 64), peerId: '' };
          }
        }
        // 兜底2：页面标题（Telegram Web 会把聊天名放在 title 里）
        var docTitle = (document.title || '').trim();
        docTitle = docTitle.replace(/\s*[–—-]\s*Telegram.*$/i, '').replace(/\s*Telegram\s*Web\s*$/i, '').trim();
        if (docTitle && docTitle.length > 0 && docTitle.length < 100 && !/telegram/i.test(docTitle)) {
          return { name: docTitle.slice(0, 64), peerId: '' };
        }
      }
      return null;
    }, null);
  }
  var lastOpenChatSent = '';
  function reportOpenChat() {
    if (!ipc) return;
    var oc = detectOpenChat();
    var key = oc ? (oc.peerId + '|' + oc.name) : '';
    if (key === lastOpenChatSent) return;
    lastOpenChatSent = key;
    try { ipc.sendToHost('scrm:open-chat', oc || { name: '', peerId: '' }); } catch (e) {}
  }
  setInterval(function () { reportOpenChat(); }, 7000);

  // ================= 翻译状态条（访客页顶部，对标原版） =================
  // 宿主推送：{ showBar, barText, inputPh, auto, targetLang, keywords }
  // 发送相关的开关（noZh / trPreview / send* 等）都在主进程处理，页内不再保存
  var transCfg = {
    showBar: true, barText: '', inputPh: '',
    auto: true, targetLang: '',
    channel: '', sendChannel: '', hasKey: false,
    keywords: []
  };
  var transBar = null;
  function ensureTransBar() {
    if (transBar && transBar.isConnected) return transBar;
    transBar = document.createElement('div');
    transBar.setAttribute('data-scrm', 'trans-bar');
    transBar.style.cssText =
      'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'background:rgba(255,255,255,.96);border:1px solid #e0e0e0;border-radius:16px;' +
      'padding:4px 14px;font-size:12px;color:#333;box-shadow:0 2px 8px rgba(0,0,0,.12);' +
      'pointer-events:none;white-space:nowrap;font-family:sans-serif;';
    safe(function () { document.documentElement.appendChild(transBar); }, null);
    return transBar;
  }
  function renderTransBar() {
    if (!transCfg.showBar || !transCfg.barText) {
      if (transBar) transBar.style.display = 'none';
      return;
    }
    var bar = ensureTransBar();
    bar.style.display = '';
    if (bar.textContent !== transCfg.barText) bar.textContent = transCfg.barText;
  }

  // ================= 输入框占位 =================
  // 注入一条 CSS：空的聊天输入框显示"输入消息[自动翻译已开启]"
  var phStyleEl = null;
  function applyInputPlaceholder() {
    if (!transCfg.inputPh) return;
    if (!phStyleEl) {
      phStyleEl = document.createElement('style');
      phStyleEl.setAttribute('data-scrm', 'trans-ph');
      safe(function () { document.head.appendChild(phStyleEl); }, null);
    }
    var ph = transCfg.inputPh.replace(/"/g, '');
    phStyleEl.textContent =
      '[data-scrm-chat-input]:empty:before{content:"' + ph + '";color:#999;pointer-events:none;}';
    // 给疑似聊天输入框打标记（节流执行，避免每键都扫全页）
    safe(function () {
      var cands = document.querySelectorAll(
        'div[contenteditable="true"][data-lexical-editor], div[contenteditable="true"].selectable-text, ' +
        'div[contenteditable="true"][role="textbox"], textarea[data-testid*="chat"], input[data-testid*="chat"]'
      );
      Array.prototype.forEach.call(cands, function (el) {
        // 只认底部的大输入框（消息编辑框）；顶部搜索框等摘掉标记，
        // 免得宿主找输入框时抓错（WhatsApp 搜索框也是 contenteditable）
        var ok = false;
        try {
          var r = el.getBoundingClientRect();
          ok = r.height > 20 && r.width > 200 && r.top > window.innerHeight * 0.4;
        } catch (e) {}
        if (ok) { if (!el.hasAttribute('data-scrm-chat-input')) el.setAttribute('data-scrm-chat-input', '1'); }
        else if (el.hasAttribute('data-scrm-chat-input')) el.removeAttribute('data-scrm-chat-input');
      });
    }, null);
  }
  setInterval(function () { applyInputPlaceholder(); renderTransBar(); }, 4000);

  // 发送翻译统一由主进程 before-input-event 钩子处理；模板只保留接收翻译。
  // （模板内原有的回车拦截整套已删除：曾与主进程钩子打架，是 WhatsApp 空气泡的根源。）

  // ================= 真实翻译桥 =================
  // 页内只负责发起请求 + 回填译文，真正走哪个通道由宿主决定
  var pendingTrans = {};
  var inFlight = 0;
  var transReqId = 0;
  var transCache = {};
  // 并发满载时的等待队列（3.6.10）：被 inflight-full 跳过的气泡进这里，
  // 任一请求落定腾出槽位就 drainQueue 补翻——不许静默落下
  var transQueue = [];
  var transDraining = false;
  function drainQueue() {
    if (transDraining) return;
    transDraining = true;
    try {
      while (inFlight < 6 && transQueue.length) {
        var b = transQueue.shift();
        if (!b || !b.isConnected) continue;
        try { if (b.querySelector && b.querySelector('[data-scrm="trans-overlay"]')) continue; } catch (e) {}
        applyOverlay(b);
      }
    } catch (e) {}
    transDraining = false;
  }
  // 孤儿 pending 回收（3.6.10）：请求通道自带 25 秒兜底超时，pending 标记活过 30 秒
  // 说明那次尝试已经死掉（回调丢失/节点被页面换掉），摘掉标记让气泡重新走流程；
  // 没有时间戳的旧标记（升级前残留）同样回收
  function reclaimStalePending() {
    try {
      var els = document.querySelectorAll('[data-scrm-trans-pending]');
      var now = Date.now();
      for (var i = 0; i < els.length; i++) {
        var at = parseInt(els[i].getAttribute('data-scrm-trans-pending-at') || '0', 10);
        if (!at || now - at > 30000) {
          els[i].removeAttribute('data-scrm-trans-pending');
          els[i].removeAttribute('data-scrm-trans-pending-at');
        }
      }
    } catch (e) {}
  }
  // 今日统计上报（2026-10-31）：每次翻译完成上报成功/失败 + 平台 + 耗时，
  // 主进程按天累加，主页「今日概览 / 翻译节点」读出来展示。只统计本机，不外传。
  function bumpStat(ok, ms) {
    try {
      if (!ipc || !ipc.send) return;
      var payload = { ok: !!ok, platform: profilePlatformKey || 'unknown' };
      if (ms > 0) payload.ms = ms;
      ipc.send('yichat:stat', payload);
    } catch (e) {}
  }
  // silent = 测速用的探测翻译：不计入今日统计，也不影响诊断计数
  function requestTranslate(text, targetLang, silent) {
    return new Promise(function (resolve) {
      if (!ipc) { if (!silent) diagStats.transFail++; noteSkip('no-ipc'); resolve({ ok: false }); return; }
      var id = ++transReqId;
      var t0 = Date.now();
      if (!silent) diagStats.transReq++;
      pendingTrans[id] = function (res) {
        var ms = Date.now() - t0;
        if (res && res.ok) {
          if (!silent) { diagStats.transOk++; bumpStat(true, ms); }
        } else if (!silent) {
          diagStats.transFail++;
          bumpStat(false, 0);
          if (diagStats.transFail % 3 === 1) noteSkip('trans-fail');
        }
        resolve(res);
      };
      try {
        ipc.sendToHost('scrm:translate-req', { reqId: id, text: text, targetLang: targetLang });
      } catch (e) { delete pendingTrans[id]; resolve({ ok: false }); return; }
      setTimeout(function () {
        if (pendingTrans[id]) { delete pendingTrans[id]; resolve({ ok: false }); }
      }, 25000);
    });
  }
  function deliverTranslation(reqId, ok, text) {
    var r = pendingTrans[reqId];
    if (r) { delete pendingTrans[reqId]; r({ ok: !!ok, text: text || '' }); }
  }
  // ============ 翻译通道 ============
  // 通道（谷歌 / DeepL / 大模型API）与代理都由宿主主进程决定，页内只转发请求
  // 谷歌免费翻译（gtx 接口，无需 Key）。跑在 webview 访客页里，
  // 网络请求自动走该会话的代理配置；全程 try/catch，失败返回空字符串。
  function cacheTranslation(t, translated) {
    transCache[t] = translated;
    // 缓存上限，避免长会话内存膨胀
    var keys = Object.keys(transCache);
    if (keys.length > 300) delete transCache[keys[0]];
  }
  // 真实翻译（带缓存）：统一走宿主 IPC，由主进程按平台配置的通道/代理请求
  function translateReal(text) {
    var t = String(text || '').trim();
    if (!t) return Promise.resolve('');
    if (transCache[t]) return Promise.resolve(transCache[t]);
    // 页内 fetch 会被 CORS 拦截（translate.google.com 无 ACAO 头），直接走宿主 IPC，
    // 由主进程经该账号代理请求，不受 CORS 限制
    return requestTranslate(t, transCfg.targetLang).then(function (r) {
      if (r && r.ok && r.text) { cacheTranslation(t, r.text); return r.text; }
      return '';
    });
  }

  // ================= 页内工具箱（2026-11-01）：语音转文字 =================
  // 宿主（会话页右侧工具栏）通过 webview.send 下发指令，这里回 sendToHost。
  // 只读页面已有的 DOM，不碰平台自己的 React/Vue 状态。

  (function injectToolStyle() {
    try {
      var css = ''
        + '.scrm-voice-btn{display:inline-flex;align-items:center;gap:3px;margin:6px 0 0;padding:2px 8px;'
        + 'font-size:11px;line-height:1.6;color:#3d4451;background:rgba(0,0,0,.05);'
        + 'border:1px solid rgba(0,0,0,.14);border-radius:10px;cursor:pointer;font-family:inherit}'
        + '.scrm-voice-btn:hover{background:rgba(0,0,0,.1)}'
        + '.scrm-voice-text{margin-top:4px;padding:4px 8px;font-size:13px;line-height:1.6;color:#262626;'
        + 'background:rgba(0,0,0,.04);border-left:2px solid #005dff;border-radius:4px;white-space:pre-wrap;'
        + 'word-break:break-word}';
      var st = document.createElement('style');
      st.id = 'scrm-tool-style';
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  })();

  // —— 语音消息转文字：语音没法直接翻译，必须先落成文本
  var voiceReqId = 0;
  var pendingVoice = {};

  function voiceHosts() {
    return safe(function () {
      var out = [];
      var auds = document.querySelectorAll('audio');
      for (var i = 0; i < auds.length; i++) {
        var a = auds[i];
        var src = a.currentSrc || a.getAttribute('src') || a.src || '';
        if (!src) continue;
        try { if (a.closest('[data-scrm]')) continue; } catch (e) {}
        var host = null;
        try {
          host = a.closest('.message-in, .message-out, .bubble, [data-testid="msg-container"], [class*="message"], [class*="bubble"]');
        } catch (e2) {}
        if (!host) host = a.parentElement;
        if (!host) continue;
        out.push({ audio: a, host: host, src: src });
      }
      return out;
    }, []);
  }

  function ensureVoiceButtons() {
    try {
      var list = voiceHosts();
      for (var i = 0; i < list.length; i++) {
        var host = list[i].host;
        if (!host || !host.querySelector) continue;
        if (host.querySelector('.scrm-voice-btn')) continue;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scrm-voice-btn';
        btn.setAttribute('data-scrm', 'tool-ui');
        btn.textContent = '转文字';
        (function (h, au, b) {
          b.addEventListener('click', function (ev) {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
            askTranscribe(au, h, b);
          });
        })(host, list[i].audio, btn);
        host.appendChild(btn);
      }
      // Telegram Web K：语音气泡里没有 <audio> 标签（播放器是全局的），
      // 改按气泡里的播放器结构挂按钮，点击时点它的播放键、从资源记录里抓刚加载的音频。
      var tg = tgVoiceHosts();
      for (var j = 0; j < tg.length; j++) {
        var thost = tg[j].host;
        if (!thost || !thost.querySelector) continue;
        if (thost.querySelector('.scrm-voice-btn')) continue;
        var tbtn = document.createElement('button');
        tbtn.type = 'button';
        tbtn.className = 'scrm-voice-btn';
        tbtn.setAttribute('data-scrm', 'tool-ui');
        tbtn.textContent = '转文字';
        (function (h, tgEl, b) {
          b.addEventListener('click', function (ev) {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
            askTranscribeTg(h, tgEl, b);
          });
        })(thost, tg[j].toggle, tbtn);
        // Web K 的 .bubble 是整行容器，按钮挂它会飘到行首（气泡外）；挂到 .audio 的父级
        // （气泡内容盒）里，落在波形下方、气泡内部（2026-11-20 用户截图点名优化）
        var tbox = thost;
        try {
          var au = tg[j].toggle.closest('.audio') || tg[j].toggle;
          if (au && au.parentElement) tbox = au.parentElement;
        } catch (e) {}
        tbox.appendChild(tbtn);
      }
    } catch (e) {}
  }

  function tgVoiceHosts() {
    return safe(function () {
      var out = [];
      var bubbles = document.querySelectorAll('.bubble');
      for (var i = 0; i < bubbles.length; i++) {
        var b = bubbles[i];
        try { if (b.closest('[data-scrm="trans-overlay"]')) continue; } catch (e) {}
        var toggle = b.querySelector('.audio .audio-toggle, .audio-toggle');
        if (!toggle) continue;
        // 只要带波形的（语音条/音频文件），排除视频圆圈等其它播放器
        if (!b.querySelector('.audio-waveform, .audio-waveform-bars, [class*="waveform"]')) continue;
        out.push({ host: b, toggle: toggle });
      }
      return out;
    }, []);
  }

  function blobToB64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var s = String(fr.result || '');
        var i = s.indexOf(',');
        resolve({ b64: i >= 0 ? s.slice(i + 1) : '', mime: blob.type || 'audio/ogg' });
      };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function encodeWav16(samples, rate) {
    var n = samples.length;
    var buffer = new ArrayBuffer(44 + n * 2);
    var v = new DataView(buffer);
    function wstr(off, str) { for (var i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); }
    wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7FFF, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  // 把语音统一转成 16kHz 单声道 WAV：whisper 接口收 wav，小米 MiMo 的对话式识别只收 wav/mp3
  // （Telegram/WhatsApp 的 ogg-opus 它不收）。解码失败或太长就返回 null，外层原样发送。
  function blobToWavData(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      var ac = new AC();
      return ac.decodeAudioData(buf).then(function (audio) {
        try { ac.close(); } catch (e) {}
        if (!audio || !audio.duration || audio.duration > 300) return null;
        var rate = 16000;
        var oc = new OfflineAudioContext(1, Math.max(1, Math.floor(audio.duration * rate)), rate);
        var node = oc.createBufferSource();
        node.buffer = audio;
        node.connect(oc.destination);
        node.start();
        return oc.startRendering().then(function (rendered) {
          var wav = encodeWav16(rendered.getChannelData(0), rate);
          if (!wav || wav.size > 12 * 1024 * 1024) return null;
          return blobToB64(wav);
        });
      }).catch(function () { try { ac.close(); } catch (e) {} return null; });
    }).catch(function () { return null; });
  }

  function audioToBase64(src) {
    return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
      return blobToWavData(blob).then(function (w) {
        return w || blobToB64(blob);
      }).catch(function () { return blobToB64(blob); });
    });
  }

  function askTranscribe(audio, host, btn) {
    if (btn.getAttribute('data-busy') === '1') return;
    if (!ipc) return;
    btn.setAttribute('data-busy', '1');
    btn.textContent = '识别中…';
    var out = host.querySelector('.scrm-voice-text');
    if (!out) {
      out = document.createElement('div');
      out.className = 'scrm-voice-text';
      out.setAttribute('data-scrm', 'tool-ui');
      host.appendChild(out);
    }
    out.textContent = '正在取音频…';
    var src = audio.currentSrc || audio.getAttribute('src') || audio.src || '';
    audioToBase64(src).then(function (d) {
      if (!d.b64) throw new Error('empty');
      var id = 'v' + (++voiceReqId);
      pendingVoice[id] = { btn: btn, out: out };
      out.textContent = '识别中…（首次可能要几秒）';
      ipc.sendToHost('yichat:voice-req', { reqId: id, b64: d.b64, mime: d.mime });
      setTimeout(function () {
        if (!pendingVoice[id]) return;
        delete pendingVoice[id];
        try { btn.removeAttribute('data-busy'); btn.textContent = '转文字'; } catch (e) {}
        out.textContent = '识别超时了，稍后再点一次';
      }, 60000);
    }).catch(function () {
      try { btn.removeAttribute('data-busy'); btn.textContent = '转文字'; } catch (e) {}
      out.textContent = '取不到这段语音（先点一下播放，等它加载完再试）';
    });
  }

  function askTranscribeTg(host, toggle, btn) {
    if (btn.getAttribute('data-busy') === '1') return;
    if (!ipc) return;
    btn.setAttribute('data-busy', '1');
    btn.textContent = '识别中…';
    var out = host.querySelector('.scrm-voice-text');
    if (!out) {
      out = document.createElement('div');
      out.className = 'scrm-voice-text';
      out.setAttribute('data-scrm', 'tool-ui');
      (btn.parentElement || host).appendChild(out);
    }
    out.textContent = '正在取音频…（会短暂播放一下）';
    // Telegram Web K 的播放器是全局的：真正的 <audio> 元素挂在页面一个隐藏容器里、
    // 不在气泡内。点这条的播放键后，去全页面找刚开始播/刚加载的那条 blob 音频。
    var snapshot = {};
    try {
      var a0 = document.querySelectorAll('audio, video');
      for (var i = 0; i < a0.length; i++) {
        var s0 = a0[i].currentSrc || a0[i].getAttribute('src') || a0[i].src || '';
        if (s0) snapshot[s0] = 1;
      }
    } catch (e) {}
    function fail(msg) {
      try { btn.removeAttribute('data-busy'); btn.textContent = '转文字'; } catch (e) {}
      out.textContent = msg;
    }
    function sendBlob(blob) {
      var conv = (typeof blobToWavData === 'function') ? blobToWavData(blob) : Promise.resolve(null);
      conv.then(function (w) { return w || blobToB64(blob); }).catch(function () { return blobToB64(blob); }).then(function (d) {
        if (!d || !d.b64) { fail('音频取到了但读不出来，再点一次试试'); return; }
        var id = 'v' + (++voiceReqId);
        pendingVoice[id] = { btn: btn, out: out };
        out.textContent = '识别中…（首次可能要几秒）';
        ipc.sendToHost('yichat:voice-req', { reqId: id, b64: d.b64, mime: d.mime });
        setTimeout(function () {
          if (!pendingVoice[id]) return;
          delete pendingVoice[id];
          try { btn.removeAttribute('data-busy'); btn.textContent = '转文字'; } catch (e) {}
          out.textContent = '识别超时了，稍后再点一次';
        }, 60000);
      }).catch(function () { fail('音频读不出来，再点一次试试'); });
    }
    function grab(media) {
      var url = '';
      try { url = media.currentSrc || media.getAttribute('src') || media.src || ''; } catch (e) {}
      try { media.pause(); } catch (e) {}
      if (!url) { fail('没抓到这段语音，再点一次试试'); return; }
      fetch(url).then(function (r) { return r.blob(); }).then(sendBlob).catch(function () {
        fail('取不到这段语音，再点一次试试');
      });
    }
    function findAudio() {
      var auds = document.querySelectorAll('audio, video');
      var playing = null, fresh = null, anyBlob = null;
      for (var i = 0; i < auds.length; i++) {
        var a = auds[i];
        var src = '';
        try { src = a.currentSrc || a.getAttribute('src') || a.src || ''; } catch (e) {}
        if (!src || src.indexOf('blob:') !== 0) continue;
        anyBlob = a;
        if (!a.paused) playing = a;
        if (!snapshot[src] && a.readyState >= 2) fresh = a;
      }
      return { playing: playing, fresh: fresh, anyBlob: anyBlob };
    }
    try { toggle.click(); } catch (e) { fail('点不到播放键，再试一次'); return; }
    var tries = 0;
    var reclicked = false;
    var iv = setInterval(function () {
      tries++;
      try {
        var f = findAudio();
        if (f.playing) { clearInterval(iv); grab(f.playing); return; }
        if (f.fresh) { clearInterval(iv); grab(f.fresh); return; }
        if (tries === 20 && !reclicked) {
          // 5 秒没动静：可能这条本来就在播、刚被我们的点击暂停了，再点一次让它继续播
          reclicked = true;
          try { toggle.click(); } catch (e) {}
          return;
        }
        if (tries > 44) {
          clearInterval(iv);
          if (f.anyBlob) { grab(f.anyBlob); return; }
          fail('没抓到这段语音（先手动点播放听一下，再点转文字）');
        }
      } catch (err) {}
    }, 250);
  }

  function deliverVoice(reqId, ok, text) {
    var p = pendingVoice[reqId];
    if (!p) return;
    delete pendingVoice[reqId];
    try { p.btn.removeAttribute('data-busy'); p.btn.textContent = '重新识别'; } catch (e) {}
    if (!ok || !text) { p.out.textContent = String(text || '识别失败'); return; }
    p.out.textContent = text;
    // 识别出来是外语：再按当前目标语言翻一层，等于「语音直接翻译」
    requestTranslate(text, transCfg.targetLang).then(function (r) {
      if (r && r.ok && r.text) p.out.textContent = text + '\n' + r.text;
    }).catch(function () {});
  }


  // —— 图片消息看懂：图里的外语文字/内容，点「看图」发给视觉模型出中文
  (function injectImgStyle() {
    try {
      var css = ''
        + '.scrm-img-btn{position:absolute;left:8px;bottom:8px;z-index:6;display:inline-flex;align-items:center;gap:3px;padding:3px 10px;'
        + 'font-size:11px;line-height:1.5;color:#fff;background:rgba(0,0,0,.55);'
        + 'border:1px solid rgba(255,255,255,.35);border-radius:11px;cursor:pointer;font-family:inherit}'
        + '.scrm-img-btn:hover{background:rgba(0,0,0,.78)}'
        + '.scrm-img-text{margin-top:4px;padding:4px 8px;font-size:13px;line-height:1.6;color:#262626;'
        + 'background:rgba(0,0,0,.04);border-left:2px solid #005dff;border-radius:4px;white-space:pre-wrap;'
        + 'word-break:break-word}'
        + '.scrm-img-text-out{background:#fff;border:1px solid rgba(0,0,0,.08);border-left:2px solid #005dff;'
        + 'box-shadow:0 1px 4px rgba(0,0,0,.12);margin:6px 0 2px}';
      var st = document.createElement('style');
      st.id = 'scrm-img-style';
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  })();

  var imgReqId = 0;
  var pendingImg = {};

  function imgHosts() {
    return safe(function () {
      var out = [];
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i];
        var src = im.currentSrc || im.getAttribute('src') || im.src || '';
        if (!src || src.indexOf('data:image/svg') === 0) continue;
        var w = im.naturalWidth || im.width || 0;
        var h = im.naturalHeight || im.height || 0;
        if (w < 120 || h < 90) continue;
        // 表情/贴纸/动图不给「看图」：那是情绪表达，没有要识别的内容（2026-11-21 用户定）
        if (/\.gif($|[?#])/i.test(src)) continue;
        try {
          if (im.closest('[data-scrm]')) continue;
          if (im.closest('[class*="avatar" i], [class*="profile-pic" i], [class*="sticker" i], [class*="emoji" i]')) continue;
        } catch (e) {}
        // 只认聊天消息里的图片：必须落在翻译引擎同款的消息气泡容器内。
        // 旧版找不到容器就回退到父元素，结果落地页/登录页的宣传大图也被挂上按钮
        // （FB 登录页左下角那颗就是这么来的）——回退取消，没气泡就没按钮。
        // 3.6.8：容器集与翻译引擎同源——原先只用通用 bubbleSelectors，不含 Meta 系的
        // div[role="row"]，FB/Messenger/商务套件聊天里的图片永远找不到宿主、看图静默缺失。
        var host = null;
        try {
          var hostSels = bubbleSelectors.slice();
          var ccfg = currentCfg();
          if (ccfg && ccfg.containers) hostSels = ccfg.containers.concat(hostSels);
          host = im.closest(hostSels.join(','));
        } catch (e2) {}
        if (!host) continue;
        out.push({ img: im, host: host });
      }
      return out;
    }, []);
  }

  // 找紧贴图片的那层容器：Web K 的 .bubble 是整行，按钮挂它会落到气泡外下方；
  // 沿图片父级往上找第一层「盒子尺寸≈图片尺寸」的容器当锚点，按钮压在图片左下角。
  function imgAnchor(im, host) {
    try {
      var ir = im.getBoundingClientRect();
      if (!ir.width) return host;
      var el = im.parentElement, best = null;
      for (var k = 0; k < 4 && el && el !== document.body; k++) {
        var r = el.getBoundingClientRect();
        if (r.width && r.width <= ir.width + 48 && r.height <= ir.height + 48) { best = el; el = el.parentElement; }
        else break;
      }
      return best || host;
    } catch (e) { return host; }
  }

  // 可视气泡盒：host 常是整行容器，真正的气泡是它里面包着内容的那一层子元素
  function visualBox(el, host) {
    try {
      if (!host || !el || !host.contains(el)) return host;
      var n = el;
      while (n.parentElement && n.parentElement !== host) n = n.parentElement;
      if (n === el) return host;
      return n;
    } catch (e) { return host; }
  }

  function ensureImgButtons() {
    try {
      var list = imgHosts();
      for (var i = 0; i < list.length; i++) {
        var host = list[i].host;
        if (!host || !host.querySelector) continue;
        var anchor = imgAnchor(list[i].img, host);
        if (anchor.querySelector('.scrm-img-btn')) continue;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scrm-img-btn';
        btn.setAttribute('data-scrm', 'tool-ui');
        btn.textContent = '看图';
        try { if (window.getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative'; } catch (e) {}
        (function (h, im, b) {
          b.addEventListener('click', function (ev) {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
            askImage(im, h, b);
          });
        })(host, list[i].img, btn);
        anchor.appendChild(btn);
      }
    } catch (e) {}
  }

  function imgToDataUrl(src) {
    return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(blob);
        var im = new Image();
        im.onload = function () {
          try {
            var max = 1280;
            var w = im.naturalWidth, h = im.naturalHeight;
            if ((w <= max && h <= max) || !w || !h) {
              URL.revokeObjectURL(url);
              var fr = new FileReader();
              fr.onload = function () { resolve(String(fr.result || '')); };
              fr.onerror = reject;
              fr.readAsDataURL(blob);
              return;
            }
            var sc = max / Math.max(w, h);
            var c = document.createElement('canvas');
            c.width = Math.round(w * sc); c.height = Math.round(h * sc);
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            resolve(c.toDataURL('image/jpeg', 0.85));
          } catch (e) { reject(e); }
        };
        im.onerror = reject;
        im.src = url;
      });
    });
  }

  function askImage(img, host, btn) {
    if (btn.getAttribute('data-busy') === '1') return;
    if (!ipc) return;
    var target = img;
    try {
      var all = host.querySelectorAll('img');
      var best = 0;
      for (var i = 0; i < all.length; i++) {
        var a = (all[i].naturalWidth || 0) * (all[i].naturalHeight || 0);
        if (a > best) { best = a; target = all[i]; }
      }
    } catch (e) {}
    btn.setAttribute('data-busy', '1');
    btn.textContent = '看图中…';
    var out = host.querySelector('.scrm-img-text');
    if (!out && host.parentNode && host.nextElementSibling && host.nextElementSibling.classList && host.nextElementSibling.classList.contains('scrm-img-text')) out = host.nextElementSibling;
    if (!out) {
      out = document.createElement('div');
      out.className = 'scrm-img-text';
      out.setAttribute('data-scrm', 'tool-ui');
      // 纯图片气泡里没地方放结果框：挂到气泡下方（外部卡片）；带文字的气泡仍放内部
      var mediaOnly = false;
      try {
        var __cl = host.cloneNode(true);
        var __junk = __cl.querySelectorAll('[data-scrm], .time, .message-time, img, svg, video');
        for (var __q = 0; __q < __junk.length; __q++) __junk[__q].remove();
        mediaOnly = !!host.querySelector('img') && !String(__cl.textContent || '').trim();
      } catch (e) {}
      if (mediaOnly && host.parentNode) {
        out.classList.add('scrm-img-text-out');
        host.parentNode.insertBefore(out, host.nextSibling);
      } else {
        visualBox(target, host).appendChild(out);
      }
    }
    out.textContent = '正在取图…';
    var src = target.currentSrc || target.getAttribute('src') || target.src || '';
    imgToDataUrl(src).then(function (dataUrl) {
      if (!dataUrl) throw new Error('empty');
      var id = 'i' + (++imgReqId);
      pendingImg[id] = { btn: btn, out: out };
      out.textContent = '正在识别图片…（首次可能要几秒）';
      ipc.sendToHost('yichat:img-req', { reqId: id, dataUrl: dataUrl });
      setTimeout(function () {
        if (!pendingImg[id]) return;
        delete pendingImg[id];
        try { btn.removeAttribute('data-busy'); btn.textContent = '看图'; } catch (e) {}
        out.textContent = '识别超时了，稍后再点一次';
      }, 90000);
    }).catch(function () {
      try { btn.removeAttribute('data-busy'); btn.textContent = '看图'; } catch (e) {}
      out.textContent = '取不到这张图（先点开大图，等它加载完再试）';
    });
  }

  function deliverImage(reqId, ok, text) {
    var p = pendingImg[reqId];
    if (!p) return;
    delete pendingImg[reqId];
    try { p.btn.removeAttribute('data-busy'); p.btn.textContent = '重新看图'; } catch (e) {}
    p.out.textContent = ok && text ? String(text) : String(text || '识别失败');
  }


  // ================= 语音发送（TTS）：面板打字 → 合成 → 转 ogg/opus → 粘贴塞进聊天 =================
  var pendingTts = {};
  var ttsSeq = 0;
  var ttsUi = null;

  function deliverTts(reqId, d) {
    var f = pendingTts[reqId];
    if (!f) return;
    delete pendingTts[reqId];
    try { f(d || {}); } catch (e) {}
  }

  function b64ToBlob(b64, mime) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'audio/wav' });
  }

  function findComposer() {
    var sels = ['.input-message-input[contenteditable]', '.input-message-input', '.chat-input [contenteditable]', '[contenteditable="true"]'];
    for (var i = 0; i < sels.length; i++) {
      var list = document.querySelectorAll(sels[i]);
      for (var j = list.length - 1; j >= 0; j--) {
        var el = list[j];
        if (el.getClientRects && el.getClientRects().length) return el;
      }
    }
    return null;
  }

  // WAV → 真·Ogg/Opus（Telegram 语音条格式）：WebCodecs 编码 + Ogg 封装；失败返回 null
  function oggOpusFromBlob(blob) {
    return new Promise(function (resolve) {
      var done = function (f) { resolve(f || null); };
      try {
        if (!window.AudioEncoder || !window.AudioData) { done(null); return; }
        AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 }).then(function (sup) {
          if (!sup || !sup.supported) { done(null); return; }
          blob.arrayBuffer().then(function (arrayBuffer) {
            var off = new OfflineAudioContext(1, 1, 48000);
            off.decodeAudioData(arrayBuffer).then(function (buf) {
              var len = Math.ceil(buf.duration * 48000);
              var oc = new OfflineAudioContext(1, len, 48000);
              var src0 = oc.createBufferSource(); src0.buffer = buf; src0.connect(oc.destination); src0.start();
              return oc.startRendering();
            }).then(function (pcmBuf) {
              var pcm = pcmBuf.getChannelData(0);
              var crcTable = new Uint32Array(256);
              for (var i = 0; i < 256; i++) { var r = i << 24; for (var j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1); crcTable[i] = r >>> 0; }
              function oggCrc(bytes) { var c = 0; for (var i = 0; i < bytes.length; i++) c = ((c << 8) >>> 0) ^ crcTable[((c >>> 24) ^ bytes[i]) & 0xff]; return c >>> 0; }
              var serial = 0x5943;
              function makePage(packets, granule, seq, flags) {
                var segs = []; var bodyLen = 0; var k;
                for (k = 0; k < packets.length; k++) { bodyLen += packets[k].length; var n = packets[k].length; while (n >= 255) { segs.push(255); n -= 255; } segs.push(n); }
                var head = new Uint8Array(27 + segs.length);
                head.set([0x4f, 0x67, 0x67, 0x53, 0], 0); head[5] = flags;
                var dv = new DataView(head.buffer);
                dv.setBigUint64(6, BigInt(granule), true); dv.setUint32(14, serial, true); dv.setUint32(18, seq, true); dv.setUint32(22, 0, true);
                head[26] = segs.length; head.set(segs, 27);
                var page = new Uint8Array(head.length + bodyLen);
                page.set(head, 0); var off2 = head.length;
                for (k = 0; k < packets.length; k++) { page.set(packets[k], off2); off2 += packets[k].length; }
                new DataView(page.buffer).setUint32(22, oggCrc(page), true);
                return page;
              }
              var preskip = 312;
              var headPkt = new Uint8Array(19);
              headPkt.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 1], 0);
              var hdv = new DataView(headPkt.buffer); hdv.setUint16(12, preskip, true); hdv.setUint32(14, 48000, true); hdv.setInt16(16, 0, true); headPkt[18] = 0;
              var vendor = new TextEncoder().encode('YiChat');
              var tagsPkt = new Uint8Array(8 + 4 + vendor.length + 4);
              tagsPkt.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);
              var tdv = new DataView(tagsPkt.buffer); tdv.setUint32(8, vendor.length, true); tagsPkt.set(vendor, 12); tdv.setUint32(12 + vendor.length, 0, true);
              var packets = [];
              var failed = false;
              var enc = new AudioEncoder({
                output: function (chunk) { var b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push(b); },
                error: function () { failed = true; }
              });
              enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 });
              var frame = 9600; var ts = 0;
              for (var o = 0; o < pcm.length; o += frame) {
                var n = Math.min(frame, pcm.length - o);
                var ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 1, timestamp: Math.round(ts * 1e6 / 48000), data: pcm.slice(o, o + n).buffer });
                enc.encode(ad); ad.close(); ts += n;
              }
              enc.flush().then(function () {
                try { enc.close(); } catch (e) {}
                if (failed || !packets.length) { done(null); return; }
                var pages = [];
                pages.push(makePage([headPkt], 0, 0, 0x02));
                pages.push(makePage([tagsPkt], 0, 1, 0x00));
                var seq = 2; var granule = 0; var per = 50;
                for (var i2 = 0; i2 < packets.length; i2 += per) {
                  var group = packets.slice(i2, i2 + per);
                  granule += group.length * 960;
                  var isLast = i2 + per >= packets.length;
                  if (isLast) granule = ts;
                  pages.push(makePage(group, granule, seq++, isLast ? 0x04 : 0x00));
                }
                var total = 0; var q;
                for (q = 0; q < pages.length; q++) total += pages[q].length;
                var out = new Uint8Array(total); var oo = 0;
                for (q = 0; q < pages.length; q++) { out.set(pages[q], oo); oo += pages[q].length; }
                done(new File([out], 'voice.ogg', { type: 'audio/ogg' }));
              }).catch(function () { done(null); });
            }).catch(function () { done(null); });
          }).catch(function () { done(null); });
        }).catch(function () { done(null); });
      } catch (e) { done(null); }
    });
  }

  // 退路：MediaRecorder 转 opus 容器（webm/ogg），再不行用原 WAV
  function mediaRecorderFile(blob) {
    return new Promise(function (resolve) {
      var fallback = function () { resolve(new File([blob], 'voice.wav', { type: blob.type || 'audio/wav' })); };
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC || !window.MediaRecorder) { fallback(); return; }
        var mime = '';
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mime = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
        if (!mime) { fallback(); return; }
        blob.arrayBuffer().then(function (ab) {
          var ctx = new AC();
          if (ctx.resume) ctx.resume();
          ctx.decodeAudioData(ab).then(function (buf) {
            var dest = ctx.createMediaStreamDestination();
            var srcNode = ctx.createBufferSource();
            srcNode.buffer = buf;
            srcNode.connect(dest);
            var rec = new MediaRecorder(dest.stream, { mimeType: mime });
            var chunks = [];
            rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            rec.onstop = function () {
              var out = new Blob(chunks, { type: mime });
              try { ctx.close(); } catch (e) {}
              resolve(new File([out], mime.indexOf('ogg') >= 0 ? 'voice.ogg' : 'voice.webm', { type: mime }));
            };
            rec.start();
            srcNode.start();
            srcNode.onended = function () { setTimeout(function () { try { rec.stop(); } catch (e) {} }, 150); };
          }).catch(fallback);
        }).catch(fallback);
      } catch (e) { fallback(); }
    });
  }

  function voiceFileFromBlob(blob) {
    return oggOpusFromBlob(blob).then(function (f) {
      if (f) return f;
      return mediaRecorderFile(blob);
    });
  }

  function injectVoiceFile(file) {
    var ed = findComposer();
    if (!ed) return false;
    try { ed.focus(); } catch (e) {}
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      var ev;
      try { ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }); }
      catch (e2) { ev = document.createEvent('Event'); ev.initEvent('paste', true, true); ev.clipboardData = dt; }
      ed.dispatchEvent(ev);
      return true;
    } catch (e) { return false; }
  }

  function buildTtsUi() {
    var btn = document.createElement('button');
    btn.id = 'ycTtsBtn';
    btn.setAttribute('data-scrm', 'tool-ui');
    btn.textContent = '🎙';
    btn.title = '语音发送（合成）';
    btn.style.cssText = 'position:fixed;right:14px;bottom:96px;z-index:2147483000;width:44px;height:44px;border-radius:50%;border:none;background:#005dff;color:#fff;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);display:none;align-items:center;justify-content:center;';
    var panel = document.createElement('div');
    panel.id = 'ycTtsPanel';
    panel.setAttribute('data-scrm', 'tool-ui');
    panel.style.cssText = 'position:fixed;right:14px;bottom:148px;z-index:2147483000;width:330px;max-width:92vw;background:#fff;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:12px;display:none;font-family:inherit;color:#1c2733;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
      '<b style="font-size:14px;">🎙 语音发送</b>' +
      '<span id="ycTtsX" style="cursor:pointer;color:#8a9ba8;font-size:15px;padding:0 2px;">✕</span></div>' +
      '<textarea id="ycTtsText" rows="3" placeholder="输入要说的话（中文会自动翻成英文）" style="width:100%;box-sizing:border-box;border:1px solid rgba(0,0,0,.16);border-radius:9px;padding:7px 9px;font-size:13.5px;line-height:1.5;resize:vertical;font-family:inherit;"></textarea>' +
      '<div style="display:flex;align-items:center;gap:8px;margin:8px 0;">' +
      '<label style="font-size:12.5px;display:flex;align-items:center;gap:4px;cursor:pointer;"><input type="checkbox" id="ycTtsTr" checked>自动翻成英文</label>' +
      '<span style="font-size:12.5px;color:#5b6b7a;">音色</span>' +
      '<select id="ycTtsVoice" style="font-size:12.5px;padding:3px 6px;border-radius:7px;border:1px solid rgba(0,0,0,.16);"></select></div>' +
      '<div id="ycTtsSpoken" style="display:none;font-size:12.5px;color:#2b3a55;background:rgba(0,0,0,.045);border-radius:8px;padding:6px 9px;margin-bottom:8px;"></div>' +
      '<audio id="ycTtsAudio" controls style="display:none;width:100%;height:34px;margin-bottom:8px;"></audio>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="ycTtsGo" style="flex:1;background:#005dff;color:#fff;border:none;border-radius:9px;padding:8px 0;font-size:13.5px;cursor:pointer;">生成并填入聊天</button></div>' +
      '<div id="ycTtsStatus" style="font-size:12px;color:#7a8a99;margin-top:7px;line-height:1.5;"></div>';
    document.body.appendChild(btn);
    document.body.appendChild(panel);
    var voices = ['茉莉', '冰糖', 'Mia', 'Chloe', '苏打', '白桦', 'Milo', 'Dean'];
    var sel = panel.querySelector('#ycTtsVoice');
    voices.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    var status = panel.querySelector('#ycTtsStatus');
    var spoken = panel.querySelector('#ycTtsSpoken');
    var audio = panel.querySelector('#ycTtsAudio');
    var goBtn = panel.querySelector('#ycTtsGo');
    var setStatus = function (t) { status.textContent = t || ''; };
    btn.addEventListener('click', function () {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      if (panel.style.display === 'block') { var ta = panel.querySelector('#ycTtsText'); if (ta) ta.focus(); }
    });
    panel.querySelector('#ycTtsX').addEventListener('click', function () { panel.style.display = 'none'; });
    goBtn.addEventListener('click', function () {
      var text = panel.querySelector('#ycTtsText').value.trim();
      if (!text) { setStatus('先输入要说的话'); return; }
      if (!ipc || !ipc.sendToHost) { setStatus('当前版本不支持'); return; }
      var id = 't' + (++ttsSeq) + '_' + Date.now();
      goBtn.disabled = true;
      goBtn.style.opacity = '.55';
      setStatus('正在合成…');
      pendingTts[id] = function (d) {
        goBtn.disabled = false;
        goBtn.style.opacity = '';
        if (!d.ok || !d.audioBase64) { setStatus(d.text || '合成失败'); return; }
        if (d.spoken) { spoken.style.display = 'block'; spoken.textContent = '将发送：' + d.spoken; }
        var blob = b64ToBlob(d.audioBase64, d.mime);
        audio.src = URL.createObjectURL(blob);
        audio.style.display = 'block';
        setStatus('已生成，正在转成 Telegram 语音格式…');
        voiceFileFromBlob(blob).then(function (file) {
          var okIn = injectVoiceFile(file);
          if (okIn) setStatus('已生成 ✓ 已放入聊天——如果输入框上方出现语音附件预览，按 Telegram 的发送键发出；没出现的话告诉我，我换一种塞法。也可以先点上方播放器试听。');
          else setStatus('已生成 ✓ 但没找到聊天输入框——先点开一个对话再试；也可以先试听。');
        });
      };
      ipc.sendToHost('yichat:tts-req', { reqId: id, text: text, voice: sel.value, translate: panel.querySelector('#ycTtsTr').checked });
      setTimeout(function () {
        if (pendingTts[id]) { delete pendingTts[id]; goBtn.disabled = false; goBtn.style.opacity = ''; setStatus('合成超时，请重试'); }
      }, 60000);
    });
    return { btn: btn, panel: panel };
  }

  function ensureTtsUi() {
    try {
      if (!document.body) return;
      if (!ttsUi) ttsUi = buildTtsUi();
      var has = !!findComposer();
      ttsUi.btn.style.display = has ? 'flex' : 'none';
      if (!has) ttsUi.panel.style.display = 'none';
    } catch (e) {}
  }
  setInterval(ensureTtsUi, 2000);

  // IPC 直达通道：宿主用 webview.send 下发配置/译文，不依赖 window 对象在主世界可见
  if (ipc && ipc.on) {
    try {
      ipc.on('scrm:trans-config', function (ev, cfg) {
        try { window.__scrmTransOverlay && window.__scrmTransOverlay.setTransConfig(cfg || {}); } catch (e) {}
      });
      ipc.on('scrm:deliver-translation', function (ev, d) {
        try { if (d) deliverTranslation(d.reqId, d.ok, d.text); } catch (e) {}
      });
      ipc.on('scrm:set-enabled', function (ev, on) {
        try { window.__scrmTransOverlay && window.__scrmTransOverlay.setEnabled(!!on); } catch (e) {}
      });
      ipc.on('scrm:set-style', function (ev, s) {
        try { window.__scrmTransOverlay && window.__scrmTransOverlay.setStyle(s || {}); } catch (e) {}
      });
      // 工具箱：语音识别结果回填
      ipc.on('yichat:voice-res', function (ev, d) {
        try { if (d) deliverVoice(d.reqId, d.ok, d.text); } catch (e) {}
      });
      ipc.on('yichat:voice-scan', function () {
        try { ensureVoiceButtons(); } catch (e) {}
      });
      ipc.on('yichat:img-res', function (ev, d) {
        try { if (d) deliverImage(d.reqId, d.ok, d.text); } catch (e) {}
      });
      ipc.on('yichat:tts-res', function (ev, d) {
        try { if (d) deliverTts(d.reqId, d); } catch (e) {}
      });
      ipc.on('yichat:img-scan', function () {
        try { ensureImgButtons(); } catch (e) {}
      });
    } catch (e) {}
  }

  var overlayApi = {
    setStyle: function (s) {
      s = s || {};
      if (s.color) style.color = String(s.color);
      if (s.size) style.size = Math.max(10, Math.min(24, parseInt(s.size, 10) || 14));
      styleCustomized = (String(style.color).toLowerCase() !== '#000000' || style.size !== 14);
      restyle();
      return { color: style.color, size: style.size };
    },
    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) refresh();
      return enabled;
    },
    // 翻译配置下发：状态条文案 / 输入框占位 / 自动开关 / 目标语言 / 平台key / 关键词
    setTransConfig: function (cfg) {
      cfg = cfg || {};
      if (typeof cfg.showBar === 'boolean') transCfg.showBar = cfg.showBar;
      if (typeof cfg.barText === 'string') transCfg.barText = cfg.barText;
      if (typeof cfg.inputPh === 'string') transCfg.inputPh = cfg.inputPh;
      if (typeof cfg.auto === 'boolean') {
        transCfg.auto = cfg.auto;
        enabled = !!cfg.auto;
      }
      if (typeof cfg.targetLang === 'string') transCfg.targetLang = cfg.targetLang;
      // 3.6.8：通道/有无 Key 一并留存，仅供诊断探针上报（cfgSnap），不参与页内逻辑
      if (typeof cfg.channel === 'string') transCfg.channel = cfg.channel;
      if (typeof cfg.sendChannel === 'string') transCfg.sendChannel = cfg.sendChannel;
      if (typeof cfg.hasKey === 'boolean') transCfg.hasKey = cfg.hasKey;
      if (Array.isArray(cfg.keywords)) transCfg.keywords = cfg.keywords.filter(function (x) { return typeof x === 'string' && x.trim(); }).map(function (x) { return x.trim(); });
      if (typeof cfg.platformKey === 'string') profilePlatformKey = cfg.platformKey;
      renderTransBar();
      applyInputPlaceholder();
      // 配置全部落定后再扫一次，避免用旧通道重复请求
      if (transCfg.auto) refresh();
      return true;
    },
    // 宿主翻译结果回填（requestTranslate 的应答）
    deliverTranslation: function (reqId, ok, text) { deliverTranslation(reqId, ok, text); return true; },
  };
  // 暴露给宿主渲染层（webview.executeJavaScript 在页面主世界执行）。
  // 2026-11-01：开启上下文隔离后，window 上的赋值只存在于 preload 世界，
  // 宿主的 executeJavaScript 看不到，所以额外用 contextBridge 桥一份到主世界。
  // 未开隔离时 contextBridge 会抛错 → 退回直接挂 window，两种模式都能用。
  try {
    require('electron').contextBridge.exposeInMainWorld('__scrmTransOverlay', overlayApi);
  } catch (e) {
    try { window.__scrmTransOverlay = overlayApi; } catch (e2) {}
  }
  // 结构快照同理桥到主世界：宿主在设置页点「导出页面结构快照」时，
  // 对每个会话 webview 调 window.__yichatSnapshot() 取脱敏结构树
  try {
    require('electron').contextBridge.exposeInMainWorld('__yichatSnapshot', buildSnapshot);
  } catch (e) {
    try { window.__yichatSnapshot = buildSnapshot; } catch (e2) {}
  }
})();
