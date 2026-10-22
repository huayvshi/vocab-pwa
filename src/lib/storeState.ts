import type { StudyState } from '../types.ts';
import { MAX_EVENTS } from './srs.ts';

/** IndexedDB / localStorage 里的键名 */
export const STORE_KEY = 'study.v1';

export function defaultState(): StudyState {
  return {
    version: 2,
    progress: {},
    stats: {},
    settings: {
      dailyGoal: 10,
      theme: 'system',
      wrongFirst: true,
      hideMeaning: false,
      drawCount: 20,
    },
    custom: [],
    stars: {},
    updatedAt: Date.now(),
  };
}

/** 兼容历史数据：缺字段补默认值，脏字段丢弃，超长作答记录截断 */
export function normalizeState(raw: StudyState | null): StudyState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const stars: Record<string, number> = {};
  if (raw.stars && typeof raw.stars === 'object' && !Array.isArray(raw.stars)) {
    for (const [word, at] of Object.entries(raw.stars)) {
      if (typeof word === 'string' && word && typeof at === 'number' && Number.isFinite(at)) {
        stars[word] = at;
      }
    }
  }

  const progress: StudyState['progress'] = {};
  if (raw.progress && typeof raw.progress === 'object') {
    for (const [word, item] of Object.entries(raw.progress)) {
      if (!item || typeof item !== 'object') continue;
      const recent = Array.isArray(item.recent)
        ? item.recent
            .filter(
              (event) =>
                event &&
                typeof event.at === 'number' &&
                Number.isFinite(event.at) &&
                (event.grade === 'again' || event.grade === 'hard' || event.grade === 'good'),
            )
            .slice(0, MAX_EVENTS)
        : [];
      const learnedAt = num(item.learnedAt, Date.now());
      progress[word] = {
        ...item,
        word,
        reps: num(item.reps, 0),
        interval: num(item.interval, 0),
        ease: num(item.ease, 2.5),
        due: num(item.due, learnedAt),
        lapses: num(item.lapses, 0),
        correct: num(item.correct, 0),
        learnedAt,
        recent,
      };
    }
  }

  const stats: StudyState['stats'] = {};
  if (raw.stats && typeof raw.stats === 'object') {
    for (const [day, value] of Object.entries(raw.stats)) {
      if (!value || typeof value !== 'object') continue;
      stats[day] = {
        learned: num(value.learned, 0),
        reviewed: num(value.reviewed, 0),
        correct: num(value.correct, 0),
        wrong: num(value.wrong, 0),
      };
    }
  }

  const custom = Array.isArray(raw.custom)
    ? raw.custom.filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          typeof entry.word === 'string' &&
          Array.isArray(entry.senses) &&
          entry.senses.length > 0,
      )
    : [];

  const settings = { ...base.settings, ...(raw.settings ?? {}) };

  return {
    ...base,
    ...raw,
    version: 2,
    progress,
    stats,
    custom,
    stars,
    settings: {
      ...settings,
      dailyGoal: Math.min(500, Math.max(1, Math.round(num(settings.dailyGoal, 10)))),
      drawCount: Math.min(200, Math.max(1, Math.round(num(settings.drawCount, 20)))),
      hideMeaning: settings.hideMeaning === true,
    },
  };
}
