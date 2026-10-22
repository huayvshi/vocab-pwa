# -*- coding: utf-8 -*-
"""生成 dist/__debug.html：加载应用后测量所有超宽元素，把结果写进 DOM，供 --dump-dom 读取。"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "dist", "index.html")
OUT = os.path.join(ROOT, "dist", "__debug.html")

INJECT = """
    <pre id="report" style="position:fixed;left:0;top:0;z-index:9999"></pre>
    <script type="module">
      const desc = (el) => {
        let s = el.tagName.toLowerCase();
        const cls = typeof el.className === 'string' ? el.className.trim() : '';
        if (cls) s += '.' + cls.split(/\\s+/).join('.');
        return s.slice(0, 70);
      };
      const run = () => {
        const vw = window.innerWidth;
        const docW = document.documentElement.scrollWidth;
        const bad = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 || r.width > vw + 1) {
            bad.push(`${desc(el)} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
          }
        }
        document.getElementById('report').textContent =
          `VW=${vw} SCROLLW=${docW} BAD=${bad.length}\\n` + bad.slice(0, 20).join('\\n');
      };
      // 等词库加载完、输入注入完成后再量
      setTimeout(run, 2600);
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
