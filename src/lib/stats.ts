import type { DailyStat, WordProgress } from '../types.ts';
import { DAY_MS, isMastered, isDue } from './srs.ts';

const pad = (value: number) => `${value}`.padStart(2, '0');

/** 本地时区的 YYYY-MM-DD */
export function dayKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function addDays(key: string, delta: number): string {
  const date = parseDayKey(key);
  date.setDate(date.getDate() + delta);
  return dayKey(date.getTime());
}

export const emptyStat = (): DailyStat => ({ learned: 0, reviewed: 0, correct: 0, wrong: 0 });

export function getStat(stats: Record<string, DailyStat>, key: string): DailyStat {
  return stats[key] ?? emptyStat();
}

export interface StatDelta {
  learned?: number;
  reviewed?: number;
  correct?: number;
  wrong?: number;
}

/** 返回新的 stats 对象（不改原对象），便于 React 比较引用 */
export function bumpStat(
  stats: Record<string, DailyStat>,
  key: string,
  delta: StatDelta,
): Record<string, DailyStat> {
  const current = getStat(stats, key);
  const next: DailyStat = {
    learned: current.learned + (delta.learned ?? 0),
    reviewed: current.reviewed + (delta.reviewed ?? 0),
    correct: current.correct + (delta.correct ?? 0),
    wrong: current.wrong + (delta.wrong ?? 0),
  };
  return { ...stats, [key]: next };
}

export const hasActivity = (stat: DailyStat): boolean =>
  stat.learned + stat.reviewed + stat.correct + stat.wrong > 0;

/**
 * 连续打卡天数：从今天往前数，今天没活动时允许从昨天起算（当天还没开始不算断签）。
 */
export function streak(stats: Record<string, DailyStat>, now: number): number {
  const today = dayKey(now);
  let cursor = hasActivity(getStat(stats, today)) ? today : addDays(today, -1);
  let count = 0;
  while (hasActivity(getStat(stats, cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
    if (count > 3650) break;
  }
  return count;
}

/** 最近 n 天（含今天）的逐日数据，按时间正序 */
export function lastNDays(
  stats: Record<string, DailyStat>,
  n: number,
  now: number,
): Array<{ key: string; stat: DailyStat }> {
  const today = dayKey(now);
  const list: Array<{ key: string; stat: DailyStat }> = [];
  for (let offset = n - 1; offset >= 0; offset -= 1) {
    const key = addDays(today, -offset);
    list.push({ key, stat: getStat(stats, key) });
  }
  return list;
}

export interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  stat: DailyStat;
}

/** 月历矩阵：按周分组，每周 7 格，周一开头 */
export function monthMatrix(
  stats: Record<string, DailyStat>,
  year: number,
  month: number,
): CalendarCell[][] {
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一 = 0
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < startOffset; index += 1) {
    const date = new Date(year, month - 1, 1 - (startOffset - index));
    const key = dayKey(date.getTime());
    cells.push({ key, day: date.getDate(), inMonth: false, stat: getStat(stats, key) });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(month)}-${pad(day)}`;
    cells.push({ key, day, inMonth: true, stat: getStat(stats, key) });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1];
    const next = parseDayKey(last.key);
    next.setDate(next.getDate() + 1);
    const key = dayKey(next.getTime());
    cells.push({ key, day: next.getDate(), inMonth: false, stat: getStat(stats, key) });
  }
  const weeks: CalendarCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** 正确率（0–100），没有作答时返回 null */
export function accuracy(stat: DailyStat): number | null {
  const total = stat.correct + stat.wrong;
  if (total === 0) return null;
  return Math.round((stat.correct / total) * 100);
}

export interface ProgressSummary {
  /** 学过的词数（任意进度） */
  touched: number;
  /** 已掌握词数 */
  mastered: number;
  /** 现在到期该复习的词数 */
  due: number;
  /** 错题本词数 */
  wrongBook: number;
  /** 平均熟悉度 0–100 */
  averageMastery: number;
}

export function summarize(progress: Record<string, WordProgress>, now: number): ProgressSummary {
  const values = Object.values(progress);
  if (values.length === 0) {
    return { touched: 0, mastered: 0, due: 0, wrongBook: 0, averageMastery: 0 };
  }
  let mastered = 0;
  let due = 0;
  let wrongBook = 0;
  let masterySum = 0;
  for (const item of values) {
    if (isMastered(item)) mastered += 1;
    if (isDue(item, now)) due += 1;
    if (item.lapses > 0) wrongBook += 1;
    masterySum +=
      Math.min(1, item.reps / 6) * 0.55 + Math.min(1, item.interval / 60) * 0.45 - Math.min(0.4, item.lapses * 0.08);
  }
  return {
    touched: values.length,
    mastered,
    due,
    wrongBook,
    averageMastery: Math.round(Math.max(0, (masterySum / values.length) * 100)),
  };
}

/** 本周（周一起）每天的学习量，用于统计页柱状图 */
export function weekSeries(
  stats: Record<string, DailyStat>,
  now: number,
): Array<{ key: string; label: string; stat: DailyStat }> {
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const today = new Date(now);
  const offset = (today.getDay() + 6) % 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
  const list: Array<{ key: string; label: string; stat: DailyStat }> = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(monday.getTime() + index * DAY_MS);
    const key = dayKey(date.getTime());
    list.push({ key, label: labels[index], stat: getStat(stats, key) });
  }
  return list;
}
