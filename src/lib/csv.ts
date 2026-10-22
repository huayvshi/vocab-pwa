import type { WordEntry } from '../types.ts';

export interface CsvParseResult {
  words: WordEntry[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  word: 'word',
  单词: 'word',
  词: 'word',
  uk: 'uk',
  英音: 'uk',
  英式音标: 'uk',
  us: 'us',
  美音: 'us',
  美式音标: 'us',
  pos: 'pos',
  词性: 'pos',
  def: 'def',
  definition: 'def',
  释义: 'def',
  中文: 'def',
  example: 'example',
  例句: 'example',
  zh: 'zh',
  译文: 'zh',
  例句翻译: 'zh',
  topic: 'topic',
  主题: 'topic',
  标签: 'topic',
  level: 'level',
  难度: 'level',
};

interface RawRow {
  word: string;
  uk: string;
  us: string;
  pos: string;
  def: string;
  example: string;
  zh: string;
  topic: string;
  level: string;
}

const emptyRow = (): RawRow => ({
  word: '',
  uk: '',
  us: '',
  pos: '',
  def: '',
  example: '',
  zh: '',
  topic: '',
  level: '',
});

/** 按逗号切分一行，支持双引号包裹与 "" 转义 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((item) => item.trim());
}

const isDelimiterRow = (cells: string[]): boolean =>
  cells.every((cell) => cell === '' || /^[-=*\s]+$/.test(cell));

const WORD_PATTERN = /^[A-Za-z][A-Za-z'’\- ]{0,39}$/;

/**
 * 解析 CSV：首行可以是表头（中英文均可），也可以直接是数据。
 * 最少只需要「单词 + 释义」两列，顺序为 word,pos,def。
 */
export function parseCsv(text: string, startId = 9000, limit = 3000): CsvParseResult {
  const errors: string[] = [];
  const words: WordEntry[] = [];
  const seen = new Set<string>();
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

  if (lines.length === 0) {
    return { words, errors: ['文件是空的，没有可导入的内容。'] };
  }

  const firstCells = splitCsvLine(lines[0]);
  const looksLikeHeader = firstCells.some((cell) => HEADER_ALIASES[cell.toLowerCase()] !== undefined);
  const columnMap: Array<keyof RawRow> = looksLikeHeader
    ? firstCells.map((cell) => HEADER_ALIASES[cell.toLowerCase()] ?? 'word')
    : ['word', 'pos', 'def'];

  const body = looksLikeHeader ? lines.slice(1) : lines;
  if (looksLikeHeader && !columnMap.includes('def')) {
    errors.push('表头里没找到「释义 / def」列，已按「单词,词性,释义」的顺序尝试解析。');
    for (let index = 0; index < columnMap.length; index += 1) columnMap[index] = 'word';
    columnMap[0] = 'word';
    columnMap[1] = 'pos';
    columnMap[2] = 'def';
  }

  body.forEach((line, lineIndex) => {
    if (words.length >= limit) return;
    const cells = splitCsvLine(line);
    if (isDelimiterRow(cells)) return;
    const row = emptyRow();
    cells.forEach((cell, cellIndex) => {
      const key = columnMap[cellIndex];
      if (key && row[key] === '') row[key] = cell;
      else if (key && key === 'def' && cell) row.def = `${row.def}；${cell}`.replace(/^；/, '');
    });

    const word = row.word.trim();
    const def = row.def.trim();
    if (!word) {
      errors.push(`第 ${lineIndex + (looksLikeHeader ? 2 : 1)} 行：缺少单词，已跳过。`);
      return;
    }
    if (!WORD_PATTERN.test(word)) {
      errors.push(`第 ${lineIndex + (looksLikeHeader ? 2 : 1)} 行：「${word}」不是合法的英文单词，已跳过。`);
      return;
    }
    if (!def) {
      errors.push(`第 ${lineIndex + (looksLikeHeader ? 2 : 1)} 行：${word} 缺少释义，已跳过。`);
      return;
    }
    const key = word.toLowerCase();
    if (seen.has(key)) {
      errors.push(`第 ${lineIndex + (looksLikeHeader ? 2 : 1)} 行：${word} 重复出现，已忽略后面这条。`);
      return;
    }
    seen.add(key);

    words.push({
      id: startId + words.length,
      word,
      phoneticUK: row.uk,
      phoneticUS: row.us,
      senses: [{ pos: row.pos || 'n.', def }],
      forms: {},
      altPron: [],
      source: '自定义词库',
      example: row.example ? { en: row.example, zh: row.zh } : undefined,
      topic: row.topic || '自定义',
      level: /plus|进阶|难/i.test(row.level) ? 'plus' : 'core',
      custom: true,
    });
  });

  if (words.length === 0 && errors.length === 0) errors.push('没有解析到有效的词条，请检查文件格式。');
  return { words, errors };
}

/** 导出生词本 / 已学词的纯文本，可直接打印或粘进别处 */
export function exportWordlistText(words: WordEntry[], title = '生词本'): string {
  const lines: string[] = [title, `共 ${words.length} 词 · 导出于 ${new Date().toLocaleString('zh-CN')}`, ''];
  words.forEach((entry, index) => {
    const phonetic = entry.phoneticUK ? ` /${entry.phoneticUK}/` : '';
    const defs = entry.senses.map((sense) => `${sense.pos} ${sense.def}`).join('；');
    lines.push(`${index + 1}. ${entry.word}${phonetic}  ${defs}`);
    if (entry.example?.en) lines.push(`   例：${entry.example.en}`);
  });
  return lines.join('\n');
}

/** 导出为 CSV，方便再导回来或在 Excel 里编辑 */
export function exportCsv(words: WordEntry[]): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = ['word,uk,us,pos,def,example,zh,topic,level'];
  for (const entry of words) {
    const sense = entry.senses[0] ?? { pos: '', def: '' };
    rows.push(
      [
        entry.word,
        entry.phoneticUK,
        entry.phoneticUS,
        sense.pos,
        entry.senses.map((item) => `${item.pos} ${item.def}`).join('；'),
        entry.example?.en ?? '',
        entry.example?.zh ?? '',
        entry.topic ?? '',
        entry.level ?? 'core',
      ]
        .map(escape)
        .join(','),
    );
  }
  return rows.join('\n');
}
