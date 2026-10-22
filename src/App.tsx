import { useCallback, useEffect, useMemo, useState } from 'react';
import { RootsView } from './components/RootsView';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { StatsView } from './components/StatsView';
import { StudyView } from './components/StudyView';
import { TabBar } from './components/TabBar';
import type { Tab } from './components/TabBar';
import { useStudyStore, useTheme } from './hooks/useStudyStore';
import { stopAudio } from './lib/audio';
import type { QueueMode } from './lib/study';
import { dayKey, getStat, summarize } from './lib/stats';
import type { RootsFile, VocabFile, WordEntry } from './types';

export default function App() {
  const [vocab, setVocab] = useState<VocabFile | null>(null);
  const [roots, setRoots] = useState<RootsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [tab, setTab] = useState<Tab>('search');
  const [focusWord, setFocusWord] = useState<string | null>(null);
  const [studyIntent, setStudyIntent] = useState<{
    mode: QueueMode;
    starredOnly?: boolean;
    token: number;
  }>({
    mode: 'mixed',
    token: 0,
  });

  const store = useStudyStore();
  useTheme(store.state.settings.theme);

  // 加载内置词库
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}data/vocab.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<VocabFile>;
      })
      .then((data) => {
        if (alive) setVocab(data);
      })
      .catch((error: unknown) => {
        if (alive) setLoadError(error instanceof Error ? error.message : String(error));
      });
    // 词根表是附属数据，失败只影响「词根」页，不阻塞查词
    fetch(`${import.meta.env.BASE_URL}data/roots.json`)
      .then((response) => (response.ok ? (response.json() as Promise<RootsFile>) : null))
      .then((data) => {
        if (alive && data) setRoots(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // 内置词 + 用户导入词
  const words = useMemo<WordEntry[]>(() => {
    const builtin = vocab?.words ?? [];
    if (store.state.custom.length === 0) return builtin;
    const known = new Set(builtin.map((entry) => entry.word.toLowerCase()));
    const extra = store.state.custom.filter((entry) => !known.has(entry.word.toLowerCase()));
    return [...builtin, ...extra];
  }, [vocab, store.state.custom]);

  const summary = useMemo(() => summarize(store.state.progress, Date.now()), [store.state.progress]);
  const learnedToday = getStat(store.state.stats, dayKey(Date.now())).learned;

  const switchTab = useCallback((next: Tab) => {
    stopAudio();
    setTab(next);
  }, []);

  const handleLookup = useCallback((word: string) => {
    stopAudio();
    setFocusWord(word);
    setTab('search');
  }, []);

  const handleStudyWord = useCallback(() => {
    stopAudio();
    setTab('study');
  }, []);

  const practiceWrong = useCallback(() => {
    stopAudio();
    setStudyIntent((prev) => ({ mode: 'wrong', starredOnly: false, token: prev.token + 1 }));
    setTab('study');
  }, []);

  const practiceStarred = useCallback(() => {
    stopAudio();
    setStudyIntent((prev) => ({ mode: 'mixed', starredOnly: true, token: prev.token + 1 }));
    setTab('study');
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>考研词汇 · 查词与背诵</h1>
          <p className="brand-sub">
            {vocab ? `${vocab.meta.count} 词 · v${vocab.meta.version}` : '正在加载词库…'}
            {store.state.custom.length > 0 ? ` · 自定义 ${store.state.custom.length} 词` : ''}
            <span className={online ? 'dot online' : 'dot offline'} aria-hidden="true" />
            <span className="net-label">{online ? '在线' : '离线'}</span>
          </p>
        </div>
        <TabBar tab={tab} onChange={switchTab} dueCount={summary.due} todayLearned={learnedToday} />
      </header>

      {loadError && tab === 'search' ? <div className="notice error">词库加载失败：{loadError}</div> : null}

      {tab === 'search' ? (
        <SearchView words={words} store={store} onStudy={handleStudyWord} focusWord={focusWord} />
      ) : null}

      {tab === 'roots' ? (
        <RootsView words={words} roots={roots} store={store} onLookup={handleLookup} />
      ) : null}

      {tab === 'study' ? (
        <StudyView
          words={words}
          store={store}
          initialMode={studyIntent.mode}
          initialStarredOnly={studyIntent.starredOnly}
          startToken={studyIntent.token}
          onLookup={handleLookup}
        />
      ) : null}

      {tab === 'stats' ? (
        <StatsView
          words={words}
          store={store}
          onPracticeWrong={practiceWrong}
          onPracticeStarred={practiceStarred}
          onLookup={handleLookup}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsView
          store={store}
          words={words}
          vocabVersion={vocab?.meta.version ?? '0.2.0'}
          online={online}
        />
      ) : null}

      <footer className="app-foot">
        <span>
          词库：{vocab?.meta.source ?? '—'} · 音频：词典音频接口（仅用于验证，正式版需替换为已授权音频）
        </span>
        <span className="foot-right">
          进度保存在本机（{store.storage}），不上传服务器
        </span>
      </footer>
    </div>
  );
}
