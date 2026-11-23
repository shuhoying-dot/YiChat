#!/usr/bin/env python3
# YiChat 发布前回归门（2026-11-23，3.9.0 源码固化）
#
# 用法：
#   python run_all.py [dist_dir]
#   dist_dir 省略时用仓库内 src/renderer/dist（源码 dist）；打包后应再对
#   「成品 asar 解出的 dist」跑一遍（打包流程的一部分，不过不发版）。
#
# 覆盖三套仿真（全部断言化，任一失败退出码非 0）：
#   A. overlay 资料抓取七场景（TG/WA × 被动/自动、每号一次标记、隐形罩）
#   B. AI 帮写开关七段序列（点开→点关→点开→双击→✕关→点开→点遮罩关）
#   C. 工作台与数据备份（备份卡、冷启动文案、平台验证徽标、备份收集/恢复全链路）
#
# 依赖：Python + Playwright（含 Chromium）。夹具页在 fixtures/ 下；
# overlay.js / tweak-new.js / app-new.css 每次运行都从仓库源码现拷，保证测的是当前代码。
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
FIX = os.path.join(HERE, 'fixtures')
DIST = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(REPO, 'src', 'renderer', 'dist')
PORT_FIX, PORT_DIST = 8933, 8941

RESULTS = []


def report(name, ok, detail=''):
    RESULTS.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + ((' | ' + str(detail)[:220]) if detail else ''), flush=True)


def serve(directory, port):
    return subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'],
                            cwd=directory, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def wait_port(port, tries=40):
    import socket
    for _ in range(tries):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.25)
    return False


INIT = """
window.require = function (name) {
  if (name === 'electron') return {
    ipcRenderer: {
      sendToHost: function (ch, payload) { (window.__sent = window.__sent || []).push({ ch: ch, payload: payload }); },
      send: function () {}, on: function () {}, once: function () {},
      removeListener: function () {}, invoke: function () { return Promise.resolve(null); }
    },
    contextBridge: { exposeInMainWorld: function (k, v) { window[k] = v; } }
  };
  throw new Error('unknown module ' + name);
};
"""


def suite_overlay(b):
    def scenario(url, wait_s, end_check=None):
        pg = b.new_page(viewport={'width': 1242, 'height': 864})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
        pg.add_init_script(INIT)
        pg.goto(url)
        deadline = time.time() + wait_s
        sent = []
        while time.time() < deadline:
            pg.wait_for_timeout(700)
            sent = pg.evaluate("() => (window.__sent || []).filter(x => x.ch === 'scrm:profile')")
            if sent and end_check is None:
                break
            if sent and end_check and pg.evaluate(end_check):
                break
        sent = pg.evaluate("() => (window.__sent || []).filter(x => x.ch === 'scrm:profile')")
        state = pg.evaluate(end_check) if end_check else None
        pg.close()
        return sent, state, errs

    def named(sent):
        return [x for x in sent if x.get('payload', {}).get('name')]

    base = f'http://127.0.0.1:{PORT_FIX}'
    sent, _, errs = scenario(base + '/telegram/?open=1', 14)
    report('A1 TG 被动抓取', bool(named(sent)) and not errs, f'sends={len(sent)} errs={errs[:2]}')
    sent, _, errs = scenario(base + '/telegram/?late=1', 45,
                             "() => document.getElementById('settings').style.display === 'none' && document.getElementById('menu').style.display === 'none'")
    report('A2 TG 自动抓取（侧栏延迟 35s 就绪门）', bool(named(sent)) and not errs, f'sends={len(sent)} errs={errs[:2]}')
    sent, _, errs = scenario(base + '/whatsapp/?open=1', 14)
    report('A3 WA 被动抓取', bool(named(sent)) and not errs, f'sends={len(sent)} errs={errs[:2]}')
    sent, _, errs = scenario(base + '/whatsapp/', 45,
                             "() => document.getElementById('wa-panel').style.display === 'none'")
    report('A4 WA 自动抓取', bool(sent) and not errs, f'sends={len(sent)} errs={errs[:2]}')

    # A5 每号一次标记：抓到后置标记，重载后不再自动打开
    pg = b.new_page(viewport={'width': 1242, 'height': 864})
    errs5 = []
    pg.on('pageerror', lambda e: errs5.append(str(e)[:120]))
    pg.add_init_script(INIT)
    pg.goto(base + '/telegram/')
    sent5 = []
    deadline = time.time() + 30
    while time.time() < deadline:
        pg.wait_for_timeout(700)
        sent5 = pg.evaluate("() => (window.__sent || []).filter(x => x.ch === 'scrm:profile' && x.payload.name)")
        if sent5:
            break
    flag = pg.evaluate("() => localStorage.getItem('yc-self-captured-v1')")
    pg.reload()
    opened_again = False
    deadline = time.time() + 30
    while time.time() < deadline:
        pg.wait_for_timeout(700)
        st = pg.evaluate("() => ({ s: document.getElementById('settings').style.display, m: document.getElementById('menu').style.display, n: (window.__sent || []).filter(x => x.ch === 'scrm:profile').length })")
        if st['s'] == 'block' or st['m'] == 'block' or st['n'] > 0:
            opened_again = True
            break
    report('A5 每号一次标记（抓后置标记、重载不再开）', bool(sent5) and bool(flag) and not opened_again and not errs5,
           f'named={len(sent5)} flag={"SET" if flag else "MISSING"} reopened={opened_again}')
    pg.close()

    # A6 TG 隐形罩：自动抓取全程菜单/设置层不得可见
    pg = b.new_page(viewport={'width': 1242, 'height': 864})
    errs6 = []
    pg.on('pageerror', lambda e: errs6.append(str(e)[:120]))
    pg.add_init_script(INIT)
    pg.goto(base + '/telegram/')
    viol6, sent6 = 0, 0
    deadline = time.time() + 40
    while time.time() < deadline:
        pg.wait_for_timeout(150)
        st = pg.evaluate("""() => {
          var out = { viol: 0, sent: (window.__sent || []).filter(x => x.ch === 'scrm:profile' && x.payload.name).length,
                      cloak: !!document.querySelector('style[data-yc-cloak]') };
          ['menu', 'settings'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.style.display === 'block' && getComputedStyle(el).opacity !== '0') out.viol++;
          });
          return out;
        }""")
        viol6 += st['viol']
        sent6 = st['sent']
        if sent6 and not st['cloak']:
            break
    report('A6 TG 隐形罩', sent6 >= 1 and viol6 == 0 and not errs6, f'named={sent6} violations={viol6}')
    pg.close()

    # A7 WA 隐形罩：面板打开期间必须被罩住
    pg = b.new_page(viewport={'width': 1242, 'height': 864})
    errs7 = []
    pg.on('pageerror', lambda e: errs7.append(str(e)[:120]))
    pg.add_init_script(INIT)
    pg.goto(base + '/whatsapp/')
    viol7, seen7, sent7 = 0, 0, 0
    deadline = time.time() + 40
    while time.time() < deadline:
        pg.wait_for_timeout(120)
        st = pg.evaluate("""() => {
          var p = document.getElementById('wa-panel');
          var open = !!(p && p.style.display !== 'none');
          var cloaked = false;
          if (open) { var n = p; while (n) { if (n.style && n.style.opacity === '0') { cloaked = true; break; } n = n.parentElement; } }
          return { open: open, cloaked: cloaked,
                   sent: (window.__sent || []).filter(x => x.ch === 'scrm:profile').length };
        }""")
        if st['open']:
            seen7 += 1
            if not st['cloaked']:
                viol7 += 1
        sent7 = st['sent']
        if sent7 and seen7 and viol7 == 0 and pg.evaluate("() => document.getElementById('wa-panel').style.display === 'none'"):
            break
    report('A7 WA 隐形罩', seen7 > 0 and viol7 == 0 and sent7 >= 1 and not errs7,
           f'open_samples={seen7} uncloaked={viol7} sends={sent7}')
    pg.close()


def suite_toggle(b):
    pg = b.new_page(viewport={'width': 560, 'height': 700})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
    pg.goto('file://' + os.path.join(FIX, 'toggle', 'sim-new.html'))
    pg.wait_for_timeout(2500)
    pg.wait_for_selector('.sess-toolbar .yc-dock', timeout=6000)
    ai = pg.evaluate("""() => { const els = Array.from(document.querySelectorAll('.sess-toolbar .yc-dock > *'));
      const t = els.find(el => (el.title||'').includes('AI') || (el.textContent||'').includes('AI')); return els.indexOf(t); }""")
    sel = f'.sess-toolbar .yc-dock > *:nth-child({ai+1})'

    def mask():
        return pg.evaluate("() => !!document.getElementById('yc-ai-mask')")

    def click():
        pg.click(sel, timeout=2500)
        pg.wait_for_timeout(250)
        return mask()

    seq = [('click1_open', click()), ('click2_close', click()), ('click3_open', click())]
    pg.dblclick(sel, timeout=2500)
    pg.wait_for_timeout(250)
    seq.append(('dblclick_from_open', mask()))
    pg.click('.yc-ai-x', timeout=2500)
    pg.wait_for_timeout(250)
    seq.append(('x_close', mask()))
    seq.append(('click4_open', click()))
    pg.mouse.click(60, 300)
    pg.wait_for_timeout(250)
    seq.append(('mask_click_close', mask()))
    expect = [('click1_open', True), ('click2_close', False), ('click3_open', True),
              ('dblclick_from_open', True), ('x_close', False), ('click4_open', True),
              ('mask_click_close', False)]
    report('B AI 帮写标准开关七段序列', seq == expect and not errs, f'seq={seq} errs={errs[:2]}')
    pg.close()


def suite_workbench(b):
    pg = b.new_page(viewport={'width': 1242, 'height': 864})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
    pg.goto(f'http://127.0.0.1:{PORT_DIST}/index.html')
    pg.wait_for_timeout(3500)
    r = {}
    r['wb'] = pg.evaluate("() => !!document.getElementById('yc-wb')")
    r['backup_card'] = pg.evaluate("() => !!document.querySelector('.yc3-backup-card')")
    r['sess_text'] = pg.evaluate("() => { var el = document.querySelector('.yc3-gs-sess'); return el ? el.textContent : ''; }")
    r['ver_ok'] = pg.evaluate("() => document.querySelectorAll('.yc3-ver.ok').length")
    r['ver_no'] = pg.evaluate("() => document.querySelectorAll('.yc3-ver.no').length")
    pg.evaluate("""() => {
      localStorage.setItem('yichat-api-keys', JSON.stringify([{name:'k1', key:'SECRET1'}]));
      localStorage.setItem('cq', JSON.stringify({translate:'k1'}));
      localStorage.setItem('yichat_accounts_telegram', JSON.stringify([{id:'a1'}]));
      localStorage.setItem('other-app-key', 'KEEPME');
    }""")
    bk = pg.evaluate("() => window.__ycBackupTest ? window.__ycBackupTest.collect() : null")
    ok_collect = bool(bk) and bk.get('kind') == 'yichat-config-backup' \
        and 'yichat-api-keys' in bk['data'] and 'cq' in bk['data'] and 'other-app-key' not in bk['data']
    report('C1 工作台/备份卡/冷启动文案/验证徽标',
           bool(r['wb']) and bool(r['backup_card']) and '连接' in (r['sess_text'] or '') and r['ver_ok'] >= 2 and r['ver_no'] >= 1,
           f"wb={r['wb']} sess='{r['sess_text']}' chips ok={r['ver_ok']} no={r['ver_no']}")
    report('C2 备份收集（键集正确、不扫外键）', ok_collect,
           f"keys={sorted(bk['data'].keys()) if bk else None}")
    pg.evaluate("""(bk) => {
      localStorage.setItem('yichat-api-keys', 'CORRUPTED');
      localStorage.setItem('yichat-junk', 'STRAY');
      window.yichat = { importBackup: () => Promise.resolve({ ok: true, text: JSON.stringify(bk) }) };
    }""", bk)
    pg.click('.yc3-backup-card [data-act="backup-import"]')
    pg.wait_for_timeout(600)
    confirm = pg.evaluate("() => !!document.querySelector('.yc3-backup-status [data-act=\"backup-confirm\"]')")
    pg.click('.yc3-backup-status [data-act="backup-confirm"]')
    pg.wait_for_timeout(2500)
    restored = pg.evaluate("() => localStorage.getItem('yichat-api-keys')")
    stray = pg.evaluate("() => localStorage.getItem('yichat-junk')")
    other = pg.evaluate("() => localStorage.getItem('other-app-key')")
    wb2 = pg.evaluate("() => !!document.getElementById('yc-wb')")
    ok_restore = bool(confirm) and bool(restored) and 'SECRET1' in restored and stray is None and other == 'KEEPME' and bool(wb2)
    report('C3 备份恢复全链路（还原/清多余键/不动外键/重载正常）', ok_restore,
           f'restored={str(restored)[:40]} stray_gone={stray is None} other={other}')
    report('C4 全程零页面错误', not errs, f'errs={errs[:3]}')
    pg.close()


def main():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('需要 Playwright：pip install playwright && playwright install chromium')
        return 2
    # 夹具用当前源码：overlay / tweak / 编译 CSS 现拷
    shutil.copy(os.path.join(REPO, 'src', 'webview-preload', 'translate-overlay.js'), os.path.join(FIX, 'overlay.js'))
    shutil.copy(os.path.join(REPO, 'src', 'renderer', 'dist', 'assets', 'yichat-ui-tweak.js'), os.path.join(FIX, 'toggle', 'tweak-new.js'))
    shutil.copy(os.path.join(REPO, 'src', 'renderer', 'dist', 'assets', 'index-Dl50fv36.css'), os.path.join(FIX, 'toggle', 'app-new.css'))
    servers = [serve(FIX, PORT_FIX), serve(DIST, PORT_DIST)]
    try:
        if not (wait_port(PORT_FIX) and wait_port(PORT_DIST)):
            print('本地静态服务启动失败')
            return 2
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            suite_overlay(b)
            suite_toggle(b)
            suite_workbench(b)
            b.close()
    finally:
        for s in servers:
            s.terminate()
    failed = [n for n, ok in RESULTS if not ok]
    print('=' * 50)
    print(f'回归门：{len(RESULTS) - len(failed)}/{len(RESULTS)} 通过' + (f'，失败：{failed}' if failed else ''))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
