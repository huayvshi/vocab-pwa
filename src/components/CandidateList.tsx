import type { SearchHit } from '../types';

interface HighlightProps {
  text: string;
  query: string;
  loose?: boolean;
}

/** 简单命中高亮：区分大小写无关的连续匹配 */
export function Highlight({ text, query, loose = false }: HighlightProps) {
  const q = query.trim();
  if (!q) return <>{text}</>;

  const haystack = loose ? text.replace(/[^a-zA-Z]/g, '') : text;
  if (loose) {
    // 词形/前缀命中时不做精确位置高亮，直接加粗
    return <strong className="hl">{text}</strong>;
  }

  const idx = haystack.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="hl">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  exact: '完全匹配',
  form: '词形',
  prefix: '前缀',
  contains: '包含',
  zh: '中文释义',
  fuzzy: '拼写相近',
};

interface Props {
  hits: SearchHit[];
  activeIndex: number;
  query: string;
  onSelect: (hit: SearchHit) => void;
  onHover: (index: number) => void;
  listId: string;
}

export function CandidateList({ hits, activeIndex, query, onSelect, onHover, listId }: Props) {
  if (hits.length === 0) {
    return (
      <div className="candidates empty" role="status">
        没有找到匹配的词，试试少输入几个字母，或换个说法。
      </div>
    );
  }

  return (
    <ul className="candidates" id={listId} role="listbox" aria-label="候选词">
      {hits.map((hit, index) => {
        const active = index === activeIndex;
        return (
          <li
            key={`${hit.entry.id}-${hit.kind}`}
            role="option"
            aria-selected={active}
            id={`${listId}-opt-${index}`}
            className={active ? 'candidate active' : 'candidate'}
            onMouseEnter={() => onHover(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(hit);
            }}
          >
            <span className="candidate-word">
              <Highlight text={hit.entry.word} query={query} loose={hit.kind !== 'exact'} />
            </span>
            <span className="candidate-pos">{hit.entry.senses[0]?.pos}</span>
            <span className="candidate-def">{hit.entry.senses[0]?.def}</span>
            <span className={`candidate-kind kind-${hit.kind}`}>{KIND_LABEL[hit.kind]}</span>
            {hit.note ? <span className="candidate-note">{hit.note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
