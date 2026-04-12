---
phase: quick
plan: 260411-wgv
subsystem: stats-dashboard
tags: [fix, ux, charts, visualization]
dependency_graph:
  requires: []
  provides: [stats-no-focus-refetch, horizontal-bar-wins, per-player-radar-normalization]
  affects: [src/app/stats/page.tsx, src/app/stats/charts/WinsByPlayerPie.tsx, src/app/stats/charts/PlayerRadarCard.tsx, src/lib/stats.ts]
tech_stack:
  added: []
  patterns: [vertical-bar-chart, per-player-percentage-normalization]
key_files:
  created: []
  modified:
    - src/app/stats/page.tsx
    - src/lib/stats.ts
    - src/app/stats/charts/WinsByPlayerPie.tsx
    - src/app/stats/charts/PlayerRadarCard.tsx
    - tests/stats.test.ts
decisions:
  - Used jest (project test runner) instead of vitest (plan specified vitest but project uses jest)
metrics:
  duration: 166s
  completed: "2026-04-12T03:29:13Z"
  tasks: 2
  files: 5
---

# Quick Task 260411-wgv: Fix Stats Dashboard Summary

Remove focus auto-refresh, replace misleading pie chart with horizontal bar chart, and fix radar normalization to per-player percentages.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove focus refetch and fix computePlayerRadar return type | 3ffb107 | src/app/stats/page.tsx, src/lib/stats.ts, tests/stats.test.ts |
| 2 | Replace pie chart with horizontal bar chart and fix radar normalization | 6865099 | src/app/stats/charts/WinsByPlayerPie.tsx, src/app/stats/charts/PlayerRadarCard.tsx |

## Changes Made

### Task 1: Remove focus refetch + totalGames field
- Removed `window.addEventListener('focus', onFocus)` and cleanup from stats page useEffect -- now fetches on mount only
- Renamed `refetch` to `fetchData` since it is only called once
- Added `totalGames: number` field to `computePlayerRadar` return type in `src/lib/stats.ts`
- Added 2 new test assertions for `totalGames` field in `tests/stats.test.ts`

### Task 2: Horizontal bar chart + radar normalization fix
- Replaced PieChart/Pie/Legend imports with BarChart/Bar/XAxis/YAxis/CartesianGrid in WinsByPlayerPie
- Uses `layout="vertical"` with category YAxis for player names, number XAxis for win counts
- Dynamic height based on player count (`Math.max(200, data.length * 40)`)
- Rewrote PlayerRadarCard normalization: "Played" axis = `played / totalGames`, all other axes = `count / played`
- Updated tooltip to display `"{playerName}: {raw} ({pct}%)"` format
- Fixed Recharts Tooltip formatter type (removed explicit `number` annotation to match `ValueType`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Test runner mismatch**
- **Found during:** Task 1 verification
- **Issue:** Plan specified `npx vitest run` but project uses jest (`"test": "jest"` in package.json)
- **Fix:** Used `npx jest tests/stats.test.ts` instead
- **Files modified:** None (runtime change only)

**2. [Rule 1 - Bug] Recharts Tooltip formatter type**
- **Found during:** Task 2 verification
- **Issue:** `formatter={(value: number) => ...}` incompatible with Recharts v3.8 `Formatter<ValueType, NameType>` type
- **Fix:** Changed to `formatter={(value) => [\`${Number(value)} wins\`, "Wins"]}` to accept `ValueType`
- **Files modified:** src/app/stats/charts/WinsByPlayerPie.tsx
- **Commit:** 6865099

## Verification

- 42/42 jest tests pass (including 2 new totalGames assertions)
- TypeScript compiles cleanly (`npx tsc --noEmit`)
- Manual verification needed: open /stats, switch tabs (no refetch), check horizontal bars and radar shapes
