# Screwed Breakdowns — Design

**Date:** 2026-05-16
**Scope:** Add two new charts to the Stats page Breakdowns section — "Screwed by player" and "Screwed by deck" — extending the existing 1-row grid into a 2x2 grid.
**Status:** Approved, pending implementation plan.

## Context

The Stats page already exposes screwed-rate per player as one of four axes on the Player Overview radar, but there is no top-level "who gets screwed most often?" or "which decks get their pilot screwed?" view. The user wants explicit count-based charts to make this visible, mirroring the existing Wins-by-player / Games-by-deck pattern in the Breakdowns section.

## What ships

Two new pure compute helpers, two new chart components, and a 2x2 layout update in `src/app/stats/page.tsx`.

## A. New compute helpers in `src/lib/stats.ts`

### `computeScrewedByPlayerBar(games)`

- Returns `{ player: string; screwed: number }[]`, sorted by `screwed` descending.
- For each game, counts each participant's `isScrewed === true` flag.
- **Includes** imported games (matches existing D-17 — player-level stats include all games).
- Omits players with 0 screwed-counts (per D-19 zero-denominator rule).

### `computeScrewedByDeckPie(games)`

- Returns `{ deck: string; screwed: number }[]`, sorted by `screwed` descending, capped at top 15 (no "Other" bucket, matching the recently-updated `computeGamesByDeckPie`).
- For each non-imported game, group screwed participants by their `deckName` and count. Skips participants with null/empty/whitespace-only `deckName`.
- **Excludes** imported games (matches existing D-16 — deck-level stats exclude imports because imported games' decks are spreadsheet-derived best guesses, not the actual decks played).
- Omits decks with 0 screwed-counts.

Both functions are pure, no React, independently testable. They live alongside the existing `computeWinsByPlayerPie` and `computeGamesByDeckPie` helpers in `src/lib/stats.ts`.

## B. New chart components

### `src/app/stats/charts/ScrewedByPlayerBar.tsx`

- Horizontal bar chart, structurally equivalent to `WinsByPlayerPie.tsx` (which is, despite the misleading name, a horizontal bar chart).
- Props: `{ data: { player: string; screwed: number }[]; chartTokens: ChartTokens; height?: number }` — same shape as WinsByPlayerPie.
- Tooltip formatter says `"N screwed"`.
- Bar fill: `CHART_COLORS[2]` (a red-ish tone in the existing palette, semantically fitting "bad outcome") instead of `CHART_COLORS[0]` (the blue used by WinsByPlayer). One-color bar — not per-bar coloring.

### `src/app/stats/charts/ScrewedByDeckPie.tsx`

- Pie chart, structurally equivalent to `GamesByDeckPie.tsx`.
- Props: `{ data: { deck: string; screwed: number }[]; chartTokens: ChartTokens; height?: number }`.
- Tooltip formatter: `"N screwed (X%)"` — where X is the share of total screwed counts.
- Recharts `<Legend>` used (same pattern as GamesByDeckPie).

## C. Layout — 2x2 Breakdowns grid in `src/app/stats/page.tsx`

The existing Breakdowns section currently renders a 1x2 grid:

```
Breakdowns
┌─────────────────────┬─────────────────────┐
│ Wins by player      │ Games by deck       │  ← existing
│ (bar)               │ (pie, top 15)       │
└─────────────────────┴─────────────────────┘
```

Becomes a 2x2 grid:

```
Breakdowns
┌─────────────────────┬─────────────────────┐
│ Wins by player      │ Games by deck       │  ← Row 1 (existing)
│ (bar)               │ (pie, top 15)       │
├─────────────────────┼─────────────────────┤
│ Screwed by player   │ Screwed by deck     │  ← Row 2 (new)
│ (bar)               │ (pie, top 15)       │
└─────────────────────┴─────────────────────┘
```

### Implementation notes

- The existing `<div className="sm:grid sm:grid-cols-2 sm:gap-6">` is unchanged — CSS Grid auto-flows 4 items into 2 rows of 2.
- Two new entries in the `CHART_IDS` object:
  - `SCREWED_BY_PLAYER_BAR: 'screwed-by-player'`
  - `SCREWED_BY_DECK_PIE: 'screwed-by-deck'`
- Two new entries in `getSummary`:
  - `SCREWED_BY_PLAYER_BAR`: `${top.player} screwed most (${top.screwed})` when data exists, else `'No data yet'`.
  - `SCREWED_BY_DECK_PIE`: `${top.deck} screwed most (${top.screwed})` when data exists, else `'No data yet'`.
- The new pie's `ChartSection` gets `description="Showing top 15 decks"` — matching the new convention on Games-by-deck pie.
- The IIFE that computes `breakdownsHeight = Math.max(320, winsByPlayer.length * 40)` continues to govern all four cards. All four `ChartSection`s receive the same height, so the 2x2 stays visually aligned.

## D. Compute memos in stats/page.tsx

Two new `useMemo`s alongside the existing breakdown memos:

```ts
const screwedByPlayer = useMemo(() => computeScrewedByPlayerBar(games), [games]);
const screwedByDeck = useMemo(() => computeScrewedByDeckPie(games), [games]);
```

The IIFE's `breakdownsHeight` and the rest of the memo block remain untouched.

## E. Tests

In `tests/stats.test.ts`, add new test cases (parallel to the existing Wins-by-player and Games-by-deck blocks):

### `computeScrewedByPlayerBar` block

- Counts each participant's `isScrewed === true` across games.
- Omits players with 0 screwed-counts.
- Returns sorted descending by screwed count.
- **Includes imported games** — explicit test that a player screwed only in an imported game still appears.
- Empty input returns `[]`.

### `computeScrewedByDeckPie` block

- Counts screwed-participants grouped by their `deckName` in non-imported games.
- Skips null/empty/whitespace-only `deckName`.
- **Excludes imported games** — explicit test that a deck screwed only in an imported game is omitted.
- Returns sorted desc, top 15 (no "Other" entry).
- Test with 5 decks → 5 entries.
- Test with 20 decks → 15 entries, none of them "Other".
- Empty input returns `[]`.

## F. Out of scope

- Screwed RATE charts (percentage view). Already visible per-player on the radar; we picked counts for symmetry with sibling charts in the same section.
- Per-deck screwed rate (e.g., "this deck pilots get screwed 30% of games"). Could be future-flagged.
- Touching the Win Rates section. Unchanged.
- Re-ordering or renaming the existing "Wins by player" / "Games by deck" labels (despite the WinsByPlayerPie filename being misleading — it's a bar chart, not a pie; rename is out of scope here).

## G. File inventory

| File | Action |
|------|--------|
| `src/lib/stats.ts` | Add `computeScrewedByPlayerBar` + `computeScrewedByDeckPie` |
| `src/app/stats/charts/ScrewedByPlayerBar.tsx` | New file |
| `src/app/stats/charts/ScrewedByDeckPie.tsx` | New file |
| `src/app/stats/page.tsx` | Import + memo + 2 new `ChartSection` children + 2 new `CHART_IDS` + 2 new `getSummary` cases |
| `tests/stats.test.ts` | Two new describe blocks for the compute helpers |
