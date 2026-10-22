// 搜索规则单测：用构建前同一份 TS 源码 + 真实词库跑断言
// 运行：node tools/test_search.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { search } from '../src/lib/search.ts';

const here = dirname(fileURLToPath(import.meta.url));
const vocab = JSON.parse(readFileSync(join(here, '..', 'public', 'data', 'vocab.json'), 'utf8'));
const words = vocab.words;

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass += 1;
  } else {
    failures.push(`${name}\n    expected ${e}\n    actual   ${a}`);
  }
}

const top = (q) => {
  const hits = search(words, q, 20);
  return hits.length ? hits[0].entry.word : null;
};
const kindOf = (q) => {
  const hits = search(words, q, 20);
  return hits.length ? hits[0].kind : null;
};

// 1. 完全匹配排第一
check('exact: abandon', top('abandon'), 'abandon');
check('exact kind', kindOf('abandon'), 'exact');

// 2. 大小写与首尾空格
check('case: ABANDON', top('  ABANDON  '), 'abandon');
check('case: Vulnerable', top('Vulnerable'), 'vulnerable');

// 3. 词形匹配
check('form: abandoned', top('abandoned'), 'abandon');
check('form kind', kindOf('abandoned'), 'form');
check('form note', search(words, 'abandoned', 5)[0].note, 'abandoned 是 abandon 的过去式');
check('form: phenomena', top('phenomena'), 'phenomenon');
check('form: hypotheses', top('hypotheses'), 'hypothesis');
check('form: implied', top('implied'), 'imply');
check('form: contracted', top('contracted'), 'contract');

// 4. 前缀匹配
check('prefix: aba', top('aba'), 'abandon');
check('prefix kind', kindOf('aba'), 'prefix');
check(
  'prefix: dem 命中 demand 与 demonstrate',
  search(words, 'dem', 20)
    .map((h) => h.entry.word)
    .filter((w) => w === 'demand' || w === 'demonstrate')
    .sort()
    .join(','),
  'demand,demonstrate',
);

// 5. 中文释义
check('zh: 放弃', top('放弃'), 'abandon');
check('zh kind', kindOf('放弃'), 'zh');
check('zh: 认知', top('认知'), 'cognitive');
check('zh: 客观', top('客观'), 'objective');
check('zh: 幸存? 无匹配返回空', search(words, '不存在的释义', 20).length, 0);

// 6. 拼写相近
check('fuzzy: abandom', top('abandom'), 'abandon');
check('fuzzy kind', kindOf('abandom'), 'fuzzy');
check('无结果', top('zzzzzz'), null);

// 7. 排序与条数
const many = search(words, 'a', 20);
check('limit 20', many.length <= 20, true);
const ranks = search(words, 'abandon', 20).map((h) => h.kind);
check('exact 在 form/prefix 之前', ranks[0], 'exact');

// 8. 多音词数据完整
const record = words.find((w) => w.word === 'record');
check('record 有多读音', record.altPron.length, 1);
check('record 英音', record.phoneticUK, '/ˈrekɔːd/');
check('record 义项数', record.senses.length, 2);

// 9. 词库整体校验
check('词条数 >= 5500', words.length >= 5500, true, String(words.length));
check('单词唯一', new Set(words.map((w) => w.word)).size, words.length);
check('全部有释义', words.every((w) => w.senses.length > 0), true);
check(
  '英音格式统一',
  words.every((w) => !w.phoneticUK || (w.phoneticUK.startsWith('/') && w.phoneticUK.endsWith('/'))),
  true,
);
check(
  '美音格式统一',
  words.every((w) => !w.phoneticUS || (w.phoneticUS.startsWith('/') && w.phoneticUS.endsWith('/'))),
  true,
);
check(
  'id 连续',
  words.map((w) => w.id).join(','),
  Array.from({ length: words.length }, (_, i) => i + 1).join(','),
);
check('基础词在库内：telephone', top('telephone'), 'telephone');
check('基础词在库内：dictionary', top('dictionary'), 'dictionary');

console.log(`\n通过 ${pass} 项`);
if (failures.length) {
  console.log(`失败 ${failures.length} 项：`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('全部通过 ✓');
