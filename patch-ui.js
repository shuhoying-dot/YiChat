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

// 修复 1：顶栏节点状态原来是写死轮播（优秀/一般/高延迟每 10 秒换一个，毫秒数
// 固定值加随机抖动），不是真测速。改为每 15 秒读一次本机真实翻译统计
// getDailyStats()，按今日平均延迟分档显示，毫秒数就是真实平均值。
// 没翻译数据时保持初始态、不轮播。
const oldZY = 'b.useEffect(()=>{let e=setInterval(()=>{a(e=>(e+1)%RY.length),s(Math.floor(Math.random()*40)-20)},1e4);return()=>clearInterval(e)},[])';
const newZY = 'b.useEffect(()=>{let g=()=>{try{let p=window.yichat&&window.yichat.getDailyStats&&window.yichat.getDailyStats();if(p&&p.then)p.then(e=>{if(!e||!(e.avgMs>0)){a(3);s(0);return;}let t=e.avgMs<=400?0:e.avgMs<=1200?1:2;a(t);s(Math.round(e.avgMs-RY[t].ms))}).catch(()=>{})}catch(_){}};g();let e=setInterval(g,15e3);return()=>clearInterval(e)},[])';
rep('status-bar real stats', oldZY, newZY);

// 修复 2：数据统计页（LY）原来整页写死演示数字（1234/856/42/98.2% + 10 月假趋势）。
// 改为读同一份本机翻译统计：今日翻译 / 翻译成功率 / 今日失败 / 近 7 天翻译 + 真实 7 天趋势。
const oldLY = 'function LY(){let{t:e}=zG();return(0,$.jsxs)(`div`,{style:{padding:20,overflowY:`auto`,height:`100%`},children:[(0,$.jsx)(fA,{extra:(0,$.jsx)(FY,{}),style:{marginBottom:16},children:(0,$.jsxs)(SL,{gutter:16,children:[(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`fans.stTotal`),value:1234})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`fans.stFresh`),value:856})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`fans.stToday`),value:42})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`stats.sendRate`),value:98.2,suffix:`%`,precision:1})})]})}),(0,$.jsxs)(fA,{title:e(`stats.trend`),children:[(0,$.jsx)(IY,{label:`10-09`,value:38,max:60}),(0,$.jsx)(IY,{label:`10-10`,value:45,max:60}),(0,$.jsx)(IY,{label:`10-11`,value:52,max:60}),(0,$.jsx)(IY,{label:`10-12`,value:31,max:60}),(0,$.jsx)(IY,{label:`10-13`,value:47,max:60}),(0,$.jsx)(IY,{label:`10-14`,value:58,max:60}),(0,$.jsx)(IY,{label:e(`stats.today`),value:42,max:60})]})]})}';
const newLY = 'function LY(){let{t:e}=zG();let[n,r]=b.useState(null);b.useEffect(()=>{let g=()=>{try{let p=window.yichat&&window.yichat.getDailyStats&&window.yichat.getDailyStats();if(p&&p.then)p.then(e=>r(e)).catch(()=>{})}catch(_){}};g();let t=setInterval(g,15e3);return()=>clearInterval(t)},[]);let h=n&&Array.isArray(n.history)?n.history:[],hs=h.reduce((s,x)=>s+(x.ok||0),0),mx=Math.max(1,...h.map(x=>x.ok||0));return(0,$.jsxs)(`div`,{style:{padding:20,overflowY:`auto`,height:`100%`},children:[(0,$.jsx)(fA,{style:{marginBottom:16},children:(0,$.jsxs)(SL,{gutter:16,children:[(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`stats.todayOk`),value:n?n.ok||0:0})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`stats.okRate`),value:n?n.rate||0:0,suffix:`%`})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`stats.todayFail`),value:n?n.fail||0:0})}),(0,$.jsx)(Oj,{span:6,children:(0,$.jsx)(PL,{title:e(`stats.weekOk`),value:hs})})]})}),(0,$.jsxs)(fA,{title:e(`stats.trend`),children:h.map(x=>(0,$.jsx)(IY,{label:String(x.d||``).slice(5),value:x.ok||0,max:mx},x.d))})]})}';
rep('stats page real data', oldLY, newLY);

// 修复 3：统计页新词条（插在 stats.today 词条后面，四语齐全）+ 趋势标题去掉「演示数据」
// stats.trend 原文案自带「（演示数据）/(demo)」，现在是真数据了，改成中性标题。
if (s.includes('"stats.todayOk"')) {
  console.log('stats dict keys: ALREADY PATCHED');
} else {
  const anchor = '"stats.today":[';
  const ai = s.indexOf(anchor);
  if (ai < 0) { console.log('stats dict keys: ANCHOR MISS'); process.exit(1); }
  const end = s.indexOf('],', ai);
  if (end < 0) { console.log('stats dict keys: END MISS'); process.exit(1); }
  const ins = '"stats.todayOk":[`今日翻译`,`Translated today`,`今日翻譯`,`Đã dịch hôm nay`],"stats.okRate":[`翻译成功率`,`Translation success`,`翻譯成功率`,`Tỷ lệ thành công`],"stats.todayFail":[`今日失败`,`Failed today`,`今日失敗`,`Thất bại hôm nay`],"stats.weekOk":[`近 7 天翻译`,`Last 7 days`,`近 7 天翻譯`,`7 ngày qua`],';
  s = s.slice(0, end + 2) + ins + s.slice(end + 2);
  changed++;
  console.log('stats dict keys: patched');
}
rep('stats.trend label zh', '每日进粉趋势（演示数据）', '每日翻译趋势');
rep('stats.trend label en', 'Daily fan trend (demo)', 'Daily translation trend');

if (changed) fs.writeFileSync(p, s);
console.log('done, changed =', changed);
