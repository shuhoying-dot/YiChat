# tools/ — 源码固化工具（3.9.0，2026-11-23）

本目录是工程资产，不属于应用本体：

- `patch-inventory.md` — 3.6.11 基线之后每一处外科补丁的清单（文件/原因/验收）。
- `check_invariants.py` — 结构不变量校验：版本五处一致、关键锚点在位、
  白屏铁律（index.html 必须含 yichat-ui-tweak.js 标签）。改完代码先跑它。
- `regression/run_all.py` — 发布前回归门：overlay 抓取七场景＋帮写开关七段
  序列＋工作台/备份全链路，全断言，任一失败即非 0 退出、不得发版。
  需要 Python＋Playwright（本机用 ~/workspace/.pwtest/bin/python）。
  打包后必须再对「成品 asar 解出的 dist」跑一遍：
  `python tools/regression/run_all.py <解包目录>/src/renderer/dist`

打包注意：tools/ 不入 asar。打包 staging 时与 CHANGELOG.md、docs/ 一并排除，
条目数基准随之核对（3.8.9 为 344 条目＝已排除 docs/CHANGELOG 的口径）。
