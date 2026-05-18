# Deck Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Decks" multi-select filter to the Games page toolbar that hides games where no participant played any of the selected decks.

**Architecture:** Pure client-side addition. Mirrors the existing Players multi-select pattern in `src/app/games/page.tsx`: new `decks: string[]` field on `FilterState`, new `deriveDeckOptions(games)` helper, new branch in `matchesAllFilters`, new `<details>` dropdown in the toolbar, parallel tests in `tests/games-filter.test.ts`. No schema, API, or migration changes.

**Tech Stack:** Next.js 16 (App Router client component), React 19, TypeScript, Jest + ts-jest.

**User preference — no commits during execution:** Per the user's established pattern, do NOT create commits between steps. Leave all changes in the working tree. The user will inspect the final diff and commit at the end.

**Spec:** `docs/superpowers/specs/2026-05-18-deck-filter-design.md`

---

## File map

**Modified:**
- `src/app/games/page.tsx` — add `decks` to `FilterState`, `deriveDeckOptions` export, `matchesAllFilters` branch, `deckFilters` state + toggle, `<details>` UI block, include in `anyFilterActive` + `clearFilters`.
- `tests/games-filter.test.ts` — update shared `EMPTY_FILTERS` constant, add `deriveDeckOptions` describe block, add deck-branch tests to `matchesAllFilters` describe.

**Created:** none.

**Conventions:**
- Jest config: `testMatch: '**/tests/**/*.test.ts'` (no .tsx tests, no jsdom). All tests target pure helpers; the UI block is not unit-tested here, matching the existing pattern for the Players filter.
- All new code LF-terminated (verify with `file <path>` after writes).

---

## Task 1: `deriveDeckOptions` helper + `FilterState.decks` field

**Files:**
- Modify: `tests/games-filter.test.ts`
- Modify: `src/app/games/page.tsx`

- [ ] **Step 1.1: Update the shared `EMPTY_FILTERS` test constant**

`FilterState` will gain a `decks: string[]` field. The existing test file at the top of every spread expression uses `{ winner: null, playerCount: null, players: [] }` via the `EMPTY_FILTERS` constant. Updating that constant first keeps every existing `...EMPTY_FILTERS` spread compiling.

In `tests/games-filter.test.ts`, find:

```ts
const EMPTY_FILTERS: FilterState = { winner: null, playerCount: null, players: [] };
```

Replace with:

```ts
const EMPTY_FILTERS: FilterState = { winner: null, playerCount: null, players: [], decks: [] };
```

Also update the imports at the top of the file. Find the existing import:

```ts
import {
  matchesAllFilters,
  deriveWinnerOptions,
  derivePlayerOptions,
  type FilterState,
  type Game,
} from '../src/app/games/page';
```

Replace with:

```ts
import {
  matchesAllFilters,
  deriveWinnerOptions,
  derivePlayerOptions,
  deriveDeckOptions,
  type FilterState,
  type Game,
} from '../src/app/games/page';
```

(This import will be unresolved until Step 1.4 lands. That's the intentional red state for Step 1.3.)

- [ ] **Step 1.2: Write failing tests for `deriveDeckOptions`**

Find the end of the file (after the last existing `describe(...)` block) and append:

```ts
describe('deriveDeckOptions', () => {
  it('returns empty array for empty input', () => {
    expect(deriveDeckOptions([])).toEqual([]);
  });

  it('returns distinct deck names, alphabetized case-insensitively', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, 'Selvala'),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
      mkGame('g2', [
        mkParticipant('Carol', true, false, 'breya'),
        mkParticipant('Dave', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa', 'breya', 'Selvala']);
  });

  it('skips null deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, null),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('skips empty-string deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, ''),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('skips whitespace-only deck names', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, '   '),
        mkParticipant('Bob', false, false, 'Atraxa'),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Atraxa']);
  });

  it('trims surrounding whitespace before dedup', () => {
    const games = [
      mkGame('g1', [
        mkParticipant('Alice', true, false, 'Selvala'),
        mkParticipant('Bob', false, false, ' Selvala '),
      ]),
    ];
    expect(deriveDeckOptions(games)).toEqual(['Selvala']);
  });
});
```

- [ ] **Step 1.3: Run the helper tests to verify they fail**

Run: `npx jest tests/games-filter.test.ts -t 'deriveDeckOptions'`
Expected: FAIL with a module-resolution / unresolved-import error on `deriveDeckOptions`. That's the intentional red state.

- [ ] **Step 1.4: Implement `deriveDeckOptions` and extend `FilterState`**

In `src/app/games/page.tsx`, find the existing `FilterState` interface:

```ts
export interface FilterState {
  winner: string | null;
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
  players: string[];
}
```

Add `decks`:

```ts
export interface FilterState {
  winner: string | null;
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
  players: string[];
  decks: string[];
}
```

Find the existing `derivePlayerOptions` helper and append `deriveDeckOptions` immediately after it:

```ts
/**
 * Distinct deck names from currently-loaded games, alphabetized case-insensitively.
 * Skips null/empty/whitespace-only deck names. Trims surrounding whitespace before dedup
 * (consistent with how computeGamesByDeckPie and friends treat blank decks).
 */
export function deriveDeckOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      const trimmed = p.deckName?.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

- [ ] **Step 1.5: Run helper tests to verify they pass**

Run: `npx jest tests/games-filter.test.ts -t 'deriveDeckOptions'`
Expected: All 6 deriveDeckOptions tests PASS.

- [ ] **Step 1.6: Run the full test file**

Run: `npx jest tests/games-filter.test.ts`
Expected: All existing tests still pass (they spread `EMPTY_FILTERS` which now includes `decks: []`, the empty array passes the existing branches' `length === 0` guards). New deriveDeckOptions tests pass. Total grows by 6.

- [ ] **Step 1.7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (At this point the new `decks` field exists on `FilterState` but no code uses it yet — that's fine, the optional field is satisfied by `[]` everywhere it's constructed.)

---

## Task 2: `matchesAllFilters` deck branch

**Files:**
- Modify: `tests/games-filter.test.ts`
- Modify: `src/app/games/page.tsx`

- [ ] **Step 2.1: Write failing tests for the deck branch**

In `tests/games-filter.test.ts`, find the existing `describe('matchesAllFilters (D-17)', () => { ... })` block. Append the following `describe` block as a nested child INSIDE that outer block (immediately after the existing `describe('playerCount filter ...')` and `players filter` blocks, or at the end of the outer block — either placement works):

```ts
  describe('decks filter', () => {
    const selvala = mkGame('g-s', [
      mkParticipant('Alice', true, false, 'Selvala'),
      mkParticipant('Bob', false, false, 'Atraxa'),
    ]);
    const breya = mkGame('g-b', [
      mkParticipant('Carol', true, false, 'Breya'),
      mkParticipant('Dave', false, false, 'Atraxa'),
    ]);
    const allBlank = mkGame('g-x', [
      mkParticipant('Eve', true, false, null),
      mkParticipant('Frank', false, false, '   '),
    ]);

    it('passthrough when decks array is empty', () => {
      expect(matchesAllFilters(selvala, EMPTY_FILTERS)).toBe(true);
      expect(matchesAllFilters(allBlank, EMPTY_FILTERS)).toBe(true);
    });

    it('matches when any participant played the selected deck', () => {
      expect(matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Selvala'] })).toBe(true);
      expect(matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Atraxa'] })).toBe(true);
    });

    it('multi-select is OR within: any of the selected decks suffices', () => {
      expect(
        matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Breya', 'Atraxa'] })
      ).toBe(true);
      expect(
        matchesAllFilters(breya, { ...EMPTY_FILTERS, decks: ['Selvala', 'Atraxa'] })
      ).toBe(true);
    });

    it('rejects when no participant played any selected deck', () => {
      expect(
        matchesAllFilters(selvala, { ...EMPTY_FILTERS, decks: ['Breya'] })
      ).toBe(false);
      expect(
        matchesAllFilters(breya, { ...EMPTY_FILTERS, decks: ['Selvala'] })
      ).toBe(false);
    });

    it('skips participants with null/empty/whitespace deck names', () => {
      expect(
        matchesAllFilters(allBlank, { ...EMPTY_FILTERS, decks: ['Selvala'] })
      ).toBe(false);
    });

    it('ANDs across filter types: deck + player', () => {
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Alice'],
          decks: ['Selvala'],
        })
      ).toBe(true);
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Alice'],
          decks: ['Breya'],
        })
      ).toBe(false);
      expect(
        matchesAllFilters(selvala, {
          ...EMPTY_FILTERS,
          players: ['Carol'],
          decks: ['Selvala'],
        })
      ).toBe(false);
    });
  });
```

- [ ] **Step 2.2: Run the new tests to verify they fail**

Run: `npx jest tests/games-filter.test.ts -t 'decks filter'`
Expected: All 6 tests in the new "decks filter" block FAIL — the implementation doesn't check `filters.decks` yet, so the rejecting cases would incorrectly return `true`. (The "passthrough when decks array is empty" test may pass since the function returns `true` for an empty filter state by default. Other tests fail.)

- [ ] **Step 2.3: Implement the deck branch in `matchesAllFilters`**

In `src/app/games/page.tsx`, find the existing `matchesAllFilters` function:

```ts
export function matchesAllFilters(game: Game, filters: FilterState): boolean {
  if (filters.winner !== null) {
    const winner = game.participants.find((p) => p.isWinner);
    if (!winner || winner.playerName !== filters.winner) return false;
  }
  if (filters.playerCount !== null) {
    if (game.participants.length !== filters.playerCount) return false;
  }
  if (filters.players.length > 0) {
    const names = new Set(game.participants.map((p) => p.playerName));
    const anyMatch = filters.players.some((p) => names.has(p));
    if (!anyMatch) return false;
  }
  return true;
}
```

Replace with (only the new `if (filters.decks.length > 0)` block is added; everything else is unchanged):

```ts
export function matchesAllFilters(game: Game, filters: FilterState): boolean {
  if (filters.winner !== null) {
    const winner = game.participants.find((p) => p.isWinner);
    if (!winner || winner.playerName !== filters.winner) return false;
  }
  if (filters.playerCount !== null) {
    if (game.participants.length !== filters.playerCount) return false;
  }
  if (filters.players.length > 0) {
    const names = new Set(game.participants.map((p) => p.playerName));
    const anyMatch = filters.players.some((p) => names.has(p));
    if (!anyMatch) return false;
  }
  if (filters.decks.length > 0) {
    const usedDecks = new Set(
      game.participants
        .map((p) => p.deckName?.trim())
        .filter((d): d is string => !!d && d !== '')
    );
    const anyMatch = filters.decks.some((d) => usedDecks.has(d));
    if (!anyMatch) return false;
  }
  return true;
}
```

The `(d): d is string => !!d && d !== ''` predicate handles `undefined` (from `?.trim()` on a null `deckName`) and empty strings in one pass. The `Set` lookup is O(1) per selected deck.

- [ ] **Step 2.4: Run the deck-branch tests to verify they pass**

Run: `npx jest tests/games-filter.test.ts -t 'decks filter'`
Expected: All 6 PASS.

- [ ] **Step 2.5: Run the full test file**

Run: `npx jest tests/games-filter.test.ts`
Expected: All tests pass. Pre-existing tests still green (they didn't depend on `filters.decks` since `EMPTY_FILTERS` now has `decks: []` which short-circuits the new branch).

- [ ] **Step 2.6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 3: UI — Decks multi-select dropdown in the toolbar

**Files:**
- Modify: `src/app/games/page.tsx`

- [ ] **Step 3.1: Add the `deckFilters` state and the option-derivation memo**

In `src/app/games/page.tsx`, find the existing filter state declarations:

```ts
const [winnerFilter, setWinnerFilter] = useState<string | null>(null);
const [countFilter, setCountFilter] = useState<2 | 3 | 4 | 5 | 6 | 7 | 8 | null>(null);
const [playerFilters, setPlayerFilters] = useState<string[]>([]);
```

Append the new state on the next line:

```ts
const [deckFilters, setDeckFilters] = useState<string[]>([]);
```

Then find the existing memoized options:

```ts
const winnerOptions = useMemo(() => deriveWinnerOptions(games), [games]);
const playerOptions = useMemo(() => derivePlayerOptions(games), [games]);
```

Append:

```ts
const deckOptions = useMemo(() => deriveDeckOptions(games), [games]);
```

- [ ] **Step 3.2: Pass `decks` into `matchesAllFilters` and extend `anyFilterActive` + `clearFilters`**

Find the `filteredGames` memo:

```ts
const filteredGames = useMemo(
  () =>
    games.filter((g) =>
      matchesAllFilters(g, { winner: winnerFilter, playerCount: countFilter, players: playerFilters })
    ),
  [games, winnerFilter, countFilter, playerFilters]
);
```

Replace with:

```ts
const filteredGames = useMemo(
  () =>
    games.filter((g) =>
      matchesAllFilters(g, {
        winner: winnerFilter,
        playerCount: countFilter,
        players: playerFilters,
        decks: deckFilters,
      })
    ),
  [games, winnerFilter, countFilter, playerFilters, deckFilters]
);
```

Find `anyFilterActive`:

```ts
const anyFilterActive = winnerFilter !== null || countFilter !== null || playerFilters.length > 0;
```

Replace with:

```ts
const anyFilterActive =
  winnerFilter !== null ||
  countFilter !== null ||
  playerFilters.length > 0 ||
  deckFilters.length > 0;
```

Find `clearFilters`:

```ts
const clearFilters = () => {
  setWinnerFilter(null);
  setCountFilter(null);
  setPlayerFilters([]);
};
```

Replace with:

```ts
const clearFilters = () => {
  setWinnerFilter(null);
  setCountFilter(null);
  setPlayerFilters([]);
  setDeckFilters([]);
};
```

Find `togglePlayerFilter`:

```ts
const togglePlayerFilter = (name: string) => {
  setPlayerFilters((prev) =>
    prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
  );
};
```

Add a sibling `toggleDeckFilter` immediately after it:

```ts
const toggleDeckFilter = (name: string) => {
  setDeckFilters((prev) =>
    prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]
  );
};
```

- [ ] **Step 3.3: Add the Decks `<details>` block to the toolbar JSX**

Find the existing Players filter block (the `<details>` element wrapped in a `<div className="flex-1 min-w-[12rem]">`). Add a sibling Decks block immediately AFTER the Players `</div>` and BEFORE the `{anyFilterActive && ...}` Clear filters button.

Insert this block (the structure is a near-verbatim copy of the Players block with renamed identifiers and labels):

```tsx
<div className="flex-1 min-w-[12rem]">
  <label className="block text-xs text-muted mb-1">
    Decks {deckFilters.length > 0 && `(${deckFilters.length} selected)`}
  </label>
  <details className="relative">
    <summary className="px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm cursor-pointer list-none">
      {deckFilters.length === 0 ? 'Any decks' : deckFilters.join(', ')}
    </summary>
    <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-surface shadow-lg p-2">
      {deckOptions.length === 0 && (
        <p className="text-xs text-muted italic px-1 py-1">No decks yet</p>
      )}
      {deckOptions.map((name) => (
        <label
          key={name}
          className="flex items-center gap-2 px-1 py-1 text-sm text-foreground hover:bg-surface-hover rounded cursor-pointer"
        >
          <input
            type="checkbox"
            checked={deckFilters.includes(name)}
            onChange={() => toggleDeckFilter(name)}
          />
          <span>{name}</span>
        </label>
      ))}
    </div>
  </details>
</div>
```

- [ ] **Step 3.4: Run the full test suite**

Run: `npm test`
Expected: same baseline as before (only `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` failing). All previously-green tests still green. `tests/games-filter.test.ts` gains 12 new tests (6 helper + 6 deck-branch).

- [ ] **Step 3.5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3.6: Line-ending hygiene**

Run: `file src/app/games/page.tsx tests/games-filter.test.ts`
Expected: both report `ASCII text` / `Unicode text` (no `CRLF line terminators`). If either shows CRLF, normalize with `tr -d '\r' < FILE > FILE.tmp && mv FILE.tmp FILE`.

- [ ] **Step 3.7: Working-tree summary**

Run: `git status --short -- src/app/games/page.tsx tests/games-filter.test.ts`
Expected: both files modified, nothing else in scope (pre-existing CRLF noise on other files is unrelated).

- [ ] **Step 3.8: Manual smoke (for the user)**

The user will run this themselves at `/games` in a browser:
1. Open the Games tab → toolbar now shows a fourth "Decks" dropdown next to Players.
2. Click the Decks dropdown → list shows distinct deck names from loaded games, alphabetized.
3. Check one deck → list filters to games where that deck appeared in any seat.
4. Check a second deck → list expands to include games with either deck (OR within).
5. Also pick a Player → list narrows to games matching both filters (AND across).
6. Click "Clear filters" → all filters reset, including decks.
7. Verify games with all-null/empty deck names don't appear when any deck is selected.

---

## Self-review notes

**Spec coverage:**
- A. Filter semantics → Task 2 implements OR-within / AND-across, null/empty/whitespace skip.
- B. State + types → Task 1 (`FilterState.decks`), Task 3 (`deckFilters` state).
- C. `deriveDeckOptions` helper → Task 1.4.
- D. `matchesAllFilters` branch → Task 2.3.
- E. UI → Task 3.3.
- F. Tests → Tasks 1.2 (6 helper) + 2.1 (6 branch) — all 12 specified test cases covered.
- G. Out of scope → respected (no URL state, no "winning deck only" mode, no persistence).
- H. File inventory → matches.

**Placeholder scan:** None. Every step has executable code or a concrete command.

**Type consistency:** `decks: string[]` in `FilterState` (Task 1.4) consumed by `matchesAllFilters` (Task 2.3) and the page state (Task 3.1). `deriveDeckOptions` signature `(games: Game[]) => string[]` consistent across the helper, the test imports (Task 1.1), and the useMemo (Task 3.1). `toggleDeckFilter(name: string)` consumed only by the checkbox `onChange` in Task 3.3. No drift.

**Pre-existing baseline failure:** `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` was failing before this feature. Do not investigate or "fix" it as part of this work.
