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

// 节点分档词与主页节点卡统一：优秀 / 良好 / 偏慢（原顶栏用 一般 / 高延迟，同一延迟两个说法）
rep('nodeNormal word',
  '"status.nodeNormal":[`一般`,`Normal`,`一般`,`Trung bình`]',
  '"status.nodeNormal":[`良好`,`Good`,`良好`,`Tốt`]');
rep('nodeHigh word',
  '"status.nodeHigh":[`高延迟`,`High latency`,`高延遲`,`Trễ cao`]',
  '"status.nodeHigh":[`偏慢`,`Slow`,`偏慢`,`Hơi chậm`]');

if (changed) fs.writeFileSync(p, s);
console.log('done, changed =', changed);
