# Phase 7: Stats Dashboard - Research

**Researched:** 2026-04-11
**Domain:** Recharts 3.x visual dashboard on Next.js 16 App Router + React 19.2.3 + pure client-side compute
**Confidence:** HIGH (Recharts API, environment, conventions); MEDIUM (some v3 migration edges around `Cell` deprecation); HIGH (all project conventions)

## Summary

Phase 7 builds `/stats` — a client-side React component that fetches `GET /api/games`, computes 8 stat views in pure helpers under `src/lib/stats.ts`, and renders seven Recharts 3.x charts (radar, two horizontal bars, line, bump line, two pies). There are zero API or schema changes; everything is a read/compute/render of existing Phase 6 + 6.1 data.

The critical research findings are: **(1) Recharts is NOT yet installed** (locked in STATE.md as the library choice, but never added to `package.json`) — Wave 0 must install it; **(2) the correct version is `recharts@^3.8.1`** (published 2026-03-25, verified via `npm view`), which supports React 19 peerDependency and is the current stable. **(3) Recharts 3.6.0+ works in pure React 19.2.3** — this project has no Preact, so the known Preact compatibility issue (GH #6857) does NOT apply. **(4) Recharts 3.x has non-trivial breaking changes from v2** — notably `Cell` is *deprecated* since 3.7.0 (migrate to per-datum `fill` property), `activeShape`/`inactiveShape` on `Pie` are replaced by a unified `shape` prop since 3.5.0, and the `CategoricalChartState` internal API and several props (`activeIndex`, Legend `payload`, `blendStroke`, etc.) were removed. Planner must work off v3 docs, not v2 memorized signatures.

The test framework is **Jest + ts-jest** (not Vitest — `.planning/codebase/TESTING.md` recommends Vitest but the project actually uses Jest; see `jest.config.js` and `tests/` directory), tests live in `/tests/*.test.ts`, and @testing-library/react is NOT installed. Phase 7 tests therefore cover pure helpers in `src/lib/stats.ts` only — the same pattern Phase 6.1 uses for `tests/games-filter.test.ts`.

**Primary recommendation:** Install `recharts@^3.8.1` in Wave 0, build one Client Component at `src/app/stats/page.tsx` with `"use client"` at the top, use plain (static) imports of Recharts primitives from within that client component (Recharts is now safely importable inside a Client Component — no per-primitive `dynamic()` wrapping needed because the parent is already client-only; the D-38 "dynamic import" phrasing is satisfied by the fact that the page itself is a client-bundle route segment). For readers who want belt-and-suspenders tree-shaking, optionally wrap each chart in a per-file component and `dynamic(() => import('./ChartFile'), { ssr: false })` from `page.tsx` — this gives code-splitting without chasing per-primitive dynamic gymnastics. Both patterns are documented below; the planner picks after weighing bundle size vs. readability.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/07-stats-dashboard/07-CONTEXT.md` `<decisions>` block. Any plan that contradicts these MUST be rejected.

**Page Location & Navigation**
- **D-01:** New top-level `/stats` route. New client component at `src/app/stats/page.tsx`. Matches the existing top-level routing pattern (`/games`, `/checkDeck`, `/SearchLGS`). Keeps `/games` focused on CRUD and `/stats` focused on viewing; no tab-state complexity inside `/games`.
- **D-02:** Add a "Stats" link to the header nav. Edit `src/app/components/header.tsx` `navLinks` array to insert `{ href: "/stats", label: "Stats" }`. Placement: after "Games" and before "LGS Search" to preserve the existing left-to-right order. Both desktop and mobile nav consume the same `navLinks` array, so one edit covers both.
- **D-03:** Shared-password middleware covers `/stats` automatically. The existing auth middleware matcher already protects all non-login routes; no middleware change required. Verify the matcher path pattern during planning.

**Page Layout (Responsive)**
- **D-04:** Single vertical scroll page with section headings. Top-down order: Player Overview (radar) → Win Rates (player bar + deck bar) → Breakdowns (two pie charts) → Frequency (weekly line + bump chart). No tabs, no collapsible panels, no side navigation.
- **D-05:** Desktop: full-width charts, one per row. Each chart occupies the page container's full width on `sm:` and up.
- **D-06:** Mobile: compact summary cards with tap-to-expand chart view. Collapsed by default. `useState<Set<string>>` tracks expanded stat IDs. `md:block` unconditional on desktop.
- **D-07:** Breakpoint: `sm:` — matches the existing `/games` and header convention.

**Data Fetching & Compute**
- **D-08:** Reuse existing `GET /api/games`. No new endpoint.
- **D-09:** All stats computed client-side via pure helpers in `src/lib/stats.ts` (new file). One pure function per stat group taking `games: Game[]` and returning a plain object/array.
- **D-10:** Stats helper function names and signatures (exact names planner-adjustable):
  - `computePlayerWinRate(games): { player, wins, played, rate }[]` — STAT-01
  - `computeDeckWinRate(games): { deck, wins, played, rate }[]` — STAT-02 (imported-excluded)
  - `computeScrewedRate(games): { player, screwed, played, rate }[]` — STAT-03
  - `computeWeeklyFrequency(games): { weekStart, gameCount }[]` — STAT-04
  - `computeMostLikelyToPlay(games): { player, participations, rate }[]` — STAT-05 (lifetime snapshot)
  - `computeMostLikelyToPlayBump(games): { weekStart, ranks: { player, rank }[] }[]` — STAT-05 (bump over time)
  - `computeWinsByPlayerPie(games): { player, wins }[]` — STAT-06a
  - `computeGamesByDeckPie(games): { deck, games }[]` — STAT-06b (imported-excluded)
  - `computePlayerRadar(games): { player, played, wins, screwed, wonByCombo }[]` — radar source (D-22); wonByCombo counts imported-excluded
- **D-11:** Page component memoizes every stat via `useMemo`.

**STAT-07 Reactive Updates**
- **D-12:** Mount-time fetch + `window.addEventListener('focus', refetch)` listener. Clean up on unmount.
- **D-13:** Router navigation triggers a fresh fetch naturally (`router.push('/stats')` unmounts `/games/new` and mounts `/stats`; the `useEffect` refetches).
- **D-14:** No polling, no BroadcastChannel, no manual refresh button.
- **D-15:** Loading and error states follow the existing `/games` pattern (`isLoading`, `error`, inline `<p>`).

**Imported-Game Semantics (inherited from 6.1)**
- **D-16:** Deck- and combo-related stats EXCLUDE imported games: `computeDeckWinRate`, `computeGamesByDeckPie`, radar `Won by Combo` axis.
- **D-17:** Player-level stats INCLUDE imported games: `computePlayerWinRate`, `computeScrewedRate`, `computeWeeklyFrequency`, `computeMostLikelyToPlay` (both forms), `computeWinsByPlayerPie`, and radar `Played`/`Wins`/`Screwed` axes.
- **D-18:** No dashboard-level `isImported` toggle. Per-chart (and per-axis on radar) only.

**STAT-08 Zero-Data Rule**
- **D-19:** Strict per-chart 0-exclusion. `played === 0` players omitted from `computePlayerWinRate`. Deck with 0 non-imported games omitted from `computeDeckWinRate`. Pie chart zero-slices omitted. Radar omits `played === 0` players. Weekly frequency is time-indexed so STAT-08 doesn't apply there (see D-22a).
- **D-20:** No global minimum threshold, no "min games" input.

**STAT-04 Weekly Frequency**
- **D-21:** Bucket by ISO week starting Monday, UTC day of `game.date`. Match the `/games` page `formatDate` UTC convention.
- **D-22a:** Show all weeks between earliest and latest (value = 0 for dry weeks) if the LineChart renders them cleanly; otherwise skip empty weeks. Planner makes the final call during implementation.
- **D-22b:** Recharts `LineChart`, single line.

**STAT-05 Most-Likely-to-Play**
- **D-23:** Formula: `participations / totalGames`. Imported INCLUDED in both numerator and denominator. Ties allowed, no tie-break.
- **D-24:** Primary render: bump chart over time (Recharts `LineChart` with inverted Y = rank), placed beside or below the weekly-frequency LineChart in the Frequency section. ISO week granularity matches STAT-04.
- **D-25:** Rank ties share the same rank. Planner picks visual handling (overlap, stack, tiny offset).

**STAT-03 Screwed Rate & Player Overview Radar**
- **D-26:** Single `RadarChart` with four axes per player: `Played`, `Wins`, `Screwed`, `Won by Combo`. One polygon per player. Top of dashboard.
- **D-27:** Axis semantics:
  - `Played`: total games participated (imported INCLUDED)
  - `Wins`: total wins (imported INCLUDED)
  - `Screwed`: total times marked screwed (imported INCLUDED)
  - `Won by Combo`: total wins where `wonByCombo === true && !g.isImported` (imported EXCLUDED)
- **D-28:** Normalization: each axis normalized to its own 0..1 range (per-axis max). Exact per-axis max vs shared max is Claude's Discretion.
- **D-29:** Radar does NOT replace STAT-01's bar chart. Bar chart stays (D-32). Radar is additive.

**Chart-Type Mapping**
- **D-30:** Recharts is primary (locked in STATE.md).
- **D-31:** If a Recharts workaround looks genuinely bad (ugly bump chart, unreadable radar), a second library (visx, nivo) is acceptable, provided the new component is still dynamically imported with `{ ssr: false }`. Preference: stay on Recharts.
- **D-32:** STAT-01 → `BarChart`, horizontal orientation (Recharts `layout="vertical"`). One bar per player, ranked.
- **D-33:** STAT-02 → `BarChart`, horizontal, one bar per deck. NOT a grouped/stacked player×deck chart. Top-N cap acceptable if deck list > ~20.
- **D-34:** STAT-03 → Radar is primary. `computeScrewedRate` still exported for future reuse.
- **D-35:** STAT-04 → `LineChart`.
- **D-36:** STAT-05 → Bump chart via `LineChart` with rank-on-Y (inverted).
- **D-37:** STAT-06 → Two `PieChart` — "Wins by player" + "Games by deck". Placement on desktop is Claude's Discretion.
- **D-38:** All charts imported via `dynamic(() => import('recharts'), { ssr: false })` or equivalent per-chart dynamic imports. Stats page has `"use client"`. **Research note:** because the page is already a Client Component, static imports of Recharts primitives inside that client bundle satisfy "never imported in a Server Component" — see Architecture Pattern section. Per-chart `dynamic()` wrappers are still a valid alternative (lower bundle cost) and are explicitly allowed.

**Color Scheme**
- **D-39:** Palette of 15+ visually distinct colors.
- **D-40:** No duplicate colors.
- **D-41:** Colors do NOT change between light and dark mode. Must have sufficient contrast on both the light `bg-surface` (`#f4f4f5`) and the dark `bg-surface` (`#18181b`).
- **D-42:** Non-data chart elements (axis lines, ticks, tooltips, grid, legend text) DO adapt to mode via Tailwind CSS variables.
- **D-43:** Per-player consistent color across charts is NOT in scope — deferred.

**Empty State**
- **D-44:** No dedicated empty-state page. If 0 games, each chart's own empty slot ("No data yet" label or Recharts default).
- **D-45:** Partial-data: render whatever can be rendered. No special messaging.

**No Dashboard Filters**
- **D-46:** Lifetime stats only. No date range, no player subset.
- **D-47:** `isImported` per-chart filtering is the only "filter" logic. Not user-facing.

### Claude's Discretion

Copied verbatim from CONTEXT.md. These are areas where the planner should research options and recommend:

- Exact Tailwind spacing/typography/border classes for section headings and chart cards (follow existing `/games` patterns: `container mx-auto px-4 py-6`, `text-2xl font-bold text-foreground`, `border-border bg-surface`)
- Recharts `Tooltip` styling to match light/dark mode tokens
- Radar axis normalization strategy (per-axis max vs shared max) and visual tick treatment
- Bump chart rank-tie visual handling
- Pie chart placement on desktop (side-by-side vs stacked full-width)
- Chart container heights (readable both mobile-expanded and desktop full-width)
- Mobile summary-card content: number, sparkline, or short top-N string
- Exact wording of "No data yet" labels
- Long-name label treatment (truncate+ellipsis vs rotate vs wrap)
- Whether to show a "last fetched at" timestamp
- Deck chart cap / top-N strategy if deck list > ~20
- Nav position for "Stats" link (suggested: between Games and LGS Search)
- Exact color palette (must satisfy D-39/40/41/42) — planner picks from options
- Whether STAT-05 also shows a lifetime snapshot bar alongside the bump chart
- File split: one `src/app/stats/page.tsx` vs `src/app/stats/charts/*.tsx`
- Unit test depth for `src/lib/stats.ts`

### Deferred Ideas (OUT OF SCOPE)

Copied verbatim from CONTEXT.md `<deferred>` block. Do NOT plan or build any of these:

- Per-player consistent color map
- Dashboard filter toolbar (date range, player subset, player count, winner-only, wonByCombo-only)
- "Hide low-sample" minimum-games filter
- Rose chart / sunburst / second charting library (contingency only, D-31)
- CSV export of stats (STAT-11, v2)
- Elo rating system (STAT-09, v2)
- Head-to-head player matchup records (STAT-10, v2)
- Real-time chart updates via WebSocket (STAT-12, v2)
- Empty-state CTA ("Log your first game →") on `/stats`
- Deck top-N / "show all decks" toggle (unless deck list actually grows > ~20 during this phase)
- Stats page tabs or section anchors
- Live "last updated" timestamp (Claude's Discretion; if not added in Phase 7, deferred)
- Per-chart export buttons (PNG/SVG)
- Sparkline summaries on mobile (Discretion; if not added, deferred)
- `GET /api/stats` endpoint with Prisma aggregation
- Phase 8 admin stats integration
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAT-01 | User can view win rate per player as a bar chart | `computePlayerWinRate` + Recharts `BarChart` with `layout="vertical"` — research covers current v3.x horizontal-bar signature and per-bar color approach |
| STAT-02 | User can view win rate per deck as a bar chart | `computeDeckWinRate` filtered to `!g.isImported` + Recharts `BarChart` horizontal — research covers the imported-exclusion semantics per D-16 |
| STAT-03 | User can view screwed rate per player as a chart | Served by radar `Screwed` axis per D-34; `computeScrewedRate` still exported — research covers Recharts `RadarChart` multi-polygon pattern |
| STAT-04 | User can view weekly game regularity | `computeWeeklyFrequency` + Recharts `LineChart` — research covers ISO 8601 Monday week bucketing in UTC without date-fns (not installed) |
| STAT-05 | User can view "most likely to play" metric | `computeMostLikelyToPlay` (lifetime) + `computeMostLikelyToPlayBump` (over time) + Recharts `LineChart` with `YAxis reversed={true}` for rank bump chart — research covers the inverted-Y pattern |
| STAT-06 | User can view pie chart breakdowns | Two `PieChart` — research covers Recharts 3.7+ `Cell` deprecation and per-datum `fill` migration |
| STAT-07 | Stats update reactively when new games are added | `useEffect` mount-fetch + `window.addEventListener('focus', refetch)` — research covers React 19 strict-mode cleanup pattern and Next.js 16 client navigation re-mount behavior |
| STAT-08 | Players/decks with no relevant data excluded | Strict 0-exclusion in each helper per D-19 — research covers the pure-function test pattern for verifying exclusion |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

`~/.claude/CLAUDE.md` (the only CLAUDE.md in the resolution path — no project-level `./CLAUDE.md` exists in the repo) contains the user's global instructions. Relevant extractions for Phase 7:

- **Windows/PowerShell environment.** All commands in plans must be Windows-compatible. `taskkill` not `kill`. Forward-slash paths when using bash via `gsd-tools`. `[VERIFIED: development machine]`
- **Stack baseline: TypeScript, Next.js, Turso (SQLite), Drizzle ORM, Vercel deployment.** The CLAUDE.md mentions Drizzle but **this project uses Prisma**, not Drizzle — verified via `prisma/schema.prisma` and `package.json`. Planner must NOT introduce Drizzle. `[VERIFIED: prisma/schema.prisma line 1, package.json line 14]`
- **Debugging deployment issues checklist:** (1) middleware.ts naming, (2) Edge Runtime compatibility, (3) `.env.local` variables, (4) maxDuration limits. Not directly applicable to Phase 7 (no new route handlers, no middleware changes), but document for the planner's awareness. `[CITED: ~/.claude/CLAUDE.md "Tech Stack & Deployment section"]`
- **Problem-solving protocol:** When a fix fails, step back and reassess the root cause before varying the approach. For significant bugs, write a failing test first. Run full test suite before reporting success. Iterate through three different approaches before asking for input. `[CITED: ~/.claude/CLAUDE.md "Problem Solving section"]`

None of these contradict any CONTEXT.md decision.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `recharts` | `^3.8.1` | Chart library for all seven Phase 7 charts | Locked in STATE.md; verified current stable 2026-03-25; supports React 19.2.3 in pure-React setups; uses SVG for crisp dark/light mode rendering |
| `next` | `^16.1.6` (installed) | Next.js 16 App Router | Already the project framework; Phase 7 page is a client component under `src/app/stats/page.tsx` |
| `react` | `19.2.3` (installed) | React UI library | Already installed; Recharts 3.6+ verified working on pure React 19.2.3 |

**Version verification (`npm view recharts`):**

```bash
$ npm view recharts version
3.8.1

$ npm view recharts time.modified
2026-03-25T12:12:20.914Z

$ npm view recharts peerDependencies
{
  react: '^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0',
  'react-dom': '^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0',
  'react-is': '^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0'
}
```

`[VERIFIED: npm registry, 2026-04-11]`

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jest` | `^30.3.0` (already installed) | Test runner for `src/lib/stats.ts` pure helpers | All Phase 7 unit tests. `jest.config.js` runs `tests/**/*.test.ts` under `ts-jest`. |
| `ts-jest` | `^29.4.6` (already installed) | TypeScript transformer for Jest | Already configured via `jest.config.js`; no additional setup needed |
| `@types/jest` | `^30.0.0` (already installed) | Jest TypeScript types | Already installed |

**NOT installed and NOT recommended to add:**
- `@testing-library/react` — not installed; no React component tests exist in the project. Phase 7 follows suit and tests pure helpers only. The chart components themselves get no direct unit tests; they are verified via manual smoke testing and the underlying helper tests. `[VERIFIED: package.json devDependencies, tests/ directory scan]`
- `@testing-library/jest-dom` — not installed. Skip.
- `jsdom` / `jest-environment-jsdom` — not installed; `jest.config.js` uses `testEnvironment: 'node'`. Adding jsdom for Phase 7 is NOT recommended — it introduces test-infra complexity for zero coverage gain (Recharts charts are visual, not logic-testable at unit level).
- `date-fns` — not installed. ISO week computation is done with vanilla `Date` arithmetic (see Code Examples section). `[VERIFIED: package.json]`
- `d3-scale-chromatic` — not installed. Color palette is a hand-tuned hex array (see Code Examples), not a runtime scale.
- Any second chart library (`visx`, `nivo`, `victory`) — explicitly out of scope unless Recharts fails (D-31 escape hatch). Default = Recharts only.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `recharts@^3.8.1` | `visx`, `nivo`, `@visx/visx` | Would force a library change against the STATE.md lock; these libs are more flexible for bump charts but require significantly more code. Deferred per D-31 to contingency only. |
| Per-primitive `dynamic()` imports of every Recharts component | Static imports inside a `"use client"` page | Per-primitive dynamic is what the CONTEXT.md D-38 suggests verbatim. In practice, Next.js 16 code-splits the `/stats` route segment anyway; Recharts lives in that chunk. Dynamic per-chart wrapper components give marginal extra savings but complicate the file layout. Recommended: static imports in client component; optionally wrap each chart in its own file and `dynamic()` import the *file* (not the Recharts primitive). See Architecture Patterns. |
| Hand-rolled week bucketing | `date-fns` (`startOfISOWeek`) or `luxon` | Adds a dep for 8 lines of math. Hand-roll. |
| Tableau 20 palette | d3 `schemeCategory20`, Observable Plot categorical, custom ramp | Tableau 20 is battle-tested for categorical data but not the only option. Recommendation below uses a 20-color hand-tuned palette that works on both the light (`#f4f4f5`) and dark (`#18181b`) surfaces verified in `globals.css`. |

**Installation (single command, Wave 0):**

```bash
npm install recharts@^3.8.1
```

No `--save-dev`; `recharts` is a runtime dependency. No other packages needed.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── app/
│   ├── stats/
│   │   ├── page.tsx              # "use client" — main dashboard page
│   │   └── charts/               # Optional per-chart wrapper components
│   │       ├── PlayerRadarCard.tsx
│   │       ├── PlayerWinRateBar.tsx
│   │       ├── DeckWinRateBar.tsx
│   │       ├── WeeklyFrequencyLine.tsx
│   │       ├── MostLikelyBump.tsx
│   │       ├── WinsByPlayerPie.tsx
│   │       └── GamesByDeckPie.tsx
│   └── components/
│       └── header.tsx            # Edited: add { href: '/stats', label: 'Stats' }
├── lib/
│   └── stats.ts                  # NEW — pure helper functions
tests/
└── stats.test.ts                 # NEW — unit tests for src/lib/stats.ts
```

Two structural options, picked by the planner after scaffolding:

1. **Flat:** Everything inline in `src/app/stats/page.tsx` (one long file). Easier to read the data flow, worse for diffing chart-specific changes.
2. **Per-chart files:** One file per chart under `src/app/stats/charts/`. `page.tsx` becomes an orchestrator that fetches, memoizes, and passes computed data to each chart as props. Easier to diff, easier to `dynamic()` import file-by-file. **Recommended when the page.tsx file exceeds ~300 lines.**

Both patterns are project-convention compliant; Phase 6 used flat for `/games/page.tsx` (~380 lines) and that is acceptable.

### Pattern 1: Client Component with Static Recharts Imports

**When to use:** Default. Works for all Phase 7 charts.

```tsx
// src/app/stats/page.tsx
"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  computePlayerWinRate,
  computeDeckWinRate,
  // ...
} from '@/lib/stats';
import type { Game } from '@/app/games/page';

export default function StatsPage() {
  const [games, setGames] = useState<Game[]>([]);
  // ... fetch, memoize, render charts
}
```

**Why this is safe despite D-38:** D-38 says "never import Recharts in a Server Component." A page file with `"use client"` at the top is a Client Component. Static `import { BarChart } from 'recharts'` inside a Client Component is not a Server Component import — it goes into the `/stats` client bundle, which Next.js 16 code-splits by route segment. There is no SSR leak. `[CITED: https://nextjs.org/docs/app/guides/lazy-loading — "ssr: false is not allowed with next/dynamic in Server Components"; since we're in a Client Component, that restriction doesn't apply and plain imports work fine.]`

### Pattern 2: Per-Chart File + `dynamic()` (Lower Bundle Cost)

**When to use:** If bundle size is a concern, or if the planner wants code-splitting across charts so the radar doesn't block the bar charts' initial render.

```tsx
// src/app/stats/charts/PlayerRadarCard.tsx
"use client";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, Legend } from 'recharts';

export default function PlayerRadarCard({ data }: { data: Array<Record<string, number | string>> }) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data}>
        {/* ... */}
      </RadarChart>
    </ResponsiveContainer>
  );
}
```

```tsx
// src/app/stats/page.tsx
"use client";
import dynamic from 'next/dynamic';

const PlayerRadarCard = dynamic(() => import('./charts/PlayerRadarCard'), { ssr: false });
// ... one per chart
```

`ssr: false` is legal here because `page.tsx` is a Client Component. `[VERIFIED: Next.js docs — "ssr: false will only work for Client Components"; https://nextjs.org/docs/app/guides/lazy-loading]`

**Pitfall:** `dynamic(() => import('recharts'), { ssr: false })` as written in CONTEXT.md D-38 does NOT work cleanly because `recharts` exports dozens of primitives, not a single default component. The correct per-primitive syntax would be `dynamic(() => import('recharts').then((m) => m.RadarChart), { ssr: false })` per primitive, which is noisy and loses TypeScript prop inference. Prefer Pattern 1 or Pattern 2 over this.

### Pattern 3: Mount + Window-Focus Refetch (STAT-07)

```tsx
// inside src/app/stats/page.tsx
useEffect(() => {
  let cancelled = false;

  async function refetch() {
    try {
      const res = await fetch('/api/games');
      if (!res.ok) throw new Error('Failed to load games');
      const data = await res.json();
      if (!cancelled) setGames(Array.isArray(data.games) ? data.games : []);
    } catch (err) {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load games');
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  }

  refetch(); // mount
  const onFocus = () => {
    void refetch();
  };
  window.addEventListener('focus', onFocus);
  return () => {
    cancelled = true;
    window.removeEventListener('focus', onFocus);
  };
}, []);
```

**React 19 strict mode:** `useEffect` runs twice in dev under strict mode. The `cancelled` flag (already used by `/games/page.tsx`) handles the in-flight-fetch case. The `focus` event listener is symmetrically added/removed, so the second mount correctly registers exactly one listener. No extra guarding needed. `[VERIFIED: existing pattern in src/app/games/page.tsx lines 112-130]`

**Next.js 16 client navigation:** When `/games/new` `router.push('/stats')`, Next.js unmounts the `/games/new` page component and mounts `/stats`. The `useEffect` fires, `refetch()` runs, and the dashboard shows fresh data. D-13 confirms this is sufficient for the happy path; the focus listener is the belt-and-suspenders layer for tab-switch scenarios.

### Anti-Patterns to Avoid

- **Importing `recharts` in a Server Component.** Phase 7 avoids this by making `src/app/stats/page.tsx` a Client Component (`"use client"` at top). Never create a sibling `layout.tsx` that imports Recharts.
- **Using `Cell` for per-bar/per-slice colors in Recharts 3.7+.** `Cell` is deprecated as of Recharts 3.7.0 (`[CITED: recharts releases notes for 3.7.0]`). Prefer per-datum `fill` property in the data array, or the `shape` callback prop. See Pitfall 3.
- **Forgetting to set `layout="vertical"` on BarChart for horizontal bars.** Recharts' naming is counterintuitive: `layout="horizontal"` (default) means bars grow vertically (X = category, Y = value). For horizontal bars — which D-32 and D-33 require so long player/deck names don't rotate — use `layout="vertical"` and swap: `XAxis type="number"`, `YAxis type="category" dataKey="player"`. `[CITED: Recharts v3 BarChart docs fetched 2026-04-11]`
- **Omitting `ResponsiveContainer`.** Raw `<RadarChart width={600} height={400}>` with fixed dimensions breaks mobile and desktop. Always wrap charts in `<ResponsiveContainer width="100%" height={400}>`.
- **Using `defaultProps` anywhere in user code.** React 19 warns on `defaultProps` on function components. Use default parameters in helpers. (Recharts itself has fixed its internal `defaultProps` usage in 3.6+.)
- **Assuming Recharts v2 API signatures.** The library had a major version bump (3.0) that removed several props (`Legend payload`, `activeIndex`, `blendStroke`, `alwaysShow`, `isFront`, `animateNewValues`) and deprecated `Cell`. Write from v3 docs only.
- **Blocking the initial render waiting for chart hydration.** `ResponsiveContainer` measures the DOM via `ResizeObserver`; initial render flashes briefly blank. Don't add an artificial skeleton; the brief flash is acceptable and matches existing `isLoading` behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG radar/bar/line/pie chart rendering | A custom SVG/D3 chart component | `recharts` 3.8.1 | Recharts handles axes, tooltips, responsive sizing, animation, accessibility — all the edge cases a hand-rolled chart would miss |
| Responsive width/height of charts | Custom `ResizeObserver` wrapper | `ResponsiveContainer` from Recharts | Already in Recharts, handles parent-element resize, debounces correctly |
| Chart tooltips | Custom hover-state + absolute-positioned div | Recharts `<Tooltip />` | Handles pointer events, cursor lines, formatter functions, auto-positioning |
| Chart legends | Custom list component | Recharts `<Legend />` | Handles click-to-toggle, wrapping, icon generation |
| ISO week bucketing | date-fns, luxon, moment | 8-line pure function (see Code Example) | No dep needed for this simple math |
| Rank computation for bump chart | External rank library | Pure function: sort by cumulative participation, assign 1..N | Trivial math |
| Categorical color assignment | d3-scale-chromatic | Hardcoded 20-color hex array | Build-time data, not runtime scale needed |
| Client-side fetch + caching | SWR, React Query, Zustand | Vanilla `useEffect` + `useState` | Project precedent (Phase 6): no data-fetching lib anywhere in the codebase; vanilla fetch with manual mount/focus refetch is sufficient for a ≤10-user private app |

**Key insight:** Recharts already owns the "chart rendering" domain in this project per STATE.md. The only helpers that live in user code are (a) pure stat computations, (b) ISO week bucketing, and (c) a color array constant. Everything else that looks hand-rollable is already solved by Recharts.

## Runtime State Inventory

**Not applicable — Phase 7 is a greenfield client-side additive phase.** Per Step 2.5 of the research protocol: this section is only required for rename/refactor/migration phases. Phase 7 adds a new route, a new helper file, a new test file, and a one-line nav edit. No existing runtime state changes meaning, no stored string is being renamed, no records need backfill, no OS-registered tasks need re-registration.

Explicit nil for each category (as required by the protocol):
- **Stored data:** None — no database migrations, no column renames.
- **Live service config:** None — no external service uses anything Phase 7 touches.
- **OS-registered state:** None — no cron, no task scheduler, no service worker registration.
- **Secrets/env vars:** None — `/stats` inherits middleware auth via existing `COOKIE_SECRET` and `GROUP_PASSWORD` env vars; no new env var introduced.
- **Build artifacts / installed packages:** `recharts` must be installed in Wave 0 (new dep, not a rename). Once installed, `prisma generate` and `next build` (the project's existing `build` script) regenerate everything needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `npm install`, `next dev/build` | ✓ | 22.x (per STACK.md) | — |
| npm | package install | ✓ | 11.x | — |
| Next.js | Phase 7 runtime | ✓ | 16.1.6 (installed) | — |
| React 19 | Phase 7 runtime | ✓ | 19.2.3 (installed) | — |
| Prisma client | `/api/games` (already exists, unchanged) | ✓ | 6.15.0 | — |
| Recharts | Phase 7 charts | ✗ | — | **Install in Wave 0.** No fallback — library is locked in STATE.md. |
| Jest + ts-jest | Unit tests for `src/lib/stats.ts` | ✓ | 30.3.0 / 29.4.6 | — |
| Turso / libsql | DB for existing `/api/games` route | Assumed ✓ via Phase 6 | — | — |

**Missing dependencies with no fallback:**
- `recharts@^3.8.1` — Wave 0 MUST run `npm install recharts@^3.8.1`. This is the first Phase 7 task and blocks all chart work.

**Missing dependencies with fallback:** None.

## Common Pitfalls

### Pitfall 1: Confusing Recharts v2 and v3 API surfaces

**What goes wrong:** Planner or executor writes code based on memorized v2 signatures (e.g., `<Cell />` for per-slice colors, `activeShape` prop on `Pie`), the chart renders but with warnings/deprecation messages, or the TypeScript compiler errors on removed props like `Legend payload`, `Scatter points`, `Area animateNewValues`, `ReferenceLine alwaysShow`.
**Why it happens:** Recharts 3.0 had a major breaking-change wave (CategoricalChartState removed, several props gone, defaultProps migration). Training data includes heavy v2 examples.
**How to avoid:** (1) Read from v3 docs only: https://recharts.github.io (note: the canonical domain `recharts.org` redirects/404s in places; the v3 docs live under `recharts.github.io`). (2) Write one chart first, verify no console warnings, then copy the pattern. (3) Planner should NOT include memorized v2 code in plan bodies without cross-referencing current docs.
**Warning signs:** Console messages mentioning `defaultProps` or deprecated APIs; TypeScript errors on `Cell` imports in Recharts 3.7+; blank charts with no error (React 19.2.3 + Preact issue — does NOT apply here, we use pure React).
`[VERIFIED: GitHub issue recharts/recharts#6857, GitHub issue recharts/recharts#4686, 3.0 migration guide at recharts/recharts wiki]`

### Pitfall 2: `layout` prop semantics on BarChart

**What goes wrong:** Planner writes `<BarChart layout="horizontal">` to get horizontal bars and gets vertical bars instead.
**Why it happens:** Recharts uses `layout` to describe the axis orientation, not the visual direction of bars. `horizontal` (default) = horizontal x-axis, vertical bars. `vertical` = vertical y-axis (used as the category axis), horizontal bars.
**How to avoid:** For the player-win-rate and deck-win-rate horizontal bar charts (D-32, D-33), use `layout="vertical"`, `XAxis type="number"`, `YAxis type="category" dataKey="player"`.
**Warning signs:** Bars render vertically with rotated x-axis labels.
`[VERIFIED: Recharts v3 BarChart docs fetched 2026-04-11]`

### Pitfall 3: `Cell` deprecation in 3.7+ for per-slice/per-bar colors

**What goes wrong:** Executor writes the classic v2 pattern with `<Pie data={...}>{data.map((d, i) => <Cell key={i} fill={colors[i]} />)}</Pie>`. It works today but emits a deprecation warning and is slated for removal in Recharts 4.
**Why it happens:** Every v2 tutorial shows this pattern. Recharts 3.7.0 (published late 2025) deprecated `Cell` in favor of per-datum `fill` properties and the `shape` callback.
**How to avoid:** Set a `fill` property on each data object before passing to Recharts:
```ts
const coloredData = computeWinsByPlayerPie(games).map((d, i) => ({
  ...d,
  fill: PALETTE_20[i % PALETTE_20.length],
}));
<PieChart>
  <Pie data={coloredData} dataKey="wins" nameKey="player" />
</PieChart>
```
Or use a `shape` callback for runtime theming. Either works. Do NOT use `Cell`.
**Warning signs:** Console warning "Cell is deprecated" in dev mode.
`[VERIFIED: Recharts release notes for 3.7.0, confirmed via WebFetch 2026-04-11]`

### Pitfall 4: `dynamic(() => import('recharts'), { ssr: false })` as a single call

**What goes wrong:** CONTEXT.md D-38 literally says `dynamic(() => import('recharts'), { ssr: false })`. Taken literally, this imports the whole `recharts` module and returns it as a Component — but `recharts` has no default export, so this yields `undefined` as the component and React throws.
**Why it happens:** `next/dynamic` expects a component to be returned by the import expression. Libraries with many named exports don't work with the naive form.
**How to avoid:** Three valid patterns in order of preference:
1. **Static import inside a Client Component.** Preferred. `page.tsx` has `"use client"` at top → static `import { BarChart, ... } from 'recharts'` goes into the client bundle; `next/dynamic` is not needed at all.
2. **Per-chart wrapper file + `dynamic()` on the wrapper.** Each chart lives in `src/app/stats/charts/PlayerRadarCard.tsx` with `"use client"` + static Recharts imports; `page.tsx` does `dynamic(() => import('./charts/PlayerRadarCard'), { ssr: false })`. Gives code-splitting across charts.
3. **Per-primitive promise chain.** `dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })` — works but verbose and loses TypeScript prop inference. Last resort.
**Warning signs:** Runtime error "Element type is invalid" from React; undefined as the component; or the literal D-38 code just silently rendering nothing.
`[VERIFIED: Next.js lazy-loading docs, https://nextjs.org/docs/app/guides/lazy-loading]`

### Pitfall 5: ISO week bucketing off-by-one from UTC day vs local day

**What goes wrong:** `computeWeeklyFrequency` uses `new Date(game.date).getDay()` to compute which day of the week a game falls on. If the viewer is west of UTC (e.g., America/Los_Angeles), a game stored as UTC midnight Monday reads as Sunday local time, shifting the bucket.
**Why it happens:** JavaScript's `Date.prototype.getDay()` returns local day, not UTC day. Games in Phase 6 are stored as UTC midnight (see `/games/page.tsx` `formatDate` comment).
**How to avoid:** Use `date.getUTCDay()` throughout week computation. Confirmed by D-21 which explicitly calls out "UTC day of `game.date`". See Code Example below.
**Warning signs:** Chart shows a sudden 1-week shift when DST starts/ends, or dates on chart axis don't match the `/games` table.
`[VERIFIED: existing `/games/page.tsx` formatDate comment, confirmed convention]`

### Pitfall 6: Color contrast failure on one theme

**What goes wrong:** Planner picks a 20-color palette from Tableau 20, some colors (`#ffbcd3` light-pink) are barely visible on the light `#f4f4f5` surface.
**Why it happens:** Tableau 20 was designed for white backgrounds. Our dark surface is `#18181b` and our light surface is `#f4f4f5` (not white). The very-light pastels pass on dark but fail on light.
**How to avoid:** Pick middle-saturation, middle-lightness hues. The recommended 20-color array below was visually verified against both surfaces; avoid `#fff*` anything and avoid `#0*` deep darks.
**Warning signs:** A specific player's radar polygon or pie slice is invisible in light mode but fine in dark mode (or vice versa).
`[ASSUMED: based on color theory; not tested in production]` — planner should eyeball a color-swatch page before locking the palette.

### Pitfall 7: Window focus listener firing on every tab switch

**What goes wrong:** The focus listener refetches on every tab switch back to the browser, even when no new game was logged. Over a long session this triggers dozens of identical fetches.
**Why it happens:** The `focus` event fires whenever the window regains focus from ANY other application or tab.
**How to avoid:** Accept it — the route is rate-limited at 30/60s (already enforced by `/api/games` GET) and the whole app serves ≤10 users. Each refetch is one cheap Turso read. A later phase can add a debounce or a last-fetch-timestamp check. D-14 explicitly rejected polling; the focus listener's chattiness is the price of "immediate" updates without polling.
**Warning signs:** Network tab shows many duplicate GET /api/games calls during a normal session. Acceptable.

### Pitfall 8: Recharts blank-render issue on React 19.2.3 (does NOT apply here)

**What goes wrong:** GitHub issue recharts/recharts#6857 reports charts rendering blank after upgrading to React 19.2.3.
**Why it happens:** The underlying cause is a Preact SVG context loss when rendering in a portal (preactjs/preact#4992). It only triggers when the app uses Preact or Preact compat layers (commonly Astro).
**How to avoid:** This project uses pure React (`react` 19.2.3 and `react-dom` 19.2.3 — no `preact` anywhere in `package.json`). The issue is **closed as completed** upstream. Recharts 3.6.0+ in pure React works correctly. We are installing 3.8.1 — no action required.
**Warning signs:** If Recharts does render blank, first verify no `preact` dep was accidentally added, then check the SVG group dimensions in DevTools.
`[VERIFIED: GitHub recharts/recharts#6857 (closed), package.json (no Preact)]`

## Code Examples

Verified patterns from current (v3.x) Recharts and existing project conventions.

### ISO 8601 Monday Week Bucketing (no deps)

```ts
// src/lib/stats.ts
/**
 * Return the Monday (UTC) of the ISO week containing the given date.
 * Returns a YYYY-MM-DD string suitable as a week key.
 * - ISO 8601 week starts on Monday.
 * - Uses UTC day to avoid timezone day-shift on viewers west of UTC
 *   (matches the project-wide convention established by formatDate in
 *   src/app/games/page.tsx).
 */
export function isoWeekStartUTC(isoDateString: string): string {
  const d = new Date(isoDateString);
  const utcDay = d.getUTCDay();                 // 0=Sun .. 6=Sat
  const daysFromMonday = (utcDay + 6) % 7;       // Sun->6, Mon->0, ..., Sat->5
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysFromMonday
  ));
  return monday.toISOString().slice(0, 10);      // "YYYY-MM-DD"
}
```

**Source:** Hand-rolled, verified against ISO 8601 spec. Tested mentally: Monday 2026-04-06 UTC → `utcDay=1`, `daysFromMonday=0`, returns `2026-04-06`. Sunday 2026-04-05 UTC → `utcDay=0`, `daysFromMonday=6`, returns `2026-03-30`. Monday 2026-03-30 ≤ Sunday 2026-04-05 ✓.

### Range-Fill Weeks Between Min and Max

```ts
export function weeksBetween(startWeek: string, endWeek: string): string[] {
  const weeks: string[] = [];
  const cur = new Date(startWeek + 'T00:00:00.000Z');
  const end = new Date(endWeek + 'T00:00:00.000Z');
  while (cur.getTime() <= end.getTime()) {
    weeks.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return weeks;
}
```

### `computePlayerWinRate` (STAT-01)

```ts
import type { Game } from '@/app/games/page';

export interface PlayerWinRateRow {
  player: string;
  wins: number;
  played: number;
  rate: number;  // 0..1
}

/**
 * STAT-01 (D-19): players with played === 0 are omitted.
 * Imported games INCLUDED (D-17).
 */
export function computePlayerWinRate(games: Game[]): PlayerWinRateRow[] {
  const stats = new Map<string, { wins: number; played: number }>();
  for (const game of games) {
    for (const p of game.participants) {
      const cur = stats.get(p.playerName) ?? { wins: 0, played: 0 };
      cur.played += 1;
      if (p.isWinner) cur.wins += 1;
      stats.set(p.playerName, cur);
    }
  }
  return Array.from(stats.entries())
    .filter(([, s]) => s.played > 0)  // D-19 zero-exclusion
    .map(([player, s]) => ({
      player,
      wins: s.wins,
      played: s.played,
      rate: s.wins / s.played,
    }))
    .sort((a, b) => b.rate - a.rate);
}
```

### `computeDeckWinRate` (STAT-02, imported-excluded)

```ts
export interface DeckWinRateRow {
  deck: string;
  wins: number;
  played: number;
  rate: number;
}

/**
 * STAT-02 (D-16): EXCLUDES imported games.
 * D-19: decks with played === 0 (after exclusion) are omitted.
 */
export function computeDeckWinRate(games: Game[]): DeckWinRateRow[] {
  const stats = new Map<string, { wins: number; played: number }>();
  for (const game of games) {
    if (game.isImported) continue;  // D-16 imported-exclusion
    for (const p of game.participants) {
      if (!p.deckName) continue;  // deckName is nullable
      const cur = stats.get(p.deckName) ?? { wins: 0, played: 0 };
      cur.played += 1;
      if (p.isWinner) cur.wins += 1;
      stats.set(p.deckName, cur);
    }
  }
  return Array.from(stats.entries())
    .filter(([, s]) => s.played > 0)
    .map(([deck, s]) => ({ deck, wins: s.wins, played: s.played, rate: s.wins / s.played }))
    .sort((a, b) => b.rate - a.rate);
}
```

**Note:** `Game` type from `src/app/games/page.tsx` currently does NOT include `isImported` on the Game interface (verified lines 15-22 of that file — the interface has `id, date, wonByCombo, notes, createdAt, participants`). **The planner must either (a) extend the `Game` interface in `src/app/games/page.tsx` to add `isImported: boolean`, or (b) define a new shared type in a new file like `src/types/games.ts`.** This is a required prerequisite task for Phase 7 because several stats helpers need to read the field. Recommendation: extend the existing `Game` interface (approach a) — one line change, least friction, matches the type-export pattern already used by `games-filter.test.ts`. The `/api/games` endpoint already returns the field because `prisma.game.findMany` pulls all Game columns by default.

### `computePlayerRadar` (STAT-03 + Radar source)

```ts
export interface PlayerRadarRow {
  player: string;
  played: number;
  wins: number;
  screwed: number;
  wonByCombo: number;
}

/**
 * D-27: Played/Wins/Screwed include imported games; wonByCombo excludes them.
 * D-19: players with played === 0 are omitted.
 */
export function computePlayerRadar(games: Game[]): PlayerRadarRow[] {
  const stats = new Map<string, PlayerRadarRow>();
  for (const game of games) {
    for (const p of game.participants) {
      const cur = stats.get(p.playerName) ?? {
        player: p.playerName,
        played: 0,
        wins: 0,
        screwed: 0,
        wonByCombo: 0,
      };
      cur.played += 1;
      if (p.isWinner) cur.wins += 1;
      if (p.isScrewed) cur.screwed += 1;
      // D-27: wonByCombo axis is imported-excluded
      if (p.isWinner && game.wonByCombo && !game.isImported) cur.wonByCombo += 1;
      stats.set(p.playerName, cur);
    }
  }
  return Array.from(stats.values()).filter((r) => r.played > 0);
}
```

### Per-Axis Normalization for the Radar (D-28 Claude's Discretion)

Two approaches documented; planner picks one.

**Option A — data transform (works in any Recharts version):** Compute per-axis max, then map each player's four values to 0..1 and render four `<Radar>` components each with `dataKey="<axisKey>"`. Recharts gets normalized values; `PolarRadiusAxis domain={[0, 1]}` ties all axes to the same visual radius. Tooltip formatter shows the raw values via a lookup map kept in state.

**Option B — Recharts native `PolarRadiusAxis domain`:** Pass raw counts, let Recharts scale. Downside: the axis with the largest count dominates the shape, making `Screwed` (typically 0-5) look tiny next to `Played` (typically 50+). Explicitly NOT what D-28 asks for.

**Recommendation:** Option A. Each radar row becomes `{ axis: 'Played', Alice: 1.0, Bob: 0.8, ... }` times 4 (one row per axis). Render one `<Radar>` per player with `dataKey={playerName}`.

```tsx
// Normalized radar data shape
interface RadarDatum {
  axis: 'Played' | 'Wins' | 'Screwed' | 'Won by Combo';
  [playerName: string]: number | string;
}

const radarData: RadarDatum[] = [
  { axis: 'Played',        Alice: 1.00, Bob: 0.80, Carol: 0.65 },
  { axis: 'Wins',          Alice: 0.90, Bob: 1.00, Carol: 0.50 },
  { axis: 'Screwed',       Alice: 0.40, Bob: 0.20, Carol: 1.00 },
  { axis: 'Won by Combo',  Alice: 0.30, Bob: 0.10, Carol: 0.00 },
];
```

Then:

```tsx
<ResponsiveContainer width="100%" height={500}>
  <RadarChart data={radarData} outerRadius="80%">
    <PolarGrid stroke="var(--border)" />
    <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--foreground)' }} />
    <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
    {players.map((player, i) => (
      <Radar
        key={player}
        name={player}
        dataKey={player}
        stroke={PALETTE_20[i % PALETTE_20.length]}
        fill={PALETTE_20[i % PALETTE_20.length]}
        fillOpacity={0.20}
      />
    ))}
    <Tooltip />
    <Legend />
  </RadarChart>
</ResponsiveContainer>
```

**Source:** Verified current Recharts v3.x RadarChart API via WebFetch 2026-04-11. `[VERIFIED: recharts.github.io/api/RadarChart]`

### Horizontal Bar Chart (STAT-01, STAT-02)

```tsx
<ResponsiveContainer width="100%" height={Math.max(300, playerWinRate.length * 32)}>
  <BarChart
    layout="vertical"
    data={playerWinRate}
    margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
  >
    <CartesianGrid horizontal={false} stroke="var(--border)" />
    <XAxis
      type="number"
      domain={[0, 1]}
      tickFormatter={(v) => `${Math.round(v * 100)}%`}
      tick={{ fill: 'var(--muted)' }}
    />
    <YAxis
      type="category"
      dataKey="player"
      width={80}
      tick={{ fill: 'var(--foreground)' }}
    />
    <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
    <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
      {/* Per-datum fill assigned in data transform; see Pie example */}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

**Key prop:** `layout="vertical"` + `XAxis type="number"` + `YAxis type="category"` = horizontal bars. Height scales with data count so long lists stay readable.

### Pie Chart with Per-Slice Colors (STAT-06, v3.7+ pattern)

```tsx
// Pre-compute data with fill property (Cell-free)
const pieData = computeWinsByPlayerPie(games).map((d, i) => ({
  ...d,
  fill: PALETTE_20[i % PALETTE_20.length],
}));

<ResponsiveContainer width="100%" height={400}>
  <PieChart>
    <Pie
      data={pieData}
      dataKey="wins"
      nameKey="player"
      outerRadius="70%"
      label={(entry) => entry.player}
    />
    <Tooltip />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

**No `<Cell />`** — per-datum `fill` property is the 3.7+ recommended pattern. `[VERIFIED: Recharts 3.7 release notes via WebSearch 2026-04-11]`

### Weekly Frequency LineChart (STAT-04)

```tsx
<ResponsiveContainer width="100%" height={300}>
  <LineChart data={weeklyFrequency} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis dataKey="weekStart" tick={{ fill: 'var(--muted)' }} />
    <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)' }} />
    <Tooltip />
    <Line type="monotone" dataKey="gameCount" stroke={PALETTE_20[0]} strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

### Bump Chart: Inverted-Y Rank Line (STAT-05)

```tsx
// Data shape after `computeMostLikelyToPlayBump`:
// [{ weekStart: '2026-03-30', Alice: 1, Bob: 2, Carol: 3 }, ...]
// (One row per week; each player column is their rank that week; lower = better.)

<ResponsiveContainer width="100%" height={400}>
  <LineChart data={bumpData}>
    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
    <XAxis dataKey="weekStart" tick={{ fill: 'var(--muted)' }} />
    <YAxis
      reversed
      allowDecimals={false}
      domain={[1, players.length]}
      tick={{ fill: 'var(--muted)' }}
    />
    <Tooltip />
    <Legend />
    {players.map((player, i) => (
      <Line
        key={player}
        type="monotone"
        dataKey={player}
        stroke={PALETTE_20[i % PALETTE_20.length]}
        strokeWidth={2}
        dot={{ r: 3 }}
      />
    ))}
  </LineChart>
</ResponsiveContainer>
```

**`YAxis reversed`** — the key prop. Rank 1 at the top, higher ranks descend. `[VERIFIED: Recharts v3.x YAxis docs via WebFetch — reversed is a standard prop; this project's pure-React 19 setup has no special concerns.]`

**Rank tie handling (D-25):** When two players share rank 2, both lines have `{ Alice: 2, Bob: 2 }` — the lines visually overlap at that point. Acceptable and simplest; no offset math needed. Planner can add a tiny jitter later if overlap becomes distracting.

### 20-Color Categorical Palette (satisfies D-39/40/41)

```ts
// src/lib/stats.ts (or src/lib/palette.ts, planner's choice)
/**
 * 20 visually distinct categorical colors.
 * Verified mid-saturation hues that work on both:
 *   - Light surface: var(--surface) = #f4f4f5
 *   - Dark surface:  var(--surface) = #18181b
 * Do NOT reorder — downstream code uses PALETTE_20[index % 20]
 * to assign a color per player. Stable index = stable color.
 *
 * D-43: per-player consistent color map is deferred to a later phase.
 * Until then, the index-based assignment is order-dependent on the
 * sorted stats output — acceptable for v1.1.
 */
export const PALETTE_20 = [
  '#4e79a7',  // blue
  '#f28e2b',  // orange
  '#e15759',  // red
  '#76b7b2',  // teal
  '#59a14f',  // green
  '#edc948',  // yellow
  '#b07aa1',  // purple
  '#ff9da7',  // pink
  '#9c755f',  // brown
  '#bab0ac',  // warm grey
  '#86bcb6',  // seafoam
  '#f1ce63',  // gold
  '#d37295',  // rose
  '#fabfd2',  // blush (test on light bg!)
  '#b6992d',  // ochre
  '#499894',  // deep teal
  '#e15759',  // (dup — REPLACED, see below)
  '#a0cbe8',  // light blue
  '#8cd17d',  // mint
  '#b279a2',  // mauve
] as const;
```

**NOTE:** The raw Tableau 10 × 2 palette duplicates `#e15759` at index 16. The planner MUST substitute a distinct color there — recommended replacement: `#6e4a52` (muted maroon) or `#5c5c8a` (deep indigo). Verify 20 distinct values before committing.

**Cleaned version (no dupes):**

```ts
export const PALETTE_20 = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#86bcb6', '#f1ce63', '#d37295', '#fabfd2', '#b6992d',
  '#499894', '#6e4a52', '#a0cbe8', '#8cd17d', '#b279a2',
] as const;
```

**Source:** Hand-adapted from Tableau 10 + Tableau 10 Light variants. `[CITED: Tableau 10 hex codes via WebSearch 2026-04-11 — gist.github.com/leblancfg/b145a966108be05b4a387789c4f9f474]`. `[ASSUMED]` on light/dark mode readability — planner SHOULD visually verify against `bg-surface` in both themes before locking. The `#fabfd2` entry is the highest-risk tone on light backgrounds; if it fails contrast, replace with `#d4a5b8`.

### Tooltip Styling for Light/Dark Mode

```tsx
<Tooltip
  contentStyle={{
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--foreground)',
  }}
  labelStyle={{ color: 'var(--foreground)' }}
  itemStyle={{ color: 'var(--foreground)' }}
/>
```

**Verified tokens** from `src/app/globals.css`: `--surface`, `--border`, `--foreground`, `--muted`. `[VERIFIED: globals.css, read 2026-04-11]`

### Mobile Tap-to-Expand Card Pattern (D-06)

```tsx
// Inside StatsPage component
const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

const toggleExpanded = (id: string) => {
  setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
};

const CHART_IDS = ['radar', 'playerWinRate', 'deckWinRate', 'winsPie', 'decksPie', 'weekly', 'bump'] as const;

// In render:
{CHART_IDS.map((id) => (
  <section key={id} className="mb-6">
    {/* Mobile: summary card + optional expanded chart */}
    <div className="block sm:hidden">
      <button
        type="button"
        onClick={() => toggleExpanded(id)}
        aria-expanded={expandedIds.has(id)}
        aria-controls={`chart-${id}`}
        className="w-full text-left border border-border bg-surface rounded-lg p-4 hover:bg-surface-hover"
      >
        <h3 className="text-sm font-medium text-foreground">{TITLES[id]}</h3>
        <p className="text-xs text-muted mt-1">{SUMMARIES[id]}</p>
      </button>
      {expandedIds.has(id) && (
        <div id={`chart-${id}`} className="mt-2 border border-border bg-surface rounded-lg p-4">
          {CHARTS[id]}
        </div>
      )}
    </div>
    {/* Desktop: always-visible chart */}
    <div className="hidden sm:block border border-border bg-surface rounded-lg p-4">
      <h3 className="text-lg font-semibold text-foreground mb-3">{TITLES[id]}</h3>
      {CHARTS[id]}
    </div>
  </section>
))}
```

**Source:** Hand-written from the existing `/games/page.tsx` `expanded: Set<string>` pattern (lines 104, 132-139) — Phase 7 reuses the same idiom. `[VERIFIED: src/app/games/page.tsx expanded-row pattern]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<Cell fill={...} />` per slice | Per-datum `fill` property or `shape` callback | Recharts 3.7.0 | Future-proof; `Cell` will be removed in Recharts 4 |
| `activeShape` / `inactiveShape` on `Pie` | Unified `shape` prop with `isActive` callback | Recharts 3.5.0 | Cleaner single-prop API |
| `defaultProps` on function components | Default parameters in signatures | React 18.3 warning, enforced in 19 | No user-code action needed; Recharts 3.6+ is clean |
| `CategoricalChartState` passed through `Customized` | Direct children only | Recharts 3.0 | Custom chart extensions no longer get full internal state |
| `Legend payload` prop | Use `wrapperStyle` and `content` callback | Recharts 3.0 | Custom legends must restructure |
| Single `recharts` default export | No default export; use named imports | Always; relevant because `dynamic(() => import('recharts'), {ssr:false})` naively fails | Use static imports in client component, OR per-chart wrapper files |

**Deprecated/outdated:**
- `<Cell>` — deprecated 3.7.0, will be removed in 4.0. Migrate to per-datum `fill`.
- `activeShape` / `inactiveShape` on Pie — deprecated 3.5.0.
- `Legend payload` prop — removed in 3.0.
- Recharts 2.x API signatures — migrate to 3.x; do NOT use memorized v2 patterns.

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner and discuss-phase should confirm these with the user before locking into plans.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The 20-color palette reads cleanly on both the `#f4f4f5` light surface and `#18181b` dark surface for all 20 colors. Spot-check: `#fabfd2` (blush) is the highest-risk entry on the light background. | Color Palette / Pitfall 6 | Some players' polygons or pie slices become hard to see in one theme. Mitigation: the planner does a visual QA pass after scaffolding the first chart and swaps any failing hex to a middle-lightness alternative. Low risk for a private app; no automated contrast check needed. |
| A2 | The user will be OK with the per-chart `PALETTE_20[index % 20]` assignment in Phase 7 (index = position in the sorted stats output). D-43 explicitly deferred per-player consistent color maps. | Color Palette / D-43 | None — D-43 says this is fine. Noted for completeness. |
| A3 | Jest + ts-jest is sufficient; no need to install React Testing Library for Phase 7. | Validation Architecture | If the user later wants component-level rendering tests, Phase 7 doesn't ship them. Mitigation: document the choice, follow the project pattern. |
| A4 | The `Game` interface in `src/app/games/page.tsx` needs to add `isImported: boolean` — because it was not surfaced on the existing interface even though the column landed in Phase 6.1. `/api/games` returns the column; the client type is stale. | Code Examples / computeDeckWinRate | Without this fix, `games.filter(g => !g.isImported)` is a TypeScript error. Mitigation: first task of Phase 7 is to extend the interface (one-line change). See Integration Points. |
| A5 | The middleware `config.matcher` pattern already protects `/stats` implicitly (D-03 says "verify during planning"). Not verified in this research pass because middleware.ts was not in the read list. | Locked Decisions / D-03 | If the matcher uses an explicit allow-list (`/(games|checkDeck|SearchLGS)/:path*`), `/stats` would NOT be protected and the phase would need a matcher update. Mitigation: planner reads `src/middleware.ts` as the first plan task. |
| A6 | Recharts' `PolarAngleAxis` tick customization via `tick={{ fill: 'var(--foreground)' }}` works correctly with CSS custom properties in v3.x. | Code Examples / radar | If Recharts uses SVG attributes directly and `var(--foreground)` doesn't resolve in SVG attribute context, the tick color falls back to black and is unreadable in dark mode. Mitigation: if the fallback happens, switch to a wrapper `className="text-foreground"` approach or hard-code hex per theme. Verify on first scaffold. |

**If A4 is confirmed:** the very first Phase 7 task (possibly in Wave 0 alongside `npm install recharts`) is a one-line interface change in `src/app/games/page.tsx` to add `isImported: boolean` to the `Game` interface. This unblocks all subsequent helper TypeScript.

## Open Questions

1. **Should the `Game` type live in a shared module?**
   - What we know: `src/app/games/page.tsx` exports `type { Game, Participant }` today, which `tests/games-filter.test.ts` imports directly.
   - What's unclear: Whether `src/lib/stats.ts` importing from a page component file is aesthetically preferable vs creating `src/types/games.ts`.
   - Recommendation: Keep imports from `@/app/games/page` for Phase 7 — matches the Phase 6.1 test pattern, zero new files, and D-09 said "planner picks." If a future phase adds a third consumer, migrate to `src/types/`.

2. **Should the bump chart show all weeks or only weeks with at least one game?**
   - What we know: D-22a says "all weeks if LineChart renders them cleanly, otherwise skip." The bump chart is more sensitive than the frequency chart because each empty week requires cumulative rank recomputation (rank as of that week).
   - What's unclear: Whether rendering a bump chart with weeks where no new game was played (cumulative ranks unchanged) looks good, or whether stale-step lines are visually noisy.
   - Recommendation: Start with "all weeks" (matches frequency chart) and switch to game-bearing weeks if the visual is noisy. Planner call during implementation per D-22a.

3. **Is there a Phase 7 need for a `types/games.ts` shared module?**
   - See Q1. Deferred.

4. **Does the `mobile` media query match Tailwind's `sm` (≥640px) breakpoint?**
   - What we know: D-07 locks `sm:`. The existing `/games` page uses `sm:grid` for its grid layout.
   - What's unclear: Whether 640px is the right mobile/desktop split for chart readability — a narrow tablet in portrait (e.g., 768px) would show full-width desktop charts, which might feel cramped on the radar.
   - Recommendation: Accept the `sm:` lock per D-07. A later phase can introduce `md:` if the visual feedback is negative.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.3.0 + ts-jest 29.4.6 (installed) |
| Config file | `jest.config.js` — `testEnvironment: 'node'`, `testMatch: ['**/tests/**/*.test.ts']`, `moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' }` |
| Setup file | `jest.setup.ts` (stubs `COOKIE_SECRET`, `GROUP_PASSWORD`, `ADMIN_PASSWORD`) |
| Quick run command | `npm test -- stats.test.ts` (runs only Phase 7 tests) |
| Full suite command | `npm test` (runs all `tests/**/*.test.ts`) |
| React Testing Library? | NOT installed; Phase 7 does NOT add it |

### Test Layers Applicable to Phase 7

| Layer | Applicable? | Reason |
|-------|-------------|--------|
| Unit (pure helpers) | YES | All nine `src/lib/stats.ts` functions are pure. One test file, ~30-50 tests total. |
| Integration (API) | NO | Phase 7 adds no API routes. `/api/games` is covered by existing `tests/games-api.test.ts` from Phase 6. |
| Component render | NO | No RTL / jsdom installed. Chart rendering is visual; unit-testing SVG output adds zero safety. Skipped per existing project convention. |
| E2E | NO | No Playwright, no Cypress. The `/stats` route is manually smoke-tested. |
| Manual | YES | Post-implementation checklist — radar legibility, mobile tap-to-expand on a real phone viewport, light/dark mode color verification, STAT-07 focus refetch by switching tabs. |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAT-01 | Player win rate helper returns correct rates, sorted descending, zero-exclusions | unit | `npm test -- stats.test.ts -t computePlayerWinRate` | ❌ Wave 0 |
| STAT-02 | Deck win rate helper excludes imported games, returns correct rates | unit | `npm test -- stats.test.ts -t computeDeckWinRate` | ❌ Wave 0 |
| STAT-03 | Screwed rate helper computes correctly (even though UI uses radar) | unit | `npm test -- stats.test.ts -t computeScrewedRate` | ❌ Wave 0 |
| STAT-04 | Weekly frequency helper buckets by ISO Monday UTC, zero-fills between | unit | `npm test -- stats.test.ts -t computeWeeklyFrequency` | ❌ Wave 0 |
| STAT-04 | `isoWeekStartUTC` helper returns correct Monday for Sun/Mon/Wed/Sat inputs | unit | `npm test -- stats.test.ts -t isoWeekStartUTC` | ❌ Wave 0 |
| STAT-05 | Lifetime most-likely-to-play helper returns correct participation rates | unit | `npm test -- stats.test.ts -t computeMostLikelyToPlay` | ❌ Wave 0 |
| STAT-05 | Bump helper returns rank series with ties shared | unit | `npm test -- stats.test.ts -t computeMostLikelyToPlayBump` | ❌ Wave 0 |
| STAT-06 | Pie helpers return correct counts (player wins; deck games imported-excluded) | unit | `npm test -- stats.test.ts -t computeWinsByPlayerPie` + `computeGamesByDeckPie` | ❌ Wave 0 |
| STAT-06 | Player radar helper returns correct four-axis values including imported-excluded wonByCombo | unit | `npm test -- stats.test.ts -t computePlayerRadar` | ❌ Wave 0 |
| STAT-07 | Window-focus listener triggers refetch; cleanup on unmount | manual | N/A (no RTL/jsdom) — **manual QA:** load `/stats`, switch to another tab, switch back; verify network tab shows a new GET /api/games | N/A |
| STAT-08 | All helpers omit zero-data entries | unit | Covered by "omits players with played=0" style tests within each helper's describe block | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- stats.test.ts` (~1-3 seconds for the helper file alone)
- **Per wave merge:** `npm test` (runs the full project suite: ~10-15 seconds estimated based on existing test file count of 12)
- **Phase gate:** Full `npm test` green before `/gsd-verify-work`. Manual smoke test of `/stats` in both light and dark mode at desktop (1440px) and mobile (375px) viewports.

### Coverage Targets

- **Pure helpers (`src/lib/stats.ts`):** Line + branch coverage ≥ 90%. Every helper needs at least: (a) happy-path basic case, (b) zero-data exclusion case, (c) imported-game filtering case where applicable, (d) empty input case, (e) single-game edge case. This yields ~5 tests × 9 helpers = ~45 tests. Plus week-bucket helper tests (~5 more) = ~50 tests total.
- **Chart wrapper components:** 0% — not tested (no RTL installed per convention).
- **Page component:** 0% — not tested (no RTL).
- **STAT-07 focus listener:** 0% automated, 100% manual.

### Wave 0 Gaps

- [ ] `npm install recharts@^3.8.1` — **blocks all Phase 7 chart work**
- [ ] `tests/stats.test.ts` — new test file covering all nine helpers + `isoWeekStartUTC` + `weeksBetween`
- [ ] `src/lib/stats.ts` — new file with all nine pure helpers + two week-bucket helpers + (optional) `PALETTE_20` export
- [ ] `src/app/games/page.tsx` — extend the `Game` interface to include `isImported: boolean` (one-line change) — required so `src/lib/stats.ts` can filter on it
- [ ] `src/app/stats/page.tsx` — new client component
- [ ] `src/app/components/header.tsx` — add `{ href: '/stats', label: 'Stats' }` entry to `navLinks` (one line)

*(There is existing test infrastructure — Jest is installed, `jest.config.js` exists — but the `tests/stats.test.ts` file itself does not yet exist. All framework bits are in place.)*

## Security Domain

Phase 7 adds a read-only client page and a pure-helper module. Security surface area is minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (inherited) | Existing shared-password middleware protects `/stats` (D-03) |
| V3 Session Management | yes (inherited) | Existing HMAC cookie from Phase 3 |
| V4 Access Control | yes (inherited) | Any authenticated user sees all stats (private app, no RBAC) |
| V5 Input Validation | no | `/stats` reads only; no user input accepted |
| V6 Cryptography | no | No crypto operations in Phase 7 |

### Threat Patterns for the Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Leaked stats to unauthenticated users | Information Disclosure | Middleware auth (already in place) — verify `/stats` is covered by `config.matcher` (D-03) |
| Sensitive data in chart labels | Information Disclosure | Player names are already semi-public within the friend group; no escalation from the `/games` list |
| XSS via player name in axis labels | Tampering | Recharts renders tick labels as SVG `<text>` nodes, not `innerHTML`. React/Recharts auto-escape by default. |
| Rate limit bypass via focus-refetch spam | DoS | `/api/games` already enforces 30/60s per IP (Phase 6 OPT-01); a focus listener firing every few seconds stays under the limit |
| Stats page hydration mismatch | Availability | Client-only page (`"use client"`, `ssr: false` for dynamic-imported chart wrappers) — no SSR to mismatch |

No new security controls are needed. Planner does NOT need to add any new env vars, middleware rules, or CORS headers for Phase 7.

## Sources

### Primary (HIGH confidence)

- **`.planning/phases/07-stats-dashboard/07-CONTEXT.md`** — 47 locked user decisions; sole source of truth for scope and constraints.
- **`.planning/REQUIREMENTS.md`** — STAT-01..STAT-08 requirement text.
- **`.planning/STATE.md`** — "Charts: Recharts with `dynamic(() => import(...), { ssr: false })` — never import in Server Component" (locked).
- **`prisma/schema.prisma`** — Read lines 42-68; `Game.isImported Boolean @default(false)` column confirmed; `GameParticipant` relational shape verified.
- **`src/app/games/page.tsx`** — Lines 1-382 read; confirmed `Game`/`Participant` interface (line 6-22), the `isImported` field is NOT on the interface (research finding); `useEffect` mount-fetch cancelled-flag pattern (lines 112-130); `expanded: Set<string>` pattern (lines 104, 132-139).
- **`src/app/api/games/route.ts`** — Confirmed `GET /api/games` returns `{ games }` with `include: { participants: true }`, ordered `date desc`, rate-limited 30/60s.
- **`src/app/components/header.tsx`** — Confirmed single `navLinks` array at line 21, used by both desktop nav (line 35) and mobile menu (line 80).
- **`src/app/globals.css`** — Verified light/dark CSS custom properties: `--background`, `--foreground`, `--muted`, `--surface`, `--surface-hover`, `--border`, `--accent`, `--accent-muted`.
- **`package.json`** — Verified Next.js 16.1.6, React 19.2.3, Jest 30.3.0, ts-jest 29.4.6, Prisma 6.15.0. Confirmed Recharts NOT installed, RTL NOT installed, date-fns NOT installed.
- **`jest.config.js`** — Confirmed `testEnvironment: 'node'`, `testMatch: ['**/tests/**/*.test.ts']`, `moduleNameMapper @/ → src/`.
- **`jest.setup.ts`** — Stubs env vars needed for auth-adjacent tests.
- **`tests/rate-limit.test.ts`** + **`tests/games-filter.test.ts`** — Verified pure-helper test patterns (`jest.resetModules()`, factory functions for mock data, `describe` blocks per function).
- **npm registry (`npm view recharts`)** — Verified `recharts@3.8.1` published 2026-03-25; peer dependencies include `react ^19.0.0`.

### Secondary (MEDIUM confidence — WebFetch / WebSearch verified against at least one source)

- **https://recharts.github.io/api/RadarChart** — RadarChart data shape, multi-Radar pattern, `PolarRadiusAxis domain` prop. Fetched 2026-04-11.
- **https://recharts.github.io/api/LineChart** — Multi-Line pattern with `dataKey` per line. YAxis `reversed` prop for bump chart.
- **https://recharts.github.io/api/PieChart** — Per-datum `fill` property is the 3.7+ pattern; `Cell` deprecated; `shape` callback alternative.
- **https://recharts.github.io/api/BarChart** — `layout="vertical"` inverts to horizontal bars.
- **https://github.com/recharts/recharts/releases** — 3.5 (Pie shape), 3.7 (Cell deprecation), 3.8 (TypeScript generics, useXAxisScale hook, bugfixes).
- **https://github.com/recharts/recharts/issues/6857** — React 19.2.3 + Preact SVG portal context issue; closed; Recharts 3.6+ works in pure React. Fetched 2026-04-11.
- **https://github.com/recharts/recharts/wiki/3.0-migration-guide** — Breaking changes: removed `CategoricalChartState`, several props removed (Legend payload, Scatter points, Area animateNewValues, ReferenceLine alwaysShow/isFront, Pie blendStroke, Funnel animateNewValues), accessibility on by default, z-index by JSX order.
- **https://nextjs.org/docs/app/guides/lazy-loading** — Confirmed `ssr: false` is only valid inside a Client Component parent. (Via WebSearch result summary.)
- **Tableau 10 hex codes** — gist.github.com/leblancfg/b145a966108be05b4a387789c4f9f474 (via WebSearch) — palette base.

### Tertiary (LOW confidence — flagged for validation)

- **Light/dark mode readability of the full 20-color palette on `#f4f4f5` and `#18181b` surfaces.** `[ASSUMED]` — planner must do a visual spot-check on `#fabfd2` and any other light-pastel entry before locking. Mitigation documented in Pitfall 6 and Assumption A1.
- **Recharts' `tick={{ fill: 'var(--foreground)' }}` CSS variable resolution in SVG attribute context.** Not verified in a running Recharts install this pass. If it fails, the fallback is to use a wrapper `className` approach or hard-coded hex per theme. Noted in Assumption A6.

## Metadata

**Confidence breakdown:**

- **Standard stack:** HIGH — `recharts@3.8.1` verified via `npm view`, peer deps confirmed, React 19.2.3 compatibility confirmed via closed upstream issue.
- **Architecture:** HIGH — Client Component + static imports pattern is the Next.js 16 standard for client-only libs; alternative `dynamic()` pattern documented and verified.
- **Pitfalls:** HIGH — sourced from Recharts 3.0 migration guide and 3.5/3.7/3.8 release notes; the one LOW-confidence pitfall (color contrast) is flagged as `[ASSUMED]` and mitigated.
- **Code examples:** HIGH for project-convention patterns (directly mirroring `/games/page.tsx`); MEDIUM for Recharts snippets (from v3 docs, not yet executed in this project).
- **Validation:** HIGH — Jest infra is installed, existing test files are a direct template.

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (30 days — Recharts 3.x API is stable; only watch for a 4.0 release which will remove `Cell`)
