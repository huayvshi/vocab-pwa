import type { Grade, QueueItem, StudyState, WordEntry } from '../types.ts';
import { bumpStat, dayKey, getStat } from './stats.ts';
import { schedule } from './srs.ts';

export type QueueMode = 'mixed' | 'new' | 'review' | 'wrong' | 'random';

/** 查词页的筛选条件 */
export type WordFilter = 'all' | 'star' | 'wrong' | 'learning' | 'new' | 'mastered';

export interface QueueOptions {
  /** 本轮最多取多少张卡 */
  limit: number;
  /** 每日新词目标 */
  dailyGoal: number;
  mode?: QueueMode;
  /** 只看某个主题 */
  topic?: string;
  /** 只看某个难度 */
  level?: 'core' | 'plus';
  wrongFirst?: boolean;
  /** random 模式下抽多少张，缺省 20 */
  count?: number;
  /** 只看重点标记的词 */
  starredOnly?: boolean;
  /** 注入随机源，便于单测 */
  random?: () => number;
}

export const DEFAULT_DRAW_COUNT = 20;
export const MAX_DRAW_COUNT = 200;

/** 洗牌（Fisher–Yates），随机源可注入 */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const temp = copy[index];
    copy[index] = copy[swap];
    copy[swap] = temp;
  }
  return copy;
}

/* ---------------- 重点标记 ---------------- */

export function isStarred(state: StudyState, word: string): boolean {
  return state.stars?.[word] !== undefined;
}

/** 切换某个词的重点标记（纯函数） */
export function toggleStar(state: StudyState, word: string, now: number): StudyState {
  const stars = { ...(state.stars ?? {}) };
  if (stars[word] !== undefined) delete stars[word];
  else stars[word] = now;
  return { ...state, stars, updatedAt: now };
}

/** 批量标记 / 取消标记，words 为空表示全部取消 */
export function setStars(state: StudyState, words: string[], now: number): StudyState {
  const stars = { ...(state.stars ?? {}) };
  for (const word of words) stars[word] = now;
  return { ...state, stars, updatedAt: now };
}

export function unstarAll(state: StudyState, now: number): StudyState {
  return { ...state, stars: {}, updatedAt: now };
}

/** 已标记的词，按标记时间倒序 */
export function starredWords(state: StudyState): string[] {
  return Object.entries(state.stars ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word);
}

/* ---------------- 筛选 ---------------- */

/** 按查词页的筛选条件过滤词库 */
export function filterWords(
  words: WordEntry[],
  state: StudyState,
  filter: WordFilter,
  now: number,
): WordEntry[] {
  const { progress } = state;
  if (filter === 'all') return words;
  if (filter === 'star') {
    const stars = state.stars ?? {};
    return words.filter((entry) => stars[entry.word] !== undefined);
  }
  if (filter === 'wrong') return words.filter((entry) => (progress[entry.word]?.lapses ?? 0) > 0);
  if (filter === 'learning') {
    return words.filter((entry) => {
      const item = progress[entry.word];
      return item !== undefined && item.reps < 5 && item.interval < 21;
    });
  }
  if (filter === 'mastered') {
    return words.filter((entry) => {
      const item = progress[entry.word];
      return item !== undefined && (item.reps >= 5 || item.interval >= 21);
    });
  }
  void now;
  return words.filter((entry) => progress[entry.word] === undefined);
}

/** 每个筛选条件下的词数，用于筛选行上的小标签 */
export const WORD_FILTERS: WordFilter[] = ['all', 'star', 'wrong', 'learning', 'new', 'mastered'];

export function countByFilter(
  words: WordEntry[],
  state: StudyState,
  now: number,
): Record<WordFilter, number> {
  const counts = {} as Record<WordFilter, number>;
  for (const filter of WORD_FILTERS) counts[filter] = filterWords(words, state, filter, now).length;
  return counts;
}

/** 抽选张数：非法输入回落默认值，超上限截断 */
export function normalizeDrawCount(input: number | string | null | undefined): number {
  const value = typeof input === 'number' ? input : Number.parseFloat(String(input ?? ''));
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DRAW_COUNT;
  return Math.min(MAX_DRAW_COUNT, Math.max(1, Math.round(value)));
}

/** 今天已经学了多少新词 */
export function learnedToday(state: StudyState, now: number): number {
  return getStat(state.stats, dayKey(now)).learned;
}

/** 今天还剩多少新词额度 */
export function remainingNew(state: StudyState, now: number, dailyGoal: number): number {
  return Math.max(0, dailyGoal - learnedToday(state, now));
}

/**
 * 组卡规则：到期复习优先 → 错题（可选优先）→ 新词补足今日目标 → 剩余额度用未到期复习填满。
 * random 模式在一个池子里随机抽 count 张。
 * 全部为纯计算，便于单测。
 */
export function buildQueue(
  words: WordEntry[],
  state: StudyState,
  now: number,
  options: QueueOptions,
): QueueItem[] {
  const {
    limit,
    dailyGoal,
    mode = 'mixed',
    topic,
    level,
    wrongFirst = false,
    count = DEFAULT_DRAW_COUNT,
    starredOnly = false,
    random = Math.random,
  } = options;
  const { progress } = state;
  const stars = state.stars ?? {};
  const pool = words.filter(
    (entry) =>
      (!topic || entry.topic === topic) &&
      (!level || (entry.level ?? 'core') === level) &&
      (!starredOnly || stars[entry.word] !== undefined),
  );

  if (mode === 'random') {
    // 只在学过的词里抽；一个都没学过时退到整库。抽出来的卡一律标 random，不吃每日新词额度
    const size = Math.max(0, Math.min(Math.round(count), limit));
    const learnedPool = pool.filter((entry) => progress[entry.word] !== undefined);
    const source = learnedPool.length > 0 ? learnedPool : pool;
    return shuffle(source, random)
      .slice(0, Math.min(size, source.length))
      .map((entry) => ({ entry, kind: 'random' as const }));
  }

  const due: QueueItem[] = pool
    .filter((entry) => {
      const item = progress[entry.word];
      return item !== undefined && item.due <= now;
    })
    .sort((a, b) => (progress[a.word]?.due ?? 0) - (progress[b.word]?.due ?? 0))
    .map((entry) => ({ entry, kind: 'review' as const }));

  const wrong: QueueItem[] = pool
    .filter((entry) => (progress[entry.word]?.lapses ?? 0) > 0)
    .sort((a, b) => (progress[b.word]?.lapses ?? 0) - (progress[a.word]?.lapses ?? 0))
    .map((entry) => ({ entry, kind: 'wrong' as const }));

  const fresh: QueueItem[] = pool
    .filter((entry) => progress[entry.word] === undefined)
    .slice(0, remainingNew(state, now, dailyGoal))
    .map((entry) => ({ entry, kind: 'new' as const }));

  if (mode === 'new') return fresh.slice(0, limit);
  if (mode === 'review') return due.slice(0, limit);
  if (mode === 'wrong') return wrong.slice(0, limit);

  const queue: QueueItem[] = [];
  const push = (items: QueueItem[]) => {
    for (const item of items) {
      if (queue.length >= limit) return;
      if (queue.some((existing) => existing.entry.word === item.entry.word)) continue;
      queue.push(item);
    }
  };

  if (wrongFirst) push(wrong);
  push(due);
  push(fresh);
  push(wrong);
  return queue.slice(0, limit);
}

/**
 * 记录一次评分，返回新的 state（不修改入参）。
 * 新词计入 learned，其余计入 reviewed；同时维护今日正确/错误计数。
 * `countsAsNew = false` 用于随机抽选：采到未学过的词时只记复习，不吃每日新词额度。
 */
export function applyAnswer(
  state: StudyState,
  word: string,
  grade: Grade,
  now: number,
  options: { countsAsNew?: boolean } = {},
): StudyState {
  const countsAsNew = options.countsAsNew !== false;
  const prev = state.progress[word];
  const nextProgress = schedule(prev, grade, now, word);
  const isNew = prev === undefined;
  const isCorrect = grade !== 'again';
  return {
    ...state,
    progress: { ...state.progress, [word]: nextProgress },
    stats: bumpStat(state.stats, dayKey(now), {
      learned: isNew && countsAsNew ? 1 : 0,
      reviewed: isNew && countsAsNew ? 0 : 1,
      correct: isCorrect ? 1 : 0,
      wrong: isCorrect ? 0 : 1,
    }),
    updatedAt: now,
  };
}

/** 队列里各类卡片的数量，用于页面上的小标签 */
export function queueSummary(queue: QueueItem[]): Record<QueueItem['kind'], number> {
  const counts = { new: 0, review: 0, wrong: 0, again: 0, random: 0 };
  for (const item of queue) counts[item.kind] += 1;
  return counts;
}

/** 本轮预计用时（分钟）：新词 25 秒、复习 12 秒、错题 20 秒、随机抽选 18 秒 */
export function estimateMinutes(queue: QueueItem[]): number {
  const seconds = queue.reduce((sum, item) => {
    if (item.kind === 'new') return sum + 25;
    if (item.kind === 'wrong') return sum + 20;
    if (item.kind === 'random') return sum + 18;
    return sum + 12;
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}
