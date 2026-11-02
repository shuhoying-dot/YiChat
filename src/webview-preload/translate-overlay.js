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
      // 2026-11-02 v3 译文卡：无头版式——浅蓝底 + 蓝色左竖线，译文直接跟在原文下（去掉品牌小蓝头）
      st.textContent = '.scrm-trans-overlay{margin-top:5px!important;background:rgba(47,107,255,.055)!important;border:1px solid rgba(47,107,255,.16)!important;border-left:3px solid #2f6bff!important;border-radius:8px!important;padding:5px 10px 6px!important;position:relative!important;box-shadow:none!important}' +
        '.scrm-kw-hit{outline:2px solid #faad14!important;outline-offset:-2px!important}' +
        '.scrm-kw-badge{margin-top:4px!important;font-size:11px!important;color:#ad6800!important;background:#fffbe6!important;border:1px solid #ffe58f!important;border-radius:4px!important;padding:1px 6px!important;display:inline-block!important}' +
        // 译文正文：正常深灰，和原文清晰区分
        'div.scrm-trans-overlay div.scrm-trans-text{font-size:12.5px!important;line-height:1.6!important;color:#34405a!important;padding-left:1px!important}' +
        // 已读勾单独隐藏（用户要求）：有译文的气泡里，time-sending-status 图标去掉
        '.bubble:has(.scrm-trans-overlay) .time-sending-status,' +
        'div.message:has(.scrm-trans-overlay) .time-sending-status' +
        '{display:none!important;visibility:hidden!important}' +
        // 深色主题（跟随网页/系统）：深色底浅色字
        '@media (prefers-color-scheme:dark){.scrm-trans-overlay{background:rgba(255,255,255,.06)!important;border-color:rgba(255,255,255,.14)!important;border-left-color:#4096ff!important}' +
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
      texts: ['div[dir="auto"]', 'span[dir="auto"]']
    },
    facebook: {
      containers: ['div[role="row"]'],
      needScope: true,
      texts: ['div[dir="auto"]', 'span[dir="auto"]']
    },
    metabiz: {
      containers: ['div[role="row"]'],
      needScope: true,
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
  var diagStats = { bubbles: 0, transReq: 0, transOk: 0, transFail: 0, lastSkips: [] };
  function noteSkip(reason) {
    try {
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
    try { scope = !!conversationScope(); } catch (e4) {}
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
      scopeFound: scope,
      overlays: overlays,
      pending: pending,
      bubblesLastScan: diagStats.bubbles,
      transReq: diagStats.transReq,
      transOk: diagStats.transOk,
      transFail: diagStats.transFail,
      lastSkips: diagStats.lastSkips.slice(),
      sampleText: sample,
      sampleChain: chain
    };
  }
  function sendDiag() {
    try { if (ipc && ipc.send) ipc.send('yichat:overlay-diag', collectDiag()); } catch (e) {}
  }
  setInterval(sendDiag, 8000);
  setTimeout(sendDiag, 2500);

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
          var rm = c.querySelectorAll('[data-scrm="trans-overlay"], .time, .message-time, [data-scrm-hidden], .reactions, [class*="reaction"], [class*="Reaction"]');
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
        var brm = bc.querySelectorAll('[data-scrm="trans-overlay"], .time, .message-time, [data-scrm-hidden], .reactions, [class*="reaction"], [class*="Reaction"]');
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
        if (r.height > 20 && r.width > 200 && r.top > window.innerHeight * 0.4) return cands[i];
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
    for (var d = 0; d < 10 && node && node !== document.body; d++) {
      node = node.parentElement;
      if (!node) break;
      var cnt = 0;
      for (var i = 0; i < sels.length; i++) { try { cnt += node.querySelectorAll(sels[i]).length; } catch (e) {} }
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

  function applyOverlay(bubble) {
    if (!enabled) return;
    // 平台严格模式（如 WhatsApp）：只处理会话区（scope）内、本身就是消息容器的气泡；
    // 会话列表行/落地页元素被塞译文盒会溢出重叠，一律不碰
    try {
      var sc = currentCfg();
      if (sc && sc.strict) {
        if (sc.scope && !(bubble.closest && bubble.closest(sc.scope))) return;
        var okC = false;
        var scs = sc.containers || [];
        for (var si = 0; si < scs.length; si++) { try { if (bubble.matches && bubble.matches(scs[si])) { okC = true; break; } } catch (e) {} }
        if (!okC) return;
      }
    } catch (e) {}
    // needScope 平台（Meta 系）：必须落在会话区内才翻——列表页预览文本结构与消息相同，无此门必误译；
    // 会话区优先用 conversationScope()，定位不到时用输入框祖先链兜底（向上找高度占视口 40% 以上的窗格）
    try {
      var nc = currentCfg();
      if (nc && nc.needScope) {
        var nsc = conversationScope();
        if (!nsc) {
          var cin = findComposerEl();
          if (cin) {
            var cn = cin, climb = 0;
            while (cn && cn !== document.body && climb < 8) {
              cn = cn.parentElement; climb++;
              if (!cn) break;
              try { var crr = cn.getBoundingClientRect(); if (crr.height > window.innerHeight * 0.4) nsc = cn; } catch (e) {}
            }
          }
        }
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
        var scp2 = conversationScope();
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
    if (dup) return;
    // 翻译中的气泡打标记，避免并发重复请求同一文本
    if (safe(function () { return bubble.getAttribute('data-scrm-trans-pending'); }, null)) return;
    // 纯日期文本不翻译
    if (/^(today|yesterday|今天|昨天)$/i.test(content.trim())) return;
    // 月份+日期格式不翻译（如 "September 30"）
    if (/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}$/i.test(content.trim())) return;
    // Telegram 系统服务消息不翻译（如自动删除通知）
    if (/set messages to auto-delete|disabled the auto-delete|enabled the auto-delete|将消息设置为.*自动删除|禁用自动删除/i.test(content)) return;
    if (inFlight >= 6) return;
    inFlight++;
    safe(function () { bubble.setAttribute('data-scrm-trans-pending', '1'); }, null);
    markKeyword(bubble, content);
    // 真实通道：按翻译设置通道分流（谷歌免费 / DeepL / 大模型API），见 translateReal
    translateReal(content).then(function (translated) {
      inFlight--;
      safe(function () { if (bubble.removeAttribute) bubble.removeAttribute('data-scrm-trans-pending'); }, null);
      if (!translated) { noteSkip('trans-empty'); return; }
      if (!enabled) return;
      if (!bubble.isConnected) return;
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
            // 小勾隐藏：仅藏已读勾（2026-10-31 用户要求保留发送时间，时间逻辑已全部移除）
            try { hideIcons(box); } catch (e) {}
            // （原"隐藏时间戳 + 暴力扫 HH:MM"逻辑已删除：它把整条 span.time 藏了，时间不见了）
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
    });
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
    var __bubbles = findBubbles();
    diagStats.bubbles = __bubbles.length;
    __bubbles.forEach(applyOverlay);
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
    set('margin', '6px 0 2px');
    set('padding', '6px 10px 7px');
    set('background', dark ? 'rgba(255,255,255,0.07)' : 'rgba(47,107,255,0.055)');
    set('border', dark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(47,107,255,0.16)');
    set('border-left', dark ? '3px solid #4096ff' : '3px solid #2f6bff');
    set('border-radius', '8px');
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
      trans.style.setProperty('font-size', '12.5px', 'important');
      trans.style.setProperty('line-height', '1.6', 'important');
      trans.style.setProperty('color', isDarkPage() ? '#cdd6e4' : '#34405a', 'important');
    }
  }
  // 小勾（已读回执）隐藏：从盒子向上逐层找 sending-status 相关元素
  // 只在 Telegram 启用，其他平台跳过
  function hideIcons(box) {
    if (!timeHidingEnabled()) return;
    try {
      var p = box.parentElement;
      var depth = 0;
      while (p && p !== document.body && p !== document.documentElement && depth < 8) {
        depth++;
        var icons = null;
        try { icons = p.querySelectorAll('[class*="sending-status"]'); } catch (e) {}
        if (icons && icons.length) {
          for (var i = 0; i < icons.length; i++) {
            var ic = icons[i];
            if (!box.contains(ic)) {
              ic.style.setProperty('display', 'none', 'important');
              ic.style.setProperty('visibility', 'hidden', 'important');
              ic.style.setProperty('width', '0', 'important');
              ic.style.setProperty('height', '0', 'important');
            }
          }
          break;
        }
        p = p.parentElement;
      }
    } catch (e) {}
  }
  // 时间/勾隐藏只在 Telegram 启用（用户要求）：其他平台跳过，避免干扰通用模板
  // profilePlatformKey 在 configure() 里从宿主推送的配置中获取
  function timeHidingEnabled() {
    try {
      var k = String(profilePlatformKey || '').toLowerCase();
      return k.indexOf('telegram') >= 0;
    } catch (e) { return false; }
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
  // 语音气泡的「转文字」按钮：独立节流，跟翻译开关无关（关掉翻译也可能只是想听写）
  setInterval(function () { ensureVoiceButtons(); }, 4000);


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
        + 'font-size:11px;line-height:1.6;color:#005dff;background:rgba(0,93,255,.08);'
        + 'border:1px solid rgba(0,93,255,.25);border-radius:10px;cursor:pointer;font-family:inherit}'
        + '.scrm-voice-btn:hover{background:rgba(0,93,255,.16)}'
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
        try { if (a.closest('[data-scrm="trans-overlay"]')) continue; } catch (e) {}
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
        btn.setAttribute('data-scrm', 'trans-overlay');
        btn.textContent = '转文字';
        (function (h, au, b) {
          b.addEventListener('click', function (ev) {
            try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
            askTranscribe(au, h, b);
          });
        })(host, list[i].audio, btn);
        host.appendChild(btn);
      }
    } catch (e) {}
  }

  function audioToBase64(src) {
    return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
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
      out.setAttribute('data-scrm', 'trans-overlay');
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
})();
