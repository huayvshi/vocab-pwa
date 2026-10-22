import { useEffect, useMemo, useRef, useState } from 'react';
import { estimateBytes } from '../lib/db';
import { exportCsv, exportWordlistText, parseCsv } from '../lib/csv';
import type { CsvParseResult } from '../lib/csv';
import type { StoreApi } from '../hooks/useStudyStore';
import type { ThemeMode, WordEntry } from '../types';

interface Props {
  store: StoreApi;
  words: WordEntry[];
  vocabVersion: string;
  online: boolean;
}

const GOALS = [5, 10, 15, 20, 30];
const THEMES: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
];
const TEMPLATE = [
  'word,uk,us,pos,def,example,zh,topic,level',
  'resilient,rɪˈzɪliənt,rɪˈzɪliənt,adj.,有弹性的；能恢复的,Children are more resilient than adults.,孩子比成年人更有适应力。,心理,plus',
  'incentive,ɪnˈsentɪv,ɪnˈsentɪv,n.,激励；刺激因素,Tax cuts act as an incentive to invest.,减税起到鼓励投资的作用。,经济,core',
].join('\n');

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
}

function download(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([`\ufeff${content}`], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SettingsView({ store, words, vocabVersion, online }: Props) {
  const { state, updateSettings, importWords, resetProgress } = store;
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [imported, setImported] = useState(0);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const byWord = useMemo(() => {
    const map = new Map<string, WordEntry>();
    for (const entry of words) map.set(entry.word, entry);
    return map;
  }, [words]);

  const wrongWords = useMemo(
    () =>
      Object.values(state.progress)
        .filter((item) => item.lapses > 0)
        .sort((a, b) => b.lapses - a.lapses)
        .map((item) => byWord.get(item.word))
        .filter((entry): entry is WordEntry => entry !== undefined),
    [state.progress, byWord],
  );

  const learnedWords = useMemo(
    () =>
      Object.keys(state.progress)
        .map((word) => byWord.get(word))
        .filter((entry): entry is WordEntry => entry !== undefined),
    [state.progress, byWord],
  );

  const kb = Math.max(1, Math.round(estimateBytes(state) / 1024));

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setParsed(parseCsv(text, 9000));
    setImported(0);
  };

  const doImport = () => {
    if (!parsed || parsed.words.length === 0) return;
    importWords(parsed.words);
    setImported(parsed.words.length);
    setParsed(null);
    setPasteText('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  };

  return (
    <main className="view">
      <div className="settings-columns">
        <section className="panel">
          <h2>学习设置</h2>
          <p className="filter-label">每日新词目标</p>
          <div className="chip-row">
            {GOALS.map((goal) => (
              <button
                key={goal}
                type="button"
                className={state.settings.dailyGoal === goal ? 'chip active' : 'chip'}
                onClick={() => updateSettings({ dailyGoal: goal })}
              >
                {goal} 个
              </button>
            ))}
          </div>

          <p className="filter-label">外观</p>
          <div className="chip-row">
            {THEMES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={state.settings.theme === item.value ? 'chip active' : 'chip'}
                onClick={() => updateSettings({ theme: item.value })}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="switch-row">
            <input
              type="checkbox"
              checked={state.settings.wrongFirst}
              onChange={(event) => updateSettings({ wrongFirst: event.target.checked })}
            />
            <span>混合学习时优先安排错题</span>
          </label>

          <label className="switch-row">
            <input
              type="checkbox"
              checked={state.settings.hideMeaning}
              onChange={(event) => updateSettings({ hideMeaning: event.target.checked })}
            />
            <span>背单词时默认遮住中文释义</span>
          </label>
          <p className="panel-note">
            遮住后先自己回忆，按 <kbd>空格</kbd> 显示；学习中途随时按 <kbd>H</kbd> 切换，这个开关只决定默认状态。
          </p>

          <p className="filter-label">随机抽选默认张数</p>
          <div className="chip-row">
            {[10, 20, 30, 50].map((preset) => (
              <button
                key={preset}
                type="button"
                className={state.settings.drawCount === preset ? 'chip active' : 'chip'}
                onClick={() => updateSettings({ drawCount: preset })}
              >
                {preset} 张
              </button>
            ))}
          </div>
          <p className="panel-note">
            学习页选「随机抽选」时用这个张数，也可以在那里临时改；上限 200 张。
          </p>

          <p className="filter-label">安装到桌面</p>
          {installEvent ? (
            <button type="button" className="primary-btn small" onClick={() => void install()}>
              安装到桌面
            </button>
          ) : (
            <p className="panel-note">
              电脑：地址栏右侧的「安装」图标；安卓 Chrome：菜单 →「添加到主屏幕」；iPhone
              Safari：分享 →「添加到主屏幕」。安装后可以全屏打开、离线使用。
            </p>
          )}

          <p className="filter-label">存储</p>
          <ul className="kv-list">
            <li>
              <span>存储方式</span>
              <b>{store.storage}</b>
            </li>
            <li>
              <span>学习数据占用</span>
              <b>约 {kb} KB</b>
            </li>
            <li>
              <span>内置词库</span>
              <b>{words.length - state.custom.length} 词 · v{vocabVersion}</b>
            </li>
            <li>
              <span>自定义词</span>
              <b>{state.custom.length} 词</b>
            </li>
            <li>
              <span>网络</span>
              <b>{online ? '在线' : '离线'}</b>
            </li>
          </ul>
        </section>

        <section className="panel">
          <h2>导入自己的词库</h2>
          <p className="panel-note">
            支持 CSV（UTF-8，逗号分隔）。最少需要「单词 + 释义」两列；表头可用中文：
            <code>单词,英音,美音,词性,释义,例句,译文,主题,难度</code>。
          </p>
          <div className="import-row">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() => download('词库模板.csv', TEMPLATE, 'text/csv;charset=utf-8')}
            >
              下载模板
            </button>
          </div>
          <textarea
            className="paste-area"
            rows={4}
            placeholder={'或者直接粘贴几行：\nmitigate,v.,减轻；缓和\nplausible,adj.,看似合理的'}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
          />
          <div className="import-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setParsed(parseCsv(pasteText, 9000))}
              disabled={pasteText.trim() === ''}
            >
              解析粘贴内容
            </button>
            {parsed && parsed.words.length > 0 ? (
              <button type="button" className="primary-btn small" onClick={doImport}>
                导入 {parsed.words.length} 词
              </button>
            ) : null}
          </div>

          {imported > 0 ? <p className="notice ok">已导入 {imported} 个自定义词，可在查词与学习中直接使用。</p> : null}
          {parsed && parsed.words.length > 0 ? (
            <div className="preview-box">
              <p>
                识别到 <b>{parsed.words.length}</b> 个词：
                {parsed.words.slice(0, 6).map((entry) => entry.word).join('、')}
                {parsed.words.length > 6 ? ' …' : ''}
              </p>
            </div>
          ) : null}
          {parsed && parsed.errors.length > 0 ? (
            <ul className="error-list">
              {parsed.errors.slice(0, 6).map((error) => (
                <li key={error}>{error}</li>
              ))}
              {parsed.errors.length > 6 ? <li>还有 {parsed.errors.length - 6} 条问题…</li> : null}
            </ul>
          ) : null}
        </section>

        <section className="panel">
          <h2>导出与备份</h2>
          <p className="panel-note">
            错题本 {wrongWords.length} 词 · 已学 {learnedWords.length} 词
          </p>
          <div className="export-grid">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => download('错题本.txt', exportWordlistText(wrongWords, '错题本'))}
              disabled={wrongWords.length === 0}
            >
              导出错题本 txt
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => download('已学单词.txt', exportWordlistText(learnedWords, '已学单词'))}
              disabled={learnedWords.length === 0}
            >
              导出已学单词 txt
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => download('单词备份.csv', exportCsv(learnedWords), 'text/csv;charset=utf-8')}
              disabled={learnedWords.length === 0}
            >
              导出 CSV 备份
            </button>
            <button type="button" className="ghost-btn" onClick={() => window.print()}>
              打印错题本
            </button>
          </div>
          <p className="filter-label">危险操作</p>
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (window.confirm('清空所有学习进度与打卡记录？自定义词和设置会保留。')) resetProgress();
            }}
          >
            清空学习进度
          </button>
        </section>

        <section className="panel">
          <h2>自定义词</h2>
          {state.custom.length === 0 ? (
            <p className="panel-note">还没有导入过词条。</p>
          ) : (
            <ul className="custom-list">
              {state.custom.map((entry) => (
                <li key={entry.id}>
                  <b>{entry.word}</b>
                  <span>{entry.senses[0]?.def}</span>
                  <button type="button" className="link-btn" onClick={() => store.removeCustom(entry.id)}>
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="print-area" aria-hidden="true">
        <h1>错题本</h1>
        <pre>{exportWordlistText(wrongWords, '错题本')}</pre>
      </div>
    </main>
  );
}
