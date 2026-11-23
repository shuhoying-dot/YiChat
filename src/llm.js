// 主进程：大模型 API 真实请求（OpenAI 兼容 / Claude / Gemini）。
// 跑在 Node 里，没有浏览器 CORS 限制。Key 只用于发请求，绝不记日志。
// 所有函数返回 {ok, ...}，错误时 message 为人类可读的原因。

const DEFAULT_BASE = {
  OpenAI: 'https://api.openai.com/v1',
};

const DEFAULT_MODEL = {
  OpenAI: 'gpt-4o-mini',
};

// ---- 接口地址校验（2026-11-01）----
// baseUrl 来自渲染层，主进程直接拿去 fetch 就是 SSRF 入口：任何能触发 IPC 的页面
// 都能让主进程去请求内网服务。这里只放行 http/https，并拦掉云元数据与内网段。
// 本机回环（127.0.0.1 / localhost）保留——本地跑 Ollama / LM Studio 是正常用法。
const BLOCK_HOSTS = [
  'metadata.google.internal', 'metadata.goog', 'instance-data',
  '100.100.100.200',            // 阿里云元数据
  '169.254.169.254',            // AWS / GCP / Azure 元数据
];
function isPrivateIPv4(h) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;                       // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;          // 192.168/16
  if (a === 169 && b === 254) return true;          // link-local
  if (a === 0) return true;
  return false;
}
function badUrl(msg) {
  const e = new Error(msg);
  e.code = 'YC_BAD_URL';
  return e;
}
// 返回规范化后的 base（去掉末尾斜杠）
function baseOf(entry) {
  const raw = String(entry.baseUrl || DEFAULT_BASE[entry.type] || DEFAULT_BASE.OpenAI).trim();
  let u;
  try { u = new URL(raw); } catch (e) { throw badUrl('接口地址格式不合法'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw badUrl('接口地址只支持 http / https');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCK_HOSTS.includes(host)) throw badUrl('该接口地址不被允许');
  if (isPrivateIPv4(host)) throw badUrl('不允许请求内网地址（本机 127.0.0.1 除外）');
  return raw.replace(/\/+$/, '');
}

function modelOf(entry) {
  return (entry.model || DEFAULT_MODEL[entry.type] || 'gpt-4o-mini').trim();
}

// 直连域名（中国区服务，走代理反而连不上）：火山引擎、小米等
const DIRECT_DOMAINS = ['volces.com', 'volcengine.com', 'mi.com', 'xiaomi.com', 'xiaomi.cn', 'deepseek.com', 'dashscope.aliyuncs.com', 'aliyuncs.com', 'qwen.ai', 'baidu.com', 'qianfan.cloud', 'tencentcloudapi.com', 'hunyuan.cloud.tencent.com', 'bigmodel.cn', 'zhipuai.cn', 'moonshot.cn', 'kimi.com', 'minimax.chat', 'stepfun.com', 'siliconflow.cn', 'deepinfra.com'];

function isDirectUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DIRECT_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch (e) { return false; }
}

// ---- 代理（2026-11-21 3.6.8 重写）----
// 原实现 require('undici') 在打包用的 Electron 里 MODULE_NOT_FOUND，proxyDispatcher
// 恒返回 null → 主进程请求永远直连、代理配了也不生效；还留过硬编码回退代理
// 127.0.0.1:7897（开发者本机端口假设，已删除）。现改为 Node 内置 http/https/net/tls
// 手写 HTTP 代理：http 目标走绝对 URI 转发，https 目标走 CONNECT 隧道，无第三方依赖。
// 代理来源：环境变量 HTTPS_PROXY/HTTP_PROXY，或调用方显式传入（谷歌翻译的账号代理）；
// 没配就直连。只支持 http/https 代理（socks 代理走 webview session 那条路）。
function envProxy() {
  return String(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '').trim();
}

function fetchViaProxy(rawUrl, opts, proxyUrl, signal) {
  return new Promise((resolve, reject) => {
    let sock = null;
    let req = null;
    let done = false;
    const fail = (e) => {
      if (done) return;
      done = true;
      try { if (req) req.destroy(); } catch (_) {}
      try { if (sock) sock.destroy(); } catch (_) {}
      reject(e);
    };
    const onAbort = () => { const e = new Error('请求已取消'); e.name = 'AbortError'; fail(e); };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    (async () => {
      const http = require('http');
      const https = require('https');
      const net = require('net');
      const tls = require('tls');
      const target = new URL(rawUrl);
      const proxy = new URL(proxyUrl);
      const method = String(opts.method || 'GET').toUpperCase();
      // 用 Request 统一序列化 body（string / FormData / Blob 都可），并合并请求头
      const reqObj = new Request(rawUrl, {
        method,
        headers: opts.headers || {},
        body: (method !== 'GET' && method !== 'HEAD' && opts.body != null) ? opts.body : undefined,
      });
      const headers = {};
      reqObj.headers.forEach((v, k) => { headers[k] = v; });
      let bodyBuf = null;
      if (opts.body != null && method !== 'GET' && method !== 'HEAD') {
        bodyBuf = Buffer.from(await reqObj.arrayBuffer());
        headers['content-length'] = String(bodyBuf.length);
      }
      const isHttps = target.protocol === 'https:';
      const proxyPort = Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80);
      const auth = proxy.username
        ? 'Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password || '')).toString('base64')
        : '';
      const finish = (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (done) return;
          done = true;
          const buf = Buffer.concat(chunks);
          const h = {};
          for (const k of Object.keys(res.headers)) {
            if (k !== 'transfer-encoding' && k !== 'content-length') h[k] = res.headers[k];
          }
          resolve(new Response(buf.length ? buf : null, { status: res.statusCode, headers: h }));
        });
        res.on('error', fail);
      };
      if (!isHttps) {
        // HTTP 目标：把绝对 URI 直接发给代理转发
        const h2 = { ...headers, host: target.host };
        if (auth) h2['proxy-authorization'] = auth;
        req = http.request({ host: proxy.hostname, port: proxyPort, method, path: rawUrl, headers: h2 }, finish);
        req.on('error', fail);
        if (bodyBuf) req.write(bodyBuf);
        req.end();
        return;
      }
      // HTTPS 目标：先 CONNECT 建隧道，再在隧道上做 TLS
      sock = net.connect(proxyPort, proxy.hostname);
      sock.on('error', fail);
      sock.on('connect', () => {
        sock.write('CONNECT ' + target.host + ' HTTP/1.1\r\nHost: ' + target.host + '\r\n'
          + (auth ? 'Proxy-Authorization: ' + auth + '\r\n' : '') + '\r\n');
      });
      let buf = Buffer.alloc(0);
      let tunnelDone = false;
      sock.on('data', (chunk) => {
        if (tunnelDone) return;
        buf = Buffer.concat([buf, chunk]);
        const idx = buf.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const statusLine = buf.slice(0, idx).toString('latin1').split('\r\n')[0];
        if (parseInt(statusLine.split(' ')[1], 10) !== 200) { fail(new Error('代理 CONNECT 失败：' + statusLine)); return; }
        tunnelDone = true;
        const tlsSock = tls.connect({
          socket: sock,
          servername: target.hostname,
          rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
        });
        tlsSock.on('error', fail);
        tlsSock.on('secureConnect', () => {
          req = https.request({
            host: target.hostname,
            port: Number(target.port) || 443,
            method,
            path: target.pathname + target.search,
            headers: { ...headers, host: target.host },
            agent: false,
            createConnection: () => tlsSock,
          }, finish);
          req.on('error', fail);
          if (bodyBuf) req.write(bodyBuf);
          req.end();
        });
      });
    })().catch(fail);
  });
}

async function fetchTimeout(url, opts = {}, ms = 30000, proxyOverride) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  try {
    // 国外接口走代理（显式传入优先，否则环境变量），国内直连域名永远直连
    const proxy = proxyOverride !== undefined ? String(proxyOverride || '').trim() : envProxy();
    if (proxy && /^https?:\/\//i.test(proxy) && !isDirectUrl(url)) {
      return await fetchViaProxy(url, opts, proxy, ctrl.signal);
    }
    const fetchOpts = { ...opts, signal: ctrl.signal };
    return await fetch(url, fetchOpts);
  } finally {
    clearTimeout(timer);
  }
}

function errMessage(e) {
  if (e && e.code === 'YC_BAD_URL') return e.message;
  if (e && e.name === 'AbortError') return '请求超时（30秒），请检查网络或代理';
  return '网络错误：' + String((e && e.message) || e);
}

// 错误人话化（UI 规矩第 6 条）：HTTP 状态 → 人话原因＋下一步，原文截断附后备查
function humanHttp(status, body) {
  var raw = String(body || '').slice(0, 120);
  var tail = raw ? '（原始错误：' + raw + '）' : '';
  if (status === 401 || status === 403) return 'Key 不对或已失效：到 设置 → API Key 里检查这把 Key，或换一把再试' + tail;
  if (status === 402) return '余额不足或服务未开通：到服务商后台看下额度与开通状态' + tail;
  if (status === 404) return '地址或模型名不对：到 设置 → API Key 里核对 Base URL 和模型名' + tail;
  if (status === 429) return '请求太频繁或额度用完了：等一两分钟再试，或换一把 Key' + tail;
  if (status >= 500) return '服务商那边出问题了（HTTP ' + status + '）：等几分钟再试' + tail;
  return '请求失败（HTTP ' + status + '）' + tail;
}

// ---------- DeepL 翻译（免费版 :fx / 付费版自动识别） ----------
function deeplBase(key) {
  return String(key || '').trim().endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com';
}

// 中文语言名 → DeepL 目标语言代码
const DEEPL_LANG = {
  '中文': 'ZH', '简体中文': 'ZH', '繁体中文': 'ZH-HANT',
  '英语': 'EN', '英文': 'EN',
  '日语': 'JA', '日文': 'JA',
  '韩语': 'KO', '韩文': 'KO',
  '法语': 'FR', '法文': 'FR',
  '德语': 'DE', '德文': 'DE',
  '西班牙语': 'ES', '西班牙文': 'ES',
  '葡萄牙语': 'PT', '俄语': 'RU',
  '意大利语': 'IT', '荷兰语': 'NL',
  '阿拉伯语': 'AR', '泰语': 'TH', '越南语': 'VI',
  '印尼语': 'ID', '马来语': 'MS', '土耳其语': 'TR',
};

async function deeplTestKey(key) {
  try {
    const res = await fetchTimeout(deeplBase(key) + '/v2/usage', {
      headers: { Authorization: 'DeepL-Auth-Key ' + key },
    });
    if (res.ok) return { ok: true, message: '连接成功，Key 有效' };
    if (res.status === 403) return { ok: false, message: 'Key 无效（403 未授权）' };
    const body = await res.text().catch(() => '');
    return { ok: false, message: `${humanHttp(res.status, body)}` };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

async function deeplTranslate(key, text, targetLang) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, message: '待翻译文本为空' };
  const target = DEEPL_LANG[String(targetLang || '').trim()] || 'ZH';
  try {
    const res = await fetchTimeout(deeplBase(key) + '/v2/translate', {
      method: 'POST',
      headers: {
        Authorization: 'DeepL-Auth-Key ' + key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: [t], target_lang: target }),
    });
    if (!res.ok) {
      if (res.status === 403) return { ok: false, message: 'Key 无效（403 未授权）' };
      if (res.status === 456) return { ok: false, message: 'DeepL 免费额度已用完' };
      const body = await res.text().catch(() => '');
      return { ok: false, message: `${humanHttp(res.status, body)}` };
    }
    const data = await res.json();
    const translated = (data.translations || []).map((x) => x.text || '').join('');
    if (!translated) return { ok: false, message: 'DeepL 返回为空' };
    return { ok: true, text: translated };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ---------- 测试 Key（轻量请求，按类型走对应 endpoint） ----------
async function testKey(entry) {
  const key = String(entry.key || '').trim();
  if (!key) return { ok: false, message: 'Key 为空' };
  if (entry.type === 'DeepL') return deeplTestKey(key);
  try {
    if (entry.type === 'Claude') {
      // Anthropic 没有 ping 接口：用最小 messages 请求校验，401 即 Key 无效
      const res = await fetchTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: modelOf(entry),
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      if (res.ok) return { ok: true, message: '连接成功，Key 有效' };
      if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
      const body = await res.text().catch(() => '');
      return { ok: false, message: `${humanHttp(res.status, body)}` };
    }
    if (entry.type === 'Gemini') {
      const res = await fetchTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
      );
      if (res.ok) return { ok: true, message: '连接成功，Key 有效' };
      if (res.status === 400 || res.status === 403) return { ok: false, message: 'Key 无效或无权限' };
      return { ok: false, message: `${humanHttp(res.status, '')}` };
    }
    // OpenAI / DeepSeek / 自定义：OpenAI 兼容，GET /models 即可校验
    const res = await fetchTimeout(baseOf(entry) + '/models', {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (res.ok) {
      // 3.8.1（S11）：顺带验所配模型在不在列表里——原来只验 Key，模型名写错也报
      // 「测试通过」，实际调用时才 404。列表为空/拿不到时不拦（有些网关不给全量列表）。
      try {
        const data = await res.json().catch(() => null);
        const ids = data && Array.isArray(data.data) ? data.data.map((m) => String((m && m.id) || '')) : [];
        const want = modelOf(entry);
        if (ids.length && want && ids.indexOf(want) < 0) {
          return { ok: false, message: '模型不存在：' + want + '——这把 Key 的服务商没有这个模型，去 设置 → API Key 里改模型名' };
        }
      } catch (e) {}
      return { ok: true, message: '连接成功，Key 有效' };
    }
    if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
    return { ok: false, message: `${humanHttp(res.status, '')}` };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ---------- 聊天补全（统一入口） ----------
async function chat(entry, messages, maxTokens = 500) {
  const key = String(entry.key || '').trim();
  if (!key) return { ok: false, message: 'Key 为空' };
  const model = modelOf(entry);
  // 语音识别模型（如 mimo-v2.5-asr）只收音频：拿它做文字活（翻译/看图/帮写）必然 400，
  // 提前拦下说清，让用户改选文字模型，别把服务商的英文报错原样甩给他（他已连撞三次）
  if (/asr|whisper|transcribe/i.test(model)) {
    const hasAudio = Array.isArray(messages) && messages.some((m) => Array.isArray(m && m.content) && m.content.some((c) => c && c.type === 'input_audio'));
    if (!hasAudio) return { ok: false, message: '选错 Key 了：这是语音识别模型（' + model + '），只能转语音、不能处理文字。请改选「小米看图」（mimo-v2.6-flash）那条' };
  }
  try {
    if (entry.type === 'Claude') {
      const res = await fetchTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
      });
      if (!res.ok) {
        if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
        const body = await res.text().catch(() => '');
        return { ok: false, message: `${humanHttp(res.status, body)}` };
      }
      const data = await res.json();
      const text = (data.content || []).map((b) => b.text || '').join('');
      return { ok: true, text };
    }
    if (entry.type === 'Gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      // 3.8.1（S11）：content 可能是多模态数组（OpenAI 格式 parts），原来直接
      // join 会把对象拼成 [object Object] 发出去；这里只提取文本段。
      const msgText = (m) => {
        const c = m && m.content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) return c.map((p) => (p && p.type === 'text' && typeof p.text === 'string') ? p.text : '').filter(Boolean).join('\n');
        return '';
      };
      const res = await fetchTimeout(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: messages.map(msgText).join('\n') }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 403) return { ok: false, message: 'Key 无效或无权限' };
        return { ok: false, message: `${humanHttp(res.status, '')}` };
      }
      const data = await res.json();
      const text = (((data.candidates || [])[0] || {}).content || {}).parts
        ? data.candidates[0].content.parts.map((p) => p.text || '').join('')
        : '';
      return { ok: true, text };
    }
    // OpenAI / DeepSeek / 自定义
    const res = await fetchTimeout(baseOf(entry) + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
      const body = await res.text().catch(() => '');
      return { ok: false, message: `${humanHttp(res.status, body)}` };
    }
    const data = await res.json();
    const text = (((data.choices || [])[0] || {}).message || {}).content || '';
    return { ok: true, text };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ---------- 翻译：走聊天补全做翻译 ----------
async function translate(entry, text, targetLang = '英语') {
  const t = String(text || '').trim();
  if (!t) return { ok: false, message: '待翻译文本为空' };
  if (entry.type === 'DeepL') {
    const key = String(entry.key || '').trim();
    if (!key) return { ok: false, message: 'Key 为空' };
    return deeplTranslate(key, t, targetLang);
  }
  // 3.8.1（S11）：max_tokens 原写死 800，长消息译文会被静默截断且仍返回 ok；
  // 改为按输入长度放大（约 1.5 倍字符数 + 64 余量），上限 4000
  const maxTokens = Math.min(4000, Math.max(800, Math.ceil(t.length * 1.5) + 64));
  const r = await chat(
    entry,
    [
      { role: 'system', content: `你是一个翻译引擎。把用户发来的文本翻译成${targetLang}，只输出译文，不要解释。` },
      { role: 'user', content: t },
    ],
    maxTokens
  );
  return r;
}

// ---------- 文本转语音（OpenAI 兼容 /audio/speech） ----------
async function tts(entry, text, voice = 'alloy') {
  const t = String(text || '').trim();
  if (!t) return { ok: false, message: '文本为空' };
  if (entry.type === 'Claude' || entry.type === 'Gemini') {
    return { ok: false, message: `${entry.type} 不支持语音合成，请用 OpenAI / DeepSeek / 自定义类型` };
  }
  const key = String(entry.key || '').trim();
  // 3.8.1（S11）：首跳模型用条目自带的（ttsModel 优先，其次条目 model）——原来写死
  // tts-1，非 OpenAI 官方端点先吃一次 404 才落对话式兜底，多一趟往返且日志难读
  const speechModel = String(entry.ttsModel || entry.model || '').trim() || 'tts-1';
  try {
    const res = await fetchTimeout(baseOf(entry) + '/audio/speech', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ model: speechModel, voice, input: t.slice(0, 2000) }),
    }, 60000);
    if (!res.ok) {
      if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
      if (res.status === 404) {
        // 有些服务商（如小米 MiMo）没有 /audio/speech 接口，语音合成走对话接口：
        // 要合成的文本放在 assistant 消息里（官方规矩），audio 参数指定音色，
        // 返回 choices[0].message.audio.data（base64 的 wav）。条目里配了 TTS 模型才走这条。
        const ttsChatModel = String(
          entry.ttsModel || (/tts/i.test(String(entry.model || '')) ? entry.model : '')
        ).trim();
        if (ttsChatModel) {
          try {
            const MIMO_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];
            const v = MIMO_VOICES.indexOf(String(voice || '')) >= 0 ? String(voice) : 'mimo_default';
            const r2 = await fetchTimeout(baseOf(entry) + '/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
              body: JSON.stringify({
                model: ttsChatModel,
                messages: [{ role: 'assistant', content: t.slice(0, 2000) }],
                audio: { format: 'wav', voice: v },
              }),
            }, 90000);
            if (r2.ok) {
              const d2 = await r2.json().catch(() => null);
              const msg2 = d2 && d2.choices && d2.choices[0] && d2.choices[0].message;
              const b64 = msg2 && msg2.audio && msg2.audio.data;
              if (b64) return { ok: true, audioBase64: String(b64), mime: 'audio/wav' };
              return { ok: false, message: '语音合成没返回音频（模型或音色不对）' };
            }
            const b2 = await r2.text().catch(() => '');
            return { ok: false, message: `语音合成失败（HTTP ${r2.status}）：${b2.slice(0, 160)}` };
          } catch (e2) {}
        }
      }
      return { ok: false, message: `${humanHttp(res.status, '')}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, audioBase64: buf.toString('base64'), mime: 'audio/mpeg' };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ---------- 语音转文字（OpenAI 兼容 /audio/transcriptions） ----------
// 客户发来的语音消息：先在访客页取到音频字节，再送到这里识别成文字，
// 识别出来的文字再走翻译通道译成中文——语音没法直接翻译，必须先落地成文本。
// 支持 OpenAI 官方、one-api / 硅基流动等兼容网关，以及本机的 faster-whisper 服务。
async function transcribe(entry, audioBase64, mime, lang) {
  const b64 = String(audioBase64 || '');
  if (!b64) return { ok: false, message: '音频是空的' };
  if (entry.type === 'Claude' || entry.type === 'Gemini' || entry.type === 'DeepL') {
    return { ok: false, message: `${entry.type} 不支持语音识别，请在 API Key 里加一个 OpenAI / 自定义 类型的 Key` };
  }
  const key = String(entry.key || '').trim();
  // 模型名：优先 asrModel，否则用条目自带 model（3.8.1 S11：原来非 whisper 系
  // 模型名一律回落 whisper-1 首跳试错，MiMo 类条目先吃一次 404 才走 input_audio 兜底）
  const model = String(entry.asrModel || entry.model || 'whisper-1').trim();
  try {
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return { ok: false, message: '音频解码失败' };
    if (buf.length > 24 * 1024 * 1024) return { ok: false, message: '音频超过 24MB，请换一条更短的语音' };
    const m = String(mime || '').toLowerCase();
    const ext = /mpeg|mp3/.test(m) ? 'mp3'
      : /wav/.test(m) ? 'wav'
        : /mp4|m4a|aac/.test(m) ? 'm4a'
          : /webm/.test(m) ? 'webm'
            : 'ogg';
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime || 'audio/ogg' }), 'voice.' + ext);
    form.append('model', model);
    form.append('response_format', 'json');
    if (lang) form.append('language', String(lang));
    const res = await fetchTimeout(baseOf(entry) + '/audio/transcriptions', {
      method: 'POST',
      headers: key ? { Authorization: 'Bearer ' + key } : {},
      body: form,
    }, 90000);
    if (!res.ok) {
      if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
      if (res.status === 404) {
        // 有些服务商（如小米 MiMo）没有 whisper 式接口，语音识别走对话接口的 input_audio：
        // 条目里配了 ASR 模型（asrModel，或 model 本身带 asr）且音频是 wav/mp3 时改走这条再试。
        const asrChatModel = String(
          entry.asrModel || (/asr/i.test(String(entry.model || '')) ? entry.model : '')
        ).trim();
        const fmt = ext === 'wav' ? 'wav' : ext === 'mp3' ? 'mp3' : '';
        if (asrChatModel && fmt) {
          try {
            const r2 = await fetchTimeout(baseOf(entry) + '/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
              body: JSON.stringify({
                model: asrChatModel,
                messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: b64, format: fmt } }] }],
                max_tokens: 2000,
              }),
            }, 90000);
            if (r2.ok) {
              const d2 = await r2.json().catch(() => null);
              const t2 = d2 && d2.choices && d2.choices[0] && d2.choices[0].message && d2.choices[0].message.content;
              if (t2 && String(t2).trim()) return { ok: true, text: String(t2).trim() };
              return { ok: false, message: '识别结果为空（可能是静音或格式不支持）' };
            }
          } catch (e2) {}
        }
        return { ok: false, message: '接口不存在（404）：这个 Key 的地址不支持语音识别' };
      }
      const body = await res.text().catch(() => '');
      return { ok: false, message: `识别失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
    }
    const data = await res.json().catch(() => null);
    const text = (data && (data.text || (data.result && data.result.text))) || '';
    if (!String(text).trim()) return { ok: false, message: '识别结果为空（可能是静音或格式不支持）' };
    return { ok: true, text: String(text).trim() };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

module.exports = { testKey, chat, translate, tts, transcribe, fetchTimeout, DEFAULT_BASE, DEFAULT_MODEL };
