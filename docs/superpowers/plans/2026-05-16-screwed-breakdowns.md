# Screwed Breakdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new "Screwed by player" + "Screwed by deck" charts to the Stats page Breakdowns section, turning the existing 1x2 row into a 2x2 grid that shares the same `breakdownsHeight` IIFE.

**Architecture:** Two new pure compute helpers in `src/lib/stats.ts` (TDD), two new chart components mirroring `WinsByPlayerPie.tsx` (bar) and `GamesByDeckPie.tsx` (pie) shapes, and wiring in `src/app/stats/page.tsx` to add the four-card grid layout.

**Tech Stack:** Next.js 16, React 19, TypeScript, Recharts, Tailwind v4, Jest + ts-jest (path alias `@/` → `src/`).

**Spec:** `docs/superpowers/specs/2026-05-16-screwed-breakdowns-design.md`

---

## File Inventory

| File | Action |
|------|--------|
| `src/lib/stats.ts` | Modify — append `computeScrewedByPlayerBar` and `computeScrewedByDeckPie` |
| `tests/stats.test.ts` | Modify — add two new describe blocks; extend imports |
| `src/app/stats/charts/ScrewedByPlayerBar.tsx` | Create — horizontal bar component (CHART_COLORS[2] fill) |
| `src/app/stats/charts/ScrewedByDeckPie.tsx` | Create — pie component with legend, screwed tooltip |
| `src/app/stats/page.tsx` | Modify — dynamic imports, two memos, two CHART_IDS entries, two getSummary cases, two new ChartSection children in Breakdowns grid |

---

## Task 1: Add `computeScrewedByPlayerBar` to stats lib

**Files:**
- Modify: `src/lib/stats.ts` (append function)
- Modify: `tests/stats.test.ts` (extend imports + add describe block)

- [ ] **Step 1: Extend the stats.ts import block in `tests/stats.test.ts`**

The existing import block at the top of `tests/stats.test.ts` lists all the compute functions exported from `@/lib/stats`. Add `computeScrewedByPlayerBar` to that list (preserving the existing order; insert it logically near the other "By" helpers).

After your edit, the import block should include (among the other names):

```ts
  computeScrewedByPlayerBar,
```

- [ ] **Step 2: Write the failing tests**

At the bottom of `tests/stats.test.ts`, append:

```ts
describe('computeScrewedByPlayerBar (2026-05-16)', () => {
  it('returns empty array for empty input', () => {
    expect(computeScrewedByPlayerBar([])).toEqual([]);
  });

  it('counts isScrewed flags per player across all games', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
        mkParticipant('Bob'),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Alice', { isScrewed: true }),
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result).toEqual([
      { player: 'Alice', screwed: 2 },
      { player: 'Bob', screwed: 1 },
    ]);
  });

  it('omits players with 0 screwed counts (D-19)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
        mkParticipant('Bob'),
        mkParticipant('Carol'),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result.map((d) => d.player)).toEqual(['Alice']);
    expect(result.find((d) => d.player === 'Bob')).toBeUndefined();
    expect(result.find((d) => d.player === 'Carol')).toBeUndefined();
  });

  it('sorts by screwed count descending', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
        mkParticipant('Bob', { isScrewed: true }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
        mkParticipant('Alice'),
      ]),
      mkGame('2026-04-03', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true }),
        mkParticipant('Alice'),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result[0]).toEqual({ player: 'Bob', screwed: 3 });
    expect(result[1]).toEqual({ player: 'Alice', screwed: 1 });
  });

  it('INCLUDES imported games (D-17 — player-level stats include all games)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true }),
      ], { isImported: true }),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result).toEqual([{ player: 'Alice', screwed: 1 }]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/stats.test.ts`
Expected: import error / TypeScript compile error / "computeScrewedByPlayerBar is not a function" — the function doesn't exist yet.

- [ ] **Step 4: Implement the function in `src/lib/stats.ts`**

Append to the bottom of `src/lib/stats.ts`:

```ts
/**
 * Total screwed-count per player across ALL games (D-17 — player stats include
 * imported games). Omits players with 0 screwed counts. Sorted by screwed desc.
 * Mirrors computeWinsByPlayerPie shape.
 */
export function computeScrewedByPlayerBar(
  games: Game[]
): { player: string; screwed: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isScrewed) {
        map.set(p.playerName, (map.get(p.playerName) ?? 0) + 1);
      }
    }
  }
  return Array.from(map.entries())
    .filter(([, screwed]) => screwed > 0)
    .map(([player, screwed]) => ({ player, screwed }))
    .sort((a, b) => b.screwed - a.screwed);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/stats.test.ts`
Expected: all PASS. Note the previous total + 5 new tests = new total.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts tests/stats.test.ts
git commit -m "feat(stats): add computeScrewedByPlayerBar

Counts each participant's isScrewed flag, grouped by playerName,
including imported games. Mirrors the computeWinsByPlayerPie shape."
```

---

## Task 2: Add `computeScrewedByDeckPie` to stats lib

**Files:**
- Modify: `src/lib/stats.ts` (append function)
- Modify: `tests/stats.test.ts` (extend imports + add describe block)

- [ ] **Step 1: Extend the stats.ts import block in `tests/stats.test.ts`**

Add `computeScrewedByDeckPie` to the imports from `@/lib/stats`. After your edit, the import block should include both new names from Task 1 and Task 2:

```ts
  computeScrewedByPlayerBar,
  computeScrewedByDeckPie,
```

- [ ] **Step 2: Write the failing tests**

At the bottom of `tests/stats.test.ts`, append:

```ts
describe('computeScrewedByDeckPie (2026-05-16)', () => {
  it('returns empty array for empty input', () => {
    expect(computeScrewedByDeckPie([])).toEqual([]);
  });

  it('counts screwed-participants by their deckName in non-imported games', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Bob', { isScrewed: true, deckName: 'Goblins' }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Alice', { isScrewed: true, deckName: 'Atraxa' }),
        mkParticipant('Bob', { isWinner: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([
      { deck: 'Atraxa', screwed: 2 },
      { deck: 'Goblins', screwed: 1 },
    ]);
  });

  it('skips participants with null deckName', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: null }),
        mkParticipant('Bob', { isScrewed: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Goblins', screwed: 1 }]);
  });

  it('skips participants with empty / whitespace-only deckName', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: '' }),
        mkParticipant('Bob', { isScrewed: true, deckName: '   ' }),
        mkParticipant('Carol', { isScrewed: true, deckName: 'Elves' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Elves', screwed: 1 }]);
  });

  it('EXCLUDES imported games (D-16 — deck stats exclude imports)', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isScrewed: true, isWinner: true, deckName: 'Atraxa' }),
      ], { isImported: true }),
      mkGame('2026-04-02', [
        mkParticipant('Bob', { isScrewed: true, isWinner: true, deckName: 'Goblins' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result).toEqual([{ deck: 'Goblins', screwed: 1 }]);
  });

  it('returns all entries when fewer than 15 distinct decks', () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      mkGame('2026-04-01', [
        mkParticipant('P', { isScrewed: true, isWinner: true, deckName: `Deck${i}` }),
      ])
    );
    const result = computeScrewedByDeckPie(games);
    expect(result).toHaveLength(5);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });

  it('caps at top 15 and never includes Other', () => {
    const games: Game[] = [];
    for (let i = 0; i < 20; i++) {
      // Deck i screwed (i+1) times so the highest deck is at index 19 with 20 screws
      for (let j = 0; j <= i; j++) {
        games.push(
          mkGame('2026-04-01', [
            mkParticipant('P', { isScrewed: true, isWinner: true, deckName: `Deck${i}` }),
          ])
        );
      }
    }
    const result = computeScrewedByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
    expect(result[0]).toEqual({ deck: 'Deck19', screwed: 20 });
    expect(result[14].deck).toBe('Deck5');
  });

  it('sorts by screwed count descending', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('A', { isScrewed: true, isWinner: true, deckName: 'Less' }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('B', { isScrewed: true, isWinner: true, deckName: 'More' }),
      ]),
      mkGame('2026-04-03', [
        mkParticipant('C', { isScrewed: true, isWinner: true, deckName: 'More' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result[0]).toEqual({ deck: 'More', screwed: 2 });
    expect(result[1]).toEqual({ deck: 'Less', screwed: 1 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/stats.test.ts`
Expected: import/runtime error for `computeScrewedByDeckPie`.

- [ ] **Step 4: Implement the function in `src/lib/stats.ts`**

Append to the bottom of `src/lib/stats.ts`:

```ts
/**
 * Screwed counts per deck across NON-IMPORTED games (D-16 — deck stats exclude
 * imports because imported games' deckNames are spreadsheet-derived best guesses).
 * For each non-imported game, increments a deck's screwed count once per
 * participant who used that deck AND has isScrewed === true. Skips null/empty/
 * whitespace-only deckName. Returns top 15 sorted by screwed desc; no 'Other' bucket.
 * Mirrors computeGamesByDeckPie shape.
 */
export function computeScrewedByDeckPie(
  games: Game[]
): { deck: string; screwed: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const map = new Map<string, number>();
  for (const g of nonImported) {
    for (const p of g.participants) {
      if (!p.isScrewed) continue;
      const deck = p.deckName?.trim();
      if (!deck) continue;
      map.set(deck, (map.get(deck) ?? 0) + 1);
    }
  }
  const all = Array.from(map.entries())
    .filter(([, screwed]) => screwed > 0)
    .map(([deck, screwed]) => ({ deck, screwed }))
    .sort((a, b) => b.screwed - a.screwed);
  return all.slice(0, 15);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tests/stats.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts tests/stats.test.ts
git commit -m "feat(stats): add computeScrewedByDeckPie

Counts isScrewed participants grouped by their deckName, excluding
imported games. Returns top 15 sorted desc; no 'Other' bucket.
Mirrors computeGamesByDeckPie shape."
```

---

## Task 3: Create `ScrewedByPlayerBar.tsx` chart component

**Files:**
- Create: `src/app/stats/charts/ScrewedByPlayerBar.tsx`

This component mirrors `src/app/stats/charts/WinsByPlayerPie.tsx` (which, despite the name, is a horizontal bar chart). The only differences: data key is `screwed` instead of `wins`, tooltip says "screwed", bar fill uses `CHART_COLORS[2]` (a red-ish tone) for visual distinction.

- [ ] **Step 1: Create the file with full contents**

Create `src/app/stats/charts/ScrewedByPlayerBar.tsx`:

```tsx
"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface ScrewedByPlayerDatum {
  player: string;
  screwed: number;
}

interface Props {
  data: ScrewedByPlayerDatum[];
  chartTokens: ChartTokens;
  height?: number;
}

export default function ScrewedByPlayerBar({ data, chartTokens, height }: Props) {
  const resolvedHeight = height ?? Math.max(200, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <BarChart layout="vertical" data={data} margin={{ left: 60 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={chartTokens.border} />
        <XAxis type="number" tick={{ fontSize: 12, fill: chartTokens.muted }} />
        <YAxis
          type="category"
          dataKey="player"
          tick={{ fontSize: 12, fill: chartTokens.foreground }}
          width={60}
        />
        <Tooltip
          formatter={(value) => [`${Number(value)} screwed`, "Screwed"]}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
        <Bar dataKey="screwed" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean PASS. (The file is self-contained and only depends on already-installed packages and the existing `CHART_COLORS` export from `../page`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/stats/charts/ScrewedByPlayerBar.tsx
git commit -m "feat(stats): add ScrewedByPlayerBar chart component

Horizontal bar chart for screwed counts per player. Mirrors
WinsByPlayerPie shape; uses CHART_COLORS[2] (red-ish) for the bar
fill to visually distinguish 'bad outcome' from 'win'."
```

---

## Task 4: Create `ScrewedByDeckPie.tsx` chart component

**Files:**
- Create: `src/app/stats/charts/ScrewedByDeckPie.tsx`

Mirrors `src/app/stats/charts/GamesByDeckPie.tsx`. The differences: data key is `screwed` instead of `games`, tooltip says "N screwed (X%)".

- [ ] **Step 1: Create the file with full contents**

Create `src/app/stats/charts/ScrewedByDeckPie.tsx`:

```tsx
"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface ScrewedByDeckDatum {
  deck: string;
  screwed: number;
}

interface Props {
  data: ScrewedByDeckDatum[];
  chartTokens: ChartTokens;
  height?: number;
}

export default function ScrewedByDeckPie({ data, chartTokens, height }: Props) {
  const capped = data.length > 20 ? data.slice(0, 20) : data;
  const coloredData = capped.map((d, i) => ({
    ...d,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const total = capped.reduce((s, d) => s + d.screwed, 0);
  const resolvedHeight = height ?? 320;

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <PieChart>
        <Pie
          data={coloredData}
          dataKey="screwed"
          nameKey="deck"
          cx="50%"
          cy="50%"
          outerRadius={120}
        />
        <Tooltip
          formatter={(value, name) => {
            const v = Number(value);
            return [`${v} screwed (${total > 0 ? Math.round((v / total) * 100) : 0}%)`, String(name)];
          }}
          contentStyle={{
            background: chartTokens.surface,
            border: `1px solid ${chartTokens.border}`,
            color: chartTokens.foreground,
          }}
        />
        <Legend
          iconType="circle"
          formatter={(value: string) => (
            <span style={{ color: chartTokens.muted }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/stats/charts/ScrewedByDeckPie.tsx
git commit -m "feat(stats): add ScrewedByDeckPie chart component

Pie chart for screwed counts per deck. Mirrors GamesByDeckPie shape
with the data key renamed from 'games' to 'screwed' and tooltip
formatter updated to say 'N screwed (X%)'."
```

---

## Task 5: Wire the new charts into `src/app/stats/page.tsx`

**Files:**
- Modify: `src/app/stats/page.tsx`

Five sub-changes: imports (compute + dynamic chart imports), `CHART_IDS` extension, memos, `getSummary` cases, and two new `ChartSection` children inside the Breakdowns grid.

- [ ] **Step 1: Extend the `@/lib/stats` import block**

Find the existing imports near the top of `src/app/stats/page.tsx`:

```tsx
import {
  computePlayerWinRate,
  computeDeckWinRate,
  computeScrewedRate,
  computeWeeklyFrequency,
  computeMostLikelyToPlay,
  computeMostLikelyToPlayBump,
  computeWinsByPlayerPie,
  computeGamesByDeckPie,
  computePlayerRadar,
  filterGamesByTimeframe,
  type Timeframe,
} from '@/lib/stats';
```

Replace with:

```tsx
import {
  computePlayerWinRate,
  computeDeckWinRate,
  computeScrewedRate,
  computeWeeklyFrequency,
  computeMostLikelyToPlay,
  computeMostLikelyToPlayBump,
  computeWinsByPlayerPie,
  computeGamesByDeckPie,
  computeScrewedByPlayerBar,
  computeScrewedByDeckPie,
  computePlayerRadar,
  filterGamesByTimeframe,
  type Timeframe,
} from '@/lib/stats';
```

- [ ] **Step 2: Add dynamic chart imports**

Find the existing dynamic chart import block (currently around lines 24-30):

```tsx
const PlayerRadarCard = dynamic(() => import('./charts/PlayerRadarCard'), { ssr: false });
const PlayerWinRateBar = dynamic(() => import('./charts/PlayerWinRateBar'), { ssr: false });
const DeckWinRateBar = dynamic(() => import('./charts/DeckWinRateBar'), { ssr: false });
const WinsByPlayerPie = dynamic(() => import('./charts/WinsByPlayerPie'), { ssr: false });
const GamesByDeckPie = dynamic(() => import('./charts/GamesByDeckPie'), { ssr: false });
const WeeklyFrequencyLine = dynamic(() => import('./charts/WeeklyFrequencyLine'), { ssr: false });
const MostLikelyBump = dynamic(() => import('./charts/MostLikelyBump'), { ssr: false });
```

Append two new lines right after `GamesByDeckPie`:

```tsx
const PlayerRadarCard = dynamic(() => import('./charts/PlayerRadarCard'), { ssr: false });
const PlayerWinRateBar = dynamic(() => import('./charts/PlayerWinRateBar'), { ssr: false });
const DeckWinRateBar = dynamic(() => import('./charts/DeckWinRateBar'), { ssr: false });
const WinsByPlayerPie = dynamic(() => import('./charts/WinsByPlayerPie'), { ssr: false });
const GamesByDeckPie = dynamic(() => import('./charts/GamesByDeckPie'), { ssr: false });
const ScrewedByPlayerBar = dynamic(() => import('./charts/ScrewedByPlayerBar'), { ssr: false });
const ScrewedByDeckPie = dynamic(() => import('./charts/ScrewedByDeckPie'), { ssr: false });
const WeeklyFrequencyLine = dynamic(() => import('./charts/WeeklyFrequencyLine'), { ssr: false });
const MostLikelyBump = dynamic(() => import('./charts/MostLikelyBump'), { ssr: false });
```

- [ ] **Step 3: Extend the `CHART_IDS` object**

Find the existing `CHART_IDS` const (currently around lines 46-54):

```tsx
const CHART_IDS = {
  RADAR: 'player-radar',
  PLAYER_WIN_BAR: 'player-win-rate',
  DECK_WIN_BAR: 'deck-win-rate',
  WINS_BY_PLAYER_PIE: 'wins-by-player',
  GAMES_BY_DECK_PIE: 'games-by-deck',
  WEEKLY_FREQ: 'weekly-frequency',
  LIKELY_BUMP: 'most-likely-bump',
} as const;
```

Replace with (adding the two new entries right after `GAMES_BY_DECK_PIE`):

```tsx
const CHART_IDS = {
  RADAR: 'player-radar',
  PLAYER_WIN_BAR: 'player-win-rate',
  DECK_WIN_BAR: 'deck-win-rate',
  WINS_BY_PLAYER_PIE: 'wins-by-player',
  GAMES_BY_DECK_PIE: 'games-by-deck',
  SCREWED_BY_PLAYER_BAR: 'screwed-by-player',
  SCREWED_BY_DECK_PIE: 'screwed-by-deck',
  WEEKLY_FREQ: 'weekly-frequency',
  LIKELY_BUMP: 'most-likely-bump',
} as const;
```

- [ ] **Step 4: Add memos for the two new compute helpers**

Find the existing memo block inside `StatsPage()` (the block that defines `playerWinRate`, `winsByPlayer`, `gamesByDeck`, etc.). Add two new memo lines immediately after the `gamesByDeck` memo:

The block currently looks like (lines may have shifted):

```tsx
  const playerWinRate = useMemo(() => computePlayerWinRate(games), [games]);
  const deckWinRate = useMemo(() => computeDeckWinRate(games), [games]);
  const screwedRate = useMemo(() => computeScrewedRate(games), [games]);
  const mostLikelyToPlay = useMemo(() => computeMostLikelyToPlay(games), [games]);
  const winsByPlayer = useMemo(() => computeWinsByPlayerPie(games), [games]);
  const gamesByDeck = useMemo(() => computeGamesByDeckPie(games), [games]);
  const playerRadar = useMemo(() => computePlayerRadar(games), [games]);
```

Replace with (two new lines added after `gamesByDeck`):

```tsx
  const playerWinRate = useMemo(() => computePlayerWinRate(games), [games]);
  const deckWinRate = useMemo(() => computeDeckWinRate(games), [games]);
  const screwedRate = useMemo(() => computeScrewedRate(games), [games]);
  const mostLikelyToPlay = useMemo(() => computeMostLikelyToPlay(games), [games]);
  const winsByPlayer = useMemo(() => computeWinsByPlayerPie(games), [games]);
  const gamesByDeck = useMemo(() => computeGamesByDeckPie(games), [games]);
  const screwedByPlayer = useMemo(() => computeScrewedByPlayerBar(games), [games]);
  const screwedByDeck = useMemo(() => computeScrewedByDeckPie(games), [games]);
  const playerRadar = useMemo(() => computePlayerRadar(games), [games]);
```

- [ ] **Step 5: Add `getSummary` cases for the two new charts**

Find the existing `getSummary` function inside `StatsPage()`. It's a switch-style function with cases for each `CHART_IDS.*` value. Add two new cases right after the `GAMES_BY_DECK_PIE` case (which currently reads something like `case CHART_IDS.GAMES_BY_DECK_PIE: return gamesByDeck.length > 0 ? ...`).

Locate this region:

```tsx
      case CHART_IDS.GAMES_BY_DECK_PIE:
        return gamesByDeck.length > 0
          ? `${gamesByDeck[0].deck} most played`
          : 'No data yet';
      case CHART_IDS.WEEKLY_FREQ: {
```

Insert these two new cases between them (the order must be: GAMES_BY_DECK_PIE → SCREWED_BY_PLAYER_BAR → SCREWED_BY_DECK_PIE → WEEKLY_FREQ):

```tsx
      case CHART_IDS.GAMES_BY_DECK_PIE:
        return gamesByDeck.length > 0
          ? `${gamesByDeck[0].deck} most played`
          : 'No data yet';
      case CHART_IDS.SCREWED_BY_PLAYER_BAR:
        return screwedByPlayer.length > 0
          ? `${screwedByPlayer[0].player} screwed most (${screwedByPlayer[0].screwed})`
          : 'No data yet';
      case CHART_IDS.SCREWED_BY_DECK_PIE:
        return screwedByDeck.length > 0
          ? `${screwedByDeck[0].deck} screwed most (${screwedByDeck[0].screwed})`
          : 'No data yet';
      case CHART_IDS.WEEKLY_FREQ: {
```

- [ ] **Step 6: Add the two new ChartSection children inside the Breakdowns grid**

Find the Breakdowns section in the JSX (it starts with `{/* Section 3: Breakdowns */}`). The current structure inside is:

```tsx
              <div className="sm:grid sm:grid-cols-2 sm:gap-6">
              <ChartSection
                id={CHART_IDS.WINS_BY_PLAYER_PIE}
                title="Wins by player"
                ...
              >
                {winsByPlayer.length > 0 ? (
                  <WinsByPlayerPie data={winsByPlayer} chartTokens={chartTokens} height={breakdownsHeight} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
              <ChartSection
                id={CHART_IDS.GAMES_BY_DECK_PIE}
                title="Games by deck"
                description="Showing top 15 decks"
                ...
              >
                {gamesByDeck.length > 0 ? (
                  <GamesByDeckPie data={gamesByDeck} chartTokens={chartTokens} height={breakdownsHeight} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
            </div>
```

Add two new `ChartSection` children immediately after the GAMES_BY_DECK_PIE `</ChartSection>` and before the closing `</div>`. The two new cards mirror the existing two in structure:

```tsx
              <ChartSection
                id={CHART_IDS.SCREWED_BY_PLAYER_BAR}
                title="Screwed by player"
                summary={getSummary(CHART_IDS.SCREWED_BY_PLAYER_BAR)}
                expanded={expandedCharts.has(CHART_IDS.SCREWED_BY_PLAYER_BAR)}
                onToggle={() => toggleChart(CHART_IDS.SCREWED_BY_PLAYER_BAR)}
              >
                {screwedByPlayer.length > 0 ? (
                  <ScrewedByPlayerBar data={screwedByPlayer} chartTokens={chartTokens} height={breakdownsHeight} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
              <ChartSection
                id={CHART_IDS.SCREWED_BY_DECK_PIE}
                title="Screwed by deck"
                description="Showing top 15 decks"
                summary={getSummary(CHART_IDS.SCREWED_BY_DECK_PIE)}
                expanded={expandedCharts.has(CHART_IDS.SCREWED_BY_DECK_PIE)}
                onToggle={() => toggleChart(CHART_IDS.SCREWED_BY_DECK_PIE)}
              >
                {screwedByDeck.length > 0 ? (
                  <ScrewedByDeckPie data={screwedByDeck} chartTokens={chartTokens} height={breakdownsHeight} />
                ) : (
                  <EmptyChart />
                )}
              </ChartSection>
            </div>
```

After your edit, the Breakdowns grid `<div className="sm:grid sm:grid-cols-2 sm:gap-6">` contains four `ChartSection` children in this order: WINS_BY_PLAYER_PIE → GAMES_BY_DECK_PIE → SCREWED_BY_PLAYER_BAR → SCREWED_BY_DECK_PIE. CSS Grid auto-flows them into a 2x2.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean PASS (zero errors).

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: previous total + 13 new tests (5 from Task 1, 8 from Task 2) all passing. The only pre-existing failure is `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` — that one is known and unrelated to this work. Any other failure is a regression to fix.

- [ ] **Step 9: Commit**

```bash
git add src/app/stats/page.tsx
git commit -m "feat(stats): wire Screwed-by-player and Screwed-by-deck into Breakdowns 2x2

- Imports the two new compute helpers and the two new chart components.
- Adds SCREWED_BY_PLAYER_BAR and SCREWED_BY_DECK_PIE entries to CHART_IDS.
- Memoizes screwedByPlayer and screwedByDeck alongside existing breakdowns.
- Adds two new getSummary cases (top player/deck + their screwed count).
- Adds two new ChartSection children to the Breakdowns grid so the
  existing sm:grid-cols-2 auto-flows into a 2x2 layout. The shared
  breakdownsHeight (max(320, winsByPlayer.length * 40)) now sizes all
  four cards consistently.
"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass except the pre-existing `tests/cron-sync.test.ts` failure. Confirm the new `computeScrewedByPlayerBar` (5 tests) and `computeScrewedByDeckPie` (8 tests) all pass.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: same pre-existing 114 problems / 101 errors / 13 warnings as before. No new lint errors introduced. (If the count goes up by 1+, identify the new entry and fix it.)

- [ ] **Step 4: Spot-check the new files exist and are referenced**

Run:
```
grep -n "computeScrewedByPlayerBar\|computeScrewedByDeckPie" src/lib/stats.ts
grep -n "ScrewedByPlayerBar\|ScrewedByDeckPie" src/app/stats/page.tsx
ls -la src/app/stats/charts/Screwed*.tsx
```
Expected:
- Two function definitions and two exports in `src/lib/stats.ts`.
- At least 4 references in `src/app/stats/page.tsx` (import + dynamic + JSX usage for each of the two components).
- Two new files: `ScrewedByPlayerBar.tsx` and `ScrewedByDeckPie.tsx`.

- [ ] **Step 5: Dev-server smoke test (optional if dev server is inconvenient)**

Run: `npm run dev`
Open `http://localhost:3000/stats` in a browser.

Expected:
- The Breakdowns section now renders as a 2x2 grid on desktop (`sm:` breakpoint and up).
- Row 1: Wins by player (bar) | Games by deck (pie with "Showing top 15 decks" subhead).
- Row 2: Screwed by player (bar, red-ish fill) | Screwed by deck (pie with "Showing top 15 decks" subhead).
- All four cards same height (breakdownsHeight = max(320, winsByPlayer.length * 40)).
- Mobile (below `sm:` breakpoint): four collapsible cards stacked vertically. Each header summary shows the right text (e.g., "Alice screwed most (5)").

Kill the dev server when done.

---

## Self-Review

**Spec coverage:** Every section of the spec has at least one task:
- Section A (two compute helpers) → Tasks 1 + 2.
- Section B (two chart components) → Tasks 3 + 4.
- Section C (Breakdowns 2x2 layout) → Task 5 (Step 6).
- Section D (memos) → Task 5 (Step 4).
- Section E (tests) → Tasks 1 + 2 (TDD inline).
- Section F (out of scope) → not implemented, by design.
- Section G (file inventory) → matches the File Inventory at top of plan.

**Placeholder scan:** No TBD/TODO/"similar to" placeholders. Every code block is complete.

**Type consistency:**
- `computeScrewedByPlayerBar` returns `{ player: string; screwed: number }[]` — same shape in Task 1 impl, Task 3 chart `ScrewedByPlayerDatum`, and Task 5 memo + JSX.
- `computeScrewedByDeckPie` returns `{ deck: string; screwed: number }[]` — same shape in Task 2 impl, Task 4 chart `ScrewedByDeckDatum`, and Task 5 memo + JSX.
- `CHART_IDS.SCREWED_BY_PLAYER_BAR` and `CHART_IDS.SCREWED_BY_DECK_PIE` strings (`'screwed-by-player'`, `'screwed-by-deck'`) are used consistently in Task 5 Steps 3, 5, and 6.
- Chart component `Props.height?: number` is optional in both new components; Task 5 passes `breakdownsHeight` (defined elsewhere in stats/page.tsx).
