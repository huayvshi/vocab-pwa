import { useMemo, useState } from 'react';
import {
  accuracy,
  dayKey,
  getStat,
  monthMatrix,
  streak,
  summarize,
  weekSeries,
} from '../lib/stats';
import { dueLabel, formatDay, isMastered } from '../lib/srs';
import { isStarred, starredWords } from '../lib/study';
import type { StoreApi } from '../hooks/useStudyStore';
import type { WordEntry } from '../types';

interface Props {
  words: WordEntry[];
  store: StoreApi;
  onPracticeWrong: () => void;
  onPracticeStarred: () => void;
  onLookup: (word: string) => void;
}

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function heatLevel(learned: number, reviewed: number): number {
  const total = learned + reviewed;
  if (total === 0) return 0;
  if (total < 5) return 1;
  if (total < 10) return 2;
  if (total < 20) return 3;
  return 4;
}

export function StatsView({ words, store, onPracticeWrong, onPracticeStarred, onLookup }: Props) {
  const { state } = store;
  const now = Date.now();
  const todayKey = dayKey(now);
  const today = getStat(state.stats, todayKey);
  const stats = summarize(state.progress, now);
  const days = streak(state.stats, now);
  const week = weekSeries(state.stats, now);
  const todayAccuracy = accuracy(today);

  const [monthOffset, setMonthOffset] = useState(0);
  const { year, month, weeks } = useMemo(() => {
    const base = new Date(now);
    const target = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
    const y = target.getFullYear();
    const m = target.getMonth() + 1;
    return { year: y, month: m, weeks: monthMatrix(state.stats, y, m) };
  }, [now, monthOffset, state.stats]);

  const byWord = useMemo(() => {
    const map = new Map<string, WordEntry>();
    for (const entry of words) map.set(entry.word, entry);
    return map;
  }, [words]);

  const wrongList = useMemo(
    () =>
      Object.values(state.progress)
        .filter((item) => item.lapses > 0)
        .sort((a, b) => b.lapses - a.lapses)
        .slice(0, 30),
    [state.progress],
  );

  const starList = useMemo(() => starredWords(state).slice(0, 20), [state]);
  const starTotal = useMemo(() => starredWords(state).length, [state]);

  const mastered = stats.mastered;
  const learning = stats.touched - mastered;
  const untouched = Math.max(0, words.length - stats.touched);

  const maxWeek = Math.max(1, ...week.map((item) => item.stat.learned + item.stat.reviewed));

  return (
    <main className="view">
      <section className="kpi-grid">
        <article className="kpi">
          <span className="kpi-label">今日已学</span>
          <strong className="kpi-value">
            {today.learned}
            <small> / {state.settings.dailyGoal}</small>
          </strong>
          <span className="kpi-foot">复习 {today.reviewed} 次</span>
        </article>
        <article className="kpi">
          <span className="kpi-label">连续打卡</span>
          <strong className="kpi-value">
            {days}
            <small> 天</small>
          </strong>
          <span className="kpi-foot">{days > 0 ? '保持住' : '今天开始算第一天'}</span>
        </article>
        <article className="kpi">
          <span className="kpi-label">今日正确率</span>
          <strong className="kpi-value">{todayAccuracy === null ? '—' : `${todayAccuracy}%`}</strong>
          <span className="kpi-foot">
            对 {today.correct} · 错 {today.wrong}
          </span>
        </article>
        <article className="kpi">
          <span className="kpi-label">已掌握</span>
          <strong className="kpi-value">
            {mastered}
            <small> / {words.length}</small>
          </strong>
          <span className="kpi-foot">平均熟悉度 {stats.averageMastery}</span>
        </article>
      </section>

      <div className="stats-columns">
        <section className="panel">
          <h2>本周学习量</h2>
          <div className="week-chart" role="img" aria-label="本周每天的学习量柱状图">
            {week.map((item) => {
              const total = item.stat.learned + item.stat.reviewed;
              const height = Math.round((total / maxWeek) * 100);
              return (
                <div className="week-col" key={item.key}>
                  <div className="week-bar-wrap">
                    <div
                      className={item.key === todayKey ? 'week-bar today' : 'week-bar'}
                      style={{ height: `${Math.max(total === 0 ? 2 : 8, height)}%` }}
                      title={`${item.key}：新词 ${item.stat.learned}，复习 ${item.stat.reviewed}`}
                    />
                  </div>
                  <span className="week-num">{total || ''}</span>
                  <span className="week-label">{item.label}</span>
                </div>
              );
            })}
          </div>
          <p className="panel-note">柱高 = 当天新词 + 复习次数，今天是深色柱。</p>
        </section>

        <section className="panel">
          <h2>熟悉度分布</h2>
          <div className="dist-bar">
            <span
              className="dist-seg mastered"
              style={{ width: `${(mastered / Math.max(1, words.length)) * 100}%` }}
              title={`已掌握 ${mastered}`}
            />
            <span
              className="dist-seg learning"
              style={{ width: `${(learning / Math.max(1, words.length)) * 100}%` }}
              title={`学习中 ${learning}`}
            />
            <span
              className="dist-seg untouched"
              style={{ width: `${(untouched / Math.max(1, words.length)) * 100}%` }}
              title={`未学 ${untouched}`}
            />
          </div>
          <ul className="dist-legend">
            <li>
              <span className="dot-swatch mastered" /> 已掌握 <b>{mastered}</b>
            </li>
            <li>
              <span className="dot-swatch learning" /> 学习中 <b>{learning}</b>
            </li>
            <li>
              <span className="dot-swatch untouched" /> 未学 <b>{untouched}</b>
            </li>
          </ul>
          <p className="panel-note">连续答对 5 次或间隔超过 21 天即算掌握。</p>
        </section>
      </div>

      <div className="stats-columns">
        <section className="panel">
          <div className="panel-head">
            <h2>
              打卡日历 · {year} 年 {month} 月
            </h2>            <div className="cal-nav">
              <button type="button" className="chip" onClick={() => setMonthOffset((value) => value - 1)}>
                上一月
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => setMonthOffset(0)}
                disabled={monthOffset === 0}
              >
                本月
              </button>
              <button type="button" className="chip" onClick={() => setMonthOffset((value) => value + 1)}>
                下一月
              </button>
            </div>
          </div>
          <div className="cal-grid" role="grid" aria-label="学习打卡日历">
            {WEEKDAY_LABELS.map((label) => (
              <span className="cal-head" key={label}>
                {label}
              </span>
            ))}
            {weeks.flat().map((cell) => {
              const level = heatLevel(cell.stat.learned, cell.stat.reviewed);
              return (
                <span
                  key={cell.key}
                  className={`cal-cell lv${level}${cell.inMonth ? '' : ' outside'}${cell.key === todayKey ? ' today' : ''}`}
                  title={`${cell.key}：新词 ${cell.stat.learned}，复习 ${cell.stat.reviewed}`}
                >
                  {cell.day}
                </span>
              );
            })}
          </div>
          <p className="panel-note">颜色越深表示当天新词 + 复习次数越多。</p>
        </section>

        <div className="stats-stack">
        <section className="panel">
          <div className="panel-head">
            <h2>错题本 · {stats.wrongBook} 词</h2>
            {stats.wrongBook > 0 ? (
              <button type="button" className="primary-btn small" onClick={onPracticeWrong}>
                练错题
              </button>
            ) : null}
          </div>
          {wrongList.length === 0 ? (
            <p className="panel-note">还没有答错的词。答错一次，词就会自动进这里。</p>
          ) : (
            <ul className="wrong-list">
              {wrongList.map((item) => {
                const entry = byWord.get(item.word);
                return (
                  <li key={item.word}>
                    <button type="button" className="wrong-word" onClick={() => onLookup(item.word)}>
                      {item.word}
                    </button>
                    <span className="wrong-def">{entry?.senses[0]?.def ?? '—'}</span>
                    <span className="wrong-meta">
                      错 {item.lapses} 次 · {isMastered(item) ? '已掌握' : dueLabel(item.due, now)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>重点词 · {starTotal} 词</h2>
            {starTotal > 0 ? (
              <button type="button" className="primary-btn small" onClick={onPracticeStarred}>
                练重点词
              </button>
            ) : null}
          </div>
          {starList.length === 0 ? (
            <p className="panel-note">
              还没有标记重点。查词卡右上角的 ☆、学习卡的 S 键、或查词页「★ 重点」筛选里都能标。
            </p>
          ) : (
            <ul className="wrong-list">
              {starList.map((word) => {
                const entry = byWord.get(word);
                const starAt = state.stars?.[word];
                return (
                  <li key={word}>
                    <button type="button" className="wrong-word" onClick={() => onLookup(word)}>
                      {word}
                    </button>
                    <span className="wrong-def">{entry?.senses[0]?.def ?? '—'}</span>
                    <span className="wrong-meta">
                      {starAt ? `标于 ${formatDay(starAt)}` : '已标记'}
                      {state.progress[word] ? ` · 复习 ${state.progress[word].reps} 次` : ''}
                    </span>
                    <button
                      type="button"
                      className={isStarred(state, word) ? 'star-btn on' : 'star-btn'}
                      aria-pressed={isStarred(state, word)}
                      aria-label={`取消 ${word} 的重点标记`}
                      onClick={() => store.star(word, false)}
                    >
                      ★
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {starTotal > starList.length ? (
            <p className="panel-note">只显示前 {starList.length} 个，其余请到查词页按「★ 重点」筛选查看。</p>
          ) : null}
        </section>
        </div>
      </div>
    </main>
  );
}
