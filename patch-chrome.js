const fs = require('fs');
const p = 'src/renderer/dist/assets/index-VcmNZFOh.js';
let s = fs.readFileSync(p, 'utf8');

// 应用自身 bug：rail 里有 18 个平台（rq），但会话组件只挂载 nq 里的 16 个，
// chrome / gchat 不在其中 → 点进去主区空白、没有「+ 会话」。
const oldTail = 'snapchat`,`gvoice`],rq=[';
const newTail = 'snapchat`,`gvoice`,`chrome`,`gchat`],rq=[';

if (s.includes(newTail)) {
  console.log('ALREADY PATCHED');
  process.exit(0);
}
if (!s.includes(oldTail)) {
  console.log('PATTERN MISS');
  process.exit(1);
}
s = s.replace(oldTail, newTail);
fs.writeFileSync(p, s);
console.log('patched nq -> adds chrome/gchat');
