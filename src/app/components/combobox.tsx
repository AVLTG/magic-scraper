"use client";
import { useState, useRef, useEffect, useId, KeyboardEvent, Fragment } from 'react';

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

export interface ComboboxGroup {
  label: string;
  items: string[];
}

export interface ComboboxSection {
  label: string;
  items: string[];
  start: number; // global option index of this section's first item (headers are not options)
}

// Pure helper for grouped mode: filter each group, drop empty ones, and assign
// contiguous global option offsets so keyboard navigation indexes stay flat.
export function groupSections(
  groups: ComboboxGroup[],
  inputValue: string,
  excludeItems?: string[]
): ComboboxSection[] {
  const sections: ComboboxSection[] = [];
  let offset = 0;
  for (const g of groups) {
    const items = filterItems(g.items, inputValue, excludeItems);
    if (items.length === 0) continue;
    sections.push({ label: g.label, items, start: offset });
    offset += items.length;
  }
  return sections;
}

export interface ComboboxProps {
  items?: string[];
  groups?: ComboboxGroup[];      // grouped mode (issue #7 deck tiers) — overrides items
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string;
  id?: string;
  excludeItems?: string[];      // Phase 6.1 D-10 — items to filter OUT of the dropdown
  excludeLabel?: string;         // Phase 6.1 D-12 — text for the disabled collision row. Defaults to "Player already in game".
}

export function Combobox({
  items = [],
  groups,
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

  const sections = groups ? groupSections(groups, inputValue, excludeItems) : null;
  const allItems = groups ? groups.flatMap((g) => g.items) : items;
  const filtered = sections ? sections.flatMap((s) => s.items) : filterItems(items, inputValue, excludeItems);
  const showExcluded = shouldShowExcludedNotice(excludeItems, inputValue);
  // D-12: the "Add new" affordance is suppressed whenever the collision notice is shown.
  // They are mutually exclusive — either you see "Add xyz as new" OR "Player already in game", never both.
  const showAddNew = !showExcluded && shouldShowAddNew(allItems, inputValue);
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
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto overscroll-contain rounded-md border border-border bg-surface shadow-lg [-webkit-overflow-scrolling:touch]"
        >
          {(sections ?? [{ label: '', items: filtered, start: 0 }]).map((section) => (
            <Fragment key={section.label || '__flat__'}>
              {section.label && (
                <li
                  role="presentation"
                  className="px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted bg-surface-hover/50 border-t first:border-t-0 border-border select-none"
                >
                  {section.label}
                </li>
              )}
              {section.items.map((item, j) => {
                const i = section.start + j;
                return (
                  <li
                    key={`${section.label}-${item}`}
                    id={`${listboxId}-opt-${i}`}
                    role="option"
                    aria-selected={highlightedIndex === i}
                    // Commit on click (tap-up), not mousedown (press-down): committing on
                    // press-down makes the list impossible to drag-scroll on touch — the
                    // first option your finger lands on selects and closes. onClick only
                    // fires on a genuine tap, so a scroll gesture no longer mis-selects.
                    // The no-op mousedown preventDefault preserves the desktop behaviour
                    // the combobox was originally built around (keep input focused, no
                    // blur-before-click flicker) — see 06-02-combobox-component-SUMMARY.md.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(item)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`px-3 py-2.5 min-h-[44px] flex items-center cursor-pointer touch-manipulation ${
                      highlightedIndex === i ? 'bg-accent-muted text-accent' : 'text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {item}
                  </li>
                );
              })}
            </Fragment>
          ))}
          {showAddNew && (
            <li
              key="__addnew__"
              id={`${listboxId}-opt-${addNewIndex}`}
              role="option"
              aria-selected={highlightedIndex === addNewIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(inputValue.trim())}
              onMouseEnter={() => setHighlightedIndex(addNewIndex)}
              className={`px-3 py-2.5 min-h-[44px] flex items-center cursor-pointer touch-manipulation border-t border-border italic ${
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
              // No onMouseDown/onClick — non-clickable per D-12
              className="px-3 py-2.5 min-h-[44px] flex items-center border-t border-border italic text-muted opacity-60 cursor-not-allowed select-none"
            >
              {excludeLabel}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
