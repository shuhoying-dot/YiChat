const fs = require('fs');
const p = 'src/renderer/dist/assets/index-VcmNZFOh.js';
let s = fs.readFileSync(p, 'utf8');
let changed = 0;

// 修复 1：根组件把 antd 全局语言写死 zh_CN，切换界面语言后弹窗/表格/分页等
// antd 内置文案永远是中文。这里让根组件订阅 yichat-lang 事件重渲染，
// 并按当前界面语言在 zh_CN(mG.default) / en(Cl，包内现成的 antd 英文语言包) 间选择。
const oldRoot = 'function UY(){let[e,t]=aK();return(0,$.jsx)(ad,{locale:mG.default,';
const newRoot = 'function UY(){let[e,t]=aK();let[,u]=b.useReducer(e=>e+1,0);b.useEffect(()=>{let h=()=>u();window.addEventListener(`yichat-lang`,h);window.addEventListener(`storage`,h);return()=>{window.removeEventListener(`yichat-lang`,h);window.removeEventListener(`storage`,h)}},[]);return(0,$.jsx)(ad,{locale:NG()===`en`?Cl:mG.default,';
if (s.includes(newRoot)) {
  console.log('root locale: ALREADY PATCHED');
} else if (!s.includes(oldRoot)) {
  console.log('root locale: PATTERN MISS');
  process.exit(1);
} else {
  s = s.replace(oldRoot, newRoot);
  changed++;
  console.log('root locale: patched');
}

// 修复 2：登录页文案「当前仅支持简体中文」与实际不符（界面已支持英文），改为中性提示。
const oldZh = '"login.onlyZh":[`当前仅支持简体中文`,`Simplified Chinese only for now`,`目前僅支援簡體中文`,`Hiện chỉ hỗ trợ tiếng Trung giản thể`]';
const newZh = '"login.onlyZh":[`界面语言可在右上角切换`,`You can switch the UI language at the top right`,`介面語言可在右上角切換`,`Có thể đổi ngôn ngữ ở góc trên bên phải`]';
if (s.includes(newZh)) {
  console.log('login.onlyZh: ALREADY PATCHED');
} else if (!s.includes(oldZh)) {
  console.log('login.onlyZh: PATTERN MISS');
  process.exit(1);
} else {
  s = s.replace(oldZh, newZh);
  changed++;
  console.log('login.onlyZh: patched');
}

if (changed) fs.writeFileSync(p, s);
console.log('done, changed =', changed);
