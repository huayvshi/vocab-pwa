import re
import sys

CSS = r'C:\Users\23839\Documents\deepseek-harness\default-workspace\vocab-pwa\src\index.css'
files = sys.argv[1:]
css = open(CSS, encoding='utf-8').read()
names = set()
for path in files:
    src = open(path, encoding='utf-8').read()
    for m in re.finditer(r'className=\{?[`"\']([^`"\']+)', src):
        for n in m.group(1).split():
            if n and '{' not in n and '$' not in n:
                names.add(n)
have = {n for n in names if re.search(r'\.' + re.escape(n) + r'(?![\w-])', css)}
missing = sorted(names - have)
print('ALL', len(names))
print('MISSING', missing)
