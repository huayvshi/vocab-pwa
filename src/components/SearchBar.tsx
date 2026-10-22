import type { KeyboardEvent, RefObject } from 'react';

interface Props {
  query: string;
  onChange: (value: string) => void;
  onMove: (delta: number) => void;
  onCommit: () => void;
  onEscape: () => void;
  expanded: boolean;
  activeId?: string;
  listId: string;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function SearchBar({
  query,
  onChange,
  onMove,
  onCommit,
  onEscape,
  expanded,
  activeId,
  listId,
  inputRef,
}: Props) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onEscape();
    }
  }

  return (
    <div className="search-box">
      <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入英文或中文，如 abandon、放弃"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-label="查词"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      {query ? (
        <button
          type="button"
          className="search-clear"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="清空搜索"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
