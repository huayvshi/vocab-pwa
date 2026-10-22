import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CandidateList } from './CandidateList';
import { HistoryPanel } from './HistoryPanel';
import { SearchBar } from './SearchBar';
import { WordCard } from './WordCard';
import { playPronunciation, stopAudio } from '../lib/audio';
import type { PlayState } from '../lib/audio';
import { search } from '../lib/search';
import { countByFilter, filterWords, isStarred } from '../lib/study';
import type { WordFilter } from '../lib/study';
import { clearHistory, loadHistory, pushHistory } from '../lib/storage';
import type { StoreApi } from '../hooks/useStudyStore';
import type { Accent, HistoryItem, SearchHit, WordEntry } from '../types';

const LIST_ID = 'candidate-list';
const SAMPLES = ['abandon', 'record', '放弃', 'present', 'vulnerable'];

const FILTERS: Array<{ value: WordFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'star', label: '★ 重点' },
  { value: 'wrong', label: '错题' },
  { value: 'learning', label: '在学' },
  { value: 'new', label: '未学' },
  { value: 'mastered', label: '已掌握' },
];

interface Props {
  words: WordEntry[];
  store: StoreApi;
  onStudy: (word: string) => void;
  /** 从学习页跳过来时直接展示该词 */
  focusWord?: string | null;
}

export function SearchView({ words, store, onStudy, focusWord }: Props) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<WordEntry | null>(null);
  const [filter, setFilter] = useState<WordFilter>('all');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [flash, setFlash] = useState('');
  const [playState, setPlayState] = useState<{
    accent: Accent;
    state: PlayState;
    detail?: string;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const { state, star } = store;

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (!focusWord) return;
    const entry = words.find((item) => item.word === focusWord);
    if (entry) setSelected(entry);
  }, [focusWord, words]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  // 筛选先作用于词库，关键词再在筛选结果里搜，两个条件叠加
  const filtered = useMemo(
    () => filterWords(words, state, filter, Date.now()),
    [words, state, filter],
  );
  const counts = useMemo(() => countByFilter(words, state, Date.now()), [words, state]);
  const hits = useMemo(() => search(filtered, debounced, 20), [filtered, debounced]);

  useEffect(() => {
    setActiveIndex(0);
  }, [debounced, filter]);

  useEffect(() => {
    const exact = hits.find((hit) => hit.kind === 'exact');
    if (!exact) return;
    setHistory(pushHistory(exact.entry.word));
  }, [hits]);

  const activeHit: SearchHit | null = hits[activeIndex] ?? null;
  const displayed: WordEntry | null = activeHit?.entry ?? selected;
  const starredNow = displayed ? isStarred(state, displayed.word) : false;

  useEffect(() => {
    stopAudio();
    setPlayState(null);
  }, [displayed?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const notify = useCallback((text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(''), 1800);
  }, []);

  const commit = useCallback((entry: WordEntry) => {
    setSelected(entry);
    setHistory(pushHistory(entry.word));
    stopAudio();
    setPlayState(null);
    inputRef.current?.focus();
  }, []);

  const handleMove = useCallback(
    (delta: number) => {
      if (hits.length === 0) return;
      setActiveIndex((index) => (index + delta + hits.length) % hits.length);
    },
    [hits.length],
  );

  const handleCommit = useCallback(() => {
    if (activeHit) commit(activeHit.entry);
  }, [activeHit, commit]);

  const handleEscape = useCallback(() => {
    setQuery('');
    setDebounced('');
    stopAudio();
  }, []);

  const handlePickHistory = useCallback(
    (word: string) => {
      const entry = words.find((item) => item.word === word);
      setQuery('');
      setDebounced('');
      if (entry) commit(entry);
    },
    [words, commit],
  );

  const handlePlay = useCallback(
    async (accent: Accent) => {
      if (!displayed) return;
      setPlayState({ accent, state: 'loading' });
      await playPronunciation(displayed.word, accent, (next, detail) => {
        setPlayState(next === 'idle' ? null : { accent, state: next, detail });
      });
    },
    [displayed],
  );

  const toggleStar = useCallback(
    (word: string) => {
      const on = isStarred(state, word);
      star(word, !on);
      notify(on ? `已取消「${word}」的重点` : `已把「${word}」加入重点`);
    },
    [state, star, notify],
  );

  const bulkStar = useCallback(
    (value: boolean) => {
      const list = filtered.map((entry) => entry.word);
      if (list.length === 0) return;
      star(list, value);
      notify(value ? `已标记 ${list.length} 个词` : `已取消 ${list.length} 个词的重点`);
    },
    [filtered, star, notify],
  );

  const expanded = debounced.trim().length > 0 && hits.length > 0;
  const browsing = debounced.trim().length === 0 && filter !== 'all';
  const browseList = useMemo(() => filtered.slice(0, 30), [filtered]);

  return (
    <main className="layout">
      <section className="col-left">
        <SearchBar
          query={query}
          onChange={setQuery}
          onMove={handleMove}
          onCommit={handleCommit}
          onEscape={handleEscape}
          expanded={expanded}
          activeId={expanded ? `${LIST_ID}-opt-${activeIndex}` : undefined}
          listId={LIST_ID}
          inputRef={inputRef}
        />

        <div className="filter-row" role="group" aria-label="按状态筛选">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={filter === item.value ? 'chip active' : 'chip'}
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label}
              <em>{counts[item.value]}</em>
            </button>
          ))}
        </div>

        {debounced.trim() ? (
          <>
            {filter !== 'all' ? (
              <p className="scope-note">
                正在「{FILTERS.find((item) => item.value === filter)?.label}」范围内搜索 ·{' '}
                <button type="button" className="link-btn" onClick={() => setFilter('all')}>
                  搜全库
                </button>
              </p>
            ) : null}
            <CandidateList
              hits={hits}
              activeIndex={activeIndex}
              query={debounced}
              onSelect={(hit) => commit(hit.entry)}
              onHover={setActiveIndex}
              listId={LIST_ID}
            />
            {hits.length === 0 ? (
              <p className="notice">
                {filter === 'all'
                  ? '没有找到匹配的词。试试更短的词根或中文关键词。'
                  : '当前筛选下没有匹配，点「全部」再看全库。'}
              </p>
            ) : null}
          </>
        ) : browsing ? (
          <div className="browse-panel">
            <div className="browse-head">
              <span>
                共 {filtered.length} 个词{browseList.length < filtered.length ? `，显示前 ${browseList.length} 个` : ''}
              </span>
              <div className="browse-actions">
                <button type="button" className="link-btn" onClick={() => bulkStar(true)}>
                  全部标为重点
                </button>
                <button type="button" className="link-btn" onClick={() => bulkStar(false)}>
                  取消这 {filtered.length} 个
                </button>
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="notice">这一栏还是空的。换个筛选条件看看。</p>
            ) : (
              <ul className="browse-list">
                {browseList.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="browse-word" onClick={() => commit(entry)}>
                      <strong>{entry.word}</strong>
                      <span>{entry.senses[0]?.def ?? ''}</span>
                    </button>
                    <button
                      type="button"
                      className={isStarred(state, entry.word) ? 'star-btn on' : 'star-btn'}
                      aria-pressed={isStarred(state, entry.word)}
                      aria-label={`标记 ${entry.word} 为重点`}
                      onClick={() => toggleStar(entry.word)}
                    >
                      {isStarred(state, entry.word) ? '★' : '☆'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="samples">
            <p className="samples-title">试试这些：</p>
            <div className="samples-row">
              {SAMPLES.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="sample-chip"
                  onClick={() => {
                    setQuery(sample);
                    inputRef.current?.focus();
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
            <p className="samples-tip">
              <kbd>/</kbd> 聚焦搜索 · <kbd>↑</kbd>
              <kbd>↓</kbd> 选候选 · <kbd>Enter</kbd> 查看 · <kbd>Esc</kbd> 清空
            </p>
          </div>
        )}

        <HistoryPanel
          items={history}
          onPick={handlePickHistory}
          onClear={() => setHistory(clearHistory())}
        />
        {flash ? <p className="flash">{flash}</p> : null}
      </section>

      <section className="col-right">
        {displayed ? (
          <WordCard
            entry={displayed}
            playState={playState}
            onPlay={handlePlay}
            onStudy={() => onStudy(displayed.word)}
            progress={state.progress[displayed.word]}
            starred={starredNow}
            onToggleStar={() => toggleStar(displayed.word)}
            now={Date.now()}
          />
        ) : (
          <div className="empty-state">
            <h2>输入一个词开始</h2>
            <p>
              支持英文（完整单词、前缀、词形如 studied）、中文（「放弃」）和拼写相近的模糊查找。
            </p>
            <p className="empty-hint">
              点 <b>英音 / 美音</b> 按钮可以反复听；词卡上的 ☆ 可以把词标成重点，再用上面的「重点」筛选找回来。
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
