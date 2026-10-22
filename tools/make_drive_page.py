"""生成驱动页：把 dist/index.html 复制成 __drive-<场景>.html，并把自动化脚本内联进去。

用于在无头浏览器里点开「学习 / 统计 / 设置」并截图验证交互。
（把场景写进文件名而不是查询字符串——Windows 上传带 ? 的 URL 给 Edge 会被截断。）

用法：python tools/make_drive_page.py
"""
import io
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

SCENARIOS = [
    "setup",
    "study1",
    "study2",
    "study3",
    "stats",
    "statsempty",
    "wrong",
    "finish",
    "settings",
    "dark",
    "import",
    "lookup",
    "star",
    "starbrowse",
    "starstats",
    "mask",
    "draw",
    "meta",
    "darkmask",
    "roots",
    "rootsdark",
    "rootsword",
]

DRIVE_JS = r"""
const SCENARIO = '__SCENARIO__';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = fn();
    if (found) return found;
    await wait(60);
  }
  return null;
}

const q = (sel) => document.querySelector(sel);
const qa = (sel) => Array.from(document.querySelectorAll(sel));
const tab = (name) => {
  const hit = qa('.tab-bar .tab').find((el) => el.textContent.includes(name));
  if (hit) hit.click();
};
const clickText = (sel, text) => {
  const hit = qa(sel).find((el) => (el.textContent || '').includes(text));
  if (hit) hit.click();
  return hit;
};

function report(lines) {
  const box = document.createElement('div');
  box.id = 'drive-report';
  box.style.cssText =
    'position:fixed;left:0;bottom:0;z-index:99999;background:#0b1220;color:#8ef;font:11px/1.6 monospace;padding:5px 9px;opacity:.95;max-width:100%;white-space:pre-wrap';
  box.textContent = lines.join(' | ');
  document.body.appendChild(box);
}

async function gradeOnce(kind) {
  const reveal = q('.reveal-area .primary-btn');
  if (reveal) reveal.click();
  await wait(120);
  const btn = qa('.grade-btn.' + kind)[0];
  if (btn) btn.click();
  await wait(170);
}

const press = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

async function typeInto(selector, text) {
  const input = q(selector);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(420);
}

async function lookupWord(word) {
  tab('查词');
  await until(() => q('.search-input') || q('input'));
  await typeInto('.search-input', word);
  const first = q('.candidate');
  if (first) first.click();
  await wait(320);
}

async function main() {
  const log = [];
  await until(() => q('.tab-bar'));
  await wait(200);

  if (SCENARIO === 'lookup') {
    await until(() => q('input'));
    await wait(250);
    const input = q('.search-input') || q('input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'abandon');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(450);
    log.push('candidates=' + qa('.candidate').length);
    const first = q('.candidate');
    if (first) first.click();
    await wait(350);
    log.push('detail=' + (q('.word-card') ? q('.word-card').textContent.replace(/\s+/g, ' ').slice(0, 80) : 'none'));
  } else if (SCENARIO === 'setup') {
    tab('学习');
    await wait(350);
    log.push('preview=' + (q('.queue-preview') ? q('.queue-preview').textContent.replace(/\s+/g, ' ').trim() : 'none'));
  } else if (SCENARIO === 'study1' || SCENARIO === 'study2' || SCENARIO === 'study3') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(150);
    const startBtn = q('.primary-btn.wide');
    log.push('start=' + (startBtn ? startBtn.textContent.trim() : 'none'));
    startBtn.click();
    await until(() => q('.study-card'));
    await wait(150);
    log.push('word=' + (q('.study-word') ? q('.study-word').textContent : 'none'));
    if (SCENARIO === 'study1') {
      q('.reveal-area .primary-btn').click();
      await wait(250);
    } else if (SCENARIO === 'study2') {
      await gradeOnce('good');
      await wait(150);
    } else {
      await gradeOnce('good');
      await gradeOnce('again');
      for (let i = 0; i < 5; i += 1) await gradeOnce('good');
      log.push('meta=' + (q('.study-meta') ? q('.study-meta').textContent.replace(/\s+/g, ' ').trim() : 'none'));
    }
  } else if (SCENARIO === 'stats' || SCENARIO === 'dark') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(120);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    for (let i = 0; i < 8; i += 1) await gradeOnce('good');
    if (SCENARIO === 'dark') {
      tab('设置');
      await until(() => qa('.chip').length);
      await wait(150);
      clickText('.chip', '深色');
      await wait(250);
    }
    tab('统计');
    await wait(400);
    log.push('theme=' + document.documentElement.dataset.theme);
    log.push('kpi=' + qa('.kpi-value').map((el) => el.textContent.trim()).join('/'));
  } else if (SCENARIO === 'finish') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(120);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    await gradeOnce('again');
    for (let i = 0; i < 30; i += 1) {
      if (q('.summary-grid')) break;
      await gradeOnce('good');
    }
    await wait(300);
    log.push('summary=' + (q('.summary-grid') ? 'yes' : 'no'));
    log.push('text=' + (q('.summary-grid') ? q('.summary-grid').textContent.replace(/\s+/g, ' ') : 'none'));
  } else if (SCENARIO === 'wrong') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(120);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    await gradeOnce('again');
    for (let i = 0; i < 4; i += 1) await gradeOnce('good');
    tab('统计');
    await wait(400);
    log.push('wrong=' + qa('.wrong-list li').length);
    log.push('badge=' + (q('.tab-badge') ? q('.tab-badge').textContent : 'none'));
  } else if (SCENARIO === 'statsempty') {
    tab('统计');
    await wait(300);
    log.push('kpi=' + qa('.kpi-value').map((el) => el.textContent.trim()).join('/'));
  } else if (SCENARIO === 'settings') {
    tab('设置');
    await wait(300);
    log.push('panels=' + qa('.settings-columns .panel').length);
  } else if (SCENARIO === 'import') {
    tab('设置');
    await until(() => q('.paste-area'));
    await wait(150);
    const area = q('.paste-area');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, 'mitigate,v.,减轻；缓和\nplausible,adj.,看似合理的\nresilient,adj.,有弹性的');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(150);
    clickText('.ghost-btn', '解析粘贴内容');
    await wait(250);
    clickText('.primary-btn', '导入');
    await wait(400);
    log.push('notice=' + (q('.notice.ok') ? q('.notice.ok').textContent.trim() : 'none'));
    log.push('custom=' + qa('.custom-list li').length);
  } else if (SCENARIO === 'star' || SCENARIO === 'starbrowse') {
    if (SCENARIO === 'star') {
      await lookupWord('abandon');
      const starBtn = q('.word-card .star-btn');
      log.push('starBtn=' + (starBtn ? starBtn.textContent.trim() : 'none'));
      if (starBtn) starBtn.click();
      await wait(250);
      log.push('after=' + (q('.word-card .star-btn') ? q('.word-card .star-btn').textContent.trim() : 'none'));
      log.push('flash=' + (q('.flash') ? q('.flash').textContent.trim() : 'none'));
      log.push('pressed=' + (q('.word-card .star-btn') ? q('.word-card .star-btn').getAttribute('aria-pressed') : 'none'));
    } else {
      await lookupWord('abandon');
      q('.word-card .star-btn').click();
      await wait(200);
      await lookupWord('vulnerable');
      q('.word-card .star-btn').click();
      await wait(200);
      const clear = q('.search-clear');
      if (clear) clear.click();
      await wait(250);
      clickText('.filter-row .chip', '★ 重点');
      await wait(350);
      log.push('browse=' + qa('.browse-list li').length);
      log.push('head=' + (q('.browse-head') ? q('.browse-head').textContent.replace(/\s+/g, ' ').trim() : 'none'));
      log.push('stars=' + qa('.browse-list .star-btn.on').length);
      log.push('untouched=' + qa('.filter-row .chip')[4]?.textContent.trim());
    }
  } else if (SCENARIO === 'starstats') {
    await lookupWord('abandon');
    q('.word-card .star-btn').click();
    await wait(200);
    await lookupWord('vulnerable');
    q('.word-card .star-btn').click();
    await wait(200);
    await lookupWord('record');
    q('.word-card .star-btn').click();
    await wait(250);
    tab('统计');
    await wait(450);
    const panel = qa('.panel').find((el) => (el.textContent || '').includes('重点词'));
    log.push('panel=' + (panel ? panel.textContent.replace(/\s+/g, ' ').trim().slice(0, 110) : 'none'));
    log.push('rows=' + qa('.wrong-list li').length);
    log.push('practice=' + (qa('.primary-btn').map((el) => el.textContent.trim()).join('/')));
  } else if (SCENARIO === 'mask') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(150);
    press('h');
    await wait(150);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    q('.reveal-area .primary-btn').click();
    await wait(250);
    log.push('masked=' + (q('.masked-box') ? 'yes' : 'no'));
    log.push('zh=' + (q('.study-example .zh') ? 'yes' : 'no'));
    press('h');
    await wait(250);
    log.push('afterToggle=' + (q('.masked-box') ? 'yes' : 'no'));
    log.push('sense=' + (q('.sense-list') ? 'yes' : 'no'));
    log.push('tool=' + (q('.study-tools') ? q('.study-tools').textContent.replace(/\s+/g, ' ') : 'none'));
  } else if (SCENARIO === 'draw') {
    tab('学习');
    await until(() => qa('.chip').length);
    await wait(150);
    clickText('.mode-chip', '随机抽选');
    await wait(250);
    const num = q('input[aria-label="自定义抽选数量"]');
    if (num) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(num, '30');
      num.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(350);
    log.push('draw=' + (num ? num.value : 'none'));
    log.push('preview=' + (q('.queue-preview') ? q('.queue-preview').textContent.replace(/\s+/g, ' ').trim() : 'none'));
  } else if (SCENARIO === 'darkmask') {
    tab('设置');
    await until(() => qa('.chip').some((el) => el.textContent.trim() === '深色'));
    await wait(200);
    clickText('.chip', '深色');
    await wait(400);
    log.push('themeAfterClick=' + document.documentElement.dataset.theme);
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(150);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    q('.reveal-area .primary-btn').click();
    await wait(150);
    press('h');
    await wait(250);
    log.push('theme=' + document.documentElement.dataset.theme);
    log.push('masked=' + (q('.masked-box') ? 'yes' : 'no'));
  } else if (SCENARIO === 'meta') {
    tab('学习');
    await until(() => q('.primary-btn.wide'));
    await wait(150);
    q('.primary-btn.wide').click();
    await until(() => q('.reveal-area .primary-btn'));
    const word = q('.study-word') ? q('.study-word').textContent.trim() : '';
    await gradeOnce('good');
    await wait(200);
    log.push('word=' + word);
    await lookupWord(word);
    log.push('meta=' + (q('.word-card .meta-block') ? q('.word-card .meta-block').textContent.replace(/\s+/g, ' ').slice(0, 120) : 'none'));
    log.push('timeline=' + qa('.meta-timeline li').length);
  } else if (SCENARIO === 'roots' || SCENARIO === 'rootsdark') {
    if (SCENARIO === 'rootsdark') {
      tab('设置');
      await until(() => qa('.chip').some((el) => el.textContent.trim() === '深色'));
      await wait(200);
      clickText('.chip', '深色');
      await wait(350);
    }
    tab('词根');
    await until(() => qa('.root-card').length);
    await wait(350);
    log.push('roots=' + qa('.root-card').length);
    log.push('meta=' + (q('.roots-head .panel-meta') ? q('.roots-head .panel-meta').textContent.trim() : 'none'));
    const cards = qa('.root-card');
    const ced = cards.find((el) => (el.textContent || '').includes('ced'));
    if (ced) {
      ced.click();
      await wait(320);
      log.push('detail=' + (q('.root-detail h2') ? q('.root-detail h2').textContent.replace(/\s+/g, ' ').trim() : 'none'));
      log.push('words=' + qa('.root-word').length);
      log.push('first=' + (q('.root-word-text') ? q('.root-word-text').textContent : 'none'));
    } else {
      log.push('detail=ced-card-not-found');
    }
    log.push('theme=' + document.documentElement.dataset.theme);
  } else if (SCENARIO === 'rootsword') {
    await lookupWord('procedure');
    log.push('rootsLine=' + (q('.word-card .roots-line') ? q('.word-card .roots-line').textContent.replace(/\s+/g, ' ').trim() : 'none'));
  }

  report(log);
}

main().catch((error) => report(['ERROR ' + error.message]));
"""


def main():
    index_path = os.path.join(DIST, "index.html")
    with io.open(index_path, encoding="utf-8") as handle:
        html = handle.read()

    for scenario in SCENARIOS:
        script = DRIVE_JS.replace("__SCENARIO__", scenario)
        page = html.replace("</body>", '  <script type="module">\n%s\n  </script>\n  </body>' % script)
        out = os.path.join(DIST, "__drive-%s.html" % scenario)
        with io.open(out, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(page)

    # 窄屏验证：用 iframe 造真实视口（headless 窗口会被钳到 492 宽以上）
    frame = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>narrow</title>
<style>
  body { margin: 0; background: #dfe3ea; font: 12px/1.4 system-ui; display: flex; gap: 22px; padding: 22px; }
  figure { margin: 0; }
  figcaption { margin-bottom: 8px; color: #334; font-weight: 600; }
  iframe { border: 8px solid #1d2433; border-radius: 26px; background: #fff; display: block; }
</style></head><body>
  <figure><figcaption>390 × 844（iPhone 14）考查词 + 统计</figcaption>
    <iframe src="./__drive-stats.html" width="390" height="844"></iframe></figure>
  <figure><figcaption>360 × 780（安卓小屏）学习卡</figcaption>
    <iframe src="./__drive-study1.html" width="360" height="780"></iframe></figure>
</body></html>
"""
    with io.open(os.path.join(DIST, "__frame.html"), "w", encoding="utf-8", newline="\n") as handle:
        handle.write(frame)

    print("wrote %d drive pages + frame page" % len(SCENARIOS))


if __name__ == "__main__":
    main()
