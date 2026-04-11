---
phase: 06-game-tracking-core
plan: 02
subsystem: ui-components
tags: [combobox, autocomplete, form, accessibility, tdd]
dependency_graph:
  requires: []
  provides:
    - "src/app/components/combobox.tsx::Combobox"
    - "src/app/components/combobox.tsx::filterItems"
    - "src/app/components/combobox.tsx::shouldShowAddNew"
  affects:
    - "Phase 06-06 game form (consumes Combobox for player + deck fields)"
tech_stack:
  added: []
  patterns:
    - "Headless ARIA combobox (no 3rd-party library)"
    - "Pure helpers extracted for unit testability"
    - "Click-outside via document-level mousedown listener with cleanup"
    - "onMouseDown preventDefault for option clicks (avoids blur-before-click)"
key_files:
  created:
    - "src/app/components/combobox.tsx"
    - "tests/combobox.test.ts"
  modified: []
decisions:
  - "Hand-rolled combobox instead of Radix/Headless UI/Downshift (D-07)"
  - "Explicit + Add \"xyz\" row shown when no exact case-insensitive match (D-08)"
  - "Seed-once filtering, no debounce or SWR (D-09)"
  - "Escape closes dropdown but does NOT clear input value (D-07 / Pattern 5)"
  - "Optimistic onChange on every keystroke so parent form always sees current text"
metrics:
  duration: "~2m"
  completed: "2026-04-11T02:36:36Z"
  tasks: 1
  tests_added: 11
requirements:
  - GAME-02
  - GAME-03
---

# Phase 06 Plan 02: Combobox Component Summary

**One-liner:** Hand-rolled headless accessible `<Combobox>` with case-insensitive filtering, keyboard navigation, click-outside dismissal, and an explicit "Add new" row for typo-safe player/deck creation — zero new dependencies.

## What Shipped

### 1. `src/app/components/combobox.tsx` (174 lines)

Client component (`"use client"`) exporting:

**Pure helpers (unit-testable, no React):**
```typescript
export function filterItems(items: string[], inputValue: string): string[]
export function shouldShowAddNew(items: string[], inputValue: string): boolean
```

- `filterItems` — case-insensitive substring filter over the seed array
- `shouldShowAddNew` — returns `true` only when trimmed input is non-empty AND does not exactly match any existing item (case-insensitive); prevents `alice`/`Alice` duplicate creation (T-06-dup-entry mitigation)

**React component:**
```typescript
export interface ComboboxProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string;   // "player" | "deck" — used in "+ Add \"xyz\" as new {addLabel}"
  id?: string;
}
export function Combobox(props: ComboboxProps): JSX.Element
```

**Behavior:**
- Controlled `value`/`onChange` with internal `inputValue` mirror so the parent always sees the current typed text (optimistic onChange on every keystroke)
- `useEffect` resyncs internal state when parent `value` changes externally (edit-mode preload)
- Filtered list rendered as `<ul role="listbox">`; each option is `<li role="option">` with `aria-selected` on the highlighted row and an `aria-activedescendant` pointer from the input
- When `shouldShowAddNew` is `true`, an extra italic bordered `<li>` "+ Add \"xyz\" as new {addLabel}" appears at the bottom of the list
- Commit sources: mouse click on any option (via `onMouseDown` + `e.preventDefault()` so the blur doesn't close the list first), or Enter when an option is highlighted
- Commits always pass through a single `commit()` function that calls `onChange(val)`, syncs internal state, closes the dropdown, and resets the highlight
- Add-new row commits `inputValue.trim()` to prevent whitespace-only names (GAME-09 sanitization)

**Keyboard map (matches RESEARCH.md Pattern 5):**

| Key         | Behavior                                                         |
| ----------- | ---------------------------------------------------------------- |
| ArrowDown   | Open if closed and highlight 0; otherwise wrap-next              |
| ArrowUp     | Open if closed and highlight last; otherwise wrap-prev           |
| Enter       | Commit highlighted option (filtered item OR Add-new row)         |
| Escape      | Close dropdown, keep input text intact (per D-07)                |
| Tab         | Close dropdown, allow natural tab traversal                      |
| Home        | Jump to first row (when open)                                    |
| End         | Jump to last row including Add-new (when open)                   |

**Click-outside:** `document.addEventListener('mousedown', ...)` guarded by `isOpen` with cleanup on unmount / when closed.

**Styling:** Tailwind utility classes matching the project's existing `border-border`, `bg-surface`, `text-foreground`, `focus:ring-accent` tokens seen in `src/app/components/header.tsx`.

### 2. `tests/combobox.test.ts` (40 lines)

11 unit tests covering all listed `filterItems` / `shouldShowAddNew` cases from the plan's `<behavior>` block. Pure-logic tests — no React rendering, no DOM. Runs under the existing jest + ts-jest node environment with no additional setup.

## How To Use (Phase 06-06 Preview)

```typescript
"use client";
import { useState, useEffect } from 'react';
import { Combobox } from '@/app/components/combobox';

export function GameForm() {
  const [players, setPlayers] = useState<string[]>([]);
  const [decks, setDecks] = useState<string[]>([]);
  const [row, setRow] = useState({ playerName: '', deckName: '' });

  useEffect(() => {
    fetch('/api/players').then((r) => r.json()).then((d) => setPlayers(d.players));
    fetch('/api/decks').then((r) => r.json()).then((d) => setDecks(d.decks));
  }, []);

  return (
    <>
      <Combobox
        items={players}
        value={row.playerName}
        onChange={(v) => setRow({ ...row, playerName: v })}
        placeholder="Player name"
        addLabel="player"
      />
      <Combobox
        items={decks}
        value={row.deckName}
        onChange={(v) => setRow({ ...row, deckName: v })}
        placeholder="Deck name"
        addLabel="deck"
      />
    </>
  );
}
```

## Verification Results

- `npx jest tests/combobox.test.ts` — 11/11 PASS
- `npx jest` (full suite) — 38/38 PASS across 6 suites (no regressions)
- `npx tsc --noEmit` — zero errors
- `grep -E "@radix|@headlessui|downshift|cmdk" package.json` — no matches (D-07 honored)
- `grep dangerouslySetInnerHTML src/app/components/combobox.tsx` — no matches (T-06-03 mitigation)

## Acceptance Criteria

| Criterion                                                     | Status |
| ------------------------------------------------------------- | ------ |
| `src/app/components/combobox.tsx` exists                      | PASS   |
| `"use client"` on first non-comment line                      | PASS   |
| `export function filterItems(` present                        | PASS   |
| `export function shouldShowAddNew(` present                   | PASS   |
| `export function Combobox(` present                           | PASS   |
| `role="combobox"` present                                     | PASS   |
| `role="listbox"` present                                      | PASS   |
| `+ Add "..."` row text present (`Add &quot;`)                 | PASS   |
| `addLabel` prop name present                                  | PASS   |
| `tests/combobox.test.ts` has ≥11 `it(` blocks                 | PASS (11) |
| `npx jest tests/combobox.test.ts` exits 0                     | PASS   |
| `npx jest` full suite exits 0                                 | PASS   |
| No new combobox deps in `package.json`                        | PASS   |
| No `dangerouslySetInnerHTML`                                  | PASS   |

## Deviations from Plan

None — plan executed exactly as written. Code matches the specified skeleton verbatim.

## Threat Model Coverage

| Threat ID        | Status    | How                                                                                                  |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| T-06-03 (XSS)    | mitigated | All user text rendered via JSX text nodes; no `dangerouslySetInnerHTML`, no `innerHTML`, no `document.write` |
| T-06-dup-entry   | mitigated | `shouldShowAddNew` case-insensitive exact-match check is unit-tested with the `'alice'` vs `'Alice'` cases |

No new threat flags introduced — the component only renders into the DOM and has no network / file / auth surface.

## Known Stubs

None. The component is fully wired; its only "empty" path is when `items` is empty AND `shouldShowAddNew` returns false — which correctly hides the dropdown entirely (no stub UI).

## Commits

| Phase | Hash    | Message                                                     |
| ----- | ------- | ----------------------------------------------------------- |
| RED   | 6e1ab01 | test(06-02): add failing tests for combobox filter helpers  |
| GREEN | befdb43 | feat(06-02): implement headless combobox component          |

## Self-Check: PASSED

- Files exist on disk:
  - `src/app/components/combobox.tsx` — FOUND
  - `tests/combobox.test.ts` — FOUND
- Commits present in git log:
  - `6e1ab01` — FOUND
  - `befdb43` — FOUND
- Tests green: 38/38 full suite
- TypeScript: zero errors
