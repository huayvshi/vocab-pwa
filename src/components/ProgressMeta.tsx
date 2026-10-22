import { GRADE_LABEL, formatDateTime, relTime } from '../lib/srs';
import type { WordProgress } from '../types';

interface Props {
  progress?: WordProgress;
  now: number;
  /** 紧凑模式：学习卡顶部一行摘要 */
  compact?: boolean;
}

/** 单个词的学习 / 复习时间标记 */
export function ProgressMeta({ progress, now, compact = false }: Props) {
  if (!progress) {
    return (
      <p className={compact ? 'meta-line meta-empty' : 'meta-block meta-empty'}>
        {compact ? '还没学过' : '还没有学习记录 · 点「去背单词」开始'}
      </p>
    );
  }

  const totalReviews = progress.correct + progress.lapses;
  const recent = progress.recent ?? [];

  if (compact) {
    return (
      <p className="meta-line">
        <span>首次 {formatDateTime(progress.learnedAt).slice(0, 5)}</span>
        <span>上次 {progress.lastAt ? relTime(progress.lastAt, now) : '—'}</span>
        <span>复习 {totalReviews} 次</span>
        <span>错 {progress.lapses} 次</span>
      </p>
    );
  }

  return (
    <section className="meta-block" aria-label="学习与复习记录">
      <div className="meta-grid">
        <div>
          <span className="meta-key">首次学习</span>
          <strong>{formatDateTime(progress.learnedAt)}</strong>
        </div>
        <div>
          <span className="meta-key">上次复习</span>
          <strong>{progress.lastAt ? formatDateTime(progress.lastAt) : '—'}</strong>
        </div>
        <div>
          <span className="meta-key">下次复习</span>
          <strong>{relTime(progress.due, now)}</strong>
        </div>
        <div>
          <span className="meta-key">累计复习</span>
          <strong>{totalReviews} 次</strong>
        </div>
      </div>
      <p className="meta-line">
        <span>答对 {progress.correct}</span>
        <span>答错 {progress.lapses}</span>
        <span>熟悉度 {Math.round((progress.reps / 6) * 100)}%</span>
        <span>间隔 {progress.interval < 1 ? '不足 1 天' : `${progress.interval.toFixed(1)} 天`}</span>
      </p>
      {recent.length > 0 ? (
        <details className="meta-details" open={recent.length <= 5}>
          <summary>最近 {Math.min(recent.length, 5)} 次作答（共 {recent.length} 条）</summary>
          <ol className="meta-timeline">
            {recent.slice(0, 5).map((event) => (
              <li key={event.at}>
                <span>{formatDateTime(event.at)}</span>
                <span className={`grade-tag ${event.grade}`}>{GRADE_LABEL[event.grade]}</span>
                <span className="meta-rel">{relTime(event.at, now)}</span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
