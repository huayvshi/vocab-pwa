# -*- coding: utf-8 -*-
"""生成 dist/__sw.html：报告 Service Worker 注册状态与缓存内容，供离线验证时 --dump-dom 读取。"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "dist", "index.html")
OUT = os.path.join(ROOT, "dist", "__sw.html")

INJECT = """
    <pre id="report" style="position:fixed;left:0;top:0;z-index:9999;font-size:11px"></pre>
    <script type="module">
      const run = async () => {
        const lines = [];
        // 先触发一次音频缓存（音频走 SW 的 cache-first）
        try {
          const audio = new Audio('https://dict.youdao.com/dictvoice?audio=abandon&type=0');
          audio.play().catch(() => {});
        } catch {}
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          lines.push(`CONTROLLER=${navigator.serviceWorker.controller ? 'yes' : 'no'} REGS=${regs.length}`);
          if (regs[0]) {
            lines.push(`SCOPE=${regs[0].scope}`);
            lines.push(`ACTIVE=${regs[0].active ? regs[0].active.state : 'none'}`);
          }
          const keys = await caches.keys();
          lines.push(`CACHES=${keys.join(',')}`);
          for (const key of keys) {
            const cache = await caches.open(key);
            const reqs = await cache.keys();
            lines.push(`CACHE ${key} ENTRIES=${reqs.length}`);
            lines.push(
              '  ' +
                reqs
                  .slice(0, 8)
                  .map((r) => r.url.replace(location.origin, '').slice(0, 46))
                  .join(' | '),
            );
          }
          // 词库是否真的能读到（离线时靠缓存）
          const res = await fetch('./data/vocab.json', { cache: 'no-store' }).catch(() => null);
          lines.push(`VOCAB_FETCH=${res ? res.status : 'FAILED'}`);
          if (res) {
            const json = await res.json();
            lines.push(`WORDS=${json.words.length}`);
          }
        } catch (error) {
          lines.push('ERROR=' + (error && error.message));
        }
        document.getElementById('report').textContent = 'SWCHECK\\n' + lines.join('\\n');
      };
      setTimeout(run, 3000);
    </script>
"""


def main():
    if not os.path.exists(INDEX):
        sys.exit("dist/index.html 不存在，请先 pnpm build")
    with open(INDEX, encoding="utf-8") as fh:
        src = fh.read()
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(src.replace("</body>", INJECT + "</body>"))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
