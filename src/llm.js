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

function proxyDispatcher() {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || 'http://127.0.0.1:7897';
  if (!proxy) return null;
  try {
    const { ProxyAgent } = require('undici');
    return new ProxyAgent(proxy);
  } catch (e) { return null; }
}

async function fetchTimeout(url, opts = {}, ms = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const fetchOpts = { ...opts, signal: ctrl.signal };
    // 国外接口走代理（环境变量），国内接口直连
    if (!isDirectUrl(url)) {
      const dispatcher = proxyDispatcher();
      if (dispatcher) fetchOpts.dispatcher = dispatcher;
    }
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
    return { ok: false, message: `请求失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
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
      return { ok: false, message: `请求失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
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
      return { ok: false, message: `请求失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
    }
    if (entry.type === 'Gemini') {
      const res = await fetchTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
      );
      if (res.ok) return { ok: true, message: '连接成功，Key 有效' };
      if (res.status === 400 || res.status === 403) return { ok: false, message: 'Key 无效或无权限' };
      return { ok: false, message: `请求失败（HTTP ${res.status}）` };
    }
    // OpenAI / DeepSeek / 自定义：OpenAI 兼容，GET /models 即可校验
    const res = await fetchTimeout(baseOf(entry) + '/models', {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (res.ok) return { ok: true, message: '连接成功，Key 有效' };
    if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
    return { ok: false, message: `请求失败（HTTP ${res.status}）` };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ---------- 聊天补全（统一入口） ----------
async function chat(entry, messages, maxTokens = 500) {
  const key = String(entry.key || '').trim();
  if (!key) return { ok: false, message: 'Key 为空' };
  const model = modelOf(entry);
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
        return { ok: false, message: `请求失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
      }
      const data = await res.json();
      const text = (data.content || []).map((b) => b.text || '').join('');
      return { ok: true, text };
    }
    if (entry.type === 'Gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetchTimeout(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: messages.map((m) => m.content).join('\n') }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 403) return { ok: false, message: 'Key 无效或无权限' };
        return { ok: false, message: `请求失败（HTTP ${res.status}）` };
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
      return { ok: false, message: `请求失败（HTTP ${res.status}）：${body.slice(0, 160)}` };
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
  const r = await chat(
    entry,
    [
      { role: 'system', content: `你是一个翻译引擎。把用户发来的文本翻译成${targetLang}，只输出译文，不要解释。` },
      { role: 'user', content: t },
    ],
    800
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
  try {
    const res = await fetchTimeout(baseOf(entry) + '/audio/speech', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice, input: t.slice(0, 2000) }),
    }, 60000);
    if (!res.ok) {
      if (res.status === 401) return { ok: false, message: 'Key 无效（401 未授权）' };
      return { ok: false, message: `请求失败（HTTP ${res.status}）` };
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
  // 模型名：优先 asrModel；入口里配的 model 本身就是 whisper/transcribe 系就直接用，否则回落 whisper-1
  const model = String(
    entry.asrModel || (/whisper|transcribe/i.test(String(entry.model || '')) ? entry.model : 'whisper-1')
  ).trim();
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
      if (res.status === 404) return { ok: false, message: '接口不存在（404）：这个 Key 的地址不支持语音识别' };
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

module.exports = { testKey, chat, translate, tts, transcribe, DEFAULT_BASE, DEFAULT_MODEL };
