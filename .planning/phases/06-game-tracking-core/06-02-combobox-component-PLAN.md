---
phase: 06-game-tracking-core
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/components/combobox.tsx
  - tests/combobox.test.ts
autonomous: true
requirements:
  - GAME-02
  - GAME-03
user_setup: []

must_haves:
  truths:
    - "Combobox filters items case-insensitively as user types (client-side only, no debounce per D-09)"
    - "Combobox shows an 'Add xyz as new player/deck' row when input is non-empty AND no case-insensitive exact match exists in items (D-08)"
    - "Combobox hides the 'Add new' row when the input exactly matches an existing item (case-insensitive) — prevents 'alice' vs 'Alice' duplicate per RESEARCH.md Pitfall 3"
    - "Keyboard navigation: ArrowDown/ArrowUp move highlight, Enter commits, Escape closes without clearing input (D-07, RESEARCH.md Pattern 5)"
    - "Click-outside closes the dropdown without committing a selection"
    - "Pure helper functions filterItems(items, input) and shouldShowAddNew(items, input) are exported for unit testing"
  artifacts:
    - path: "src/app/components/combobox.tsx"
      provides: "Headless accessible combobox component + pure filter helpers"
      exports: ["Combobox", "filterItems", "shouldShowAddNew"]
      min_lines: 100
    - path: "tests/combobox.test.ts"
      provides: "Unit tests for filter/showAddNew helpers"
      min_lines: 40
  key_links:
    - from: "src/app/components/combobox.tsx"
      to: "exports Combobox React component"
      via: "export function Combobox"
      pattern: "export\\s+function\\s+Combobox"
    - from: "tests/combobox.test.ts"
      to: "src/app/components/combobox.tsx"
      via: "import { filterItems, shouldShowAddNew }"
      pattern: "from\\s+['\"]\\.\\./src/app/components/combobox['\"]"
---

<objective>
Build the hand-rolled headless combobox at `src/app/components/combobox.tsx` used for player and deck autocomplete in Phase 6 forms. Pure-logic helpers (`filterItems`, `shouldShowAddNew`) are exported and unit-tested; the full React component is implemented with keyboard navigation, click-outside handling, and the explicit "Add new" row per D-07 and D-08.

Purpose: Satisfies GAME-02 (player autocomplete) and GAME-03 (typable filter / add new) without any new dependencies (no Radix, Headless UI, or Downshift per D-07). Reused in both player and deck fields in the game form (Plan 06-06).

Output: One reusable `Combobox` component + passing unit tests for the filter logic.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/06-game-tracking-core/06-CONTEXT.md
@.planning/phases/06-game-tracking-core/06-RESEARCH.md
@src/app/checkDeck/page.tsx
@src/app/components/header.tsx
@jest.config.js

<interfaces>
<!-- Contract for downstream plans (06-06) -->

From src/app/components/combobox.tsx (to be created):
```typescript
export interface ComboboxProps {
  items: string[];                   // Seeded list (from /api/players or /api/decks)
  value: string;                     // Current controlled value
  onChange: (value: string) => void; // Called with selected item OR new user-typed value
  placeholder?: string;
  addLabel?: string;                 // "player" | "deck" — used in "Add xyz as new ___" text
  id?: string;                       // Optional DOM id for label association
}

export function Combobox(props: ComboboxProps): JSX.Element;

// Pure helpers (exported for unit testing)
export function filterItems(items: string[], inputValue: string): string[];
export function shouldShowAddNew(items: string[], inputValue: string): boolean;
```

Usage pattern from RESEARCH.md:
```typescript
<Combobox
  items={playerItems}
  value={row.playerName}
  onChange={(v) => updateRow(i, { playerName: v })}
  placeholder="Player name"
  addLabel="player"
/>
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write pure filter helpers and unit tests</name>
  <files>
    - src/app/components/combobox.tsx
    - tests/combobox.test.ts
  </files>
  <read_first>
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 5: Headless Combobox Keyboard Navigation Spec" and "Combobox Component Skeleton"
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-07, D-08, D-09 (combobox decisions)
    - tests/auth-login.test.ts (jest pattern reference; this test is pure logic so no mocks needed)
    - jest.config.js (confirms moduleNameMapper `@/*` → `src/*` and testMatch)
  </read_first>
  <behavior>
    - `filterItems(['Alice', 'Bob', 'Carol'], 'al')` → `['Alice']` (case-insensitive substring)
    - `filterItems(['Alice', 'alfred'], 'al')` → `['Alice', 'alfred']` (both match 'al')
    - `filterItems(['Alice'], '')` → `['Alice']` (empty input returns all items)
    - `filterItems([], 'anything')` → `[]`
    - `shouldShowAddNew(['Alice'], 'zara')` → `true` (no match, non-empty input)
    - `shouldShowAddNew(['Alice'], 'alice')` → `false` (case-insensitive exact match)
    - `shouldShowAddNew(['Alice'], 'Alice')` → `false` (case-insensitive exact match)
    - `shouldShowAddNew(['Alice'], 'al')` → `true` (partial match, not exact)
    - `shouldShowAddNew(['Alice'], '')` → `false` (empty input)
    - `shouldShowAddNew(['Alice'], '   ')` → `false` (whitespace-only input, trimmed)
  </behavior>
  <action>
    **Step 1 — RED: Create `tests/combobox.test.ts`** with exactly these test cases:

    ```typescript
    import { filterItems, shouldShowAddNew } from '../src/app/components/combobox';

    describe('filterItems', () => {
      it('returns items matching the input case-insensitively', () => {
        expect(filterItems(['Alice', 'Bob', 'Carol'], 'al')).toEqual(['Alice']);
      });
      it('returns multiple matches', () => {
        expect(filterItems(['Alice', 'alfred', 'Bob'], 'al')).toEqual(['Alice', 'alfred']);
      });
      it('returns all items when input is empty', () => {
        expect(filterItems(['Alice', 'Bob'], '')).toEqual(['Alice', 'Bob']);
      });
      it('returns empty array for empty items list', () => {
        expect(filterItems([], 'anything')).toEqual([]);
      });
      it('is case-insensitive on both sides', () => {
        expect(filterItems(['alice'], 'AL')).toEqual(['alice']);
      });
    });

    describe('shouldShowAddNew', () => {
      it('returns true when input has no match', () => {
        expect(shouldShowAddNew(['Alice'], 'zara')).toBe(true);
      });
      it('returns false when input exactly matches (case-insensitive lower)', () => {
        expect(shouldShowAddNew(['Alice'], 'alice')).toBe(false);
      });
      it('returns false when input exactly matches (case-insensitive same-case)', () => {
        expect(shouldShowAddNew(['Alice'], 'Alice')).toBe(false);
      });
      it('returns true on partial match (not exact)', () => {
        expect(shouldShowAddNew(['Alice'], 'al')).toBe(true);
      });
      it('returns false on empty input', () => {
        expect(shouldShowAddNew(['Alice'], '')).toBe(false);
      });
      it('returns false on whitespace-only input', () => {
        expect(shouldShowAddNew(['Alice'], '   ')).toBe(false);
      });
    });
    ```

    Run `npx jest tests/combobox.test.ts` — MUST fail (module does not exist yet).

    **Step 2 — GREEN: Create `src/app/components/combobox.tsx`** with the helpers + full Combobox component.

    Use `"use client"` directive at the top (required — the component uses `useState`, `useEffect`, `useRef`). Component shape per RESEARCH.md Pattern 5:

    ```typescript
    "use client";
    import { useState, useRef, useEffect, useId, KeyboardEvent } from 'react';

    // Pure helpers (exported for unit tests)
    export function filterItems(items: string[], inputValue: string): string[] {
      const q = inputValue.toLowerCase();
      return items.filter((i) => i.toLowerCase().includes(q));
    }

    export function shouldShowAddNew(items: string[], inputValue: string): boolean {
      const trimmed = inputValue.trim();
      if (trimmed.length === 0) return false;
      const lower = trimmed.toLowerCase();
      return !items.some((i) => i.toLowerCase() === lower);
    }

    export interface ComboboxProps {
      items: string[];
      value: string;
      onChange: (value: string) => void;
      placeholder?: string;
      addLabel?: string;
      id?: string;
    }

    export function Combobox({ items, value, onChange, placeholder, addLabel = 'item', id }: ComboboxProps) {
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

      const filtered = filterItems(items, inputValue);
      const showAddNew = shouldShowAddNew(items, inputValue);
      const totalRows = filtered.length + (showAddNew ? 1 : 0);
      const addNewIndex = filtered.length;

      const commit = (val: string) => {
        onChange(val);
        setInputValue(val);
        setIsOpen(false);
        setHighlightedIndex(-1);
      };

      const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightedIndex(0);
            return;
          }
          setHighlightedIndex((prev) => (prev + 1) % Math.max(totalRows, 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
            setHighlightedIndex(Math.max(totalRows - 1, 0));
            return;
          }
          setHighlightedIndex((prev) => (prev - 1 + Math.max(totalRows, 1)) % Math.max(totalRows, 1));
        } else if (e.key === 'Enter') {
          if (!isOpen || highlightedIndex < 0) return;
          e.preventDefault();
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
          setHighlightedIndex(Math.max(totalRows - 1, 0));
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
            </ul>
          )}
        </div>
      );
    }
    ```

    Run `npx jest tests/combobox.test.ts` — MUST pass (all 11 tests green).

    Run `npx jest` — full suite MUST remain green.

    **IMPORTANT constraints:**
    - Do NOT add `downshift`, `@radix-ui/*`, `@headlessui/*`, `cmdk`, or any combobox library (D-07 prohibits new deps)
    - Do NOT add debounce, SWR, or React Query — seed-once behavior is handled by the parent form (D-09)
    - Do NOT use `dangerouslySetInnerHTML` anywhere — React's default JSX escaping is the GAME-09/T-06-03 XSS mitigation
    - Do NOT put the file at `src/components/` — the canonical shared components directory is `src/app/components/` per STRUCTURE.md and D-07
    - The "Add new" row MUST use `inputValue.trim()` when committing so leading/trailing whitespace doesn't pollute the data (GAME-09)
  </action>
  <verify>
    <automated>npx jest tests/combobox.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - File `src/app/components/combobox.tsx` exists
    - Contains literal string `"use client"` on the first non-comment line
    - Contains literal string `export function filterItems(`
    - Contains literal string `export function shouldShowAddNew(`
    - Contains literal string `export function Combobox(`
    - Contains literal string `role="combobox"`
    - Contains literal string `role="listbox"`
    - Contains literal string `Add &quot;` (or `+ Add "` — the "Add new" row text is present)
    - Contains literal string `x-forwarded-for` → NO (this is the wrong file — must NOT contain this)
    - Contains literal string `addLabel` (prop name)
    - File `tests/combobox.test.ts` exists with at least 11 `it(` blocks
    - `npx jest tests/combobox.test.ts` exits 0 with all tests passing
    - `npx jest` full suite exits 0 (no regressions)
    - `grep -E "@radix|@headlessui|downshift|cmdk" package.json` returns nothing (no new deps added)
  </acceptance_criteria>
  <done>
    Combobox component exists with keyboard navigation, click-outside, and "Add new" row; pure helpers are unit-tested and passing.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User keyboard input → component state | Untrusted input is rendered via JSX (auto-escaped) |
| Items prop (from /api/players, /api/decks) → rendered `<li>` | Upstream data — rendered via JSX text, no HTML injection |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-03 | Tampering / XSS | Combobox `<li>` rendering user-typed inputValue and items array | mitigate | React JSX auto-escaping (no `dangerouslySetInnerHTML`, no innerHTML, no `document.write`). The `+ Add "xyz"` text is rendered as a text node. Acceptance criteria grep for `dangerouslySetInnerHTML` returning empty. |
| T-06-dup-entry | Data Integrity | "Add new" row on exact-match input | mitigate | `shouldShowAddNew` uses case-insensitive exact-match check — "alice" typed when "Alice" exists hides the "Add new" row per RESEARCH.md Pitfall 3. Unit-tested. |

</threat_model>

<verification>
- `npx jest tests/combobox.test.ts` passes with 11 tests
- `npx jest` full suite remains green
- `package.json` has no new dependencies
- `src/app/components/combobox.tsx` does not contain `dangerouslySetInnerHTML`
- `filterItems` and `shouldShowAddNew` are exported and importable from tests
</verification>

<success_criteria>
- Pure helpers `filterItems` and `shouldShowAddNew` have 100% unit coverage for the behaviors listed
- `Combobox` component renders and compiles (`tsc --noEmit` succeeds)
- Keyboard nav matches RESEARCH.md Pattern 5 spec
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-02-SUMMARY.md` documenting: exported contract, prop interface, how to use in forms.
</output>
