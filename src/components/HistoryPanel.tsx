import type { HistoryItem } from '../types';

interface Props {
  items: HistoryItem[];
  onPick: (word: string) => void;
  onClear: () => void;
}

function timeLabel(at: number): string {
  const diff = Date.now() - at;
  const minute = 60_000;
  if (diff < minute) return '刚刚';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
}

export function HistoryPanel({ items, onPick, onClear }: Props) {
  if (items.length === 0) {
    return (
      <section className="history">
        <h3 className="side-title">最近查询</h3>
        <p className="history-empty">还没有查询记录，查过的词会自动出现在这里。</p>
      </section>
    );
  }

  return (
    <section className="history">
      <div className="history-head">
        <h3 className="side-title">最近查询</h3>
        <button type="button" className="link-btn" onClick={onClear}>
          清空
        </button>
      </div>
      <ul className="history-list">
        {items.slice(0, 12).map((item) => (
          <li key={`${item.word}-${item.at}`}>
            <button type="button" className="history-chip" onClick={() => onPick(item.word)}>
              <span className="history-word">{item.word}</span>
              <span className="history-time">{timeLabel(item.at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
