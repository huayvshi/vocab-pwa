import type { HitKind, SearchHit, WordEntry } from '../types';

const FORM_LABELS: Record<string, string> = {
  past: '过去式',
  pp: '过去分词',
  ing: '现在分词',
  pl: '复数',
  third: '第三人称单数',
  comp: '比较级',
  sup: '最高级',
};

const RANK: Record<HitKind, number> = {
  exact: 0,
  form: 1,
  prefix: 2,
  contains: 3,
  zh: 4,
  fuzzy: 5,
};

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/;

export function hasChinese(text: string): boolean {
  return CJK.test(text);
}

/** 去掉首尾空白和包裹的引号，保留连字符与撇号 */
export function normalize(raw: string): string {
  return raw
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .toLowerCase();
}

/** 匹配用的宽松形式：只留字母与数字 */
function loose(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length];
}

function formNote(entry: WordEntry, query: string): string | undefined {
  for (const [key, value] of Object.entries(entry.forms)) {
    if (value.toLowerCase() === query) {
      return `${query} 是 ${entry.word} 的${FORM_LABELS[key] ?? key}`;
    }
  }
  return undefined;
}

function searchEnglish(words: WordEntry[], query: string, limit: number): SearchHit[] {
  const q = loose(query);
  if (!q) return [];

  const hits: SearchHit[] = [];
  const seen = new Set<number>();

  const push = (entry: WordEntry, kind: HitKind, note?: string) => {
    if (seen.has(entry.id)) return;
    seen.add(entry.id);
    hits.push({ entry, kind, note });
  };

  // 1) 完全匹配
  for (const w of words) {
    if (w.word.toLowerCase() === query) push(w, 'exact');
  }
  // 2) 词形匹配（studied -> study）
  for (const w of words) {
    const note = formNote(w, query);
    if (note) push(w, 'form', note);
  }
  // 3) 前缀匹配
  for (const w of words) {
    if (loose(w.word).startsWith(q)) push(w, 'prefix');
  }
  // 4) 包含匹配
  if (q.length >= 3) {
    for (const w of words) {
      if (loose(w.word).includes(q)) push(w, 'contains');
    }
  }
  // 5) 拼写相近
  if (hits.length === 0 && q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    for (const w of words) {
      if (editDistance(q, loose(w.word), max) <= max) push(w, 'fuzzy');
    }
  }

  return hits.slice(0, limit);
}

function searchChinese(words: WordEntry[], query: string, limit: number): SearchHit[] {
  const q = query.replace(/\s+/g, '');
  const hits: Array<SearchHit & { score: number }> = [];

  for (const w of words) {
    let best = Number.POSITIVE_INFINITY;
    for (const sense of w.senses) {
      const def = sense.def.replace(/\s+/g, '');
      const idx = def.indexOf(q);
      if (idx < 0) continue;
      // 位于释义开头或整段相等更优先
      const score = idx === 0 ? 0 : 1 + idx / 100;
      if (score < best) best = score;
    }
    if (Number.isFinite(best)) {
      hits.push({ entry: w, kind: 'zh', score: best });
    }
  }

  hits.sort((a, b) => a.score - b.score || a.entry.word.localeCompare(b.entry.word));
  return hits.slice(0, limit).map(({ entry, kind }) => ({ entry, kind }));
}

/**
 * 排序规则：完全匹配 > 词形匹配 > 前缀 > 包含 > 中文释义 > 拼写相近
 */
export function search(words: WordEntry[], rawQuery: string, limit = 20): SearchHit[] {
  const query = normalize(rawQuery);
  if (!query) return [];
  if (hasChinese(query)) return searchChinese(words, query, limit);

  const hits = searchEnglish(words, query, limit);
  return hits.sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.entry.word.localeCompare(b.entry.word));
}
