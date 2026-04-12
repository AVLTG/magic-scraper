---
phase: 07-stats-dashboard
plan: 01
subsystem: stats
tags: [recharts, pure-functions, unit-tests, stats, typescript]

# Dependency graph
requires:
  - phase: 06.1-game-differentiation-and-sanitization
    provides: isImported column on Game table, filter infrastructure
provides:
  - 9 pure stat computation helpers in src/lib/stats.ts
  - isoWeekStartUTC and weeksBetween utility functions
  - Recharts runtime dependency installed
  - Game interface updated with isImported field
affects: [07-02, 07-03, stats-dashboard-ui]

# Tech tracking
tech-stack:
  added: [recharts@^3.8.1]
  patterns: [pure-function-stats-layer, imported-game-exclusion-for-deck-stats]

key-files:
  created:
    - src/lib/stats.ts
    - tests/stats.test.ts
  modified:
    - package.json
    - package-lock.json
    - src/app/games/page.tsx
    - tests/games-filter.test.ts

key-decisions:
  - "Game interface isImported field made required (boolean, not optional) since Prisma schema defaults it to false"
  - "Deck win rate counts played as distinct games where deck appeared (not just winner uses)"
  - "Bump chart uses cumulative participation rate with ties sharing rank"

patterns-established:
  - "Pure stat helpers: import Game type, return sorted arrays, exclude zero-denominator entries"
  - "D-16/D-17 filtering: deck/combo stats filter !isImported, player stats include all"
  - "ISO week bucketing: always use getUTCDay() for timezone-safe week calculation"

requirements-completed: [STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-08]

# Metrics
duration: 5min
completed: 2026-04-12
---

# Phase 7 Plan 01: Stat Computation Helpers Summary

**9 pure stat helpers (win rate, deck win rate, screwed rate, weekly frequency, participation, bump chart, pie data, radar) with 40 unit tests and Recharts installed**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T02:23:45Z
- **Completed:** 2026-04-12T02:28:45Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Installed Recharts ^3.8.1 as runtime dependency
- Created src/lib/stats.ts with 9 exported stat helpers plus 2 utility functions (isoWeekStartUTC, weeksBetween)
- Created tests/stats.test.ts with 40 passing unit tests covering all helpers, edge cases, and filtering rules
- Added isImported field to Game interface in page.tsx and fixed existing test fixture

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Recharts and create stats helpers with unit tests** - `08e9d75` (feat)

## Files Created/Modified
- `src/lib/stats.ts` - 9 pure stat computation helpers + 2 utility functions
- `tests/stats.test.ts` - 40 unit tests with 5-game fixture spanning 3 weeks
- `package.json` - Added recharts@^3.8.1 dependency
- `package-lock.json` - Lock file updated
- `src/app/games/page.tsx` - Added isImported: boolean to Game interface
- `tests/games-filter.test.ts` - Added isImported to mkGame fixture

## Decisions Made
- Made isImported a required boolean (not optional) on Game interface since Prisma schema defaults it to false -- all API responses will include it
- Deck win rate "played" count = distinct games where any participant used that deck (not just winner uses), matching the plan specification
- Bump chart cumulative ranking: ties share the same rank number, next rank skips (standard competition ranking)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed games-filter.test.ts fixture missing isImported field**
- **Found during:** Task 1 (tsc --noEmit verification)
- **Issue:** Adding isImported as required on Game interface broke the existing mkGame helper in games-filter.test.ts
- **Fix:** Added `isImported: false` to the mkGame return object
- **Files modified:** tests/games-filter.test.ts
- **Verification:** tsc --noEmit passes, all 185 tests pass
- **Committed in:** 08e9d75 (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for type correctness after adding isImported to Game interface. No scope creep.

## Issues Encountered
- Jest 30 renamed `--testPathPattern` to `--testPathPatterns` -- used correct flag

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 9 stat helpers ready for chart rendering in Plan 02 (chart components) and Plan 03 (dashboard page)
- Recharts installed and available for import
- Game interface updated with isImported field for proper filtering

---
*Phase: 07-stats-dashboard*
*Completed: 2026-04-12*
