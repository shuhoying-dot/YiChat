// YiChat Key 加密 shim（2026-11-21，3.6.11 正式实现）
// 经典脚本，index.html 中排在 module bundle 之前：解析期同步执行，
// 在编译包 bundle 首次读 localStorage['yichat-api-keys'] 之前装好 Storage.prototype 包装。
// 只拦截该一个键：写时加密、读时解密、明文老数据首读时回写密文（无感迁移）。
// 加密构造：ChaCha20（RFC 8439）加密 + HMAC-SHA256 加密后认证（EtM），纯 JS 同步实现
// （Storage API 是同步的，WebCrypto subtle 是异步、用不上）。
// 落盘格式：'YCENC1:' + base64( nonce12 || 密文 || HMAC32 )，明文内嵌魔数 YKV1 二次判定。
// 主密钥由 preload 经 sendSync 从主进程同步取回（safeStorage 包裹落盘，见 main.js），
// 经 contextBridge 以 window.yichatVault.getMasterKey() 同步暴露给本脚本。
// 无主密钥时绝不假装加密：有密文数据读不出 → state.error='decrypt-failed'（宿主异常条
// 提示重新录入）；无数据 → 不装包装、行为与未加密一致，由宿主按 state 报错，不静默。

/* ==== YCV-CRYPTO-BEGIN ==== */
var YC_PREFIX = 'YCENC1:';
var YC_MAGIC = 'YKV1';
function ycB64enc(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function ycB64dec(str) {
  var s = atob(str), out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}
function ycUtf8enc(str) { return new TextEncoder().encode(str); }
function ycUtf8dec(bytes) { return new TextDecoder().decode(bytes); }

// ---------- SHA-256（纯 JS，FIPS 180-4） ----------
function ycSha256(bytes) {
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  function rr(v, c) { return (v >>> c) | (v << (32 - c)); }
  var bitLen = bytes.length * 8;
  var total = bytes.length + 9 + ((64 - ((bytes.length + 9) % 64)) % 64);
  var msg = new Uint8Array(total);
  msg.set(bytes);
  msg[bytes.length] = 0x80;
  var dv = new DataView(msg.buffer);
  dv.setUint32(total - 4, bitLen >>> 0);
  dv.setUint32(total - 8, Math.floor(bitLen / 4294967296));
  var w = new Int32Array(64);
  for (var off = 0; off < total; off += 64) {
    var t;
    for (t = 0; t < 16; t++) w[t] = dv.getInt32(off + t * 4);
    for (t = 16; t < 64; t++) {
      var s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      var s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (t = 0; t < 64; t++) {
      var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      var mj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = new Uint8Array(32);
  var odv = new DataView(out.buffer);
  for (var i = 0; i < 8; i++) odv.setInt32(i * 4, H[i]);
  return out;
}
// ---------- HMAC-SHA256（RFC 2104） ----------
function ycHmacSha256(key, data) {
  var k = key;
  if (k.length > 64) k = ycSha256(k);
  var inner = new Uint8Array(64 + data.length);
  var outer = new Uint8Array(64 + 32);
  for (var i = 0; i < 64; i++) {
    var kb = i < k.length ? k[i] : 0;
    inner[i] = kb ^ 0x36;
    outer[i] = kb ^ 0x5c;
  }
  inner.set(data, 64);
  outer.set(ycSha256(inner), 64);
  return ycSha256(outer);
}
// ---------- ChaCha20（纯 JS，RFC 8439；与 PoC 已验实现一致） ----------
function ycRotl(v, c) { return (v << c) | (v >>> (32 - c)); }
function ycQr(x, a, b, c, d) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ycRotl(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ycRotl(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ycRotl(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ycRotl(x[b] ^ x[c], 7);
}
function ycChachaBlock(key, counter, nonce) {
  var st = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574], i;
  for (i = 0; i < 8; i++) st.push((key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24)) >>> 0);
  st.push(counter >>> 0);
  for (i = 0; i < 3; i++) st.push((nonce[i * 4] | (nonce[i * 4 + 1] << 8) | (nonce[i * 4 + 2] << 16) | (nonce[i * 4 + 3] << 24)) >>> 0);
  var x = st.slice();
  for (i = 0; i < 10; i++) {
    ycQr(x, 0, 4, 8, 12); ycQr(x, 1, 5, 9, 13); ycQr(x, 2, 6, 10, 14); ycQr(x, 3, 7, 11, 15);
    ycQr(x, 0, 5, 10, 15); ycQr(x, 1, 6, 11, 12); ycQr(x, 2, 7, 8, 13); ycQr(x, 3, 4, 9, 14);
  }
  var out = new Uint8Array(64);
  for (i = 0; i < 16; i++) { var v = (x[i] + st[i]) >>> 0; out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255; out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = (v >>> 24) & 255; }
  return out;
}
function ycChacha20(key, nonce, data) {
  var out = new Uint8Array(data.length), counter = 0;
  for (var off = 0; off < data.length; off += 64) {
    var ks = ycChachaBlock(key, counter++, nonce), n = Math.min(64, data.length - off);
    for (var i = 0; i < n; i++) out[off + i] = data[off + i] ^ ks[i];
  }
  return out;
}
// ---------- 组合构造：ChaCha20 加密 + HMAC-SHA256(nonce||密文) 认证 ----------
function ycMacKey(masterKey) { return ycHmacSha256(masterKey, ycUtf8enc('YCENC1-MAC')); }
function ycEncrypt(masterKey, plain, randBytes) {
  var nonce = randBytes(12);
  var ct = ycChacha20(masterKey, nonce, ycUtf8enc(YC_MAGIC + plain));
  var authed = new Uint8Array(12 + ct.length);
  authed.set(nonce, 0); authed.set(ct, 12);
  var tag = ycHmacSha256(ycMacKey(masterKey), authed);
  var blob = new Uint8Array(authed.length + 32);
  blob.set(authed, 0); blob.set(tag, authed.length);
  return YC_PREFIX + ycB64enc(blob);
}
function ycDecrypt(masterKey, raw) {
  try {
    if (!raw || raw.indexOf(YC_PREFIX) !== 0) return null;
    var blob = ycB64dec(raw.slice(YC_PREFIX.length));
    if (blob.length < 12 + YC_MAGIC.length + 32) return null;
    var authed = blob.slice(0, blob.length - 32);
    var tag = blob.slice(blob.length - 32);
    var expect = ycHmacSha256(ycMacKey(masterKey), authed);
    var diff = 0;
    for (var i = 0; i < 32; i++) diff |= tag[i] ^ expect[i];
    if (diff !== 0) return null;
    var pt = ycUtf8dec(ycChacha20(masterKey, authed.slice(0, 12), authed.slice(12)));
    if (pt.indexOf(YC_MAGIC) !== 0) return null;
    return pt.slice(YC_MAGIC.length);
  } catch (e) { return null; }
}
/* ==== YCV-CRYPTO-END ==== */

(function () {
  'use strict';
  if (window.__ycVaultShim) return;
  window.__ycVaultShim = 1;
  var TARGET_KEY = 'yichat-api-keys';

  // ---------- 取主密钥（同步） ----------
  var state = { ready: false, backend: 'none', error: '', reads: 0, writes: 0, migrations: 0 };
  window.__ycVaultState = state;
  var masterKey = null;
  try {
    if (window.yichatVault && window.yichatVault.getMasterKey) {
      var r = window.yichatVault.getMasterKey();
      if (r && r.key) { masterKey = ycB64dec(r.key); state.backend = r.backend || 'unknown'; }
      else if (r && r.backend) { state.backend = r.backend; state.error = 'no-key:' + (r.message || ''); }
    }
  } catch (e) { state.error = 'bridge:' + String(e && e.message || e); }
  if (!masterKey || masterKey.length !== 32) {
    state.error = state.error || 'master-key-unavailable';
    // 无密钥时若已有密文数据（拷来的 userData），明确记为解密失败供宿主提示重录；
    // 包装不装：getItem 读到的是密文串，bundle 解析失败的风险由宿主文案引导重录解决，
    // 与 PoC 定版一致——绝不在无密钥时悄悄把密文当明文写回。
    try {
      var raw0 = window.localStorage.getItem(TARGET_KEY);
      if (raw0 && raw0.indexOf(YC_PREFIX) === 0) state.error = 'decrypt-failed';
    } catch (e) {}
    return;
  }
  state.ready = true;

  function encrypt(plain) {
    return ycEncrypt(masterKey, plain, function (n) {
      var b = new Uint8Array(n);
      crypto.getRandomValues(b);
      return b;
    });
  }
  function decrypt(raw) { return ycDecrypt(masterKey, raw); }

  // ---------- Storage.prototype 包装（仅 localStorage 的目标键） ----------
  var origGet = Storage.prototype.getItem;
  var origSet = Storage.prototype.setItem;
  Storage.prototype.getItem = function (k) {
    var v = origGet.call(this, k);
    if (k !== TARGET_KEY || this !== window.localStorage || v == null) return v;
    state.reads++;
    if (v.indexOf(YC_PREFIX) === 0) {
      var p = decrypt(v);
      if (p == null) { state.error = 'decrypt-failed'; return null; } // bundle 对 null 走 ||'[]' → 空表，不崩；宿主据 state.error 报异常条
      return p;
    }
    // 明文老数据：无感迁移——回写密文后照常返回明文
    try { origSet.call(this, TARGET_KEY, encrypt(v)); state.migrations++; } catch (e) {}
    return v;
  };
  Storage.prototype.setItem = function (k, v) {
    if (k === TARGET_KEY && this === window.localStorage) {
      state.writes++;
      return origSet.call(this, k, encrypt(String(v)));
    }
    return origSet.call(this, k, v);
  };

  // 诊断钩子（默认关）：localStorage 里 yc-vault-debug='1' 时才暴露原始落盘读法，
  // 供排障时核对密文形态；正常运行不挂。
  try {
    if (origGet.call(window.localStorage, 'yc-vault-debug') === '1') {
      window.__ycVaultDebug = {
        rawGet: function () { return origGet.call(window.localStorage, TARGET_KEY); }
      };
    }
  } catch (e) {}
})();
