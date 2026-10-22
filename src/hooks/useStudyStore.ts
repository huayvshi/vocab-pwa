import { useCallback, useEffect, useRef, useState } from 'react';
import type { Grade, Settings, StudyState, WordEntry } from '../types';
import { kvGet, kvSet, isIdbAvailable } from '../lib/db';
import { applyAnswer } from '../lib/study';
import { STORE_KEY as KEY, defaultState, normalizeState } from '../lib/storeState';

export { defaultState };

export interface StoreApi {
  state: StudyState;
  ready: boolean;
  storage: 'IndexedDB' | 'localStorage';
  /** 记一次评分；countsAsNew=false 用于随机抽选，不消耗每日新词额度 */
  grade: (word: string, value: Grade, options?: { countsAsNew?: boolean }) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** 加星/取消星；starred 省略表示对每个词取反。一次写入，避免批量操作丢中间态 */
  star: (target: string | string[], starred?: boolean) => void;
  importWords: (words: WordEntry[]) => void;
  removeCustom: (id: number) => void;
  resetProgress: () => void;
}

/** 学习状态 + 自动持久化（IndexedDB 优先，写入去抖 400ms） */
export function useStudyStore(): StoreApi {
  const [state, setState] = useState<StudyState>(defaultState);
  const [ready, setReady] = useState(false);
  const timer = useRef<number | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await kvGet<StudyState>(KEY);
      if (!alive) return;
      setState(normalizeState(stored));
      hydrated.current = true;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void kvSet(KEY, state);
    }, 400);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [state]);

  const grade = useCallback(
    (word: string, value: Grade, options?: { countsAsNew?: boolean }) => {
      const now = Date.now();
      setState((prev) => applyAnswer(prev, word, value, now, options));
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch }, updatedAt: Date.now() }));
  }, []);

  const star = useCallback((target: string | string[], starred?: boolean) => {
    const words = Array.isArray(target) ? target : [target];
    if (words.length === 0) return;
    const now = Date.now();
    setState((prev) => {
      const stars = { ...(prev.stars ?? {}) };
      let changed = false;
      for (const word of words) {
        if (!word) continue;
        const next = starred ?? stars[word] === undefined;
        if (next && stars[word] === undefined) {
          stars[word] = now;
          changed = true;
        } else if (!next && stars[word] !== undefined) {
          delete stars[word];
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, stars, updatedAt: now };
    });
  }, []);

  const importWords = useCallback((words: WordEntry[]) => {
    if (words.length === 0) return;
    setState((prev) => {
      const existing = new Set(prev.custom.map((entry) => entry.word.toLowerCase()));
      const merged = [...prev.custom];
      let nextId = prev.custom.reduce((max, entry) => Math.max(max, entry.id), 9000);
      for (const entry of words) {
        if (existing.has(entry.word.toLowerCase())) continue;
        nextId += 1;
        merged.push({ ...entry, id: nextId, custom: true });
        existing.add(entry.word.toLowerCase());
      }
      return { ...prev, custom: merged, updatedAt: Date.now() };
    });
  }, []);

  const removeCustom = useCallback((id: number) => {
    setState((prev) => {
      const target = prev.custom.find((entry) => entry.id === id);
      const stars = { ...(prev.stars ?? {}) };
      const progress = { ...prev.progress };
      if (target) {
        delete stars[target.word];
        delete progress[target.word];
      }
      return {
        ...prev,
        custom: prev.custom.filter((entry) => entry.id !== id),
        stars,
        progress,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    setState((prev) => ({
      ...defaultState(),
      settings: prev.settings,
      custom: prev.custom,
      // 重点标记属于用户资产，清进度时保留
      stars: prev.stars ?? {},
      updatedAt: Date.now(),
    }));
  }, []);

  return {
    state,
    ready,
    storage: isIdbAvailable() ? 'IndexedDB' : 'localStorage',
    grade,
    updateSettings,
    star,
    importWords,
    removeCustom,
    resetProgress,
  };
}

/** 主题：system 跟随系统，light/dark 手动覆盖 */
export function useTheme(theme: Settings['theme']): void {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
