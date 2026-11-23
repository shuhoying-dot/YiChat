#!/usr/bin/env python3
# YiChat 结构不变量校验（2026-11-23，3.9.0 源码固化）
#
# 编译 bundle 上的外科补丁靠锚点存活；这支脚本把「绝不能悄悄丢」的结构事实
# 钉成断言：任一不过，说明补丁被覆盖或文件被换错版本，先停下查，不要发版。
# 用法：python check_invariants.py（在仓库根目录或任意目录运行均可）
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
FAIL = []


def read(rel):
    with open(os.path.join(REPO, rel), encoding='utf-8') as fh:
        return fh.read()


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + ((' | ' + detail) if detail else ''))
    if not ok:
        FAIL.append(name)


def has(rel, needle, name, count=None):
    s = read(rel)
    c = s.count(needle)
    check(name, c == count if count is not None else c >= 1, f'{rel} 中出现 {c} 次')


DIST = 'src/renderer/dist'
# 1) tweak 脚本标签在位（v3 白屏事故铁律：缺标签则首页被工作台 CSS 藏成空白）
has(f'{DIST}/index.html', 'yichat-ui-tweak.js', 'index.html 含 yichat-ui-tweak.js 标签')
has(f'{DIST}/index.html', 'yichat-key-vault.js', 'index.html 含 yichat-key-vault.js 标签')

# 2) 五处版本串一致（package.json / title / tweak 页脚 / bundle 两处）
pkg = read('package.json')
m = re.search(r'"version": "([0-9.]+)"', pkg)
ver = m.group(1) if m else None
html = read(f'{DIST}/index.html')
tweak = read(f'{DIST}/assets/yichat-ui-tweak.js')
bundle = read(f'{DIST}/assets/index-VcmNZFOh.js')
check('版本号存在', bool(ver), f'package.json = {ver}')
check('title 版本一致', bool(ver) and f'YiChat 译聊 {ver}' in html)
check('tweak 页脚版本一致', bool(ver) and f'· v{ver}' in tweak)
check('bundle v: 版本一致', bool(ver) and f'v:`{ver}`' in bundle)
check('bundle ver: 版本一致', bool(ver) and f'ver:`{ver}`' in bundle)

# 3) 本人资料抓取（overlay）：回宿主通道、每号一次标记、隐形罩
OV = 'src/webview-preload/translate-overlay.js'
has(OV, 'scrm:profile', 'overlay 资料回传通道 scrm:profile')
has(OV, 'yc-self-captured-v1', 'overlay 每号一次标记 yc-self-captured-v1')
has(OV, 'data-yc-cloak', 'overlay 隐形罩 data-yc-cloak')
has(OV, 'ycSelfReady', 'overlay 就绪门 ycSelfReady')

# 4) tweak：帮写标准开关、备份、验证徽标、冷启动文案
has(f'{DIST}/assets/yichat-ui-tweak.js', 'ycBackupExport', 'tweak 数据备份导出')
has(f'{DIST}/assets/yichat-ui-tweak.js', 'yc3-ver', 'tweak 平台验证徽标 yc3-ver')
has(f'{DIST}/assets/yichat-ui-tweak.js', '会话将在打开后连接', 'tweak 冷启动文案', count=1)
check('tweak 无双击关残留', 'aiDockWasOpen' not in tweak, '3.8.2 的 dblclick 补丁已清除')

# 5) 主进程/预载：备份 IPC 与桥（带 assertTrusted 守卫）
has('src/main.js', 'yichat:export-backup', 'main 备份导出 IPC')
has('src/main.js', 'yichat:import-backup', 'main 备份恢复 IPC')
has('src/preload.js', 'exportBackup', 'preload exportBackup 桥')
has('src/preload.js', 'importBackup', 'preload importBackup 桥')

# 6) 编译 CSS：头像撑满修复与 3.8.9 新样式段
has(f'{DIST}/assets/index-Dl50fv36.css', '.sess-acc-avatar-img', 'CSS 头像撑满修复')
has(f'{DIST}/assets/index-Dl50fv36.css', '.yc3-backup-note', 'CSS 备份卡样式')

print('=' * 50)
print('不变量校验：' + ('全部通过' if not FAIL else f'失败 {len(FAIL)} 项：{FAIL}'))
sys.exit(1 if FAIL else 0)
