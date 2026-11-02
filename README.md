# YiChat 译聊

多平台聚合聊天 + 实时翻译桌面应用（Electron），当前版本 3.5.0。

把 18 个海外社交平台的会话聚合到一个工作台里，收发消息自动翻译，做跨境沟通不用再来回切换应用。

## 功能

- **18 个平台聚合**：WhatsApp、Telegram、Line、Facebook、Instagram、Messenger、X、TikTok、Zalo、Signal、Snapchat、Google Voice、TextNow、Google Messages、Line Business、Meta Business、Chrome、Google Chat
- **双向实时翻译**：发送与接收均可独立配置翻译通道（谷歌 / 大模型多通道）、源语言与目标语言；全局模式与平台独立模式，配置按「会话 > 平台 > 全局」三级优先
- **禁止发送保护**：可拦截含中文的消息或译文，防止误发
- **AI 帮写**：多语言多语气生成回复，并自动回译核对（需自备大模型 API Key）
- **本机数据统计**：首页工作台汇总今日翻译量、成功率、近 7 天趋势与翻译节点延迟，数据只存本机、不上传
- **深色模式与多主题色**

## 关于本仓库

这里是 3.5.0 发布版的**应用文件树**（解包后的 Electron 应用目录：`src/` 前端与主进程文件，以及若干补丁脚本 `patch-*.js`），与正式发布的 Windows / macOS 安装包内容一致，便于查阅与二次研究；它不是原始的 Vite 工程源码。

界面增强与修复以 `yichat-ui-tweak.js` 与补丁脚本的形式叠加在应用本体之上。

## 第三方组件

打包文件包含 Ant Design、React 等第三方前端组件，其著作权与许可归各原项目所有。

## 版权

© 2026 shuhoying。本仓库未附加开源许可证，保留所有权利；公开仅供查阅。
