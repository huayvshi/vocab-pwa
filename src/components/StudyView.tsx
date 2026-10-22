import { useCallback, useEffect, useMemo, useState } from 'react';
import { playPronunciation, stopAudio } from '../lib/audio';
import {
  DEFAULT_DRAW_COUNT,
  buildQueue,
  estimateMinutes,
  isStarred,
  learnedToday,
  normalizeDrawCount,
  queueSummary,
} from '../lib/study';
import type { QueueMode } from '../lib/study';
import { intervalLabel, schedule } from '../lib/srs';
import type { StoreApi } from '../hooks/useStudyStore';
import type { Grade, QueueItem, SessionSummary, WordEntry, WordLevel } from '../types';
import { ProgressMeta } from './ProgressMeta';

interface Props {
  words: WordEntry[];
  store: StoreApi;
  initialMode: QueueMode;
  initialStarredOnly?: boolean;
  startToken: number;
  onLookup: (word: string) => void;
}

interface Session {
  queue: QueueItem[];
  index: number;
  answered: number;
  correct: number;
  wrong: number;
  startedAt: number;
  /** 随机抽选局不消耗每日新词额度 */
  random: boolean;
}

const MODES: Array<{ value: QueueMode; label: string; hint: string }> = [
  { value: 'mixed', label: '混合学习', hint: '复习 + 新词' },
  { value: 'new', label: '只学新词', hint: '不掺复习' },
  { value: 'review', label: '只做复习', hint: '到期卡片' },
  { value: 'wrong', label: '错题重练', hint: '答错过的词' },
  { value: 'random', label: '随机抽选', hint: '自己定张数' },
];

const DRAW_PRESETS = [10, 20, 30, 50];

const GRADES: Array<{ value: Grade; label: string; hint: string; tone: string }> = [
  { value: 'again', label: '忘了', hint: '10 分钟后', tone: 'again' },
  { value: 'hard', label: '模糊', hint: '小幅推进', tone: 'hard' },
  { value: 'good', label: '会了', hint: '按间隔推', tone: 'good' },
];

export function StudyView({
  words,
  store,
  initialMode,
  initialStarredOnly = false,
  startToken,
  onLookup,
}: Props) {
  const { state, grade, star } = store;
  const [mode, setMode] = useState<QueueMode>(initialMode);
  const [starredOnly, setStarredOnly] = useState(initialStarredOnly);
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState<'' | WordLevel>('');
  const [drawCount, setDrawCount] = useState(() => normalizeDrawCount(state.settings.drawCount));
  const [session, setSession] = useState<Session | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hideMeaning, setHideMeaning] = useState(state.settings.hideMeaning === true);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [flash, setFlash] = useState('');

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const entry of words) if (entry.topic) set.add(entry.topic);
    return Array.from(set);
  }, [words]);

  const settings = state.settings;
  const options = useMemo(
    () => ({
      limit: 60,
      dailyGoal: settings.dailyGoal,
      mode,
      topic: topic || undefined,
      level: level || undefined,
      wrongFirst: settings.wrongFirst,
      count: drawCount,
      starredOnly,
    }),
    [settings.dailyGoal, settings.wrongFirst, mode, topic, level, drawCount, starredOnly],
  );

  const preview = useMemo(
    () => buildQueue(words, state, Date.now(), options),
    // state 变化（评分后）需要重新计算预览
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [words, state, options],
  );

  const notify = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(''), 1800);
  }, []);

  const start = useCallback(() => {
    const queue = buildQueue(words, state, Date.now(), options);
    if (queue.length === 0) return;
    setSummary(null);
    setRevealed(false);
    setSession({
      queue,
      index: 0,
      answered: 0,
      correct: 0,
      wrong: 0,
      startedAt: Date.now(),
      random: mode === 'random',
    });
  }, [words, state, options, mode]);

  // 从统计页「练错题 / 去背重点」跳过来时自动开局
  useEffect(() => {
    if (startToken > 0) {
      setMode(initialMode);
      setStarredOnly(initialStarredOnly);
      start();
    }
    // 只在 token 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startToken]);

  const current = session ? session.queue[session.index] : null;

  const handleGrade = useCallback(
    (value: Grade) => {
      if (!session || !current) return;
      grade(current.entry.word, value, { countsAsNew: !session.random });
      const nextQueue = [...session.queue];
      if (value === 'again') {
        const insertAt = Math.min(nextQueue.length, session.index + 4);
        nextQueue.splice(insertAt, 0, { ...current, kind: 'again' });
      }
      const nextIndex = session.index + 1;
      const correct = session.correct + (value === 'again' ? 0 : 1);
      const wrong = session.wrong + (value === 'again' ? 1 : 0);
      const answered = session.answered + 1;
      setRevealed(false);
      if (nextIndex >= nextQueue.length) {
        setSummary({
          answered,
          correct,
          wrong,
          newWords: session.queue.filter((item) => item.kind === 'new').length,
          startedAt: session.startedAt,
        });
        setSession(null);
        return;
      }
      setSession({ ...session, queue: nextQueue, index: nextIndex, answered, correct, wrong });
    },
    [session, current, grade],
  );

  const toggleStar = useCallback(() => {
    if (!current) return;
    const on = isStarred(state, current.entry.word);
    star(current.entry.word, !on);
    notify(on ? '已取消重点' : '已加入重点');
  }, [current, state, star, notify]);

  const toggleMask = useCallback(() => {
    setHideMeaning((prev) => {
      const next = !prev;
      notify(next ? '中文释义已遮罩（H 关闭）' : '中文释义已显示');
      return next;
    });
  }, [notify]);

  useEffect(() => {
    if (!session) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stopAudio();
        setSession(null);
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        toggleMask();
        return;
      }
      if (event.key === 's' || event.key === 'S') {
        event.preventDefault();
        toggleStar();
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (!revealed) return;
      const map: Record<string, Grade> = { '1': 'again', '2': 'hard', '3': 'good' };
      const value = map[event.key];
      if (value) {
        event.preventDefault();
        handleGrade(value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session, revealed, handleGrade, toggleMask, toggleStar]);

  const counts = queueSummary(preview);
  const minutes = estimateMinutes(preview);

  const nextPreview = (value: Grade) => {
    const progress = current ? state.progress[current.entry.word] : undefined;
    const next = schedule(progress, value, Date.now(), current?.entry.word ?? '');
    return intervalLabel(next.interval);
  };

  /* ---------------- 结算 ---------------- */
  if (summary) {
    const total = summary.correct + summary.wrong;
    const rate = total === 0 ? 0 : Math.round((summary.correct / total) * 100);
    return (
      <main className="view">
        <section className="panel summary-panel">
          <h2>本轮完成</h2>
          <p className="summary-sub">
            共作答 {summary.answered} 次 · 正确率 {rate}% · 新词 {summary.newWords} 个
          </p>
          <div className="summary-grid">
            <div className="summary-cell">
              <strong>{summary.correct}</strong>
              <span>答对</span>
            </div>
            <div className="summary-cell">
              <strong>{summary.wrong}</strong>
              <span>答错</span>
            </div>
            <div className="summary-cell">
              <strong>{summary.answered}</strong>
              <span>总作答</span>
            </div>
            <div className="summary-cell">
              <strong>{rate}%</strong>
              <span>正确率</span>
            </div>
          </div>
          <div className="summary-actions">
            <button type="button" className="primary-btn" onClick={start}>
              再来一轮
            </button>
            <button type="button" className="ghost-btn" onClick={() => setSummary(null)}>
              回到设置
            </button>
          </div>
        </section>
      </main>
    );
  }

  /* ---------------- 学习中 ---------------- */
  if (session && current) {
    const entry = current.entry;
    const progress = state.progress[entry.word];
    const starred = isStarred(state, entry.word);
    const percent = Math.round((session.index / session.queue.length) * 100);
    const masked = revealed && hideMeaning;
    return (
      <main className="view">
        <section className="study-shell">
          <div className="study-top">
            <div className="study-progress" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
            <div className="study-meta">
              <span>
                {session.index + 1} / {session.queue.length}
              </span>
              <span className="study-kind">
                {current.kind === 'new'
                  ? '新词'
                  : current.kind === 'wrong'
                    ? '错题'
                    : current.kind === 'again'
                      ? '再来一次'
                      : current.kind === 'random'
                        ? '随机'
                        : '复习'}
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  stopAudio();
                  setSession(null);
                }}
              >
                结束本轮
              </button>
            </div>
          </div>

          <article className="study-card">
            <div className="study-head">
              <h2 className="study-word">{entry.word}</h2>
              <button
                type="button"
                className={starred ? 'star-btn on' : 'star-btn'}
                aria-pressed={starred}
                aria-label="标记为重点"
                title="标记为重点（S）"
                onClick={toggleStar}
              >
                {starred ? '★' : '☆'}
              </button>
            </div>
            <p className="study-phonetic">
              <span>英 /{entry.phoneticUK.replace(/\//g, '')}/</span>
              <span>美 /{entry.phoneticUS.replace(/\//g, '')}/</span>
            </p>
            <div className="study-audio">
              <button
                type="button"
                className="chip-btn"
                onClick={() => void playPronunciation(entry.word, 'uk', () => {})}
              >
                ▶ 英音
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => void playPronunciation(entry.word, 'us', () => {})}
              >
                ▶ 美音
              </button>
              <button
                type="button"
                className={hideMeaning ? 'chip-btn mask-on' : 'chip-btn'}
                aria-pressed={hideMeaning}
                onClick={toggleMask}
                title="遮罩中文释义（H）"
              >
                {hideMeaning ? '中文已遮罩' : '中文可见'}
              </button>
            </div>
            {progress ? (
              <ProgressMeta progress={progress} now={Date.now()} compact />
            ) : (
              <p className="meta-line meta-empty">首次学习 · 还没有复习记录</p>
            )}

            {revealed ? (
              <div className="study-answer">
                {masked ? (
                  <div className="masked-box">
                    <p>中文释义已遮罩 · 先自己回忆一遍</p>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setHideMeaning(false)}
                    >
                      显示中文
                    </button>
                  </div>
                ) : (
                  <ul className="sense-list">
                    {entry.senses.map((sense, index) => (
                      <li key={`${sense.pos}-${index}`}>
                        <span className="pos">{sense.pos}</span>
                        {sense.def}
                      </li>
                    ))}
                  </ul>
                )}
                {entry.example ? (
                  <blockquote className="study-example">
                    <p className="en">{entry.example.en}</p>
                    {hideMeaning ? null : <p className="zh">{entry.example.zh}</p>}
                  </blockquote>
                ) : null}
                <div className="study-tags">
                  {entry.topic ? <span className="tag">{entry.topic}</span> : null}
                  <span className="tag">{entry.level === 'plus' ? '进阶' : '核心'}</span>
                  <button type="button" className="link-btn" onClick={() => onLookup(entry.word)}>
                    在查词页打开
                  </button>
                </div>
                <div className="grade-row">
                  {GRADES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`grade-btn ${item.tone}`}
                      onClick={() => handleGrade(item.value)}
                    >
                      <strong>{item.label}</strong>
                      <span>{nextPreview(item.value)}</span>
                    </button>
                  ))}
                </div>
                <p className="study-kbd">
                  <kbd>1</kbd> 忘了 · <kbd>2</kbd> 模糊 · <kbd>3</kbd> 会了 · <kbd>S</kbd> 重点 ·{' '}
                  <kbd>H</kbd> 遮罩 · <kbd>Esc</kbd> 结束
                </p>
              </div>
            ) : (
              <div className="reveal-area">
                <button type="button" className="primary-btn" onClick={() => setRevealed(true)}>
                  显示释义
                </button>
                <p className="study-kbd">
                  <kbd>空格</kbd> 或 <kbd>Enter</kbd> 显示释义
                </p>
              </div>
            )}
          </article>
          {flash ? <p className="flash">{flash}</p> : null}
        </section>
      </main>
    );
  }

  /* ---------------- 开卡前的设置 ---------------- */
  return (
    <main className="view">
      <section className="panel">
        <h2>今天练什么</h2>
        <p className="panel-sub">
          每日目标 {settings.dailyGoal} 个新词 · 今天已学 {learnedToday(state, Date.now())} 个
        </p>

        <div className="mode-row">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={mode === item.value ? 'mode-chip active' : 'mode-chip'}
              onClick={() => setMode(item.value)}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>

        {mode === 'random' ? (
          <div className="draw-block">
            <p className="filter-label">抽选数量</p>
            <div className="chip-row">
              {DRAW_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={drawCount === value ? 'chip active' : 'chip'}
                  onClick={() => setDrawCount(value)}
                >
                  {value} 张
                </button>
              ))}
              <label className="num-field">
                自定义
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={drawCount}
                  onChange={(event) => setDrawCount(normalizeDrawCount(event.target.value))}
                  aria-label="自定义抽选数量"
                />
                张
              </label>
            </div>
            <p className="hint-line">
              每次开始都重新随机，默认 {DEFAULT_DRAW_COUNT} 张。抽选不消耗每日新词额度。
            </p>
          </div>
        ) : null}

        <div className="filter-block">
          <p className="filter-label">范围</p>
          <div className="chip-row">
            <button
              type="button"
              className={starredOnly ? 'chip active' : 'chip'}
              onClick={() => setStarredOnly((prev) => !prev)}
            >
              ★ 只看重点
            </button>
            <span className="hint-line">已标记 {Object.keys(state.stars ?? {}).length} 个</span>
          </div>
          <p className="filter-label">主题</p>
          <div className="chip-row">
            <button
              type="button"
              className={topic === '' ? 'chip active' : 'chip'}
              onClick={() => setTopic('')}
            >
              全部
            </button>
            {topics.map((item) => (
              <button
                key={item}
                type="button"
                className={topic === item ? 'chip active' : 'chip'}
                onClick={() => setTopic(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="filter-label">难度</p>
          <div className="chip-row">
            {([
              ['', '全部'],
              ['core', '核心'],
              ['plus', '进阶'],
            ] as const).map(([value, label]) => (
              <button
                key={label}
                type="button"
                className={level === value ? 'chip active' : 'chip'}
                onClick={() => setLevel(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="queue-preview">
          <div>
            <strong>{preview.length}</strong> 张卡 · 约 {minutes} 分钟
            {mode === 'random' ? <span className="queue-note">随机抽选</span> : null}
          </div>
          <div className="queue-breakdown">
            <span>新词 {counts.new}</span>
            <span>复习 {counts.review}</span>
            <span>错题 {counts.wrong}</span>
            {counts.random > 0 ? <span>抽选 {counts.random}</span> : null}
          </div>
        </div>

        {preview.length === 0 ? (
          <p className="notice">
            {starredOnly
              ? '还没有标记重点词。在查词页或学习卡上点 ★ 就能把词标成重点。'
              : '当前条件没有可练的卡。可以切到「只学新词」，或在设置里把每日目标调大一点。'}
          </p>
        ) : (
          <button type="button" className="primary-btn wide" onClick={start}>
            开始（{preview.length} 张）
          </button>
        )}
      </section>
    </main>
  );
}
