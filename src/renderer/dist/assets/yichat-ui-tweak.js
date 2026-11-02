// YiChat UI 增强（会话页精简版 · 2026-11-01）
//   1) 右侧工具栏下方续 4 个速用键：最新 / 译文 / 截图 / AI 帮写（逐栏注入，各平台各一份）；
//   2) 话术库每条补「插入」「发送」；语音气泡补「转文字」；
//   3) 未读汇总与角标、当前会话截图进剪贴板；
//   4) 设置齿轮二次点击收起、退出弹窗会话数改真实值、顶栏时钟只到分钟、会话页账号卡瘦身。
// 不触碰 React 组件树；诊断日志走 window.yichat.logMessage → ui-diag.log。
(function () {
  'use strict';

  function log(m) {
    try {
      if (window.yichat && window.yichat.logMessage) window.yichat.logMessage('[tweak] ' + m);
    } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    log('ERR ' + (e && e.message) + ' @' + (e && e.filename) + ':' + (e && e.lineno));
  });
  window.addEventListener('unhandledrejection', function (e) {
    log('REJ ' + (e && e.reason));
  });
  log('loaded, readyState=' + document.readyState);

  function mkEl(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // —— 界面语言跟随（2026-11-01）
  // 应用自己的 i18n 只管它自己的文案；我们注入的这批（工作台、速用键、弹窗、提示）
  // 用一张小表跟着切。语言存 localStorage['yichat-lang']（zh / en），切换时应用会
  // dispatch 'yichat-lang' 事件，收到就把注入节点拆掉，下次心跳按新语言重建。
  var LANG_KEY = 'yichat-lang';
  function curLang() {
    try { return localStorage.getItem(LANG_KEY) || 'zh'; } catch (e) { return 'zh'; }
  }
  var EN = {
    'API Key 管理': 'API Keys',
    '性能监控': 'Performance',
    '凌晨好': 'Good night',
    '上午好': 'Good morning',
    '中午好': 'Good afternoon',
    '下午好': 'Good afternoon',
    '晚上好': 'Good evening',
    '近7天翻译量': 'Translations · last 7 days',
    '本机统计': 'local stats',
    '已打开': 'Open',
    '未打开': 'Not open',
    '快捷键': 'Shortcuts',
    '收起 / 展开会话栏': 'collapse / expand the session column',
    '命令面板': 'Command palette',
    '点未读直达会话': 'click an unread item to jump in',
    '搜索平台、会话、话术或设置': 'Search platforms, chats, phrases, settings',
    '没有匹配结果': 'No results',
    '未读会话': 'Unread chats',
    '主题色': 'Accent color',
    '编辑': 'Edit',
    '谨慎': 'Caution',
    '搜索平台': 'Search platforms',
    '完成': 'Done',
    'AI 帮写': 'AI Compose',
    '工具': 'Tools',
    '生成回复': 'Generate',
    '生成中…': 'Generating…',
    '填入输入框': 'Insert into input',
    '复制': 'Copy',
    '已复制': 'Copied',
    '复制失败': 'Copy failed',
    '重新生成': 'Regenerate',
    '请先在 API Key 管理里添加大模型 Key': 'Add an LLM key in API Keys first',
    '先写点梗概再生成': 'Write a brief first',
    '译回中文（核对用）': 'Back-translation (for checking)',
    '语气': 'Tone',
    '礼貌': 'Polite',
    '简洁': 'Concise',
    '促单': 'Sales-y',
    '正式': 'Formal',
    '已隐藏': 'Hidden',
    '搜索平台、会话、话术…': 'Search platforms, chats, phrases…',
    '界面语言': 'Interface language',
    '退出登录': 'Log out',
    '设置（再点一次关闭）': 'Settings (click again to close)',
    '当前没有打开的平台页，直接退出应用？': 'No platform page is open. Quit the app now?',
    '先在左边打开一个会话，再点话术': 'Open a conversation on the left first, then use Phrases',
    '操作失败：': 'Failed: ',
    '左侧没有这个平台：': 'No such platform on the left: ',
    '这个入口在当前版本里没有': 'This entry is not available in this version',
    '最新': 'Latest', '译文': 'Trans', '截图': 'Shot', '搜记录': 'Search', '未读': 'Unread',
    '平台状态': 'Platforms', '未读待办': 'Unread', '快捷入口': 'Shortcuts', '今日翻译': 'Translations today',
    '快捷键速查': 'Shortcuts', '缩放平台页面': 'Zoom platform pages', '重置缩放 100%': 'Reset zoom to 100%',
    '会话置于顶部 / 恢复': 'Pin session to top / restore', '收起 / 展开该条译文': 'Collapse or expand a translation',
    '近 7 天': 'Last 7 days', '今日': 'today',
    '在线账号': 'Accounts online', '接入平台': 'Platforms', '未读消息': 'Unread',
    '条': '', '个会话待处理': 'chats pending', '全部已读': 'all read', '点击平台行切换': 'click a row to switch',
    '平台已接入': 'connected', '读取中': 'loading…', '在线': 'online', '未接入': 'not added',
    '点一条直接跳到对应平台': 'Click a row to jump to that platform',
    '翻译设置': 'Translation', '引擎 · 语言': 'engine · languages',
    '平台管理': 'Platforms', '账号 · 代理': 'accounts · proxy',
    '平台设置': 'Platforms', '显示哪些平台': 'choose platforms',
    '代理设置': 'Proxy', '网络出口 · 端口': 'network · port',
    'API 密钥': 'API keys', '翻译模型': 'models', '模型接入': 'models',
    '性能': 'Performance', '延迟 · 缓存': 'latency · cache', '延迟 · 失败': 'latency · failures',
    '点击一条直接跳转': 'Click a row to jump there',
    '重置': 'Reset', '清空本地数据': 'clear local data',
    '没有未读消息': 'No unread messages', '当前全部已读': 'All read', '关闭': 'Close',
    '未读汇总': 'Unread', '搜聊天记录': 'Search chat history',
    '在当前打开的平台页里找，原文和译文都算': 'Search the open platform pages, source and translation',
    '输入关键词，回车搜索': 'Type a keyword and press Enter',
    '已加载的聊天记录都会参与搜索；往上翻更多历史，能搜到的也更多': 'Loaded messages only — scroll up for more history',
    '搜索中…': 'Searching…', '原文': 'src', '译文2': 'trans',
    '平台页收到新消息会自动汇总在这里，窗口不在前台时还会弹系统通知': 'New messages are collected here; notifications show when the window is in the background',
    '近 7 天还没有翻译记录': 'No translations in the last 7 days',
    '翻译数据读取中…': 'Loading translation stats…',
    '会话面板已收起（Ctrl+B 恢复）': 'Session panel hidden (Ctrl+B to restore)',
    '已恢复会话面板': 'Session panel restored',
    '会话置于顶部': 'Pin session to top', '恢复会话面板': 'Restore session panel',
    '收起会话面板 (Ctrl+B)': 'Hide session panel (Ctrl+B)', '收起会话面板': 'Hide session panel',
    '+ 会话': '+ Chat', '新增会话': 'New chat',
    '上线（让选中账号上线）': 'Online (bring the selected account back)',
    '离线（让选中账号离开，登录数据保留）': 'Offline (log out the selected account, session kept)',
    '置于左侧': 'Dock left', '把会话面板放回左侧': 'Put the session panel back on the left',
    '展开全部': 'Expand all', '展开会话面板': 'Expand session panel', '收起为窄条': 'Collapse to strip',
    '账号': 'account', '点击让该账号离开': 'Click to take this account offline',
    '点击让该账号上线': 'Click to bring this account online',
    '已刷新平台页': 'Platform pages reloaded', '现在没有打开的平台页': 'No platform page is open',
    '译文开关': 'Toggle translation',
    '把聊天窗口滚到最新一条消息': 'Scroll the chat to the latest message',
    '把当前会话截成图片放进剪贴板': 'Copy this chat to the clipboard as an image',
    '在当前平台页里搜聊天记录（原文 + 译文）': 'Search this platform page (source + translation)',
    '未读消息汇总': 'Unread summary',
    '先在左侧打开一个会话': 'Open a chat on the left first',
    '当前页译文已关（点一下打开）': 'Translation is off on this page — click to turn on',
    '当前页译文开着（点一下关掉）': 'Translation is on — click to turn off',
    '当前页译文跟随翻译设置（点一下关掉）': 'Following your translation settings — click to turn off',
    '当前没有未读消息': 'No unread messages',
    '添加备注': 'Add note',
    '点击添加备注': 'Click to add a note',
    '点击修改备注': 'Click to edit the note',
    '正在截图…': 'Capturing…',
    '已复制到剪贴板（': 'Copied to clipboard (', '先在左边打开一个会话': 'Open a chat on the left first',
    '当前版本不支持截图': 'This build does not support screenshots',
    '已发送': 'Sent', '发送失败：先点一下平台页的输入框再试': 'Failed: click the platform input box and retry',
    '已插入输入框，确认后按回车发送': 'Inserted into the input box — press Enter to send',
    '当前版本不支持这个操作': 'This build does not support this action',
    '常用话术存在本机。点「插入」只把内容放进输入框，点「发送」按当前平台的翻译设置自动翻译并直接发出。': 'Saved on this device. "Insert" only fills the input box; "Send" translates and sends it.',
    '插入': 'Insert', '发送': 'Send', '只放进输入框，不发送': 'Fill the input box only',
    '按当前平台翻译设置翻译后直接发出': 'Translate and send right away',
    '删除': 'Delete',
    /* v30 官方版式新增词条 */
    '在线会话': 'Online', '常用平台': 'Platforms', '自动': 'Auto',
    '今日翻译（条）': 'Translated today', '今日成功率': 'Success rate',
    '主题：跟随系统 / 亮色 / 暗色': 'Theme: auto / light / dark',
    '快捷键与使用提示': 'Shortcuts & tips', '日常操作都在这里': 'everyday actions live here',
    '只缩放网页内容，侧栏和栏目大小不变': 'Zooms page content only — sidebar keeps its size',
    '一键回到 100%': 'Back to 100% in one press',
    '会话面板收起 / 恢复': 'Hide / restore session panel',
    '左侧会话栏一键收起，再按恢复': 'Collapse the left session panel; press again to restore',
    '收起 / 展开译文': 'Collapse / expand translation',
    '点译文右上角的小箭头': 'Click the small arrow at the top-right of a translation',
    '翻译 · 本机数据不上传': 'Translation · data stays on this device',
    '版本信息': 'Version', '当前版本': 'version',
    '今日概览': 'Today', '仅本统计': 'local stats',
    '成功率': 'Success', '覆盖平台': 'Platforms',
    '翻译节点': 'Translate node', '平均翻译延迟，点击查看性能详情': 'Average latency — click for performance details',
    '优秀': 'Excellent', '良好': 'Good', '偏慢': 'Slow', '暂无数据': 'No data',
    '暂无平台': 'No platforms yet',
    '每个平台默认翻译成哪种语言': 'default target language per platform',
    '所有平台共用一个代理出口': 'one proxy exit for all platforms',
    '填自己的 Key，翻译走你的额度': 'bring your own key & quota',
    '左侧图标栏显示哪些平台': 'which platforms show in the rail',
    '翻译延迟 · 成功率 · 失败分析': 'latency · success · failures',
    '重置缩放': 'Reset zoom',
    '新消息会自动汇总到这里': 'New messages are collected here automatically'
  };
  function L(s) { return curLang() === 'en' ? (EN[s] || s) : s; }
  var uiLang = curLang();
  window.addEventListener('yichat-lang', function () {
    try {
      var wb = document.getElementById('yc-wb');
      if (wb && wb.parentNode) wb.parentNode.removeChild(wb);
      var ds = document.querySelectorAll('.yc-dock');
      for (var i = 0; i < ds.length; i++) if (ds[i].parentNode) ds[i].parentNode.removeChild(ds[i]);
      ['yc-side-toggle', 'yc-mini-bar', 'yc-narrow-col', 'yc-rail-toggle'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n && n.parentNode) n.parentNode.removeChild(n);
      });
      var hb = document.getElementById('yc-head-toggle');
      if (hb && hb.parentNode) hb.parentNode.removeChild(hb);
      uiLang = curLang();
    } catch (e) {}
  });

  // —— 右栏「翻译」角标的数据源：15 秒节流拉一次本机计数（只存在内存，不落盘、不外传）
  var lastStats = null;
  var lastStatsAt = 0;
  function refreshStats(force) {
    try {
      var api = window.yichat;
      if (!api || typeof api.getDailyStats !== 'function') return;
      var now = Date.now();
      if (!force && now - lastStatsAt < 15000) return;
      lastStatsAt = now;
      var p = api.getDailyStats();
      if (p && typeof p.then === 'function') p.then(function (s) { lastStats = s; }).catch(function () {});
    } catch (e) {}
  }



  // 数一下当前真正打开的平台页（退出弹窗里的「会话数」用它，应用自己写死成了 2）
  function countOpenPages() {
    var list = document.querySelectorAll('webview');
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      try {
        var src = list[i].getAttribute('src') || '';
        if (src && src !== 'about:blank') n++;
      } catch (e) {}
    }
    return n;
  }

  // 退出确认弹窗：应用把会话数写死成 2（bundle 里直接 children:`2`），改成真实打开的平台页数
  function patchLogoutModal() {
    try {
      var mask = document.querySelector('.logout-mask');
      if (!mask) return;
      var body = mask.querySelector('.logout-body');
      if (!body || body.getAttribute('data-yc-fixed') === '1') return;
      body.setAttribute('data-yc-fixed', '1');
      var n = countOpenPages();
      var num = mask.querySelector('.logout-num');
      if (n > 0) {
        if (num) num.textContent = String(n);
      } else {
        body.textContent = L('当前没有打开的平台页，直接退出应用？');
      }
    } catch (e) {}
  }
  function bindLogoutCount() {
    if (window.__ycLogoutBound) return;
    window.__ycLogoutBound = true;
    document.addEventListener('click', function (e) {
      try {
        var t = e.target;
        while (t && t !== document && !(t.getAttribute && t.getAttribute('data-t') === 'logout-btn')) t = t.parentNode;
        if (!t || t === document) return;
        setTimeout(patchLogoutModal, 0);
        setTimeout(patchLogoutModal, 80);
      } catch (err) {}
    }, true);
  }


  // —— 右上角两个按钮收成图标（语言 / 退出登录），补 title 提示
  function ensureTopIcons() {
    var l = document.querySelector('[data-t="lang-btn"]');
    if (l && !l.getAttribute('title')) l.setAttribute('title', L('界面语言'));
    var o = document.querySelector('[data-t="logout-btn"]');
    if (o && !o.getAttribute('title')) o.setAttribute('title', L('退出登录'));
  }


  // —— 顶栏时钟只到分钟：秒位每秒跳一次，除了抢注意力没有信息量
  function trimClock() {
    try {
      var pills = document.querySelectorAll('.dash-pills .dash-pill');
      for (var i = 0; i < pills.length; i++) {
        var el = pills[i];
        if (!/\d{1,2}:\d{2}:\d{2}/.test(el.textContent || '')) continue;
        if (!el.__ycClockObs && typeof MutationObserver === 'function') {
          // applyClock 自带重入保护：已截断过的文本不会再匹配到秒
          el.__ycClockObs = new MutationObserver(function () { applyClock(el); });
          el.__ycClockObs.observe(el, { childList: true, subtree: true, characterData: true });
        }
        applyClock(el);
      }
    } catch (e) {}
  }
  function applyClock(el) {
    try {
      if (el.__ycBusy) return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      var tn, hit = null;
      while ((tn = walker.nextNode())) {
        if (/\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}:\d{2}/.test(tn.nodeValue || '')) { hit = tn; break; }
      }
      if (!hit) return;
      var full = hit.nodeValue.trim();
      el.title = full;   // 完整时间留给悬停
      var short = full.replace(/(\d{1,2}:\d{2}):\d{2}/, '$1');
      if (short === full) return;   // 已经截过，不再重复
      lockClockWidth(el);
      el.__ycBusy = true;
      hit.nodeValue = hit.nodeValue.replace(full, short);
      el.__ycBusy = false;
    } catch (e) { el.__ycBusy = false; }
  }

  // 秒位每秒被 React 写回完整值、我们再截掉，胶囊宽度就在 16/19 字符之间来回变，
  // 右边的「自动」胶囊被推着左右跳一下。首次截断前此刻 DOM 还是完整文本，量一次宽锁死。
  function lockClockWidth(el) {
    try {
      if (el.__ycMinW != null) return;
      var w = el.getBoundingClientRect().width;
      if (!w || w < 40) return;
      var cs = window.getComputedStyle(el);
      // min-width 在 border-box 下含 padding，content-box 下不含，先换算成同一个口径
      if (cs && cs.boxSizing !== 'border-box') {
        w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      }
      w = Math.ceil(w);
      el.style.minWidth = w + 'px';
      el.__ycMinW = w;
    } catch (e) {}
  }


  // —— 会话页：账号卡瘦身 + 空态一次性提示
  // 卡片里的「无」「📝 暂无备注」这类占位行，自用场景纯属噪音，逐行按内容隐藏，
  // 不依赖类名（不同版本类名变过，按文本更稳）
  function compactAccCards() {
    try {
      var cards = document.querySelectorAll('.sess-acc-card');
      for (var i = 0; i < cards.length; i++) {
        var meta = cards[i].querySelector('.sess-acc-meta');
        if (!meta) continue;
        // ⚠️ 不能用 data-yc-slim 做"只跑一次"标记：React 重渲染会洗掉内联
        // display:none，标记还在就再也不补，状态点和「无」就漏出来了
        // （2026-11-01 用户截图实锤）。改成每次心跳幂等重扫，代价可忽略。
        var kids = meta.children;
        for (var j = 0; j < kids.length; j++) {
          var t = (kids[j].textContent || '').trim();
          if (kids[j].classList.contains('sess-acc-name')) continue;
          if (t === '无' || t.indexOf('暂无备注') >= 0 || t === '') kids[j].style.display = 'none';
        }
      }
    } catch (e) {}
  }

  var HINT_KEY = 'yichat_hint_pick_chat';
  function ensureEmptyHint() {
    try {
      var empty = document.querySelector('.sess-main-empty');
      var exist = document.getElementById('yc-empty-hint');
      var dismissed = localStorage.getItem(HINT_KEY) === '1';
      if (!empty || dismissed) {
        if (exist && exist.parentNode) exist.parentNode.removeChild(exist);
        return;
      }
      if (exist) return;
      var box = mkEl('div', 'yc-empty-hint');
      box.id = 'yc-empty-hint';
      box.appendChild(mkEl('span', 'yc-empty-hint-txt', curLang() === 'en'
        ? 'Pick a chat under any account on the left to start; Ctrl+B (⌘B) pins the session panel to the top'
        : '选中左侧任一账号下的会话即可开始；顶部「会话置于顶部」能把面板收起来'));
      var x = mkEl('span', 'yc-empty-hint-x', curLang() === 'en' ? 'Got it' : '知道了');
      x.addEventListener('click', function (e) {
        e.stopPropagation();
        try { localStorage.setItem(HINT_KEY, '1'); } catch (e2) {}
        if (box.parentNode) box.parentNode.removeChild(box);
      });
      box.appendChild(x);
      empty.appendChild(box);
    } catch (e) {}
  }


  // —— 右侧工具栏底部速用区（v13）：回到最新 / 译文开关
  //     React 重渲染会把注入节点整块换掉，所以每轮 tick 检查一次，缺了就重建。
  var TRANS_OFF_KEY = 'yichat_trans_off_manual';
  var dockTick = 0;

  // '1'=手动关 / '0'=手动开 / null=没动过（跟随应用里的翻译设置）
  function transRaw() {
    try { return localStorage.getItem(TRANS_OFF_KEY); } catch (e) { return null; }
  }
  function transOff() { return transRaw() === '1'; }

  // 只认当前真正可见的那个 webview：面板打开时其它页面还在 DOM 里但尺寸为 0
  function liveWebviews() {
    var out = [];
    var list = document.querySelectorAll('webview');
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.width > 200 && r.height > 150) out.push(list[i]);
    }
    return out;
  }

  function applyTransOverride() {
    var off = transOff();
    var list = liveWebviews();
    for (var i = 0; i < list.length; i++) {
      try { list[i].send('scrm:set-enabled', !off); } catch (e) {}
      if (off) {
        // 只关开关不会擦掉已经画好的译文，这里把注入的译文块一并摘掉；再打开会重新扫描生成
        try {
          list[i].executeJavaScript(
            "(function(){var n=document.querySelectorAll('.scrm-trans-overlay');" +
            "for(var i=0;i<n.length;i++){if(n[i].parentNode)n[i].parentNode.removeChild(n[i]);}" +
            "return n.length;})()", true).catch(function () {});
        } catch (e) {}
      }
    }
  }

  function scrollLatest() {
    var list = liveWebviews();
    if (!list.length) { return false; }
    var js = '(function(){' +
      'var hit=0;' +
      'document.querySelectorAll(".bubbles,.scrollable-y,.chat-container,#column-center .scrollable,#main .copyable-area").forEach(function(e){' +
      '  try{ e.scrollTop=e.scrollHeight; hit++; }catch(x){}' +
      '});' +
      'window.scrollTo(0,document.body.scrollHeight);' +
      'return hit;' +
      '})()';
    for (var i = 0; i < list.length; i++) {
      try { list[i].executeJavaScript(js, true).catch(function () {}); } catch (e) {}
    }
    return true;
  }

  var SVG_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m6.5 11.5 5.5 5.5 5.5-5.5"/><path d="M5 20h14"/></svg>';
  var SVG_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>';
  var SVG_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
  var SVG_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
  var SVG_SPARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.7 4.1 2.2 5.6 6.3 6.3-4.1.7-5.6 2.2-6.3 6.3-.7-4.1-2.2-5.6-6.3-6.3C9.8 8.6 11.3 7.1 12 3z"/></svg>';

  // 每个平台的会话页都自带一个 .sess-toolbar，应用切换平台时并不会复用同一份 DOM，
  // 所以速用区必须在「每一栏」各挂一份；且只能用 class 定位 —— 用 id 的话
  // getElementById 永远命中第一个平台那一份，其它平台就永远补不上。
  function dockBtn(key, label, html, title) {
    var b = mkEl('div', 'yc-dock-btn yc-dock-' + key);
    b.setAttribute('data-k', key);
    b.setAttribute('data-yc', '1');
    b.title = L(title || label);
    var ico = mkEl('span', 'yc-dock-ico');
    ico.innerHTML = html;
    b.appendChild(ico);
    b.appendChild(mkEl('span', 'yc-dock-lb', L(label)));
    return b;
  }

  function paintTransBtn() {
    var raw = transRaw();
    var tip = raw === '1' ? L('当前页译文已关（点一下打开）')
      : (raw === '0' ? L('当前页译文开着（点一下关掉）') : L('当前页译文跟随翻译设置（点一下关掉）'));
    var list = document.querySelectorAll('.yc-dock-trans');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      b.classList.toggle('on', raw === '0');
      b.classList.toggle('dim', raw === '1');
      b.title = tip;
    }
  }

  function buildToolDock() {
    var dock = mkEl('div', 'yc-dock');
    dock.setAttribute('data-yc', '1');

    var b1 = dockBtn('latest', '最新', SVG_DOWN, '把聊天窗口滚到最新一条消息');
    b1.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!scrollLatest()) { b1.title = L('先在左侧打开一个会话'); }
    });

    var b2 = dockBtn('trans', '译文', '<span class="yc-dock-glyph">译</span>', '译文开关');
    b2.addEventListener('click', function (e) {
      e.stopPropagation();
      var next = !transOff();
      try { localStorage.setItem(TRANS_OFF_KEY, next ? '1' : '0'); } catch (e2) {}
      applyTransOverride();
      paintTransBtn();
    });

    var b3 = dockBtn('shot', '截图', SVG_CAMERA, '把当前会话截成图片放进剪贴板');
    b3.addEventListener('click', function (e) { e.stopPropagation(); captureChat(); });
    var b4 = dockBtn('ai', 'AI 帮写', SVG_SPARK, '用中文梗概生成外语回复');
    b4.addEventListener('click', function (e) { e.stopPropagation(); aiOpen(); });

    // v21：搜记录 / 未读两个键按需求移除（未读汇总从主页未读卡打开，系统通知不受影响）

    dock.appendChild(b1);
    dock.appendChild(b2);
    dock.appendChild(b3);
    dock.appendChild(b4);
    return dock;
  }

  // 逐栏注入：应用会把每个平台的会话页 DOM 都留着，只有当前平台可见。
  // 之前只 querySelector 第一个 .sess-toolbar，导致只有 WS 那一栏有速用区。
  function ensureToolDock() {
    try {
      var bars = document.querySelectorAll('.sess-toolbar');
      for (var i = 0; i < bars.length; i++) {
        var bar = bars[i];
        var old = bar.querySelector('.yc-dock');
        if (bar.classList.contains('sess-toolbar-collapsed')) {
          // 折叠态只剩一个细把手，塞不下五个键
          if (old && old.parentNode) old.parentNode.removeChild(old);
          continue;
        }
        if (!old) bar.appendChild(buildToolDock());
      }
      paintTransBtn();
      // 关掉译文后页面一刷新就会被应用重新打开；每 4 秒补一刀，不必每秒都发 IPC
      if (transOff()) { dockTick++; if (dockTick % 4 === 0) applyTransOverride(); }
      // 角标要跟着未读数走，所以每轮都同步一次（原来只在首次注入时算过，之后永不更新）
      syncUnread();
    } catch (e) {}
  }

  // ================= 工具箱（v14）：话术插入 / 截图 / 未读汇总 / 搜记录 / 语音转文字 =================

  // preload 里 window.scrm 是平台适配器那套（getConversations 之类），
  // 截图 / 话术填写 / 通知 / 语音识别这些是本应用自己加的，挂在 window.yichat 上。
  // v14 当初错调了 window.scrm，导致这四个功能点了都提示「当前版本不支持」。
  function yapi() {
    if (typeof window === 'undefined') return null;
    return window.yichat || null;
  }

  function toast(msg, bad) {
    try {
      var el = document.getElementById('yc-toast');
      if (!el) {
        el = mkEl('div', 'yc-toast');
        el.id = 'yc-toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.className = 'yc-toast show' + (bad ? ' bad' : '');
      clearTimeout(el.__t);
      el.__t = setTimeout(function () { el.className = 'yc-toast'; }, 2600);
    } catch (e) {}
  }

  // 当前正在看的那个平台页：取可见面积最大的（面板打开时其它页尺寸为 0）
  function activePage() {
    var list = liveWebviews();
    var best = null, area = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      var a = r.width * r.height;
      if (a > area) { area = a; best = list[i]; }
    }
    return best;
  }
  function wcIdOf(el) {
    try { return el && el.getWebContentsId ? el.getWebContentsId() : 0; } catch (e) { return 0; }
  }

  // —— 1) 话术库：每条话术补「插入」「发送」（React 不管这两个按钮，掉了下次 tick 再补）
  function phraseTextOf(row) {
    try {
      var box = row.firstElementChild;
      if (!box) return '';
      var t = box.lastElementChild || box;
      return String(t.innerText || t.textContent || '').trim();
    } catch (e) { return ''; }
  }

  function phraseAction(kind, text, btn) {
    var api = yapi();
    var page = activePage();
    var id = wcIdOf(page);
    if (!id) { toast(L('先在左边打开一个会话，再点话术'), true); return; }
    if (!api || !api.fillText) { toast(L('当前版本不支持这个操作'), true); return; }
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = kind === 'send' ? '发送中…' : '插入中…';
    var task;
    try {
      task = kind === 'send' ? api.fillAndEnter(id, text) : api.fillText(id, text);
    } catch (e) {
      task = Promise.resolve({ ok: false, message: String(e && e.message || e) });
    }
    Promise.resolve(task).then(function (r) {
      btn.disabled = false;
      btn.textContent = old;
      if (kind === 'send') {
        var ok = r === true || (r && r.ok);
        toast(ok ? '已发送' : '发送失败：先点一下平台页的输入框再试', !ok);
      } else {
        var good = r && r.ok;
        toast(good ? '已插入输入框，确认后按回车发送' : ('插入失败：' + ((r && r.message) || '未知原因')), !good);
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = old;
      toast(L('操作失败：') + (e && e.message ? e.message : e), true);
    });
  }

  function ensurePhraseActions() {
    try {
      var panel = document.querySelector('.sess-slide > .set-panel');
      if (!panel) return;
      var desc = panel.querySelector('.set-panel-desc');
      if (desc && desc.getAttribute('data-yc-desc') !== '1') {
        desc.setAttribute('data-yc-desc', '1');
        desc.textContent = L('常用话术存在本机。点「插入」只把内容放进输入框，点「发送」按当前平台的翻译设置自动翻译并直接发出。');
      }
      var btns = panel.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var del = btns[i];
        if (String(del.textContent || '').trim() !== '删除') continue;
        var row = del.parentNode;
        if (!row || !row.querySelectorAll) continue;
        if (row.querySelector('.yc-ph-act')) continue;
        row.classList.add('yc-ph-row');
        var text = phraseTextOf(row);
        if (!text) continue;
        var ins = mkEl('button', 'yc-ph-act', '插入');
        ins.type = 'button';
        ins.title = L('只放进输入框，不发送');
        (function (t, b) {
          b.addEventListener('click', function (e) { e.stopPropagation(); phraseAction('insert', t, b); });
        })(text, ins);
        var send = mkEl('button', 'yc-ph-act yc-ph-send', '发送');
        send.type = 'button';
        send.title = L('按当前平台翻译设置翻译后直接发出');
        (function (t, b) {
          b.addEventListener('click', function (e) { e.stopPropagation(); phraseAction('send', t, b); });
        })(text, send);
        row.insertBefore(ins, del);
        row.insertBefore(send, del);
      }
    } catch (e) {}
  }

  // —— 2) 截图当前会话到剪贴板
  function captureChat() {
    var api = yapi();
    var id = wcIdOf(activePage());
    var en = curLang() === 'en';
    if (!id) { toast(L('先在左侧打开一个会话'), true); return; }
    if (!api || !api.capturePage) { toast(L('当前版本不支持截图'), true); return; }
    toast(L('正在截图…'));
    Promise.resolve(api.capturePage(id)).then(function (r) {
      if (r && r.ok) toast(en ? ('Copied to clipboard (' + r.width + '×' + r.height + ')')
        : ('已复制到剪贴板（' + r.width + '×' + r.height + '）'));
      else toast((en ? 'Capture failed: ' : '截图失败：') + ((r && r.message) || (en ? 'unknown reason' : '未知原因')), true);
    }).catch(function (e) {
      toast((en ? 'Capture failed: ' : '截图失败：') + (e && e.message ? e.message : e), true);
    });
  }

  // —— 账号数据快照（2026-11-01）——
  // localStorage 全表遍历 + JSON.parse 很贵：原来 collectUnread / acctMap / acctListFor
  // 各扫一遍，工作台刷新一次就要解析 N+2 遍。现在统一读这份 1.5 秒缓存。
  var ACCT_SNAP = { at: 0, data: null };
  function acctSnapshot() {
    var now = Date.now();
    if (ACCT_SNAP.data && (now - ACCT_SNAP.at) < 1500) return ACCT_SNAP.data;
    var byPlat = {}, keys = [], flat = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i) || '';
        if (k.indexOf('yichat_accounts_') !== 0) continue;
        var key = k.slice(16);
        var arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { arr = []; }
        if (!Array.isArray(arr)) arr = [];
        byPlat[key] = arr;
        keys.push(key);
        for (var j = 0; j < arr.length; j++) flat.push({ plat: key, acc: arr[j] || {} });
      }
    } catch (e) {}
    var data = { byPlat: byPlat, keys: keys, flat: flat };
    ACCT_SNAP = { at: now, data: data };
    return data;
  }
  function dropAcctSnapshot() { ACCT_SNAP = { at: 0, data: null }; }
  try { window.addEventListener('storage', dropAcctSnapshot); } catch (e) {}

  // —— 3) 未读汇总：读本机账号表的 unread 字段（不外传），涨了才弹通知
  function collectUnread() {
    var total = 0, items = [];
    var snap = acctSnapshot();
    for (var i = 0; i < snap.flat.length; i++) {
      var it = snap.flat[i], a = it.acc;
      var n = Number(a.unread) || 0;
      if (n <= 0) continue;
      total += n;
      items.push({ name: a.name || a.nick || '未命名', platform: it.plat, n: n });
    }
    items.sort(function (x, y) { return y.n - x.n; });
    return { total: total, items: items };
  }

  var lastUnreadTotal = -1;
  function syncUnread() {
    var data = collectUnread();
    var list = document.querySelectorAll('.yc-dock-unread');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      var badge = b.querySelector('.yc-dock-badge');
      if (!badge && data.total > 0) {
        badge = mkEl('i', 'yc-dock-badge');
        b.appendChild(badge);
      }
      if (badge) {
        if (data.total > 0) { badge.textContent = data.total > 99 ? '99+' : String(data.total); badge.style.display = ''; }
        else badge.style.display = 'none';
      }
      b.classList.toggle('on', data.total > 0);
      var names = data.items.slice(0, 3).map(function (x) { return x.name + '(' + x.n + ')'; }).join('、');
      b.title = data.total > 0
        ? (curLang() === 'en' ? (data.total + ' unread: ' + names) : (data.total + ' 条未读：' + names))
        : L('当前没有未读消息');
    }
    if (lastUnreadTotal >= 0 && data.total > lastUnreadTotal && document.hidden) {
      var api = yapi();
      var top = data.items.slice(0, 2).map(function (x) { return x.name + ' ' + x.n; }).join('、');
      if (api && api.notify) {
        try { api.notify({ title: 'YiChat · ' + (data.total - lastUnreadTotal) + ' 条新消息', body: top || '有新消息进来' }); } catch (e) {}
      }
    }
    lastUnreadTotal = data.total;
    return data;
  }

  function closeUnreadModal() {
    var m = document.getElementById('yc-unread-mask');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }

  function openUnreadModal() {
    closeUnreadModal();
    var data = collectUnread();
    var mask = mkEl('div', '');
    mask.id = 'yc-unread-mask';
    var en = curLang() === 'en';
    var box = mkEl('div', 'yc-modal');
    box.appendChild(mkEl('h3', '', L('未读汇总')));
    box.appendChild(mkEl('div', 'yc-modal-sub', data.total > 0
      ? (en ? (data.total + ' unread in ' + data.items.length + ' chats') : ('共 ' + data.total + ' 条未读，' + data.items.length + ' 个会话'))
      : L('当前全部已读')));
    var wrap = mkEl('div', 'yc-online-list');
    if (!data.total) {
      var empty = mkEl('div', 'yc-online-empty');
      empty.appendChild(mkEl('b', '', L('没有未读消息')));
      empty.appendChild(mkEl('div', '', L('平台页收到新消息会自动汇总在这里，窗口不在前台时还会弹系统通知')));
      wrap.appendChild(empty);
    } else {
      for (var i = 0; i < data.items.length; i++) {
        var row = mkEl('div', 'yc-online-row');
        row.appendChild(mkEl('i', 'yc-online-dot'));
        row.appendChild(mkEl('span', 'yc-online-name', data.items[i].name));
        row.appendChild(mkEl('span', 'yc-online-plat', data.items[i].platform + ' · ' + data.items[i].n));
        wrap.appendChild(row);
      }
    }
    box.appendChild(wrap);
    var foot = mkEl('div', 'yc-modal-foot');
    var btn = mkEl('span', 'yc-modal-btn', L('关闭'));
    btn.addEventListener('click', closeUnreadModal);
    foot.appendChild(btn);
    box.appendChild(foot);
    mask.appendChild(box);
    mask.addEventListener('click', function (e) { if (e.target === mask) closeUnreadModal(); });
    document.body.appendChild(mask);
  }

  // —— 5) 语音转文字：页内点「转文字」→ 这里转给主进程识别（Key 用 API Key 里第一个可用的）
  function asrEntry() {
    try {
      var arr = JSON.parse(localStorage.getItem('yichat_api_keys') || '[]');
      if (!Array.isArray(arr)) return null;
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        if (!e.key) continue;
        if (e.type === 'Claude' || e.type === 'Gemini' || e.type === 'DeepL') continue;
        return e;
      }
    } catch (err) {}
    return null;
  }

  function bindVoice(el) {
    if (!el || el.__ycVoiceBound) return;
    el.__ycVoiceBound = true;
    el.addEventListener('ipc-message', function (e) {
      try {
        if (!e || e.channel !== 'yichat:voice-req') return;
        var d = e.args && e.args[0];
        if (!d) return;
        var api = yapi();
        var entry = asrEntry();
        if (!api || !api.llmAsr) {
          el.send('yichat:voice-res', { reqId: d.reqId, ok: false, text: '当前版本不支持语音识别' });
          return;
        }
        if (!entry) {
          el.send('yichat:voice-res', {
            reqId: d.reqId, ok: false,
            text: '还没配语音识别：设置 → API Key 里加一个 OpenAI（或自定义）Key，模型填 whisper-1',
          });
          return;
        }
        Promise.resolve(api.llmAsr(entry, d.b64, d.mime)).then(function (r) {
          el.send('yichat:voice-res', {
            reqId: d.reqId, ok: !!(r && r.ok),
            text: (r && (r.text || r.message)) || '识别失败',
          });
        }).catch(function (err) {
          el.send('yichat:voice-res', { reqId: d.reqId, ok: false, text: '识别失败：' + (err && err.message || err) });
        });
      } catch (x) {}
    });
  }

  function bindVoiceAll() {
    var list = document.querySelectorAll('webview');
    for (var i = 0; i < list.length; i++) bindVoice(list[i]);
  }

  // ================= 主页工作台（v16 · 2026-11-01） =================
  // 主页原来就三块：时钟胶囊 / 「在线会话 N」/ 两张卡，剩下 400 多像素全空。
  // 这里把整块换成工作台：
  //   左栏  平台状态矩阵（点一下切到该平台）+ 跨平台未读待办（点一下跳过去）
  //   右栏  快捷入口（复用应用自己的卡片点击）+ 今日翻译用量
  // 应用自己的 .dash-grid / .dash-side 只做 display:none 留着当"隐形按钮盒"，
  // 路由逻辑、代理弹窗、重置确认框全都沿用原版，不重写。
  var wbTick = 0;
  var wbWasHidden = false;

  var ICO = {
    translate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9"/><path d="M8.5 6v-2"/><path d="M11 6c0 3.5-3 6.5-7 8"/><path d="M6 9.5c1 2 2.6 3.4 4.5 4.2"/><path d="m12.5 20 4-9 4 9"/><path d="M14 17h5"/></svg>',
    platform: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
    proxy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z"/></svg>',
    apikey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H20"/><path d="M17 12v3"/><path d="M14 12v2.4"/></svg>',
    performance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20V4"/><path d="M3.5 20h17"/><path d="m7 15 3.6-4.4 3 2.6L20 6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.7-6"/><path d="M20 4v4.5h-4.5"/></svg>'
  };

  // v17 工作台附加图标
  var ICO_USERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.4"/><path d="M3.5 19c.7-3 2.9-4.6 5.5-4.6S13.8 16 14.5 19"/><path d="M15.5 5.2a3.4 3.4 0 0 1 0 5.6"/><path d="M17.5 14.6c1.6.7 2.6 2.1 3 4.4"/></svg>';
  var ICO_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10a6 6 0 1 0-12 0c0 4.4-1.5 5.6-2 6.4-.2.4 0 .6.4.6h15.2c.4 0 .6-.2.4-.6-.5-.8-2-2-2-6.4z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>';
  var ICO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.3 12.2 2.5 2.5 5-5.2"/></svg>';
  var ICO_BOLT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3z"/></svg>';
  var ICO_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>';
  var ICO_EMPTY_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.4 2.4 2.4 4.8-5"/></svg>';
  // v30 顶条 / 右栏小图标
  var ICO_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>';
  var ICO_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5c0 4.1-4 7.5-9 7.5-1 0-2-.1-2.9-.4L4 20l1.2-3.6C3.8 15.1 3 13.4 3 11.5 3 7.4 7 4 12 4s9 3.4 9 7.5z"/></svg>';
  var ICO_GEM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10l4 5.5-9 11.5L3 9z"/><path d="M3 9h18"/><path d="m9.5 9 2.5 11 2.5-11"/></svg>';

  // v30：恢复原版 6 张快捷卡（WK 数组本就有这 6 个入口，全部真实可点）
  var QUICK_DEFS = [
    { k: 'translate', t: '翻译设置', s: '每个平台默认翻译成哪种语言', c: '#fa8c16' },
    { k: 'proxy', t: '代理设置', s: '所有平台共用一个代理出口', c: '#1890ff' },
    { k: 'apikey', t: 'API Key 管理', s: '填自己的 Key，翻译走你的额度', c: '#722ed1' },
    { k: 'platform', t: '平台设置', s: '左侧图标栏显示哪些平台', c: '#2f6bff' },
    { k: 'performance', t: '性能监控', s: '翻译延迟 · 成功率 · 失败分析', c: '#13c2c2' },
    { k: 'reset', t: '重置', s: '清空本地数据', c: '#f5222d' }
  ];

  // 左侧导航上实际显示的平台（顺序跟着用户拖拽的排序走）
  function railPlatforms() {
    var out = [];
    var list = document.querySelectorAll('.rail-item');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var t = el.getAttribute('data-t') || '';
      if (t.indexOf('rail-') !== 0) continue;
      var key = t.slice(5);
      if (key === 'home' || key === 'settings' || key === 'phone') continue;
      // svg 抓不到时兜底 img：真实应用导航图标两种都可能用
      var svg = el.querySelector('svg') || el.querySelector('img');
      var title = el.getAttribute('title') || key;
      out.push({
        key: key,
        name: title.replace(/（[^）]*）\s*$/, ''),
        svg: svg ? svg.outerHTML : ''
      });
    }
    return out;
  }

  // 本机账号表：yichat_accounts_<platform> → {账号数, 在线数, 未读数}
  function acctMap() {
    var snap = acctSnapshot(), map = {};
    for (var key in snap.byPlat) {
      if (!Object.prototype.hasOwnProperty.call(snap.byPlat, key)) continue;
      var arr = snap.byPlat[key], n = 0, on = 0, un = 0;
      for (var j = 0; j < arr.length; j++) {
        var a = arr[j] || {};
        n++;
        if (a.online === true || a.online === 'true' || a.online === 1 || a.online === '1') on++;
        un += Number(a.unread) || 0;
      }
      map[key] = { n: n, on: on, un: un };
    }
    return map;
  }

  function aggFor(map, key) {
    if (map[key]) return map[key];
    var ks = Object.keys(map);
    for (var i = 0; i < ks.length; i++) {
      var k2 = ks[i];
      if (k2 === key || k2.indexOf(key) >= 0 || key.indexOf(k2) >= 0) return map[k2];
    }
    return { n: 0, on: 0, un: 0 };
  }

  // 平台品牌色：导航没给图标时用色块兜底，保持每行有辨识度
  var PLAT_COLORS = {
    whatsapp: '#25d366', telegram: '#229ed9', line: '#06c755', messenger: '#0084ff',
    instagram: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)', tiktok: '#111111',
    x: '#111111', twitter: '#111111', facebook: '#1877f2', kakao: '#fee500', signal: '#3a76f0'
  };
  function platColor(key) {
    var k = String(key || '').toLowerCase();
    var ks = Object.keys(PLAT_COLORS);
    for (var i = 0; i < ks.length; i++) if (k.indexOf(ks[i]) >= 0) return PLAT_COLORS[ks[i]];
    return '#98a2b3';
  }

  // 单平台账号明细（名字 / 在线 / 未读），供头像点使用
  function acctListFor(key) {
    var snap = acctSnapshot();
    if (snap.byPlat[key]) return snap.byPlat[key];
    for (var i = 0; i < snap.keys.length; i++) {
      var kk = snap.keys[i];
      if (kk.indexOf(key) >= 0 || key.indexOf(kk) >= 0) return snap.byPlat[kk];
    }
    return [];
  }

  function gotoPlatform(key) {
    var el = document.querySelector('.rail-item[data-t="rail-' + key + '"]');
    if (el) { el.click(); return; }
    toast(L('左侧没有这个平台：') + key, true);
  }

  // 快捷入口：转手去点应用自己那张隐形卡片，路由 / 弹窗 / 确认框全走原逻辑
  function clickQuick(k) {
    var dt = k === 'proxy' ? 'quick-undefined' : ('quick-' + k);
    var card = document.querySelector('.dash-grid .dash-card[data-t="' + dt + '"]');
    if (!card) { toast(L('这个入口在当前版本里没有'), true); return; }
    card.click();
  }

  // v28：单列四横带（KPI → 平台状态 → 翻译|未读 → 工具条 + 快捷键行）
  // 诊断：旧版"内容挤左、状态甩右、中间悬空"= flex 撑两端；四卡同权重 = 没有视觉重心。
  // 处方：平台行改固定栅格、标题降级为小节标签、只留一个 26px 重心、低频入口压到底部。
  // v30：对齐官方版式——顶条(时钟/主题/在线会话/常用平台) + 左主区(快捷入口六宫格 + 快捷键提示卡 + 底部行)
  //      + 右栏(版本信息 / 今日概览 / 翻译节点 / 未读待办)。
  //      原版顶条由 React 每秒重渲，不能注入节点，所以整条自建；主题胶囊点击时转触发应用自带的隐藏胶囊。
  // —— v32.1 增补：六宫格排序/隐藏、左栏角标、今日目标、AI 帮写 ——
  var TILE_ORDER_KEY = 'yichat_tile_order', TILE_HIDDEN_KEY = 'yichat_tile_hidden';
  function tilePrefs() {
    var order = null, hidden = [];
    try { order = JSON.parse(localStorage.getItem(TILE_ORDER_KEY) || 'null'); } catch (e) {}
    try { hidden = JSON.parse(localStorage.getItem(TILE_HIDDEN_KEY) || '[]'); } catch (e) {}
    var keys = QUICK_DEFS.map(function (d) { return d.k; });
    if (!Array.isArray(order)) order = keys.slice();
    order = order.filter(function (k) { return keys.indexOf(k) >= 0; });
    keys.forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });
    if (!Array.isArray(hidden)) hidden = [];
    hidden = hidden.filter(function (k) { return keys.indexOf(k) >= 0; });
    return { order: order, hidden: hidden };
  }
  function saveTilePrefs(p) {
    try {
      localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(p.order));
      localStorage.setItem(TILE_HIDDEN_KEY, JSON.stringify(p.hidden));
    } catch (e) {}
  }
  function tileSig(wb) {
    var p = tilePrefs();
    return p.order.join(',') + '|' + p.hidden.join(',') + '|' + (wb.classList.contains('yc3-editing') ? 'E' : '');
  }
  function renderTiles(wb) {
    var tiles = wb.querySelector('.yc2-tiles');
    var hrow = wb.querySelector('.yc3-hidden-row');
    if (!tiles) return;
    var p = tilePrefs();
    var editing = wb.classList.contains('yc3-editing');
    tiles.setAttribute('data-sig', tileSig(wb));
    tiles.innerHTML = '';
    for (var i = 0; i < p.order.length; i++) {
      var k = p.order[i];
      if (!editing && p.hidden.indexOf(k) >= 0) continue;
      var d = null;
      for (var j = 0; j < QUICK_DEFS.length; j++) if (QUICK_DEFS[j].k === k) d = QUICK_DEFS[j];
      if (!d) continue;
      var q = mkEl('div', 'yc2-tile' + (p.hidden.indexOf(k) >= 0 ? ' is-hidden' : ''));
      q.setAttribute('data-k', d.k);
      q.setAttribute('data-quick', '1');
      q.setAttribute('data-yc', '1');
      if (editing) q.setAttribute('draggable', 'true');
      var ic = mkEl('i', 'yc2-tile-ico');
      ic.innerHTML = ICO[d.k] || '';
      ic.style.color = d.c;
      ic.style.background = d.c + '14';
      var tx = mkEl('div', 'yc2-tile-tx');
      tx.appendChild(mkEl('b', '', L(d.t)));
      tx.appendChild(mkEl('span', '', L(d.s)));
      q.appendChild(ic);
      q.appendChild(tx);
      if (editing) {
        var x = mkEl('span', 'yc3-tile-x', '✕');
        x.setAttribute('data-act', 'tile-hide');
        x.setAttribute('data-k', d.k);
        x.setAttribute('data-yc', '1');
        q.appendChild(x);
      }
      tiles.appendChild(q);
    }
    if (hrow) {
      hrow.innerHTML = '';
      if (editing && p.hidden.length) {
        hrow.appendChild(mkEl('span', 'yc3-hidden-lb', L('已隐藏')));
        p.hidden.forEach(function (hk) {
          var def = null;
          QUICK_DEFS.forEach(function (dd) { if (dd.k === hk) def = dd; });
          if (!def) return;
          var chip = mkEl('span', 'yc3-hidden-chip', L(def.t) + ' ＋');
          chip.setAttribute('data-act', 'tile-show');
          chip.setAttribute('data-k', hk);
          chip.setAttribute('data-yc', '1');
          hrow.appendChild(chip);
        });
      }
    }
    if (!tiles.__ycDragBound) {
      tiles.__ycDragBound = true;
      var dragK = null;
      tiles.addEventListener('dragstart', function (e) {
        var t = e.target;
        if (!t.classList || !t.classList.contains('yc2-tile')) return;
        dragK = t.getAttribute('data-k');
        try { e.dataTransfer.setData('text/plain', dragK); e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
        t.classList.add('dragging');
      });
      tiles.addEventListener('dragover', function (e) {
        if (!dragK) return;
        e.preventDefault();
        var t = e.target;
        while (t && t !== tiles && !(t.classList && t.classList.contains('yc2-tile'))) t = t.parentNode;
        var olds = tiles.querySelectorAll('.yc2-tile.drop-hint');
        for (var oi = 0; oi < olds.length; oi++) olds[oi].classList.remove('drop-hint');
        if (t && t !== tiles) t.classList.add('drop-hint');
      });
      tiles.addEventListener('drop', function (e) {
        e.preventDefault();
        var t = e.target;
        while (t && t !== tiles && !(t.classList && t.classList.contains('yc2-tile'))) t = t.parentNode;
        if (!t || t === tiles || !dragK) return;
        var targetK = t.getAttribute('data-k');
        if (targetK && targetK !== dragK) {
          var p2 = tilePrefs();
          var from = p2.order.indexOf(dragK), to = p2.order.indexOf(targetK);
          if (from >= 0 && to >= 0) {
            p2.order.splice(from, 1);
            p2.order.splice(to, 0, dragK);
            saveTilePrefs(p2);
          }
        }
        dragK = null;
        renderTiles(wb);
      });
      tiles.addEventListener('dragend', function () {
        dragK = null;
        var ds = tiles.querySelectorAll('.yc2-tile.dragging, .yc2-tile.drop-hint');
        for (var di = 0; di < ds.length; di++) { ds[di].classList.remove('dragging'); ds[di].classList.remove('drop-hint'); }
      });
    }
  }

  // 左栏平台图标：在线绿点 + 未读角标（数据走 acctMap/collectUnread 同一套）
  // v333 动效：数字滚动（从上次的值滚到新值，550ms）
  var rollCache = {};
  function rollNum(el, key, to, suffix) {
    if (!el) return;
    to = Math.round(Number(to) || 0);
    var from = rollCache[key];
    rollCache[key] = to;
    if (from == null) from = 0;
    var txt = String(to) + (suffix || '');
    if (from === to) { if (el.textContent !== txt) el.textContent = txt; return; }
    if (el._rollRaf) cancelAnimationFrame(el._rollRaf);
    var t0 = performance.now(), dur = 550;
    var step = function (t) {
      var pr = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - pr, 3);
      el.textContent = String(Math.round(from + (to - from) * e)) + (suffix || '');
      el._rollRaf = pr < 1 ? requestAnimationFrame(step) : 0;
    };
    el._rollRaf = requestAnimationFrame(step);
  }
  var lastUnTotal = null;
  var railUnPrev = {};
  function paintRailBadges() {
    var map = acctMap();
    var items = document.querySelectorAll('.rail-item');
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      var dt = el.getAttribute('data-t') || '';
      if (dt.indexOf('rail-') !== 0) continue;
      var agg = aggFor(map, dt.slice(5));
      var dot = el.querySelector('.yc-rail-dot');
      if (agg.on > 0) {
        if (!dot) { dot = mkEl('i', 'yc-rail-dot'); el.appendChild(dot); }
        dot.style.display = '';
      } else if (dot) dot.style.display = 'none';
      var bd = el.querySelector('.yc-rail-badge');
      if (agg.un > 0) {
        if (!bd) { bd = mkEl('i', 'yc-rail-badge'); el.appendChild(bd); }
        var txt = agg.un > 99 ? '99+' : String(agg.un);
        if (bd.textContent !== txt) bd.textContent = txt;
        bd.style.display = '';
        if (railUnPrev[dt] != null && agg.un > railUnPrev[dt]) { bd.classList.remove('yc-pop-a'); void bd.offsetWidth; bd.classList.add('yc-pop-a'); }
      } else if (bd) bd.style.display = 'none';
      railUnPrev[dt] = agg.un;
    }
  }

  // 今日目标（进度环点击循环切换，存本机）
  function cycleGoal() {
    var steps = [100, 200, 300, 500, 1000];
    var cur = 200;
    try { cur = Number(localStorage.getItem('yichat_daily_goal') || 200) || 200; } catch (e) {}
    var next = steps[0];
    for (var i = 0; i < steps.length; i++) if (steps[i] > cur) { next = steps[i]; break; }
    try { localStorage.setItem('yichat_daily_goal', String(next)); } catch (e) {}
    toast((curLang() === 'en' ? 'Daily goal: ' : '今日目标改为 ') + next + (curLang() === 'en' ? '' : ' 条'));
  }

  // —— AI 帮写：中文梗概 → 目标语言的可发送回复（走用户自己的大模型 Key）——
  var AI_LANGS = [
    { v: '英语', en: 'English' }, { v: '韩语', en: 'Korean' }, { v: '日语', en: 'Japanese' },
    { v: '越南语', en: 'Vietnamese' }, { v: '泰语', en: 'Thai' }, { v: '西班牙语', en: 'Spanish' }, { v: '俄语', en: 'Russian' }
  ];
  var AI_TONES = ['礼貌', '简洁', '促单', '正式'];
  var aiState = { lang: '英语', tone: '礼貌', text: '' };
  function aiEntry() {
    try {
      var arr = JSON.parse(localStorage.getItem('yichat_api_keys') || '[]');
      if (!Array.isArray(arr)) return null;
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i] || {};
        if (e.key) return e;
      }
    } catch (err) {}
    return null;
  }
  function llmApi() {
    try { if (window.scrm && typeof window.scrm.llmChat === 'function') return window.scrm; } catch (e) {}
    try { if (window.yichat && typeof window.yichat.llmChat === 'function') return window.yichat; } catch (e) {}
    return null;
  }
  function aiClose() {
    var m = document.getElementById('yc-ai-mask');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function aiOpen() {
    if (document.getElementById('yc-ai-mask')) { aiClose(); return; }
    var en = curLang() === 'en';
    var mask = mkEl('div', '');
    mask.id = 'yc-ai-mask';
    var box = mkEl('div', 'yc-ai');
    var head = mkEl('div', 'yc-ai-head');
    head.appendChild(mkEl('span', 'yc-ai-star', '✦'));
    head.appendChild(mkEl('b', '', L('AI 帮写')));
    var x = mkEl('span', 'yc-ai-x', '✕');
    x.addEventListener('click', aiClose);
    head.appendChild(x);
    box.appendChild(head);
    var body = mkEl('div', 'yc-ai-body');
    // 目标语言
    body.appendChild(mkEl('div', 'yc-ai-lb', en ? 'Language' : '目标语言'));
    var lrow = mkEl('div', 'yc-ai-chips');
    AI_LANGS.forEach(function (lg) {
      var c = mkEl('span', 'yc-ai-chip' + (aiState.lang === lg.v ? ' on' : ''), en ? lg.en : lg.v);
      c.addEventListener('click', function () {
        aiState.lang = lg.v;
        var cs = lrow.querySelectorAll('.yc-ai-chip');
        for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', cs[i] === c);
      });
      lrow.appendChild(c);
    });
    body.appendChild(lrow);
    // 语气
    body.appendChild(mkEl('div', 'yc-ai-lb', L('语气')));
    var trow = mkEl('div', 'yc-ai-chips');
    AI_TONES.forEach(function (tn) {
      var c = mkEl('span', 'yc-ai-chip' + (aiState.tone === tn ? ' on' : ''), L(tn));
      c.addEventListener('click', function () {
        aiState.tone = tn;
        var cs = trow.querySelectorAll('.yc-ai-chip');
        for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('on', cs[i] === c);
      });
      trow.appendChild(c);
    });
    body.appendChild(trow);
    // 梗概
    body.appendChild(mkEl('div', 'yc-ai-lb', en ? 'Your brief (Chinese is fine)' : '你想说什么（中文写梗概）'));
    var inp = document.createElement('textarea');
    inp.className = 'yc-ai-inp';
    inp.rows = 3;
    inp.placeholder = en ? 'e.g. Ask his quantity; bulk gets wholesale price; ask country for shipping' : '例：问他要多少量，量大给批发价，让他先发收货国家算运费';
    body.appendChild(inp);
    var gen = mkEl('div', 'yc-ai-gen', L('生成回复'));
    body.appendChild(gen);
    // 结果
    var res = mkEl('div', 'yc-ai-res');
    res.style.display = 'none';
    res.appendChild(mkEl('div', 'yc-ai-lb', en ? 'Result' : '生成结果（可直接发）'));
    var out = mkEl('div', 'yc-ai-out', '');
    res.appendChild(out);
    var back = mkEl('div', 'yc-ai-back', '');
    back.style.display = 'none';
    res.appendChild(back);
    var acts = mkEl('div', 'yc-ai-acts');
    var bIns = mkEl('span', 'yc-ai-act primary', L('填入输入框'));
    bIns.addEventListener('click', function () {
      if (aiState.text) phraseAction('insert', aiState.text, document.createElement('button'));
    });
    var bCopy = mkEl('span', 'yc-ai-act', L('复制'));
    bCopy.addEventListener('click', function () {
      if (!aiState.text) return;
      function done() { toast(L('已复制')); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(aiState.text).then(done).catch(function () { toast(L('复制失败'), true); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = aiState.text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast(L('复制失败'), true); }
        document.body.removeChild(ta);
      }
    });
    var bRe = mkEl('span', 'yc-ai-act', L('重新生成'));
    bRe.addEventListener('click', function () { aiRun(inp, gen, res, out, back); });
    acts.appendChild(bIns);
    acts.appendChild(bCopy);
    acts.appendChild(bRe);
    res.appendChild(acts);
    body.appendChild(res);
    box.appendChild(body);
    mask.appendChild(box);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) aiClose(); });
    document.body.appendChild(mask);
    gen.addEventListener('click', function () { aiRun(inp, gen, res, out, back); });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 40);
  }
  function aiRun(inp, gen, res, out, back) {
    var brief = String(inp.value || '').trim();
    if (!brief) { toast(L('先写点梗概再生成'), true); return; }
    var entry = aiEntry();
    var api = llmApi();
    if (!entry || !api) { toast(L('请先在 API Key 管理里添加大模型 Key'), true); return; }
    var oldTxt = gen.textContent;
    gen.textContent = L('生成中…');
    gen.classList.add('busy');
    var prompt = '把下面这段中文梗概写成一条可以直接发给客户的' + aiState.lang + '消息。要求：语气' + aiState.tone
      + '，自然得体，只输出消息正文，不要解释、不要加引号、不要附中文翻译。\n梗概：' + brief;
    api.llmChat(entry, [{ role: 'user', content: prompt }], 600).then(function (r) {
      gen.textContent = oldTxt;
      gen.classList.remove('busy');
      if (!r || !r.ok || !r.text) {
        toast((r && r.message) || (curLang() === 'en' ? 'Generation failed' : '生成失败'), true);
        return;
      }
      aiState.text = String(r.text).trim();
      out.textContent = aiState.text;
      res.style.display = '';
      back.style.display = 'none';
      api.llmChat(entry, [{ role: 'user', content: '把下面这段话翻译成中文，只输出译文：\n' + aiState.text }], 400).then(function (r2) {
        if (r2 && r2.ok && r2.text) {
          back.textContent = L('译回中文（核对用）') + '：' + String(r2.text).trim();
          back.style.display = '';
        }
      }).catch(function () {});
    }).catch(function (err) {
      gen.textContent = oldTxt;
      gen.classList.remove('busy');
      toast((curLang() === 'en' ? 'Generation failed: ' : '生成失败：') + (err && err.message ? err.message : err), true);
    });
  }

  // —— v32 工作台（2026-11-02 按定版效果图重建）——
  // 结构：顶条（时钟 / 在线会话 / 主题色 / 常用平台）→ 问候区 → 两栏：
  //   左：快捷入口六宫格 + 近 7 天翻译量柱状图 + 快捷键条
  //   右：平台状态 + 未读待办 + 翻译节点
  // 数据全部走既有管道：acctSnapshot / collectUnread / getDailyStats，不新增数据源。
  var ACCENTS = { blue: '#005dff', purple: '#722ed1', teal: '#08979c', orange: '#fa8c16' };
  function curAccent() {
    try { return localStorage.getItem('yichat_accent') || 'blue'; } catch (e) { return 'blue'; }
  }
  function applyAccent(wb, name) {
    var c = ACCENTS[name] || ACCENTS.blue;
    try { localStorage.setItem('yichat_accent', name); } catch (e) {}
    if (wb) {
      wb.style.setProperty('--wb-brand', c);
      var ds = wb.querySelectorAll('.yc3-acc-dot');
      for (var i = 0; i < ds.length; i++) ds[i].classList.toggle('on', ds[i].getAttribute('data-acc') === name);
    }
    try { document.body.style.setProperty('--wb-brand', c); } catch (e) {}
  }
  function greetWord() {
    var h = new Date().getHours();
    if (h < 6) return L('凌晨好');
    if (h < 12) return L('上午好');
    if (h < 14) return L('中午好');
    if (h < 19) return L('下午好');
    return L('晚上好');
  }

  function buildWorkbench() {
    var wb = mkEl('div', 'yc-wb yc-wb3');
    wb.id = 'yc-wb';
    var hr0 = new Date().getHours();
    wb.setAttribute('data-part', hr0 < 6 ? 'night' : hr0 < 12 ? 'morning' : hr0 < 14 ? 'noon' : hr0 < 19 ? 'afternoon' : 'evening');



    // ② 头部带：问候 + 今日指标 + 搜索 / AI 帮写 / 主题色，一行收齐（v3.3.1 定版）
    var gr = mkEl('div', 'yc3-greet');
    var gmn = mkEl('div', 'yc3-greet-main');
    gmn.appendChild(mkEl('h1', 'yc3-greet-t', greetWord()));
    var gsub = mkEl('span', 'yc3-greet-sub');
    gsub.appendChild(mkEl('span', 'yc3-gs-date', ''));
    gsub.appendChild(mkEl('span', 'yc3-gs-time', ''));
    gsub.appendChild(mkEl('span', 'yc3-gs-sess', ''));
    gmn.appendChild(gsub);
    gr.appendChild(gmn);
    var gst2 = mkEl('div', 'yc3-gstats');
    [['yc3-gs-ok', '今日翻译（条）'], ['yc3-gs-rate', '今日成功率'], ['yc3-gs-un', '未读消息']].forEach(function (gd) {
      var gs1 = mkEl('div', 'yc3-gstat ' + gd[0]);
      gs1.appendChild(mkEl('b', 'yc3-gstat-v', '—'));
      gs1.appendChild(mkEl('span', 'yc3-gstat-l', L(gd[1])));
      gst2.appendChild(gs1);
    });
    gr.appendChild(gst2);
    var gact = mkEl('div', 'yc3-gactions');
    var srch = mkEl('span', 'yc3-search');
    srch.setAttribute('data-act', 'palette');
    srch.setAttribute('data-yc', '1');
    srch.appendChild(mkEl('span', '', '⌕ ' + (curLang() === 'en' ? 'Search platforms, chats, features' : '搜索平台、会话、功能')));
    srch.appendChild(mkEl('b', 'yc3-kbd', 'Ctrl+K'));
    gact.appendChild(srch);
    var aib = mkEl('span', 'yc3-ai-btn', '✦ ' + L('AI 帮写'));
    aib.setAttribute('data-act', 'ai');
    aib.setAttribute('data-yc', '1');
    gact.appendChild(aib);
    var acc = mkEl('span', 'yc3-acc');
    acc.title = L('主题色');
    ['blue', 'purple', 'teal', 'orange'].forEach(function (nm) {
      var dd = mkEl('i', 'yc3-acc-dot');
      dd.setAttribute('data-act', 'accent');
      dd.setAttribute('data-acc', nm);
      dd.setAttribute('data-yc', '1');
      dd.style.background = ACCENTS[nm];
      acc.appendChild(dd);
    });
    gact.appendChild(acc);
    gr.appendChild(gact);
    wb.appendChild(gr);

    // ③ 两栏
    var cols = mkEl('div', 'yc3-cols');
    var left = mkEl('div', 'yc3-left');

    var sh = mkEl('div', 'yc2-sect');
    sh.appendChild(mkEl('b', '', L('快捷入口')));
    var etb = mkEl('span', 'yc3-sect-edit', L('编辑'));
    etb.setAttribute('data-act', 'tiles-edit');
    etb.setAttribute('data-yc', '1');
    sh.appendChild(etb);
    left.appendChild(sh);
    var tiles = mkEl('div', 'yc2-tiles');
    left.appendChild(tiles);
    var hrow = mkEl('div', 'yc3-hidden-row');
    left.appendChild(hrow);
    renderTiles(wb);

    // 近 7 天翻译量（本机统计 history，paint 填充）
    var chart = mkEl('div', 'yc3-card yc3-chart-card');
    var chH = mkEl('div', 'yc3-card-h');
    chH.appendChild(mkEl('b', '', L('近7天翻译量')));
    chH.appendChild(mkEl('span', 'yc3-card-s', L('本机统计')));
    var chTot = mkEl('span', 'yc3-chart-tot');
    chTot.appendChild(mkEl('span', 'yc3-chart-pre', ''));
    chTot.appendChild(mkEl('b', 'yc3-chart-n', '—'));
    chTot.appendChild(mkEl('span', 'yc3-chart-suf', ''));
    var goalEl = mkEl('span', 'yc3-goal');
    goalEl.setAttribute('data-act', 'goal');
    goalEl.setAttribute('data-yc', '1');
    goalEl.innerHTML = '<svg width="30" height="30" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(127,127,127,.18)" stroke-width="3.5"/><circle class="yc3-goal-fg" cx="18" cy="18" r="15.5" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="97.4" stroke-dashoffset="97.4" transform="rotate(-90 18 18)"/></svg>';
    goalEl.appendChild(mkEl('span', 'yc3-goal-t', ''));
    chH.appendChild(goalEl);
    chH.appendChild(chTot);
    chart.appendChild(chH);
    chart.appendChild(mkEl('div', 'yc3-chart'));
    chart.appendChild(mkEl('div', 'yc3-chart-empty', ''));
    left.appendChild(chart);

    // 快捷键条
    var en0 = curLang() === 'en';
    var tips = mkEl('div', 'yc3-tips');
    tips.appendChild(mkEl('b', '', L('快捷键')));
    var tipDefs = [
      ['Ctrl+B', L('收起 / 展开会话栏')],
      ['Ctrl+K', L('命令面板')],
      ['', L('点未读直达会话')]
    ];
    for (var ti = 0; ti < tipDefs.length; ti++) {
      var ts = mkEl('span', 'yc3-tip');
      if (tipDefs[ti][0]) ts.appendChild(mkEl('b', 'yc3-kbd', tipDefs[ti][0]));
      ts.appendChild(document.createTextNode(tipDefs[ti][1]));
      tips.appendChild(ts);
    }
    chart.appendChild(tips);
    cols.appendChild(left);

    // 右栏
    var right = mkEl('div', 'yc3-right');

    var pc3 = mkEl('div', 'yc3-card');
    var pcH = mkEl('div', 'yc3-card-h');
    pcH.appendChild(mkEl('b', '', L('平台状态')));
    pcH.appendChild(mkEl('span', 'yc3-card-s yc3-plats-sub', ''));
    pc3.appendChild(pcH);
    pc3.appendChild(mkEl('div', 'yc3-plats'));
    right.appendChild(pc3);

    var uc = mkEl('div', 'yc3-card');
    var ucH = mkEl('div', 'yc3-card-h');
    ucH.appendChild(mkEl('b', '', L('未读待办')));
    ucH.appendChild(mkEl('span', 'yc3-card-s yc3-un-sub', ''));
    uc.appendChild(ucH);
    uc.appendChild(mkEl('div', 'yc3-unread'));
    right.appendChild(uc);

    var nc = mkEl('div', 'yc3-card yc3-node-card');
    var ncH = mkEl('div', 'yc3-card-h');
    ncH.appendChild(mkEl('b', '', L('翻译节点')));
    nc.appendChild(ncH);
    var nbig = mkEl('div', 'yc3-node-big');
    nbig.appendChild(mkEl('b', 'yc3-node-ms', '—'));
    nbig.appendChild(mkEl('span', 'yc3-node-unit', 'ms'));
    var ngrade = mkEl('span', 'yc3-node-grade');
    ngrade.appendChild(mkEl('i', 'yc3-node-dot'));
    ngrade.appendChild(mkEl('span', 'yc3-node-st', '—'));
    nbig.appendChild(ngrade);
    nc.appendChild(nbig);
    nc.appendChild(mkEl('div', 'yc3-node-sub', ''));
    right.appendChild(nc);

    cols.appendChild(right);
    wb.appendChild(cols);

    // 页脚
    var foot = mkEl('div', 'yc2-foot');
    foot.appendChild(mkEl('span', 'yc2-foot-l', L('翻译 · 本机数据不上传') + ' · v3.5.0'));
    wb.appendChild(foot);

    // 事件委托：卡片被反复重建也不会丢点击
    wb.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== wb && !(t.getAttribute && (t.getAttribute('data-k') || t.getAttribute('data-act')))) t = t.parentNode;
      if (!t || t === wb) return;
      var act = t.getAttribute('data-act');
      if (act === 'accent') { applyAccent(wb, t.getAttribute('data-acc')); return; }
      if (act === 'palette') { palOpen(); return; }
      if (act === 'ai') { aiOpen(); return; }
      if (act === 'goal') { cycleGoal(); paintWorkbench(true); return; }
      if (act === 'tiles-edit') { wb.classList.toggle('yc3-editing'); renderTiles(wb); return; }
      if (act === 'tile-hide') { var tp1 = tilePrefs(); var hk3 = t.getAttribute('data-k'); if (tp1.hidden.indexOf(hk3) < 0) tp1.hidden.push(hk3); saveTilePrefs(tp1); renderTiles(wb); return; }
      if (act === 'tile-show') { var tp2 = tilePrefs(); var sk3 = t.getAttribute('data-k'); tp2.hidden = tp2.hidden.filter(function (xx) { return xx !== sk3; }); saveTilePrefs(tp2); renderTiles(wb); return; }
      if (act === 'unread-more') { openUnreadModal(); return; }
      if (act === 'theme') {
        var sw = document.querySelector('[data-t="theme-switch"]');
        if (sw) sw.click(); else toast(L('当前版本不支持这个操作'), true);
        return;
      }
      var k = t.getAttribute('data-k');
      if (!k) return;
      if (wb.classList.contains('yc3-editing') && t.getAttribute('data-quick')) return;
      if (k === '__unread') { openUnreadModal(); return; }
      if (t.getAttribute('data-quick')) { clickQuick(k); return; }
      gotoPlatform(k);
    });

    applyAccent(wb, curAccent());
    return wb;
  }

  function paintWorkbench(force) {
    var en = curLang() === 'en';
    var wb = document.getElementById('yc-wb');
    if (!wb) return;

    // 常用平台图标：跟随左侧导航排序；svg 抓不到时用品牌色字母块兜底
    var map = acctMap();
    var plats = railPlatforms();
    var svgMap = {};
    plats.forEach(function (p) { svgMap[p.key] = p.svg; });
    // 在线会话数：全部账号里的在线数
    var onSum = 0;
    for (var mk in map) {
      if (!Object.prototype.hasOwnProperty.call(map, mk)) continue;
      onSum += map[mk].on;
    }
    var sn = wb.querySelector('.yc3-gs-sess');
    if (sn) { var stx = ' · ' + (en ? (onSum + ' online') : ('在线会话 ' + onSum)); if (sn.textContent !== stx) sn.textContent = stx; }

    // 数据：本机翻译统计 + 未读
    refreshStats(false);
    var st = lastStats;
    var data = collectUnread();
    var hist = st && Array.isArray(st.history) ? st.history : [];
    var histSum = hist.reduce(function (s2, x) { return s2 + (x.ok || 0); }, 0);

    // 问候副行：日期（时间由 wbClock 每秒刷，在线会话在上方已刷）
    var sub = wb.querySelector('.yc3-gs-date');
    var okN = st ? (st.ok || 0) : 0;
    var totN = st ? (st.total || 0) : 0;
    var rateN = st ? (st.rate || 0) : 0;
    if (sub) {
      var d = new Date();
      var wk = en
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
        : ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()];
      var dateTxt = en
        ? (d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + wk)
        : ((d.getMonth() + 1) + '月' + d.getDate() + '日 ' + wk);
      if (sub.textContent !== dateTxt) sub.textContent = dateTxt;
    }
    // 头部指标块：今日翻译 / 今日成功率 / 未读（未读 0 时弱化）
    var gvOk = wb.querySelector('.yc3-gs-ok .yc3-gstat-v');
    if (gvOk) rollNum(gvOk, 'ok', okN);
    var gvRate = wb.querySelector('.yc3-gs-rate .yc3-gstat-v');
    if (gvRate) { if (totN > 0) rollNum(gvRate, 'rate', rateN, '%'); else { rollCache.rate = null; if (gvRate.textContent !== '—') gvRate.textContent = '—'; } }
    // v3312：成功率档位色——≥99 绿（健康）/ 95–99 品牌色（默认）/ <95 红（出问题一眼可见）
    if (gvRate) { var rc = totN > 0 ? (rateN >= 99 ? '#12b76a' : (rateN >= 95 ? '' : '#f04438')) : ''; if (gvRate.style.color !== rc) gvRate.style.color = rc; }
    var gvUn = wb.querySelector('.yc3-gs-un .yc3-gstat-v');
    if (gvUn) rollNum(gvUn, 'un', data.total);
    var gsUn = wb.querySelector('.yc3-gs-un');
    if (gsUn) gsUn.classList.toggle('zero', data.total === 0);

    // 近 7 天柱状图
    var chart = wb.querySelector('.yc3-chart');
    if (chart) {
      var csig = hist.map(function (x) { return x.ok || 0; }).join(',');
      if (force || chart.getAttribute('data-sig') !== csig) {
        chart.setAttribute('data-sig', csig);
        chart.innerHTML = '';
        var mx = Math.max.apply(null, hist.map(function (x) { return x.ok || 0; }).concat([1]));
        for (var ci = 0; ci < hist.length; ci++) {
          var cell = hist[ci], v = cell.ok || 0;
          var wrap = mkEl('div', 'yc3-bar-wrap');
          wrap.appendChild(mkEl('span', 'yc3-bar-v', String(v)));
          var bar = mkEl('div', 'yc3-bar' + (ci === hist.length - 1 ? ' today' : '') + (v === 0 ? ' zero' : ''));
          bar.style.height = Math.max(3, Math.round(v / mx * 100)) + '%';
          bar.style.animationDelay = (550 + ci * 80) + 'ms';
          wrap.appendChild(bar);
          wrap.appendChild(mkEl('span', 'yc3-bar-tip', String(cell.d || '').slice(5) + ' · ' + v + (en ? '' : ' 条')));
          wrap.appendChild(mkEl('span', 'yc3-bar-d', ci === hist.length - 1 ? L('今天') : String(cell.d || '').slice(5)));
          chart.appendChild(wrap);
        }
        if (histSum > 0 && hist.length) {
          var avg = Math.round(histSum / hist.length);
          var avgEl = mkEl('div', 'yc3-avg');
          avgEl.style.bottom = 'calc(18px + ' + Math.round(avg / mx * 100) + '%)';
          avgEl.appendChild(mkEl('span', '', (en ? 'Avg ' : '日均 ') + avg));
          chart.appendChild(avgEl);
        }
      }
      var cempty = wb.querySelector('.yc3-chart-empty');
      if (cempty) {
        var showEmpty = hist.length > 0 && histSum === 0;
        cempty.style.display = showEmpty ? 'flex' : 'none';
        if (showEmpty) {
          var etxt = en ? 'No data yet — bars will grow here as you translate' : '暂无数据 · 翻译后这里会长出柱子';
          if (cempty.textContent !== etxt) cempty.textContent = etxt;
        }
      }
      var cpre = wb.querySelector('.yc3-chart-pre');
      var csuf = wb.querySelector('.yc3-chart-suf');
      var cn = wb.querySelector('.yc3-chart-n');
      if (cpre) cpre.textContent = en ? '7-day total ' : '7 天共 ';
      if (csuf) csuf.textContent = en ? '' : ' 条';
      if (cn) rollNum(cn, 'sum', histSum);
    }

    // 平台状态
    var pbox = wb.querySelector('.yc3-plats');
    if (pbox) {
      var unByPlat = {};
      for (var ui = 0; ui < data.items.length; ui++) {
        unByPlat[data.items[ui].platform] = (unByPlat[data.items[ui].platform] || 0) + data.items[ui].n;
      }
      var psig = plats.map(function (p) {
        var a = aggFor(map, p.key);
        return p.key + ':' + a.on + ':' + (unByPlat[p.key] || a.un || 0);
      }).join(',');
      if (force || pbox.getAttribute('data-sig') !== psig) {
        pbox.setAttribute('data-sig', psig);
        pbox.innerHTML = '';
        var onN = 0;
        var built = [];
        for (var pi = 0; pi < plats.length; pi++) {
          var pp = plats[pi];
          var ag = aggFor(map, pp.key);
          var isOn = ag.on > 0;
          if (isOn) onN++;
          var row = mkEl('div', 'yc3-prow');
          row.setAttribute('data-k', pp.key);
          row.setAttribute('data-yc', '1');
          var pic = mkEl('span', 'yc3-pico2');
          if (pp.svg) {
            pic.innerHTML = pp.svg;
          } else {
            pic.classList.add('brand');
            var pcv = platColor(pp.key);
            if (pcv.indexOf('gradient') >= 0) pic.style.background = pcv; else pic.style.color = pcv;
            pic.innerHTML = '<span>' + String(pp.name).slice(0, 1).toUpperCase() + '</span>';
          }
          row.appendChild(pic);
          row.appendChild(mkEl('span', 'yc3-pname', pp.name));
          var stBox = mkEl('span', 'yc3-pst');
          var un = unByPlat[pp.key] || ag.un || 0;
          if (un > 0) stBox.appendChild(mkEl('i', 'yc3-badge', un > 99 ? '99+' : String(un)));
          var dt = mkEl('span', 'yc3-pstat');
          dt.appendChild(mkEl('i', 'yc3-sdot' + (isOn ? ' on' : '')));
          dt.appendChild(document.createTextNode(isOn ? L('已打开') : L('未打开')));
          stBox.appendChild(dt);
          row.appendChild(stBox);
          built.push({ el: row, on: isOn });
        }
        built.sort(function (a, b) { return (b.on ? 1 : 0) - (a.on ? 1 : 0); });
        var seenOff = false;
        for (var bi = 0; bi < built.length; bi++) {
          if (!built[bi].on && onN > 0 && !seenOff) { pbox.appendChild(mkEl('div', 'yc3-pdiv')); seenOff = true; }
          pbox.appendChild(built[bi].el);
        }
        if (!plats.length) pbox.appendChild(mkEl('div', 'yc3-pnone', L('暂无平台')));
        var psub = wb.querySelector('.yc3-plats-sub');
        if (psub) psub.textContent = en ? (onN + ' open') : (onN + ' 个已打开');
      }
    }

    // 未读待办
    var unBox = wb.querySelector('.yc3-unread');
    var unSub = wb.querySelector('.yc3-un-sub');
    if (unSub) unSub.textContent = data.total > 0 ? (en ? (data.total + ' unread') : ('共 ' + data.total + ' 条')) : L('全部已读');
    var usig = data.items.map(function (x) { return x.platform + '|' + x.name + '|' + x.n; }).join(',');
    if (unBox && unBox.getAttribute('data-sig') !== usig) {
      unBox.setAttribute('data-sig', usig);
      unBox.innerHTML = '';
      if (!data.total) {
        var em = mkEl('div', 'yc-un-empty');
        em.innerHTML = ICO_EMPTY_OK;
        em.appendChild(mkEl('b', '', L('没有未读消息')));
        em.appendChild(mkEl('span', '', L('新消息会自动汇总到这里')));
        unBox.appendChild(em);
      } else {
        var MAXU = 3;
        var nShow = Math.min(data.items.length, MAXU);
        for (var m = 0; m < nShow; m++) {
          var it = data.items[m];
          var row2 = mkEl('div', 'yc-un-row');
          row2.setAttribute('data-k', it.platform);
          row2.setAttribute('data-yc', '1');
          var uic = mkEl('span', 'yc3-pico2 yc-un-ico');
          var usvg = svgMap[it.platform];
          if (usvg) {
            uic.innerHTML = usvg;
          } else {
            uic.classList.add('brand');
            var pcw = platColor(it.platform);
            if (pcw.indexOf('gradient') >= 0) uic.style.background = pcw; else uic.style.color = pcw;
            uic.innerHTML = '<span>' + String(it.platform).slice(0, 1).toUpperCase() + '</span>';
          }
          row2.appendChild(uic);
          row2.appendChild(mkEl('span', 'yc-un-name', it.name));
          row2.appendChild(mkEl('span', 'yc-un-plat', it.platform));
          row2.appendChild(mkEl('em', 'yc-un-n', it.n > 99 ? '99+' : String(it.n)));
          unBox.appendChild(row2);
        }
        var tail = mkEl('div', 'yc-un-tail');
        tail.setAttribute('data-act', 'unread-more');
        tail.setAttribute('data-yc', '1');
        tail.appendChild(mkEl('span', '', data.items.length > MAXU
          ? (en ? ('+' + (data.items.length - MAXU) + ' more chats unread') : ('还有 ' + (data.items.length - MAXU) + ' 个会话未读'))
          : L('点击一条直接跳转')));
        unBox.appendChild(tail);
      }
    }

    // v339：未读为空时卡片瘦身（少占一截高度）
    if (unBox) { var ucCard2 = unBox.closest ? unBox.closest('.yc3-card') : null; if (ucCard2) ucCard2.classList.toggle('yc3-unslim', data.total === 0); }

    // v333：新未读提醒——总数变多时未读卡轻闪一次（不弹窗不出声）
    if (lastUnTotal !== null && data.total > lastUnTotal && unBox) {
      var ucardEl = unBox.closest ? unBox.closest('.yc3-card') : null;
      if (ucardEl) { ucardEl.classList.remove('yc3-flash'); void ucardEl.offsetWidth; ucardEl.classList.add('yc3-flash'); }
    }
    lastUnTotal = data.total;

    // 翻译节点卡：平均延迟分档（优秀 ≤400ms / 良好 ≤1200ms / 偏慢）
    var nms = wb.querySelector('.yc3-node-ms');
    var nst = wb.querySelector('.yc3-node-st');
    var ndot = wb.querySelector('.yc3-node-dot');
    if (nms && nst) {
      var grade, gcls;
      if (!st || !(st.avgMs > 0)) { grade = L('暂无数据'); gcls = 'off'; }
      else if (st.avgMs <= 400) { grade = L('优秀'); gcls = 'good'; }
      else if (st.avgMs <= 1200) { grade = L('良好'); gcls = 'mid'; }
      else { grade = L('偏慢'); gcls = 'bad'; }
      if (!st || !(st.avgMs > 0)) { if (nms.textContent !== '—') nms.textContent = '—'; }
      else rollNum(nms, 'ms', st.avgMs);
      if (nst.textContent !== grade) nst.textContent = grade;
      if (ndot) ndot.className = 'yc3-node-dot ' + gcls;
      var nsub = wb.querySelector('.yc3-node-sub');
      if (nsub) {
        if (st && !(st.avgMs > 0)) {
          var hint = en ? 'Average latency will appear here once you translate' : '翻译后这里会显示平均延迟';
          if (nsub.textContent !== hint) nsub.textContent = hint;
        } else {
          var t2 = st ? (en
            ? ('Success ' + (st.rate || 0) + '% · ' + (st.fail || 0) + ' failed today')
            : ('今日成功率 ' + (st.rate || 0) + '% · 失败 ' + (st.fail || 0) + ' 条')) : '';
          if (nsub.textContent !== t2) nsub.textContent = t2;
        }
      }
      if (nms) nms.classList.toggle('nodata', !(st && st.avgMs > 0));
    }

    // 今日目标进度环
    var gfg = wb.querySelector('.yc3-goal-fg');
    var gt = wb.querySelector('.yc3-goal-t');
    if (gfg && gt) {
      var goalN = 200;
      try { goalN = Number(localStorage.getItem('yichat_daily_goal') || 200) || 200; } catch (e) {}
      var okToday = st ? (st.ok || 0) : 0;
      var pct = Math.max(0, Math.min(1, okToday / goalN));
      gfg.style.strokeDashoffset = String(97.4 * (1 - pct));
      var gtxt = en ? ('Today ' + okToday + '/' + goalN) : ('今日 ' + okToday + '/' + goalN + ' 条');
      if (gt.textContent !== gtxt) gt.textContent = gtxt;
      var gw = wb.querySelector('.yc3-goal');
      if (gw) gw.title = en ? 'Daily goal — click to change' : '今日目标（点击切换）';
      // v333：目标达成——环庆祝一次 + 常驻「达成」小标（按天+目标值记一次）
      if (gw) {
        var doneEl = gw.querySelector('.yc3-done');
        var isDone = goalN > 0 && okToday >= goalN;
        if (isDone) {
          var overN = okToday - goalN;
          var doneTxt = overN > 0 ? (en ? ('🎉 +' + overN + ' over goal') : ('🎉 已超额 ' + overN + ' 条')) : (en ? '🎉 Done' : '🎉 达成');
          if (!doneEl) { doneEl = mkEl('span', 'yc3-done', doneTxt); gw.appendChild(doneEl); }
          else if (doneEl.textContent !== doneTxt) doneEl.textContent = doneTxt;
          var dayKey = (st && st.date ? st.date : '') + ':' + goalN;
          var seenKey = '';
          try { seenKey = localStorage.getItem('yichat_goal_done') || ''; } catch (e) {}
          if (seenKey !== dayKey) {
            try { localStorage.setItem('yichat_goal_done', dayKey); } catch (e) {}
            gw.classList.remove('yc3-celeb'); void gw.offsetWidth; gw.classList.add('yc3-celeb');
          }
        } else if (doneEl) doneEl.remove();
      }
    }

    // 六宫格编辑钮文案 + 排序/隐藏同步
    var et = wb.querySelector('.yc3-sect-edit');
    if (et) {
      var wantEt = wb.classList.contains('yc3-editing') ? L('完成') : L('编辑');
      if (et.textContent !== wantEt) et.textContent = wantEt;
    }
    var tc = wb.querySelector('.yc2-tiles');
    if (tc && tc.getAttribute('data-sig') !== tileSig(wb)) renderTiles(wb);
  }

  // 顶条时钟：自有节点，每秒 textContent 一次（很便宜），和原版顶条行为一致
  function wbClock() {
    var el = document.querySelector('#yc-wb .yc3-gs-time');
    if (!el) return;
    var d = new Date();
    function p2(x) { return String(x).padStart(2, '0'); }
    el.textContent = ' · ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  function ensureWorkbench() {
    var main = document.querySelector('.dash-main');
    if (!main) return;
    var wb = document.getElementById('yc-wb');
    if (!wb || !main.contains(wb)) {
      var old = document.getElementById('yc-wb');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var nwb = buildWorkbench();
      nwb.classList.add('yc3-enter');
      main.appendChild(nwb);
      setTimeout(function () { nwb.classList.remove('yc3-enter'); }, 1700);
      paintWorkbench(true);
      wbClock();
      return;
    }
    // 切回首页重播入场动画：工作台被隐藏过又重新可见，视为一次回到首页
    var wbVis = !!(wb.offsetParent || (wb.getClientRects && wb.getClientRects().length));
    if (wbVis && wbWasHidden && !wb.classList.contains('yc3-enter')) {
      wb.classList.add('yc3-enter');
      setTimeout(function () { wb.classList.remove('yc3-enter'); }, 1700);
      paintWorkbench(true);
    }
    wbWasHidden = !wbVis;
    wbClock();
    wbTick++;
    if (wbTick % 2 === 1 && !document.hidden) paintWorkbench(false);   // 2 秒刷一次数字；后台不重排
  }

  // 1 秒心跳：React 每次重渲染都会把这些注入节点冲掉，缺什么补什么。
  // 每一项都单独 try，一项出错不影响其它项。

  /* ---------- 账号备注兜底缓存 ----------
     演示/模拟模式下，原版把备注只存在内存里（刷新即丢），这里做一份本地缓存：
     ① 看到非空备注就记下来；② 下次启动看到「暂无备注」就把缓存内容补回显示；
     ③ 用户主动清空（编辑完为空）就删掉缓存，不会反复复活。 */
  var REMARK_KEY = 'yichat_acc_remarks_cache';
  var remarkMap = {};
  try { remarkMap = JSON.parse(localStorage.getItem(REMARK_KEY) || '{}') || {}; } catch (e) { remarkMap = {}; }
  var remarkEditing = {};
  function remarkFlush() {
    try { localStorage.setItem(REMARK_KEY, JSON.stringify(remarkMap)); } catch (e) {}
  }
  // 备注行的三种显示形态（2026-11-01 用户要求：每个账号下面都要能写备注，方便区分）
  //   · 有备注   → 「✎ 备注内容」，点击进入编辑
  //   · 没备注   → 「＋ 添加备注」，点击进入编辑
  //   · 正在编辑 → 不碰（应用自己渲染 input，改文案会打断输入）
  var NOTE_MARK = '\u270e ';   // ✎
  var NOTE_ADD = '\uff0b ';    // ＋
  function remarkLabelEmpty(raw) {
    var t = String(raw || '').replace(/^[\u270e\uff0b\s]+/, '').trim();
    if (!t) return true;
    return t === '暂无备注' || t === 'No remark' || t === '添加备注' || t === 'Add note';
  }
  function keepRemarks() {
    // ⚠️ 2026-11-01 白屏事故教训：绝不能写 React 管理的节点（textContent 会杀掉
    // React 持有的文本节点引用，应用一重渲染就 NotFoundError → 整页白屏）。
    // 所以方案是：备注行完全用我们自己的元素 .yc-acc-note 渲染，
    // 应用的原生行只做 display 隐藏/显示 + 只读取文本，一个字都不改。
    var cards = document.querySelectorAll('.sess-acc-card[data-acc-id]');
    var addTxt = L('添加备注');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var id = card.getAttribute('data-acc-id');
      if (!id) continue;
      var lab = card.querySelector('.sess-acc-remark');
      if (!lab) continue;
      var row = lab.parentNode;
      var editing = !!card.querySelector('.sess-acc-remark-edit');

      // 只读同步：编辑结束的一瞬把结果写进缓存（读原生行的文本，不写）
      if (editing) {
        remarkEditing[id] = 1;
      } else if (remarkEditing[id]) {
        delete remarkEditing[id];
        var done = remarkLabelEmpty(lab.textContent) ? '' : String(lab.textContent).replace(/^[\u270e\uff0b]\s*/, '').trim();
        if (done) { if (remarkMap[id] !== done) { remarkMap[id] = done; remarkFlush(); } }
        else if (remarkMap[id]) { delete remarkMap[id]; remarkFlush(); }
      } else if (!remarkLabelEmpty(lab.textContent)) {
        // 非编辑态下应用自己显示了真实备注（真实登录模式），也记进缓存
        var live = String(lab.textContent).replace(/^[\u270e\uff0b]\s*/, '').trim();
        if (remarkMap[id] !== live) { remarkMap[id] = live; remarkFlush(); }
      }

      // 我们自己的备注行：点击时转触发应用原生的备注 span（element.click 安全）
      var note = card.querySelector('.yc-acc-note');
      if (!note) {
        note = mkEl('div', 'yc-acc-note');
        if (row && row.parentNode) row.parentNode.insertBefore(note, row.nextSibling);
        else card.appendChild(note);
        (function (btn, c) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var sp = c.querySelector('.sess-acc-remark');
            if (sp) {
              sp.click();
              // 立刻让位给编辑框，不等下一次心跳（React 稍后才把 span 换成 input，行先显示出来）
              var r2 = sp.parentNode;
              if (r2) r2.style.display = '';
              btn.style.display = 'none';
              return;
            }
            toast(L('当前版本不支持这个操作'), true);
          });
        })(note, card);
      }
      var cached = remarkMap[id] || '';
      var want = cached ? (NOTE_MARK + cached) : (NOTE_ADD + addTxt);
      if (note.textContent !== want) note.textContent = want;
      var title = cached ? L('点击修改备注') : L('点击添加备注');
      if (note.title !== title) note.title = title;
      note.classList.toggle('is-empty', !cached);

      // 原生行：平时隐藏；编辑时显示（输入框在里面），我们的行让位
      if (row) {
        if (row.getAttribute('data-yc-slim') === '1') {
          row.removeAttribute('data-yc-slim');
        }
        row.style.display = editing ? '' : 'none';
      }
      note.style.display = editing ? 'none' : '';
    }
  }

  // —— 会话页左下「会话置于顶部」浮钮：应用渲染的无 class 裸 div，按文本＋位置认领。
  // 定位不用内联样式（应用重渲染会把内联 left/width 抹回它自己的值，再被心跳改回来
  // 就成了肉眼可见的「跳」）：改走 html 上的 CSS 变量，.yc-pintop 规则以 !important 读变量，
  // 应用怎么重写都动不了计算位置。再加 MutationObserver 在节点被重建时即时补类，不等心跳。
  var ycPinVars = '';
  function tagPinTop() {
    var side = null;   // 18 个平台的 .sess-side 都在 DOM 里，只认当前可见（有宽度）的那个
    var allSides = document.querySelectorAll('.sess-side');
    for (var j = 0; j < allSides.length; j++) { if (allSides[j].getBoundingClientRect().width > 0) { side = allSides[j]; break; } }
    if (!side) return;
    var sr = side.getBoundingClientRect();
    if (!sr.width) return;
    var key = Math.round(sr.left + 12) + '/' + Math.round(sr.width - 24);
    if (key !== ycPinVars) {
      ycPinVars = key;
      var root = document.documentElement.style;
      root.setProperty('--yc-pin-left', Math.round(sr.left + 12) + 'px');
      root.setProperty('--yc-pin-w', Math.round(sr.width - 24) + 'px');
    }
    var divs = document.querySelectorAll('div');
    for (var i = 0; i < divs.length; i++) {
      var el = divs[i];
      if (el.children.length > 1) continue;
      var t = (el.textContent || '').trim();
      if (t.length > 24) continue;
      if (!/置于顶部|取消置顶|置於頂部|Pin to top|Unpin|Ghim/.test(t)) continue;
      var r = el.getBoundingClientRect();
      if (window.innerHeight - r.bottom > 90) continue;   // 只认贴在窗口底部的那个浮钮，不误伤菜单项
      if (!el.classList.contains('yc-pintop')) el.classList.add('yc-pintop');
    }
  }
  var ycPinObsPending = false;
  function armPinObserver() {
    try {
      if (!document.body || armPinObserver.done) return;
      armPinObserver.done = true;
      new MutationObserver(function () {
        if (ycPinObsPending) return;
        ycPinObsPending = true;
        setTimeout(function () { ycPinObsPending = false; try { tagPinTop(); } catch (e) {} }, 60);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  // —— 设置页：翻译配置平台列搜索过滤（只加输入框 + 显隐行，不动应用的列表渲染）——
  function ensurePlatSearch() {
    var wrap = document.querySelector('.settings-plats');
    if (!wrap || wrap.querySelector('.yc-plat-search')) return;
    var list = wrap.querySelector('.settings-plats-list');
    if (!list) return;
    var inp = document.createElement('input');
    inp.className = 'yc-plat-search';
    inp.type = 'text';
    inp.placeholder = L('搜索平台');
    inp.addEventListener('input', function () { applyPlatFilter(); });
    inp.addEventListener('click', function (e) { e.stopPropagation(); });
    wrap.insertBefore(inp, list);
  }
  function applyPlatFilter() {
    var inp = document.querySelector('.yc-plat-search');
    var list = document.querySelector('.settings-plats-list');
    if (!inp || !list) return;
    var q = (inp.value || '').trim().toLowerCase();
    var rows = list.querySelectorAll('.settings-plat-row');
    for (var i = 0; i < rows.length; i++) {
      var hit = !q || (rows[i].textContent || '').toLowerCase().indexOf(q) >= 0;
      if (rows[i].style.display !== (hit ? '' : 'none')) rows[i].style.display = hit ? '' : 'none';
    }
  }
  // —— 设置页：「禁止发送…」两项是哑雷（误开会静默拦消息），给标签加橙色「谨慎」标 ——
  function markWarnRows() {
    var labels = document.querySelectorAll('.set-switch-label');
    for (var i = 0; i < labels.length; i++) {
      var el = labels[i];
      if (el.querySelector('.yc-warn-badge')) continue;
      if ((el.textContent || '').trim().indexOf('禁止发送') === 0) {
        var b = document.createElement('span');
        b.className = 'yc-warn-badge';
        b.textContent = L('谨慎');
        el.appendChild(b);
      }
    }
  }

  function dashTick() {
    try { ensurePhraseActions(); } catch (e) {}   // 话术库：插入 / 发送
    try { syncUnread(); } catch (e) {}            // 未读角标 + 新消息通知
    try { paintRailBadges(); } catch (e) {}       // 左栏平台图标：在线绿点 + 未读角标
    try { bindVoiceAll(); } catch (e) {}          // 语音气泡：转文字
    try { ensureToolDock(); } catch (e) {}        // 右栏底部 5 个速用键（逐栏）
    try { /* 右栏「翻译」角标已删除（2026-11-01） */ } catch (e) {}
    try { ensureTopIcons(); } catch (e) {}        // 右上角两键收成图标
    try { trimClock(); } catch (e) {}             // 顶栏时钟只到分钟
    try { keepRemarks(); } catch (e) {}           // 账号备注：本地缓存兜底（演示模式原版不落盘）
    try { compactAccCards(); } catch (e) {}       // 会话页账号卡瘦身
    try { tagPinTop(); } catch (e) {}             // 「会话置于顶部」浮钮收成账号栏通栏钮
    try { ensurePlatSearch(); } catch (e) {}      // 设置页：平台列表搜索框
    try { applyPlatFilter(); } catch (e) {}       // 设置页：平台搜索过滤（重渲染后补回）
    try { markWarnRows(); } catch (e) {}          // 设置页：「禁止发送」两项加谨慎标
    try { armPinObserver(); } catch (e) {}        // 浮钮被重建时即时补类（不等心跳，防闪跳）
    try { ensureEmptyHint(); } catch (e) {}       // 空态一次性提示
    try { markSettingsTitle(); } catch (e) {}     // 齿轮 title 提示
    try { patchLogoutModal(); } catch (e) {}      // 退出弹窗会话数改真实值
    try { ensureWorkbench(); } catch (e) {}       // 主页工作台：平台状态 / 未读待办 / 快捷入口 / 今日用量
  }

  // 离线标记：webview → 断开前的真实页面地址（上线时恢复）
  var realSrcMap = new WeakMap();
  // Chrome 平台首屏只自动打开一次首页（防止心跳反复触发）
  var chromeBooted = new WeakSet();

  var STORAGE_KEY = 'yichat_side_collapsed';
  var BTN_ID = 'yc-side-toggle';
  var BAR_ID = 'yc-mini-bar';
  var HEAD_BTN_ID = 'yc-head-toggle';
  // 平台判定：Mac 上修饰键是 ⌘，提示文案与键盘监听都要跟着换
  var IS_MAC = (function () {
    try {
      var p = navigator.platform || '';
      if (/mac/i.test(p)) return true;
      if (navigator.userAgentData && /mac/i.test(navigator.userAgentData.platform || '')) return true;
      return /Macintosh|Mac OS X/i.test(navigator.userAgent || '');
    } catch (e) { return false; }
  })();
  var MOD = IS_MAC ? '\u2318' : 'Ctrl';

  function getMode() {
    if (document.body.classList.contains('yc-side-collapsed')) return 'collapsed';
    if (document.body.classList.contains('yc-side-narrow')) return 'narrow';
    return 'normal';
  }

  function isCollapsed() { return getMode() === 'collapsed'; }

  // 三态：normal（全宽）→ narrow（窄条，YIFAF 一级收起）→ collapsed（通栏顶栏，二级收起）
  function setMode(mode, remember) {
    document.body.classList.toggle('yc-side-collapsed', mode === 'collapsed');
    document.body.classList.toggle('yc-side-narrow', mode === 'narrow');
    if (remember !== false) {
      try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) {}
    }
    layout();
  }

  function setCollapsed(on, remember) {
    setMode(on ? 'collapsed' : 'normal', remember);
  }

  // 面板可能同时存在多个（各平台一个，隐藏的留在 DOM 里，left≈0），
  // 必须选"可见区"的那个：left > 20（图标栏右侧），否则按钮会加到隐藏面板上
  function sideEl() {
    var list = document.querySelectorAll('.sess-side');
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.left > 20 && !best) best = list[i];
    }
    return best;
  }

  // ---------- 展开（普通）态控件 ----------

  // 面板右边缘 ‹ 按钮
  function ensureButton() {
    var btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.style.opacity = '0.92';
    btn.setAttribute('title', L('收起会话面板 (Ctrl+B)'));
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      setMode(getMode() === 'narrow' ? 'normal' : 'narrow'); // 窄条 ⇄ 全宽
    });
    document.body.appendChild(btn);
    return btn;
  }

  // 面板标题行右侧 ☰（YIFAF 同款触发位）；挂在"可见面板"的标题行
  function ensureHeaderBtn(side) {
    var head = side && side.querySelector('.sess-side-head');
    if (!head) return;
    var exist = document.getElementById(HEAD_BTN_ID);
    if (exist && exist.parentElement === head) return;
    if (exist) exist.remove();
    var b = document.createElement('span');
    b.id = HEAD_BTN_ID;
    b.textContent = '\u2630'; // ☰
    b.title = L('收起会话面板');
    b.style.cssText = 'cursor:pointer;user-select:none;font-size:16px;color:#8a94a6;'
      + 'padding:2px 6px;border-radius:4px;line-height:1;flex:none;';
    b.addEventListener('mouseenter', function () { b.style.color = '#2f6bff'; b.style.background = '#eef3ff'; });
    b.addEventListener('mouseleave', function () { b.style.color = '#8a94a6'; b.style.background = 'transparent'; });
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setMode(getMode() === 'narrow' ? 'normal' : 'narrow'); // 窄条 ⇄ 全宽
    });
    head.appendChild(b);
  }

  // ---------- 收起态：通栏顶栏 ----------

  // 当前选中账号卡片（收起态顶栏的上线/离线以"选中账号"为操作对象）
  function selectedCard(side) {
    if (!side) side = sideEl();
    if (!side) return null;
    var list = side.querySelectorAll('.sess-acc-card');
    if (!list.length) list = side.querySelectorAll('.acc-card, [class*="acc-card"]');
    for (var i = 0; i < list.length; i++) {
      if (/\bselected\b/.test(list[i].className)) return list[i];
    }
    return list[0] || null;
  }
  function cardOnlineBtn(card) { return card ? card.querySelector('[data-t="card-online-btn"]') : null; }
  function cardOfflineBtn(card) { return card ? card.querySelector('[data-t="card-offline-btn"]') : null; }
  function isCardOnline(card) { return !!(card && card.querySelector('.sess-acc-online-ico')); }
  // 交给应用自身的上线/离线逻辑（不是我们伪造的 reload / about:blank）
  // want=true 上线，want=false 离线；已经是目标状态则返回 false 交给调用方兜底
  function setAccountOnline(card, want) {
    if (!card) return false;
    if (isCardOnline(card) === !!want) return false;
    var b = want ? cardOnlineBtn(card) : cardOfflineBtn(card);
    if (!b) return false;
    try {
      b.click();
      lastSig = ''; // 强制下一帧刷新卡片状态点
      setTimeout(layout, 400);
      return true;
    } catch (e) { return false; }
  }

  function ensureBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = BAR_ID;

    // 左列：上「+ 会话」，下两个上线/离线小圆钮（YIFAF 同款布局）
    var leftCol = document.createElement('div');
    leftCol.className = 'yc-left';

    // 左：+ 会话
    var add = document.createElement('div');
    add.className = 'yc-mini-add';
    add.textContent = L('+ 会话');
    add.title = L('新增会话');
    add.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setCollapsed(false);
      setTimeout(function () {
        try {
          // 应用里的「新增会话」是 span.sess-add-session（不是 button），优先直接点它
          var side = sideEl();
          var span = side && side.querySelector('.sess-add-session');
          if (span) { span.click(); return; }
          var btns = document.querySelectorAll('.sess-side button');
          for (var i = 0; i < btns.length; i++) {
            var t = (btns[i].textContent || '').replace(/\s/g, '');
            if (t.indexOf('新增会话') !== -1 || t.indexOf('新建会话') !== -1) {
              btns[i].click(); return;
            }
          }
        } catch (e2) {}
      }, 260);
    });

    // 上线 / 离线：作用于当前可见的账号页面（webview）
    // 上线 = 重新连接（恢复页面）；离线 = 断开（页面置空，登录数据保留）
    function visibleWebview() {
      try {
        var list = document.querySelectorAll('webview');
        for (var i = 0; i < list.length; i++) {
          var r = list[i].getBoundingClientRect();
          if (r.width > 50 && r.height > 50) return list[i];
        }
      } catch (e) {}
      return null;
    }
    var mkRound = function (glyph, title, fn) {
      var b = document.createElement('div');
      b.className = 'yc-round-btn';
      b.textContent = glyph;
      b.title = title;
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        fn(b);
      });
      return b;
    };
    var onBtn = mkRound('\u21BB', L('上线（让选中账号上线）'), function (b) {
      // 优先走应用自己的「上线」：卡片上的 card-online-btn（离线时才有）
      var card = selectedCard();
      if (setAccountOnline(card, true)) {
        b.classList.add('active');
        var off0 = b.nextElementSibling;
        if (off0) off0.classList.remove('active');
        return;
      }
      // 已在线：刷新当前页面
      var wv = visibleWebview();
      if (!wv) return;
      try {
        var real = realSrcMap.get(wv);
        if (real) { realSrcMap.delete(wv); wv.loadURL(real); }
        else { wv.reload(); }
      } catch (e) {}
      b.classList.add('active');
      var off = b.nextElementSibling;
      if (off) off.classList.remove('active');
    });
    var offBtn = mkRound('\u2298', L('离线（让选中账号离开，登录数据保留）'), function (b) {
      var card = selectedCard();
      if (setAccountOnline(card, false)) {
        b.classList.add('active');
        var prev0 = b.previousElementSibling;
        if (prev0) prev0.classList.remove('active');
        return;
      }
      var wv = visibleWebview();
      if (!wv) return;
      try {
        if (!realSrcMap.has(wv)) realSrcMap.set(wv, wv.getAttribute('src') || '');
        wv.loadURL('about:blank');
      } catch (e) {}
      b.classList.add('active');
      var prev = b.previousElementSibling;
      if (prev) prev.classList.remove('active');
    });
    // 两个圆钮放进左列第二行
    var rounds = document.createElement('div');
    rounds.className = 'yc-rounds';
    rounds.appendChild(onBtn);
    rounds.appendChild(offBtn);
    leftCol.appendChild(add);
    leftCol.appendChild(rounds);
    bar.appendChild(leftCol);

    // 中：账号卡片容器
    var chips = document.createElement('div');
    chips.className = 'yc-chips';
    bar.appendChild(chips);

    // 右：置于左侧 / 展开全部
    var actions = document.createElement('div');
    actions.className = 'yc-actions';
    var mk = function (label, title) {
      var b = document.createElement('div');
      b.className = 'yc-top-btn';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        setCollapsed(false); // 把会话面板放回左侧
      });
      return b;
    };
    actions.appendChild(mk(L('置于左侧'), L('把会话面板放回左侧')));
    actions.appendChild(mk(L('展开全部'), L('展开会话面板')));
    bar.appendChild(actions);

    document.body.appendChild(bar);
    return bar;
  }

  // 从「可见面板」克隆账号卡片（YIFAF 行为：顶栏只显示当前平台的账号；
  // 有 selected 的只显示选中的，否则显示该面板全部账号——本来就只有当前平台）
  var lastSig = '';
  var dumped = false;
  function refreshChips(host, side) {
    var sig = '';
    var scope = side || document;
    var all = scope.querySelectorAll('.sess-acc-card');
    if (!all.length) all = scope.querySelectorAll('.acc-card, .acc-row, [class*="acc-card"]');
    if (!all.length && !dumped) {
      dumped = true;
      try {
        log('no acc-card found, side HTML: ' + String(side.innerHTML).replace(/\s+/g, ' ').slice(0, 500));
      } catch (e) {}
      return;
    }
    // YIFAF 行为：显示当前平台全部账号，选中的加高亮（蓝框）
    var cards = all;
    var infos = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var isSel = /\bselected\b/.test(c.className);
      var img = c.querySelector('img.sess-acc-avatar-img, img[class*="avatar"], img');
      var name = c.querySelector('[class*="sess-acc-name"], .acc-name, [class*="acc-name"]');
      var nm = name ? (name.textContent || '').trim() : '';
      var src = img ? (img.getAttribute('src') || '') : '';
      if (!nm && !src) continue;
      infos.push({ src: src, name: nm, card: c, sel: isSel, online: !!c.querySelector('.sess-acc-online-ico') });
      sig += src + '|' + nm + '|' + (isSel ? 1 : 0) + (c.querySelector('.sess-acc-online-ico') ? 1 : 0) + ';';
    }
    if (sig === lastSig) return;
    lastSig = sig;
    log('chips rebuilt: ' + infos.length);
    var olds = host.querySelectorAll('.yc-mini-chip');
    for (var j = 0; j < olds.length; j++) olds[j].remove();
    infos.forEach(function (info) {
      var chip = document.createElement('div');
      chip.className = 'yc-mini-chip' + (info.sel ? ' yc-chip-sel' : '');
      chip.title = info.name || L('账号');
      if (info.src) {
        var im = document.createElement('img');
        im.src = info.src;
        im.onerror = function () { im.style.visibility = 'hidden'; };
        chip.appendChild(im);
      } else {
        var ph = document.createElement('div');
        ph.className = 'yc-mini-ph';
        ph.textContent = (info.name || '?').charAt(0).toUpperCase();
        chip.appendChild(ph);
      }
      if (info.name) {
        var sp = document.createElement('span');
        sp.textContent = info.name;
        chip.appendChild(sp);
      }
      // 在线状态点（绿=在线，橙=离线/连接中），点它 = 让这个账号上线/离开
      var dot = document.createElement('i');
      dot.className = 'yc-dot ' + (info.online ? 'yc-dot-on' : 'yc-dot-off');
      dot.title = info.online ? L('点击让该账号离开') : L('点击让该账号上线');
      dot.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var side3 = sideEl();
        if (!side3) return;
        var cards3 = side3.querySelectorAll('.sess-acc-card');
        for (var k = 0; k < cards3.length; k++) {
          var ne = cards3[k].querySelector('[class*="sess-acc-name"]');
          var nm3 = ne ? (ne.textContent || '').trim() : '';
          if (nm3 === info.name) { setAccountOnline(cards3[k], !info.online); return; }
        }
      });
      chip.appendChild(dot);
      chip.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        // YIFAF 行为：收起态点账号卡片 = 只切换账号，面板保持收起不展开
        setTimeout(function () {
          try {
            var side2 = sideEl();
            if (!side2) { log('chip click: no visible side'); return; }
            var cards2 = side2.querySelectorAll('.sess-acc-card');
            if (!cards2.length) cards2 = side2.querySelectorAll('.acc-card, [class*="acc-card"]');
            for (var k = 0; k < cards2.length; k++) {
              var ne = cards2[k].querySelector('[class*="acc-name"]');
              var nm2 = ne ? (ne.textContent || '').trim() : '';
              if (nm2 === info.name) { cards2[k].click(); log('chip click: selected ' + nm2); return; }
            }
            // 没对上名字（重名等）：退回旧引用
            info.card.click();
            log('chip click: fallback old ref ' + info.name);
          } catch (e2) { log('chip click ERR ' + e2.message); }
        }, 60);
      });
      host.appendChild(chip);
    });
  }

  // ---------- 全局折叠按钮：左侧图标栏底部（YIFAF 同款位置，所有平台可见） ----------
  function ensureRailBtn() {
    var b = document.getElementById('yc-rail-toggle');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'yc-rail-toggle';
    b.textContent = L('\u2630 ') + L('会话置于顶部'); // ☰ + 文字（YIFAF 同款带字按钮；收起态变图标小方块）
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setMode(getMode() === 'collapsed' ? 'normal' : 'collapsed');
    });
    document.body.appendChild(b);
    return b;
  }

  // ---------- 窄条模式：自绘竖栏（平台名 + ☰ + 账号小卡竖排） ----------
  function ensureNarrowCol() {
    var col = document.getElementById('yc-narrow-col');
    if (col) return col;
    col = document.createElement('div');
    col.id = 'yc-narrow-col';
    var head = document.createElement('div');
    head.className = 'yc-narrow-head';
    var nm = document.createElement('span');
    nm.className = 'yc-narrow-name';
    head.appendChild(nm);
    var tg = document.createElement('div');
    tg.className = 'yc-narrow-toggle';
    tg.textContent = '\u2630';
    tg.title = L('展开会话面板');
    tg.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setMode('normal');
    });
    head.appendChild(tg);
    col.appendChild(head);
    var cards = document.createElement('div');
    cards.className = 'yc-narrow-cards';
    col.appendChild(cards);
    document.body.appendChild(col);
    return col;
  }

  var lastNarrowSig = '';
  function refreshNarrowCards(host, side) {
    var cards = side.querySelectorAll('.sess-acc-card');
    if (!cards.length) cards = side.querySelectorAll('.acc-card, [class*="acc-card"]');
    var sig = '';
    var infos = [];
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var img = c.querySelector('img.sess-acc-avatar-img, img[class*="avatar"], img');
      var name = c.querySelector('[class*="sess-acc-name"], .acc-name, [class*="acc-name"]');
      var nm = name ? (name.textContent || '').trim() : '';
      var src = img ? (img.getAttribute('src') || '') : '';
      if (!nm && !src) continue;
      infos.push({ src: src, name: nm, card: c });
      sig += src + '|' + nm + ';';
    }
    if (sig === lastNarrowSig) return;
    lastNarrowSig = sig;
    var olds = host.querySelectorAll('.yc-narrow-card');
    for (var j = 0; j < olds.length; j++) olds[j].remove();
    infos.forEach(function (info) {
      var card = document.createElement('div');
      card.className = 'yc-narrow-card';
      card.title = info.name || L('账号');
      if (info.src) {
        var im = document.createElement('img');
        im.src = info.src;
        im.onerror = function () { im.style.visibility = 'hidden'; };
        card.appendChild(im);
      } else {
        var ph = document.createElement('div');
        ph.className = 'yc-mini-ph';
        ph.textContent = (info.name || '?').charAt(0).toUpperCase();
        card.appendChild(ph);
      }
      if (info.name) {
        var sp = document.createElement('span');
        sp.textContent = info.name;
        card.appendChild(sp);
      }
      card.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        try { info.card.click(); } catch (e2) {} // 选中该账号，保持窄条
      });
      host.appendChild(card);
    });
  }

  // 布局心跳
  function layout() {
    var side = sideEl();
    var collapsed = isCollapsed();
    var btn = document.getElementById(BTN_ID);
    var bar = document.getElementById(BAR_ID);

    // 全局折叠按钮：左侧图标栏存在就显示（YIFAF 同款位置，所有平台一致）
    var railBtn = ensureRailBtn();
    var railRight = 0;
    if (side) {
      railRight = side.getBoundingClientRect().left;
    } else {
      try {
        var logo = document.querySelector('.rail-logo-circle');
        if (logo) railRight = logo.getBoundingClientRect().right + 12;
      } catch (e) {}
    }
    if (side && railRight > 30) {
      var mode = getMode();
      railBtn.style.bottom = '10px';
      if (mode === 'normal') {
        // 展开态：带字按钮（齿轮右侧）
        railBtn.style.display = 'flex';
        railBtn.classList.remove('yc-icon-only');
        railBtn.textContent = L('\u2630 ') + L('会话置于顶部');
        railBtn.title = L('会话置于顶部');
        railBtn.style.left = Math.round(railRight + 24) + 'px';
      } else if (mode === 'narrow') {
        // 窄条态：小方块，居中在窄条正下方（YIFAF 同款）
        railBtn.style.display = 'flex';
        railBtn.classList.add('yc-icon-only');
        railBtn.textContent = '\u2630';
        railBtn.title = L('展开会话面板');
        railBtn.style.left = Math.round(railRight + 16) + 'px';
      } else {
        // 收起态：隐藏左下角小方块（会浮在网页版列表上很别扭；顶栏右侧已有「展开全部/置于左侧」）
        railBtn.style.display = 'none';
      }
    } else {
      railBtn.style.display = 'none';
    }

    // Chrome 平台首屏：视图默认是 about:blank（地址栏留空），自动打开首页，
    // 避免看起来像白屏。每个 webview 只做一次，否则每轮心跳都会重新加载。
    try {
      var cwv = document.querySelector('webview[data-t="platform-webview-el-chrome"]');
      if (cwv && !realSrcMap.has(cwv) && !chromeBooted.has(cwv)) {
        var csrc = cwv.getAttribute('src');
        if (!csrc || csrc === 'about:blank' || csrc === '') {
          chromeBooted.add(cwv);
          cwv.loadURL('https://www.google.com/');
        }
      }
    } catch (e) {}

    // 面板不存在（首页/登录页）：其它控件隐藏
    if (!side) {
      if (btn) btn.style.display = 'none';
      if (bar) bar.style.display = 'none';
      try { document.documentElement.style.setProperty('--yc-bar-h', '0px'); } catch (eBar) {}
      return;
    }
    ensureBar();
    bar = document.getElementById(BAR_ID);
    var chipsHost = bar.querySelector('.yc-chips');

    if (collapsed) {
      if (btn) btn.style.display = 'none';
      var ncol = document.getElementById('yc-narrow-col');
      if (ncol) ncol.style.display = 'none';
      // 顶栏高度 = 主区顶边（与原顶栏对齐），取不到就用 56px
      var topH = 56;
      try {
        var main = document.querySelector('.sess-main') || side.nextElementSibling;
        if (main) {
          var mt = main.getBoundingClientRect().top;
          if (mt > 20 && mt < 140) topH = Math.round(mt);
        }
      } catch (e) {}
      var r = side.getBoundingClientRect();
      bar.style.display = 'flex';
      bar.style.left = Math.max(0, Math.round(r.left)) + 'px';
      bar.style.right = '0px';
      // 高度交给内容撑开（不再写死），保证头像+名字完整显示不被裁切
      bar.style.height = 'auto';
      bar.style.minHeight = Math.max(topH, 58) + 'px';
      // 把主区往下推，让网页内容正好从顶栏下沿开始：
      // 主区自身顶部离窗口顶还有 topH（标题栏等），所以 padding 只需要补差值，
      // 否则会多出一条灰色空带（之前就是多推了一段）。
      // 再额外留 8px 呼吸位，内容不贴顶栏边（用户 2026-10-31 要求）
      try {
        var BAR_GAP = 8;
        var barH = bar.offsetHeight || Math.max(topH, 58);
        var padH = Math.max(0, barH - Math.max(0, topH)) + BAR_GAP;
        document.documentElement.style.setProperty('--yc-bar-h', padH + 'px');
      } catch (eBar) {}
      refreshChips(chipsHost, side);
    } else if (getMode() === 'narrow') {
      try { document.documentElement.style.setProperty('--yc-bar-h', '0px'); } catch (eBar) {}
      // 窄条：自绘竖栏覆盖在 64px 面板位置
      bar.style.display = 'none';
      if (btn) btn.style.display = 'none';
      var col = ensureNarrowCol();
      var r3 = side.getBoundingClientRect();
      col.style.display = 'flex';
      col.style.left = Math.round(r3.left) + 'px';
      col.style.top = Math.round(r3.top) + 'px';
      col.style.height = Math.max(200, Math.round(r3.height) - 52) + 'px'; // 底部留出小方块按钮的空间
      try {
        var pn = side.querySelector('.sess-platform-name');
        var nmEl = col.querySelector('.yc-narrow-name');
        nmEl.textContent = pn ? pn.textContent : '';
        nmEl.title = nmEl.textContent;
      } catch (e) {}
      refreshNarrowCards(col.querySelector('.yc-narrow-cards'), side);
    } else {
      bar.style.display = 'none';
      try { document.documentElement.style.setProperty('--yc-bar-h', '0px'); } catch (eBar) {}
      var ncol2 = document.getElementById('yc-narrow-col');
      if (ncol2) ncol2.style.display = 'none';
      ensureHeaderBtn(side);
      var hb = document.getElementById(HEAD_BTN_ID);
      if (hb) hb.title = L('收起为窄条');
      if (btn) {
        var r2 = side.getBoundingClientRect();
        if (r2.width) {
          btn.style.display = 'flex';
          btn.style.left = Math.round(r2.right - 1) + 'px';
          btn.style.top = Math.round(r2.top + r2.height / 2 - 24) + 'px';
          btn.textContent = getMode() === 'narrow' ? '\u203a' : '\u2039'; // › / ‹
        } else {
          btn.style.display = 'none';
        }
      }
    }
  }

  function boot() {
    log('boot ok, readyState=' + document.readyState);
  }

  // —— 会话面板三态收起（2026-10-31 版整套找回）：全宽 ⇄ 窄条 ⇄ 通栏顶栏。
  //     功能键：左侧图标栏底部「☰ 会话置于顶部」、面板标题行 ☰、面板右缘 ‹、
  //     收起态顶栏右侧「置于左侧 / 展开全部」；Ctrl/Cmd+B 同效。
  function bootSide() {
    if (!sideEl()) { setTimeout(bootSide, 500); return; }
    log('side panel found, bootSide ok');
    ensureButton();
    try { localStorage.setItem(STORAGE_KEY, 'normal'); } catch (e) {}   // 启动默认展开（旧版同款）
    layout();
    window.addEventListener('resize', layout);
    setInterval(layout, 800);
    window.addEventListener('keydown', function (e) {
      try {
        if (!e || e.altKey || e.shiftKey) return;
        if (IS_MAC ? (!e.metaKey || e.ctrlKey) : (!e.ctrlKey || e.metaKey)) return;
        if (String(e.key).toLowerCase() !== 'b') return;
        e.preventDefault();
        setMode(getMode() === 'collapsed' ? 'normal' : 'collapsed');
      } catch (e2) {}
    });
  }

  // —— 左侧栏「设置」齿轮：点一下开、再点一下关（退回进来之前那个页面）
  //     应用自己的 onClick 只会 `view=settings`，压根没有 toggle；这里在捕获阶段拦一次。
  var lastViewRoute = 'home';
  function bindSettingsToggle() {
    if (window.__ycSettingsBound) return;
    window.__ycSettingsBound = true;
    document.addEventListener('click', function (e) {
      try {
        var t = e.target;
        while (t && t !== document && !(t.getAttribute && t.getAttribute('data-t') === 'rail-settings')) t = t.parentNode;
        if (!t || t === document) return;
        if (!t.classList.contains('active')) {
          // 还没进设置：记住当前页，等下次再点齿轮时退回来
          var act = document.querySelector('.rail-item.active[data-t^="rail-"]');
          if (act && act !== t) {
            var k = (act.getAttribute('data-t') || '').replace('rail-', '');
            if (k && k !== 'settings') lastViewRoute = k;
          }
          return; // 交给应用正常打开设置
        }
        // 已经在设置页 → 拦掉应用的跳转，回到上一个视图
        e.preventDefault();
        e.stopPropagation();
        var target = lastViewRoute || 'home';
        if (typeof window.__scrmNav === 'function') {
          window.__scrmNav(target);
        } else {
          var back = document.querySelector('[data-t="rail-' + target + '"]');
          if (back) back.click();
        }
      } catch (err) {}
    }, true);
  }
  function markSettingsTitle() {
    try {
      var el = document.querySelector('[data-t="rail-settings"]');
      if (!el || el.getAttribute('data-yc-title') === '1') return;
      el.setAttribute('data-yc-title', '1');
      el.setAttribute('title', L('设置（再点一次关闭）'));
    } catch (e) {}
  }
  bindSettingsToggle();
  bindLogoutCount();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); bootSide(); });
  } else {
    boot(); bootSide();
  }

  // 主页心跳：与应用是否加载了会话面板无关，独立补卡片/提示/右栏绑定
  // 窗口在后台时降到 5 秒一拍（backgroundThrottling=no 已关掉系统节流，否则等于一直 1s 全量跑）
  var dashBeat = 0;
  setInterval(function () {
    dashBeat++;
    if (document.hidden && dashBeat % 5 !== 0) return;
    dashTick();
  }, 1000);
  dashTick();
// —— Ctrl+K 命令面板（2026-11-02）：平台 / 快捷入口 / 未读会话 / 话术（面板在 DOM 时）——
  var palState = { items: [], active: 0 };
  function palCollect(q) {
    q = String(q || '').trim().toLowerCase();
    var out = [];
    function hit(txt) { return !q || String(txt || '').toLowerCase().indexOf(q) >= 0; }
    if (!q || hit('ai') || hit('帮写') || hit('compose')) out.push({ g: L('工具'), t: L('AI 帮写'), s: curLang() === 'en' ? 'Draft a reply from a Chinese brief' : '用中文梗概生成外语回复', run: function () { aiOpen(); } });
    var plats = railPlatforms();
    for (var i = 0; i < plats.length; i++) (function (p) {
      if (hit(p.name) || hit(p.key)) out.push({ g: L('平台'), t: p.name, s: p.key, svg: p.svg, run: function () { gotoPlatform(p.key); } });
    })(plats[i]);
    for (var j = 0; j < QUICK_DEFS.length; j++) (function (d) {
      if (hit(d.t) || hit(L(d.t)) || hit(d.k)) out.push({ g: L('快捷入口'), t: L(d.t), s: L(d.s), run: function () { clickQuick(d.k); } });
    })(QUICK_DEFS[j]);
    var un = collectUnread();
    for (var u = 0; u < un.items.length; u++) (function (it) {
      if (hit(it.name)) out.push({ g: L('未读会话'), t: it.name, s: it.platform + ' · ' + it.n, badge: it.n, run: function () { gotoPlatform(it.platform); } });
    })(un.items[u]);
    try {
      var panel = document.querySelector('.sess-slide > .set-panel');
      if (panel) {
        var btns = panel.querySelectorAll('button');
        var seenPh = {};
        for (var b = 0; b < btns.length; b++) {
          if (String(btns[b].textContent || '').trim() !== '删除') continue;
          var row = btns[b].parentNode;
          if (!row) continue;
          var text = phraseTextOf(row);
          if (!text || seenPh[text] || !hit(text)) continue;
          seenPh[text] = 1;
          (function (tx) {
            out.push({ g: L('话术库'), t: tx.length > 42 ? tx.slice(0, 42) + '…' : tx, s: L('只放进输入框，不发送'), run: function () { phraseAction('insert', tx, document.createElement('button')); } });
          })(text);
        }
      }
    } catch (e) {}
    return out.slice(0, 30);
  }
  function palClose() {
    var m = document.getElementById('yc-pal-mask');
    if (m && m.parentNode) m.parentNode.removeChild(m);
  }
  function palRun(idx) {
    var it = palState.items[idx];
    palClose();
    if (it) { try { it.run(); } catch (e) {} }
  }
  function palRender(listEl, q) {
    palState.items = palCollect(q);
    palState.active = 0;
    listEl.innerHTML = '';
    var lastG = null;
    palState.items.forEach(function (it, idx) {
      if (it.g !== lastG) { lastG = it.g; listEl.appendChild(mkEl('div', 'yc-pal-g', it.g)); }
      var row = mkEl('div', 'yc-pal-row' + (idx === 0 ? ' active' : ''));
      row.setAttribute('data-idx', String(idx));
      var ic = mkEl('span', 'yc-pal-ico');
      if (it.svg) ic.innerHTML = it.svg; else ic.textContent = '›';
      row.appendChild(ic);
      var tx = mkEl('span', 'yc-pal-tx');
      tx.appendChild(mkEl('b', '', it.t));
      if (it.s) tx.appendChild(mkEl('span', '', it.s));
      row.appendChild(tx);
      if (it.badge) row.appendChild(mkEl('i', 'yc3-badge', it.badge > 99 ? '99+' : String(it.badge)));
      row.addEventListener('mousedown', function (e) { e.preventDefault(); palRun(idx); });
      listEl.appendChild(row);
    });
    if (!palState.items.length) listEl.appendChild(mkEl('div', 'yc-pal-empty', L('没有匹配结果')));
  }
  function palOpen() {
    if (document.getElementById('yc-pal-mask')) { palClose(); return; }
    var mask = mkEl('div', '');
    mask.id = 'yc-pal-mask';
    var box = mkEl('div', 'yc-pal');
    var head = mkEl('div', 'yc-pal-head');
    head.appendChild(mkEl('span', 'yc-pal-mag', '⌕'));
    var inp = document.createElement('input');
    inp.className = 'yc-pal-inp';
    inp.type = 'text';
    inp.placeholder = L('搜索平台、会话、话术或设置');
    head.appendChild(inp);
    head.appendChild(mkEl('span', 'yc-pal-esc', 'ESC'));
    box.appendChild(head);
    var list = mkEl('div', 'yc-pal-list');
    box.appendChild(list);
    box.appendChild(mkEl('div', 'yc-pal-foot', curLang() === 'en' ? '↑↓ navigate · ↵ open · Ctrl+K anytime' : '↑↓ 选择 · ↵ 打开 · Ctrl+K 随时呼出'));
    mask.appendChild(box);
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) palClose(); });
    document.body.appendChild(mask);
    palRender(list, '');
    inp.addEventListener('input', function () { palRender(list, inp.value); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var n = palState.items.length;
        if (!n) return;
        palState.active = (palState.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
        var rows = list.querySelectorAll('.yc-pal-row');
        for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('active', Number(rows[i].getAttribute('data-idx')) === palState.active);
        var act = list.querySelector('.yc-pal-row.active');
        if (act) act.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        palRun(palState.active);
      } else if (e.key === 'Escape') {
        palClose();
      }
    });
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 30);
  }
  if (!window.__ycPalBound) {
    window.__ycPalBound = true;
    window.addEventListener('keydown', function (e) {
      try {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key || '').toLowerCase() === 'k') {
          e.preventDefault();
          palOpen();
        }
      } catch (err) {}
    }, true);
  }
})();
