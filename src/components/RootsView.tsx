import { useMemo, useState } from 'react';
import type { StoreApi } from '../hooks/useStudyStore';
import type { RootInfo, RootsFile, WordEntry } from '../types';

interface Props {
  words: WordEntry[];
  roots: RootsFile | null;
  store: StoreApi;
  onLookup: (word: string) => void;
}

function senseBrief(entry: WordEntry): string {
  const first = entry.senses[0];
  return first ? `${first.pos} ${first.def}` : '';
}

export function RootsView({ words, roots, store, onLookup }: Props) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // 词根 → 词库里的词
  const byRoot = useMemo(() => {
    const map = new Map<string, WordEntry[]>();
    for (const entry of words) {
      for (const rootId of entry.rootIds ?? []) {
        const bucket = map.get(rootId);
        if (bucket) bucket.push(entry);
        else map.set(rootId, [entry]);
      }
    }
    for (const bucket of map.values()) bucket.sort((a, b) => a.word.localeCompare(b.word));
    return map;
  }, [words]);

  const list = useMemo<RootInfo[]>(() => {
    const all = roots?.roots ?? [];
    const keyword = query.trim().toLowerCase();
    const filtered = keyword
      ? all.filter((root) => {
          const haystack = [root.label, root.meaning, root.gloss, root.id, ...(root.examples ?? [])]
            .join(' ')
            .toLowerCase();
          return haystack.includes(keyword);
        })
      : all;
    return filtered
      .map((root) => ({ ...root, count: (byRoot.get(root.id) ?? []).length }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));
  }, [roots, query, byRoot]);

  const covered = useMemo(() => words.filter((entry) => (entry.rootIds ?? []).length > 0).length, [words]);
  const active = list.find((root) => root.id === activeId) ?? null;
  const activeWords = active ? (byRoot.get(active.id) ?? []) : [];

  if (!roots) {
    return <div className="notice">词根表加载中…</div>;
  }

  return (
    <section className="roots-view">
      <div className="panel roots-head">
        <div className="panel-head">
          <h2>按词根记词</h2>
          <span className="panel-meta">
            {roots.meta.count} 个词根 · 覆盖 {covered} / {words.length} 词
          </span>
        </div>
        <p className="panel-note">
          词根是按字母片段自动匹配的（一个词最多归 3 个词根，长片段优先），属于联想记忆的线索，不必当成词源学。
          点词根看同根词，点单词跳到查词页。
        </p>
        <label className="roots-search">
          <span className="visually-hidden">搜索词根</span>
          <input
            type="search"
            value={query}
            placeholder="搜索词根或含义，如 ced、走、ject"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="chip ghost" onClick={() => setQuery('')}>
              清空
            </button>
          ) : null}
        </label>
      </div>

      {active ? (
        <div className="panel root-detail">
          <div className="panel-head">
            <h2>
              {active.label} <span className="root-detail-meaning">{active.meaning}</span>
            </h2>
            <span className="panel-meta">{activeWords.length} 个词</span>
          </div>
          {active.note ? <p className="panel-note">{active.note}</p> : null}
          {activeWords.length === 0 ? (
            <p className="panel-note">词库里暂时没有归到这个词根下的词。</p>
          ) : (
            <ul className="root-word-list">
              {activeWords.map((entry) => {
                const starred = Boolean(store.state.stars?.[entry.word]);
                return (
                  <li key={entry.id}>
                    <button type="button" className="root-word" onClick={() => onLookup(entry.word)}>
                      <span className="root-word-text">{entry.word}</span>
                      <span className="root-word-sense">{senseBrief(entry)}</span>
                    </button>
                    <button
                      type="button"
                      className={starred ? 'star-btn on' : 'star-btn'}
                      aria-label={starred ? `取消重点：${entry.word}` : `标为重点：${entry.word}`}
                      aria-pressed={starred}
                      onClick={() => store.star(entry.word, !starred)}
                    >
                      {starred ? '★' : '☆'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {list.length === 0 ? (
        <div className="notice">没有匹配「{query}」的词根。</div>
      ) : (
        <div className="root-grid">
          {list.map((root) => (
            <button
              key={root.id}
              type="button"
              className={root.id === activeId ? 'root-card active' : 'root-card'}
              aria-pressed={root.id === activeId}
              onClick={() => setActiveId(root.id === activeId ? null : root.id)}
            >
              <span className="root-label">{root.label}</span>
              <span className="root-meaning">{root.meaning}</span>
              {root.gloss ? <span className="root-gloss">{root.gloss}</span> : null}
              <span className="root-count">{root.count ?? 0} 词</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
