const fs = require('fs');
const p = 'src/renderer/dist/assets/index-VcmNZFOh.js';
let s = fs.readFileSync(p, 'utf8');
let changed = 0;

function rep(name, oldStr, newStr) {
  if (s.includes(newStr)) { console.log(name + ': ALREADY PATCHED'); return; }
  if (!s.includes(oldStr)) { console.log(name + ': PATTERN MISS'); process.exit(1); }
  s = s.replace(oldStr, newStr);
  changed++;
  console.log(name + ': patched');
}

// 修复 1：RY 增加第四档「暂无数据」（灰点、ms=0），供无翻译数据时显示，
// 不再停留在初始的「优秀-176ms」假值上。
rep('RY none state',
  'ms:1630}];function zY(',
  'ms:1630},{key:`none`,labelKey:`status.nodeNone`,color:`#98a2b3`,ms:0}];function zY(');

// 修复 2：词条 status.nodeNone（四语），插在 status.nodeExcellent 前。
if (s.includes('"status.nodeNone"')) {
  console.log('status.nodeNone key: ALREADY PATCHED');
} else {
  const anchor = '"status.nodeExcellent":[';
  if (!s.includes(anchor)) { console.log('status.nodeNone key: ANCHOR MISS'); process.exit(1); }
  s = s.replace(anchor, '"status.nodeNone":[`暂无数据`,`No data`,`暫無數據`,`Chưa có dữ liệu`],' + anchor);
  changed++;
  console.log('status.nodeNone key: patched');
}

// 修复 3：status.node 模板去掉写死的「-{ms}ms」，改为由组件传完整后缀，
// 无数据时传空串，显示就是「翻译节点：暂无数据」，不带假毫秒。
rep('status.node template',
  '"status.node":[`翻译节点：{label}-{ms}ms`,`Translate node: {label}-{ms}ms`,`翻譯節點：{label}-{ms}ms`,`Nút dịch: {label}-{ms}ms`]',
  '"status.node":[`翻译节点：{label}{ms}`,`Translate node: {label}{ms}`,`翻譯節點：{label}{ms}`,`Nút dịch: {label}{ms}`]');

// 修复 4：zY 渲染时把 ms 拼成后缀（有值才拼 -XXXms）。
rep('zY ms suffix',
  't(`status.node`,{label:t(c.labelKey),ms:c.ms+o})',
  't(`status.node`,{label:t(c.labelKey),ms:c.ms+o>0?\'-\'+(c.ms+o)+\'ms\':\'\'})');

// 修复 5：patch-ui 已把顶栏改成读真实统计；这里补上无数据分支——
// avgMs 无值时切到第四档「暂无数据」，而不是保留初始假值。
rep('zY no-data state',
  'if(!e||!(e.avgMs>0))return;',
  'if(!e||!(e.avgMs>0)){a(3);s(0);return;}');

if (changed) fs.writeFileSync(p, s);
console.log('done, changed =', changed);
