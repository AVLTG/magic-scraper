---
phase: 07-stats-dashboard
plan: "03"
subsystem: stats-dashboard
tags: [recharts, charts, visualization, client-components]
dependency_graph:
  requires: [07-01, 07-02]
  provides: [chart-components]
  affects: [stats-page]
tech_stack:
  added: []
  patterns: [per-datum-fill, responsive-container, chartTokens-prop-passing, pivot-for-recharts]
key_files:
  created:
    - src/app/stats/charts/PlayerRadarCard.tsx
    - src/app/stats/charts/PlayerWinRateBar.tsx
    - src/app/stats/charts/DeckWinRateBar.tsx
    - src/app/stats/charts/WinsByPlayerPie.tsx
    - src/app/stats/charts/GamesByDeckPie.tsx
    - src/app/stats/charts/WeeklyFrequencyLine.tsx
    - src/app/stats/charts/MostLikelyBump.tsx
  modified: []
decisions:
  - Used per-datum fill property instead of deprecated Cell component for pie and bar chart coloring
  - Used custom Tooltip content components for radar and bump charts to show structured multi-player data
  - Widened Recharts Tooltip formatter parameter types to match v3.8 signatures (ValueType | undefined)
metrics:
  duration: 183s
  completed: "2026-04-12T02:36:23Z"
---

# Phase 7 Plan 03: Chart Components Summary

**One-liner:** 7 Recharts chart wrappers with per-datum fill colors, responsive containers, dark-mode chartTokens, and radar normalization

## What Was Built

Created all 7 Recharts chart wrapper components that the stats page dynamically imports:

1. **PlayerRadarCard** -- RadarChart with 4 axes (Played, Wins, Screwed, Won by Combo) normalized per-axis to [0,1]. One polygon per player with custom tooltip showing raw values.

2. **PlayerWinRateBar** -- Horizontal BarChart (layout="vertical") sorted by win rate. Per-bar colors from CHART_COLORS palette. Dynamic height based on player count.

3. **DeckWinRateBar** -- Same horizontal bar pattern for decks. Wider YAxis (120px), 16-char name truncation. Caps at top 20 decks with note.

4. **WinsByPlayerPie** -- PieChart with per-datum fill (no Cell component). Tooltip shows win count and percentage.

5. **GamesByDeckPie** -- Same pie pattern for decks. Caps at top 20 with note.

6. **WeeklyFrequencyLine** -- Single-line LineChart with "MMM D" date formatting. Steel blue color (CHART_COLORS[0]).

7. **MostLikelyBump** -- Multi-line LineChart with reversed Y-axis for rank display. Pivots bump data from nested ranks array into flat rows for Recharts. Custom tooltip sorted by rank ascending.

## Key Patterns

- All components are `"use client"` and default-exported
- All receive `chartTokens` prop for light/dark adaptive chrome (axes, grid, tooltips)
- All use `ResponsiveContainer` with 100% width
- Per-datum `fill` property on data arrays replaces deprecated `<Cell>` component
- CHART_COLORS imported from `'../page'` for consistent palette

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Recharts v3.8 Tooltip formatter type signatures**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Recharts v3 Tooltip `formatter` expects `ValueType | undefined` parameters, not concrete `number`/`string` types. All 5 files with Tooltip formatters had type errors.
- **Fix:** Removed explicit parameter type annotations, used `Number(value)` and `String(name)` casts inside formatter bodies, and cast `props` payload access via `as unknown as`.
- **Files modified:** PlayerWinRateBar.tsx, DeckWinRateBar.tsx, WinsByPlayerPie.tsx, GamesByDeckPie.tsx, WeeklyFrequencyLine.tsx
- **Commit:** 6f1ba44 (included in single commit with all chart files)

## Verification

- `npx tsc --noEmit` passes with 0 errors
- All 7 chart files exist under `src/app/stats/charts/`
- All 7 files contain `from "recharts"` import
- No file contains `<Cell` (deprecated component)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1+2 | 6f1ba44 | feat(07-03): create 7 Recharts chart components |

## Self-Check: PASSED

All 7 chart files exist, commit 6f1ba44 verified, SUMMARY.md created.
