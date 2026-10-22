import type { Accent, WordEntry, WordProgress } from '../types';
import type { PlayState } from '../lib/audio';
import { ProgressMeta } from './ProgressMeta';

const FORM_LABELS: Record<string, string> = {
  past: '过去式',
  pp: '过去分词',
  ing: '现在分词',
  pl: '复数',
  third: '第三人称单数',
  comp: '比较级',
  sup: '最高级',
};

interface PlayProps {
  accent: Accent;
  ipa: string;
  state: PlayState;
  onClick: () => void;
}

function PlayButton({ accent, ipa, state, onClick }: PlayProps) {
  const busy = state === 'loading' || state === 'playing' || state === 'fallback';
  const label = accent === 'uk' ? '英音' : '美音';
  return (
    <button
      type="button"
      className={`play-btn state-${state}`}
      onClick={onClick}
      aria-label={`播放${label} ${ipa}`}
      title={`播放${label}`}
    >
      {busy ? (
        <span className="eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
          <path
            d="M16.5 8.5a5 5 0 0 1 0 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M19 6a9 9 0 0 1 0 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="play-label">{label}</span>
    </button>
  );
}

interface Props {
  entry: WordEntry;
  playState: { accent: Accent; state: PlayState; detail?: string } | null;
  onPlay: (accent: Accent) => void;
  onStudy?: () => void;
  progress?: WordProgress;
  starred?: boolean;
  onToggleStar?: () => void;
  now?: number;
}

export function WordCard({
  entry,
  playState,
  onPlay,
  onStudy,
  progress,
  starred = false,
  onToggleStar,
  now = Date.now(),
}: Props) {
  const stateFor = (accent: Accent): PlayState =>
    playState && playState.accent === accent ? playState.state : 'idle';

  const message = playState?.detail ?? '';

  return (
    <article className="word-card" aria-live="polite">
      <header className="word-head">
        <h2 className="word-title">{entry.word}</h2>
        <div className="word-head-side">
          {entry.topic ? <span className="tag">{entry.topic}</span> : null}
          {entry.level ? (
            <span className={entry.level === 'plus' ? 'tag plus' : 'tag core'}>
              {entry.level === 'plus' ? '进阶' : '核心'}
            </span>
          ) : null}
          <span className="word-tag">#{String(entry.id).padStart(3, '0')}</span>
          {onToggleStar ? (
            <button
              type="button"
              className={starred ? 'star-btn on' : 'star-btn'}
              aria-pressed={starred}
              aria-label={starred ? '取消重点标记' : '标记为重点'}
              title={starred ? '取消重点' : '标记为重点'}
              onClick={onToggleStar}
            >
              {starred ? '★' : '☆'}
            </button>
          ) : null}
        </div>
      </header>

      <div className="phonetics">
        <div className="phonetic-row">
          <span className="phonetic-flag" aria-hidden="true">
            UK
          </span>
          <span className="phonetic-ipa">{entry.phoneticUK}</span>
          <PlayButton accent="uk" ipa={entry.phoneticUK} state={stateFor('uk')} onClick={() => onPlay('uk')} />
        </div>
        <div className="phonetic-row">
          <span className="phonetic-flag" aria-hidden="true">
            US
          </span>
          <span className="phonetic-ipa">{entry.phoneticUS}</span>
          <PlayButton accent="us" ipa={entry.phoneticUS} state={stateFor('us')} onClick={() => onPlay('us')} />
        </div>
      </div>

      {entry.altPron.length > 0 ? (
        <p className="alt-pron">
          <span className="alt-pron-label">按词性读音不同</span>
          {entry.altPron.map((item) => (
            <span key={item.pos} className="alt-pron-item">
              {item.pos} {item.ipa}
            </span>
          ))}
        </p>
      ) : null}

      <ul className="senses">
        {entry.senses.map((sense, index) => (
          <li key={index} className="sense">
            {sense.pos ? <span className="sense-pos">{sense.pos}</span> : null}
            <span className="sense-def">{sense.def}</span>
          </li>
        ))}
      </ul>

      {entry.example ? (
        <blockquote className="example">
          <p className="example-en">{entry.example.en}</p>
          <p className="example-zh">{entry.example.zh}</p>
        </blockquote>
      ) : null}

      {Object.keys(entry.forms).length > 0 ? (
        <div className="forms">
          <span className="forms-label">变形</span>
          {Object.entries(entry.forms).map(([key, value]) => (
            <span key={key} className="form-chip">
              {FORM_LABELS[key] ?? key}
              <b>{value}</b>
            </span>
          ))}
        </div>
      ) : null}

      {entry.roots && entry.roots.length > 0 ? (
        <div className="roots-line">
          <span className="forms-label">词根</span>
          {entry.roots.map((root) => (
            <span key={root} className="root-chip">
              {root}
            </span>
          ))}
        </div>
      ) : null}

      <ProgressMeta progress={progress} now={now} />

      {onStudy ? (
        <button type="button" className="study-entry-btn" onClick={onStudy}>
          去背单词 →
        </button>
      ) : null}

      <footer className="word-foot">
        <span className="source">来源：{entry.source}</span>
        {message ? <span className="play-message">{message}</span> : null}
      </footer>
    </article>
  );
}
