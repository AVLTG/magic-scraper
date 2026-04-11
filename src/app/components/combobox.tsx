"use client";
import { useState, useRef, useEffect, useId, KeyboardEvent } from 'react';

// Pure helpers (exported for unit tests)
export function filterItems(items: string[], inputValue: string, excludeItems?: string[]): string[] {
  const q = inputValue.toLowerCase();
  const excluded = new Set(
    (excludeItems ?? []).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 0)
  );
  return items.filter((i) => {
    if (excluded.has(i.toLowerCase())) return false;
    return i.toLowerCase().includes(q);
  });
}

export function shouldShowAddNew(items: string[], inputValue: string): boolean {
  const trimmed = inputValue.trim();
  if (trimmed.length === 0) return false;
  const lower = trimmed.toLowerCase();
  return !items.some((i) => i.toLowerCase() === lower);
}

// Phase 6.1 D-12: when the user types a name that collides with an already-filled
// participant row, the Combobox swaps the "Add xyz as new player" affordance for a
// disabled, non-clickable row reading "Player already in game". This helper detects
// the collision state. Returns true ONLY when the typed input case-insensitively
// equals one of the excluded items (not on partial matches — partial matches should
// still allow the normal "Add new" affordance so the user can commit a fresh name).
export function shouldShowExcludedNotice(
  excludeItems: string[] | undefined,
  inputValue: string
): boolean {
  const trimmed = inputValue.trim();
  if (trimmed.length === 0) return false;
  if (!excludeItems || excludeItems.length === 0) return false;
  const lower = trimmed.toLowerCase();
  return excludeItems.some((x) => x.trim().toLowerCase() === lower);
}

export interface ComboboxProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string;
  id?: string;
  excludeItems?: string[];      // Phase 6.1 D-10 — items to filter OUT of the dropdown
  excludeLabel?: string;         // Phase 6.1 D-12 — text for the disabled collision row. Defaults to "Player already in game".
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder,
  addLabel = 'item',
  id,
  excludeItems,
  excludeLabel = 'Player already in game',
}: ComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Keep internal input in sync if parent value changes externally (edit mode preload)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside closes the dropdown
  useEffect(() => {
    if (!isOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen]);

  const filtered = filterItems(items, inputValue, excludeItems);
  const showExcluded = shouldShowExcludedNotice(excludeItems, inputValue);
  // D-12: the "Add new" affordance is suppressed whenever the collision notice is shown.
  // They are mutually exclusive — either you see "Add xyz as new" OR "Player already in game", never both.
  const showAddNew = !showExcluded && shouldShowAddNew(items, inputValue);
  const totalRows = filtered.length + (showAddNew ? 1 : 0) + (showExcluded ? 1 : 0);
  const addNewIndex = filtered.length;                          // only valid when showAddNew is true
  const excludedNoticeIndex = filtered.length;                  // same index as addNewIndex because they are mutually exclusive

  const commit = (val: string) => {
    onChange(val);
    setInputValue(val);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Highlightable count excludes the disabled notice row (D-12 — keyboard skips it)
      const highlightable = showExcluded ? filtered.length : totalRows;
      if (highlightable <= 0) return;
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        return;
      }
      setHighlightedIndex((prev) => (prev + 1) % highlightable);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const highlightable = showExcluded ? filtered.length : totalRows;
      if (highlightable <= 0) return;
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(Math.max(highlightable - 1, 0));
        return;
      }
      setHighlightedIndex((prev) => (prev - 1 + highlightable) % highlightable);
    } else if (e.key === 'Enter') {
      if (!isOpen || highlightedIndex < 0) return;
      e.preventDefault();
      // Enter on the excluded-notice row is a no-op (D-12 — non-clickable)
      if (showExcluded && highlightedIndex === excludedNoticeIndex) return;
      if (highlightedIndex === addNewIndex && showAddNew) {
        commit(inputValue.trim());
      } else if (highlightedIndex < filtered.length) {
        commit(filtered[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      // Do NOT clear input per D-07 / RESEARCH.md Pattern 5 spec
      setIsOpen(false);
      setHighlightedIndex(-1);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
      // allow natural tab
    } else if (e.key === 'Home' && isOpen) {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End' && isOpen) {
      e.preventDefault();
      const highlightable = showExcluded ? filtered.length : totalRows;
      setHighlightedIndex(Math.max(highlightable - 1, 0));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        value={inputValue}
        placeholder={placeholder}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
          setHighlightedIndex(-1);
          // Optimistic: update parent so the form state reflects typed input even if not committed
          onChange(e.target.value);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
        }
        autoComplete="off"
        className="w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
      />
      {isOpen && totalRows > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-surface shadow-lg"
        >
          {filtered.map((item, i) => (
            <li
              key={item}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={highlightedIndex === i}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(item);
              }}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`px-3 py-2 cursor-pointer ${
                highlightedIndex === i ? 'bg-accent-muted text-accent' : 'text-foreground hover:bg-surface-hover'
              }`}
            >
              {item}
            </li>
          ))}
          {showAddNew && (
            <li
              key="__addnew__"
              id={`${listboxId}-opt-${addNewIndex}`}
              role="option"
              aria-selected={highlightedIndex === addNewIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(inputValue.trim());
              }}
              onMouseEnter={() => setHighlightedIndex(addNewIndex)}
              className={`px-3 py-2 cursor-pointer border-t border-border italic ${
                highlightedIndex === addNewIndex ? 'bg-accent-muted text-accent' : 'text-muted hover:bg-surface-hover'
              }`}
            >
              + Add &quot;{inputValue.trim()}&quot; as new {addLabel}
            </li>
          )}
          {showExcluded && (
            <li
              key="__excluded__"
              id={`${listboxId}-opt-${excludedNoticeIndex}`}
              role="option"
              aria-disabled="true"
              aria-selected={false}
              // No onMouseDown — non-clickable per D-12
              className="px-3 py-2 border-t border-border italic text-muted opacity-60 cursor-not-allowed select-none"
            >
              {excludeLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
