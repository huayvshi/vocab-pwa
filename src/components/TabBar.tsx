export type Tab = 'search' | 'roots' | 'study' | 'stats' | 'settings';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'search', label: '查词' },
  { value: 'roots', label: '词根' },
  { value: 'study', label: '学习' },
  { value: 'stats', label: '统计' },
  { value: 'settings', label: '设置' },
];

interface Props {
  tab: Tab;
  onChange: (tab: Tab) => void;
  dueCount: number;
  todayLearned: number;
}

export function TabBar({ tab, onChange, dueCount, todayLearned }: Props) {
  return (
    <nav className="tab-bar" aria-label="主导航">
      {TABS.map((item) => (
        <button
          key={item.value}
          type="button"
          className={tab === item.value ? 'tab active' : 'tab'}
          aria-current={tab === item.value ? 'page' : undefined}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.value === 'study' && dueCount > 0 ? <span className="tab-badge">{dueCount}</span> : null}
          {item.value === 'stats' && todayLearned > 0 ? (
            <span className="tab-dot" aria-hidden="true" />
          ) : null}
        </button>
      ))}
    </nav>
  );
}
