# -*- coding: utf-8 -*-
"""生成 dist/__verify.html：在构建产物上注入「按 ?q= 自动填词」的脚本，供无头浏览器截图验证。
仅用于本地验证，发布前请删除 dist 或重新构建。"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "dist", "index.html")
OUT = os.path.join(ROOT, "dist", "__verify.html")

INJECT = """
    <script type="module">
      const q = new URLSearchParams(location.search).get('q');
      if (q) {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        const start = Date.now();
        const tick = () => {
          const input = document.querySelector('.search-input');
          if (input) {
            input.focus();
            setValue.call(input, q);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
          if (Date.now() - start < 8000) setTimeout(tick, 80);
        };
        tick();
      }
    </script>
"""


def main():
    if not os.path.exists(INDEX):
        sys.exit("dist/index.html 不存在，请先 pnpm build")
    with open(INDEX, encoding="utf-8") as fh:
        src = fh.read()
    if "</body>" not in src:
        sys.exit("找不到 </body>")
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(src.replace("</body>", INJECT + "</body>"))
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
