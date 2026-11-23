# YiChat 补丁清单（patch inventory）

2026-11-23 随 3.9.0「源码固化」建立。记录 3.6.11（仓库基线提交 60fe683）之后
对编译产物与源码的每一处外科补丁：动了哪个文件、为什么、怎么验。
基线之前的变更见各版本提交记录；3.6.12–3.8.0 的完整差异即提交
60fe683 → a925d89 的 diff，本清单自 3.8.1 起逐版登记。

涉及文件简称：
- BUNDLE = src/renderer/dist/assets/index-VcmNZFOh.js（编译渲染层，无源码）
- CSS = src/renderer/dist/assets/index-Dl50fv36.css（编译样式）
- TWEAK = src/renderer/dist/assets/yichat-ui-tweak.js（自有 UI 增强脚本，明文）
- OVERLAY = src/webview-preload/translate-overlay.js（平台页注入脚本，明文）
- MAIN = src/main.js，PRELOAD = src/preload.js（明文）

纪律：改编译产物必须先备份（备份不入仓）、锚点唯一命中校验、node --check、
改完跑 tools/check_invariants.py 与 tools/regression/run_all.py，成品包再验一遍。

## 3.8.1 问题清仓（asar MD5 c7dc37e023c909df9e41533f9642abac）

- S9 翻译缓存键改为「目标语言＋通道＋原文」，切语言不再端旧译文（OVERLAY）。
- S10 复核为 3.6.8 已修，仿真复证 Meta row 看图钮正常（无改动）。
- S11 llm 边角（MAIN/llm.js）：TTS/ASR 首跳用条目模型不再先吃 404；translate
max_tokens 按长度放大封顶 4000；testKey 增验模型存在；Gemini 数组 content 提文本。
- S6 IPC 信任边界（MAIN）：asr/tts/fill/capture/open-popup/quit/scrm 全套/
wa:preload-path 统一加 assertTrusted，正负向实测 14/14。
- S8 探针节流（OVERLAY）：8s→20s＋hidden 跳过；三 ensure 合并为一个 4s；
scope 走缓存复用。
- #21 性能页接真实数据（MAIN＋BUNDLE）：yichat:perf-metrics 采样
getAppMetrics/getSystemMemoryInfo/os.cpus，评分公式与口径说明注入页面。

## 3.8.2 四修（asar MD5 b29a1cae244d7c5eb2592646f98f3751）

- 账号卡头像白圈（CSS）：原生 CSS 把.sess-acc-avatar 撑到 40px+1px 边框而图
只有 34px；补.sess-acc-avatar-img{width/height:100%} 撑满（34/40→40/40）。
- 本人资料接收端（BUNDLE）：self-profile 同步回调 Ze 首行 return; 短路，删之
（发送端在 3.8.3 补完）。
- AI 帮写开关 v1（TWEAK）：单击只开＋dock 遮罩右让 50px＋dblclick 带 was-open
守卫关闭。
- TTS 选 Key（BUNDLE）：useState('') 改初始化链＝已存 hq('tts')→对口条目→唯一
候选，onChange 写回 gq('tts')。

## 3.8.3 本人资料抓取打通（asar MD5 cd3729060f5e2c587d3434c3ba87a3ee）

- 宿主 ipc-message 的 scrm:profile 空壳分支 {void 0} 改为调用
D.current.onProfileUpdate（BUNDLE）。
- OVERLAY 新增抓取模块：经 sendToHost('scrm:profile', {self,name,phone,
avatarUrl}) 回宿主，头像 fetch→blob→dataURL。
- TG reader：锚点.profile-content.is-me，名.profile-name，头像
.avatar-120 img，电话为.row-title 中 +号码形行（据真机快照 162509）。
- WA reader：类名混淆不可用，几何＋文本形状定位（左列面板内 100–140px
方形照片，下方第一段 ≥16px 文本为名，+号码形为电话；窄轨头像钮仅头像回退）。
- 附带修快照同名覆盖（MAIN）：yichat:save-snapshot 同秒冲突自动加 -2/-3。

## 3.8.4 TG 自动打开加固（asar MD5 a087498f592fef8460f80ae761da3515）

- ycRealClick 真实鼠标事件序列（pointerdown→…→click），治只认 mousedown 的钮。
- ycFindSettingsItem 两遍标签匹配（后代文本精确→整项短文本包含；多语言标签），
治菜单项图标字形污染 textContent。
- WA 自动路径同步改真实点击；window.__ycSelfDbg 步骤记录随 collectDiag 上报。

## 3.8.5 就绪门（asar MD5 165167783f1c33e383cec86f67b3e0ce）

- 根因（真机日志实锤）：新会话登录同步期菜单钮未渲染，旧版 3 次尝试预算烧光。
- ycSelfReady 就绪探针：未就绪不计数不尝试；就绪跃迁重置计数；每就绪期 6 次
真尝试、fn 返回 false 不扣次；ycTgBurger 加可见左上兜底。

## 3.8.6 每号一次（asar MD5 f3c1dce214c4c7bfbc2771fad5b426d3）

- 持久标记 yc-self-captured-v1（平台页 localStorage，随账号分区）：抓到带名字
资料即置标记，自动驱动见标记永久跳过；自动开页降为每号一次的首次引导，
日常新鲜度靠被动刷新。ycReadTelegram 加可见性门防读隐藏残留 DOM。

## 3.8.7 隐形罩（未单独交付，并入 3.8.8）

- 不取直读平台内部数据库（名字/电话在资料层渲染前不存在于页面；绑内部实现
更新即静默失效）。取渲染照常＋视觉隐形：TG 自动打开前注入
<style data-yc-cloak>，.btn-menu/.settings-layer 设 opacity:0+
pointer-events:none（不用 display/visibility），关层后撤罩＋9 秒安全阀；
WA 面板类名混淆，改 60ms 轮询就地隐形、关后还原。

## 3.8.8 帮写标准开关（asar MD5 a83af2666aef6b777532fd0d076d8ead）

- TWEAK dock 帮写钮改真 toggle（有 #yc-ai-mask 则关、否则开），删 3.8.2 的
aiDockWasOpen＋dblclick 补丁（其前提「遮罩盖钮」早被 yc-from-dock 让位消除）。

## 3.8.9 数据止血（asar MD5 8ff82428fa10a52a681ea2fd3995d20e）

- 数据备份卡（TWEAK＋CSS＋MAIN＋PRELOAD）：导出/恢复 localStorage 中
yichat*/yc-*/yc_*/cq 全部键；经 vault shim 解密视图导出、可跨机恢复；
新增 IPC yichat:export-backup / yichat:import-backup（assertTrusted＋系统
对话框）；恢复为真恢复、覆盖前二次确认、写回后自动重载。
- 平台验证徽标（TWEAK＋CSS.yc3-ver）：TG/WA「已验证」绿、其余「未验证」灰。
- 冷启动文案（TWEAK）：在线数 0 时顶条改「会话将在打开后连接」。

## 版本号五处（每版必改、必须一致，check_invariants.py 校验）

package.json 的 version；dist/index.html 的 <title>；TWEAK 页脚「· vX.Y.Z」；
BUNDLE 两处（dash 的 v:`X.Y.Z`、settings 的 ver:`X.Y.Z`）。MAIN 动态读不改。
