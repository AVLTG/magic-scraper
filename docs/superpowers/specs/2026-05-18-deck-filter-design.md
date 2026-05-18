# Deck Filter — Design

**Date:** 2026-05-18
**Scope:** Add a "Decks" filter to the Games tab toolbar in `src/app/games/page.tsx`. Multi-select dropdown mirroring the existing Players filter. Pure client-side; no schema, API, or migration changes.
**Status:** Approved, pending implementation plan.

## Context

The Games page (`/games`) already has three filters: Winner (single-select), Player count (single-select), and Players (multi-select). All filters are client-side: derived from the loaded game list, AND across filter types, OR within multi-selects (per Phase 6.1 D-17). The user wants a fourth filter — Decks — to answer "show me all games where deck X was played" regardless of who piloted it or whether they won.

## What ships

A new multi-select Decks filter alongside Players, plus a derive helper, a `matchesAllFilters` branch, and parallel tests.

## A. Filter semantics

- **Match scope:** any participant in the game played one of the selected decks (decided in brainstorming).
- **OR within:** if multiple decks are selected, a game matches if any one of them appears.
- **AND across:** the deck filter ANDs with the existing Winner / Player count / Players filters.
- **Null / empty / whitespace deck names:** skipped during option derivation AND during matching. A participant with `deckName: null` or `deckName: '   '` does not contribute to the deck set the filter checks against. Consistent with existing stats helpers (`computeGamesByDeckPie` etc.).

## B. State + types (`src/app/games/page.tsx`)

`FilterState` gains one field:

```ts
export interface FilterState {
  winner: string | null;
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
  players: string[];
  decks: string[];   // NEW
}
```

New `useState` in the component:

```ts
const [deckFilters, setDeckFilters] = useState<string[]>([]);
```

`anyFilterActive` extended:

```ts
const anyFilterActive =
  winnerFilter !== null ||
  countFilter !== null ||
  playerFilters.length > 0 ||
  deckFilters.length > 0;
```

`clearFilters` resets it. `togglePlayerFilter` gets a sibling `toggleDeckFilter` (or — equally fine — both share a small `toggleListItem` helper; pick whichever reads cleaner).

## C. New helper `deriveDeckOptions(games)`

Exported alongside `deriveWinnerOptions` and `derivePlayerOptions`:

```ts
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

- Reads `deckName` from each participant.
- Skips null, empty, and whitespace-only via `?.trim()` + truthy check.
- Dedupes via `Set`, alphabetizes case-insensitively (same comparator as the other derive helpers).

## D. `matchesAllFilters` branch

Add after the existing `filters.players` branch:

```ts
if (filters.decks.length > 0) {
  const usedDecks = new Set(
    game.participants
      .map((p) => p.deckName?.trim())
      .filter((d): d is string => !!d && d !== '')
  );
  const anyMatch = filters.decks.some((d) => usedDecks.has(d));
  if (!anyMatch) return false;
}
```

Same null/empty/whitespace handling as `deriveDeckOptions` so the option list and match logic stay in sync.

## E. UI

A `<details>` multi-select identical in structure to the existing Players filter, placed immediately after the Players filter in the toolbar. Label: "Decks". Dropdown trigger text: `'Any decks'` when empty, comma-joined selected names otherwise. Empty state inside the dropdown: "No decks yet".

Memoized option source:

```ts
const deckOptions = useMemo(() => deriveDeckOptions(games), [games]);
```

The `<details>` block can be a near-verbatim copy of the Players control (lines ~237-264 in `src/app/games/page.tsx`), differing only in label/state/options. Acceptable duplication at this scale — extracting a `<MultiSelectFilter>` component is YAGNI for two call sites.

## F. Tests

In `tests/games-filter.test.ts` (extend the existing file), add two new describe blocks parallel to the Players tests:

### `deriveDeckOptions`
- Empty input returns `[]`.
- Returns distinct deck names from all participants, alphabetized case-insensitively.
- Skips `null` deck names.
- Skips empty-string deck names.
- Skips whitespace-only deck names.
- Trims surrounding whitespace before deduplication (`'Selvala'` and `' Selvala '` become one entry).

### `matchesAllFilters` — deck branch
- Empty `decks` array: passthrough (no exclusion).
- Single selected deck matches when any participant played it.
- Multi-select: OR — game matches if any selected deck appears.
- AND-across: deck filter combines with Players filter (game must satisfy both).
- Participants with null/empty/whitespace deck names don't contribute to matches.
- Game with no decks at all (all participants have null deckName) is filtered out when a deck is selected.

## G. Out of scope

- URL state for filters (Phase 6.1 D-21 explicitly kept filters ephemeral; no change).
- "Winning deck only" filter mode (rejected during brainstorming in favor of "any participant").
- Filter persistence between page reloads.
- Stats page filters (this is games-page-only).
- Server-side filtering (all client-side, no API change).

## H. File inventory

| File | Action |
|------|--------|
| `src/app/games/page.tsx` | Add `decks` to `FilterState`, `deriveDeckOptions` export, `matchesAllFilters` branch, `deckFilters` state + handler, `<details>` UI |
| `tests/games-filter.test.ts` | New describe blocks for `deriveDeckOptions` and the `matchesAllFilters` deck branch |
