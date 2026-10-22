import type { Grade, ReviewEvent, WordEntry, WordProgress } from '../types.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
/** 答错后 10 分钟重新出现 */
export const RELEARN_MS = 10 * 60 * 1000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const MAX_EASE = 2.8;
/** 最长间隔 180 天，避免早期就把词推到半年后 */
export const MAX_INTERVAL = 180;
/** 每个词最多保留多少条作答记录 */
export const MAX_EVENTS = 12;

const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 追加一条作答记录，最新的在前，超出上限截断 */
export function pushEvent(recent: ReviewEvent[] | undefined, event: ReviewEvent): ReviewEvent[] {
  return [event, ...(recent ?? [])].slice(0, MAX_EVENTS);
}

/** 「10-21 22:12」，用于词条时间线 */
export function formatDateTime(ts?: number): string {
  if (!ts) return '—';
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 「2026-10-21」 */
export function formatDay(ts?: number): string {
  if (!ts) return '—';
  const date = new Date(ts);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 评分的中文名 */
export const GRADE_LABEL: Record<Grade, string> = {
  again: '忘了',
  hard: '模糊',
  good: '会了',
};

/** 相对时间：「刚刚」「2 小时前」「3 天前」，超过 30 天回退成「10-21」 */
export function relTime(ts: number | undefined, now: number): string {
  if (!ts) return '—';
  const diff = now - ts;
  if (diff < 60 * 1000) return '刚刚';
  const minutes = Math.round(diff / (60 * 1000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days <= 30) return `${days} 天前`;
  return formatDateTime(ts).slice(0, 5);
}

/** 没有进度记录时的初始状态 */
export function freshProgress(word: string, now: number): WordProgress {
  return {
    word,
    reps: 0,
    interval: 0,
    ease: START_EASE,
    due: now,
    lapses: 0,
    correct: 0,
    learnedAt: now,
    recent: [],
  };
}

/**
 * 简化版 SM-2：`会了` 按难度系数放大间隔，`模糊` 只小幅推进并降难度，`忘了` 打回 10 分钟。
 * 纯函数，同样的输入永远得到同样的输出，方便单测。
 */
export function schedule(
  prev: WordProgress | undefined,
  grade: Grade,
  now: number,
  word = prev?.word ?? '',
): WordProgress {
  const base = prev ?? freshProgress(word, now);

  if (grade === 'again') {
    return {
      ...base,
      reps: 0,
      lapses: base.lapses + 1,
      ease: round(clamp(base.ease - 0.2, MIN_EASE, MAX_EASE)),
      interval: RELEARN_MS / DAY_MS,
      due: now + RELEARN_MS,
      lastGrade: grade,
      lastAt: now,
      recent: pushEvent(base.recent, { at: now, grade }),
    };
  }

  if (grade === 'hard') {
    const nextInterval = base.interval > 0 ? base.interval * 1.2 : 1;
    return {
      ...base,
      reps: Math.max(1, base.reps),
      ease: round(clamp(base.ease - 0.15, MIN_EASE, MAX_EASE)),
      interval: round(clamp(nextInterval, 1, MAX_INTERVAL)),
      due: now + Math.round(clamp(nextInterval, 1, MAX_INTERVAL) * DAY_MS),
      lastGrade: grade,
      lastAt: now,
      correct: base.correct + 1,
      recent: pushEvent(base.recent, { at: now, grade }),
    };
  }

  const ease = round(clamp(base.ease + 0.1, MIN_EASE, MAX_EASE));
  const nextInterval = base.reps === 0 || base.interval <= 0 ? 1 : base.interval * ease;
  const interval = round(clamp(nextInterval, 1, MAX_INTERVAL));
  return {
    ...base,
    reps: base.reps + 1,
    ease,
    interval,
    due: now + Math.round(interval * DAY_MS),
    lastGrade: grade,
    lastAt: now,
    correct: base.correct + 1,
    recent: pushEvent(base.recent, { at: now, grade }),
  };
}

export const isDue = (progress: WordProgress | undefined, now: number): boolean =>
  progress !== undefined && progress.due <= now;

/** 间隔的易读文案：「10 分钟」「1 天」「12 天」 */
export function intervalLabel(days: number): string {
  if (!days || days <= 0) return '现在';
  if (days * DAY_MS < DAY_MS) return `${Math.max(1, Math.round(days * DAY_MS / 60000))} 分钟`;
  const rounded = Math.round(days);
  return `${rounded} 天`;
}

/** 到期文案：从现在起还有多久 / 已经过了多久 */
export function dueLabel(due: number, now: number): string {
  const diff = due - now;
  const abs = Math.abs(diff);
  const text =
    abs >= DAY_MS - 60 * 60 * 1000
      ? `${Math.round(abs / DAY_MS)} 天`
      : abs >= 60 * 60 * 1000
        ? `${Math.round(abs / (60 * 60 * 1000))} 小时`
        : `${Math.max(1, Math.round(abs / 60000))} 分钟`;
  return diff > 0 ? `${text}后` : `${text}前`;
}

/** 熟悉度 0–100：由 reps 与间隔大致折算，用于统计页展示 */
export function mastery(progress: WordProgress): number {
  const repScore = Math.min(1, progress.reps / 6);
  const intervalScore = Math.min(1, progress.interval / 60);
  const penalty = Math.min(0.4, progress.lapses * 0.08);
  return Math.round(clamp((repScore * 0.55 + intervalScore * 0.45 - penalty) * 100, 0, 100));
}

/** 一个词是否算「已掌握」：连续答对 5 次以上或间隔超过 21 天 */
export const isMastered = (progress: WordProgress): boolean =>
  progress.reps >= 5 || progress.interval >= 21;

export type { Grade };
export type Word = WordEntry;
