import type { HistoryItem } from '../types';

const KEY = 'vocab-pwa.history.v1';
const LIMIT = 30;

function safeGet(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function safeSet(value: string): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* 隐私模式或存储已满时忽略，不影响查词 */
  }
}

export function loadHistory(): HistoryItem[] {
  const raw = safeGet();
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is HistoryItem => {
        if (typeof item !== 'object' || item === null) return false;
        const rec = item as Record<string, unknown>;
        return typeof rec.word === 'string' && typeof rec.at === 'number';
      })
      .slice(0, LIMIT);
  } catch {
    return [];
  }
}

export function pushHistory(word: string): HistoryItem[] {
  const list = loadHistory().filter((item) => item.word !== word);
  list.unshift({ word, at: Date.now() });
  const next = list.slice(0, LIMIT);
  safeSet(JSON.stringify(next));
  return next;
}

export function clearHistory(): HistoryItem[] {
  safeSet(JSON.stringify([]));
  return [];
}
