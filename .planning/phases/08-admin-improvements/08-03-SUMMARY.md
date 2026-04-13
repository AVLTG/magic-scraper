---
phase: 08-admin-improvements
plan: "03"
subsystem: admin
tags: [scraper-health, admin-panel, in-memory-cache, api-endpoint]
dependency_graph:
  requires: []
  provides: [scraper-health-cache, scraper-health-api, admin-scraper-health-ui]
  affects: [src/lib/scrapeLGS/scrapeAllSites.ts, src/app/admin/page.tsx]
tech_stack:
  added: []
  patterns: [in-memory-Map-cache, Next.js-route-handler, TDD-red-green]
key_files:
  created:
    - src/lib/scraperHealthCache.ts
    - src/app/api/admin/scraper-health/route.ts
    - tests/scraper-health-cache.test.ts
  modified:
    - src/lib/scrapeLGS/scrapeAllSites.ts
    - src/app/admin/page.tsx
decisions:
  - "401 Games initialized as unknown/disabled in cache (not wired to any scraper)"
  - "StatusDot and relativeTime defined locally in admin page (Plan 02 may not have run yet in wave)"
  - "Scraper health fetch runs in existing useEffect alongside fetchUsers"
metrics:
  duration: ~8min
  completed_date: "2026-04-13"
  tasks_completed: 2
  files_modified: 5
---

# Phase 08 Plan 03: Scraper Health Dashboard Summary

**One-liner:** In-memory Map cache tracks per-store scrape success/failure, exposed via GET /api/admin/scraper-health and visualized on the admin page with status dots, relative timestamps, and expandable error messages.

## What Was Built

### Task 1: Scraper health cache module, scrapeAllSites integration, and API endpoint
- Created `src/lib/scraperHealthCache.ts` — in-memory Map with `getStoreHealth`, `setStoreHealth`, `getAllStoreHealth` exports; 401 Games pre-initialized as `{ status: "unknown", lastRun: null, error: null }`
- Updated `src/lib/scrapeLGS/scrapeAllSites.ts` — calls `setStoreHealth` after each store result (success or failure with error message)
- Created `src/app/api/admin/scraper-health/route.ts` — GET endpoint returning `getAllStoreHealth()` as JSON
- Created `tests/scraper-health-cache.test.ts` — 7 tests covering get/set round-trips, default unknown, getAllStoreHealth with 401 Games, and overwrite behavior

### Task 2: Scraper health section on admin page
- Added `StatusDot` (green/red/grey dot) and `relativeTime` (human-readable elapsed) helper components
- Added `DISABLED_STORES = new Set(["401 Games"])` constant
- Added `storeHealth` and `expandedStore` state
- Fetch `/api/admin/scraper-health` on mount alongside existing `fetchUsers`
- Rendered "Scraper Health" section below "Sync Collections" with:
  - Status dot per store (emerald = success, red = failure, zinc = unknown)
  - Relative timestamp for last run
  - 401 Games shown as grey/strikethrough with "(disabled)" label
  - Failed stores clickable to expand truncated error message (first 200 chars)

## Verification

- `npx jest --testPathPatterns="scraper-health" --no-coverage` — 7 tests pass
- `npx tsc --noEmit` — TypeScript compiles cleanly
- `npx jest --no-coverage` — full suite: 194 tests pass (14 suites)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — the scraper health section shows live data from the in-memory cache. On cold start (before any card searches), stores will show "No scraper data available." until a scrape runs, which is expected and documented in the UI copy.

## Threat Flags

None — no new trust boundaries beyond the plan's threat model (GET /api/admin/scraper-health reads in-memory cache, no sensitive data, admin-only access).

## Self-Check

### Files exist:
- src/lib/scraperHealthCache.ts: FOUND
- src/app/api/admin/scraper-health/route.ts: FOUND
- tests/scraper-health-cache.test.ts: FOUND
- src/lib/scrapeLGS/scrapeAllSites.ts: modified (FOUND)
- src/app/admin/page.tsx: modified (FOUND)

### Commits:
- 445cad1: feat(08-03): scraper health cache, API endpoint, scrapeAllSites integration
- 2edc0c4: feat(08-03): scraper health section on admin page

## Self-Check: PASSED

## Checkpoint Pending

Task 3 is a `checkpoint:human-verify` — visual verification of the scraper health section on the admin page is pending user approval before this plan is fully complete.
