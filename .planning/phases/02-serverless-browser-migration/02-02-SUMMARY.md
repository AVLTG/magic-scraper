---
phase: 02-serverless-browser-migration
plan: 02
subsystem: api
tags: [nextjs, cache, in-memory, ttl, scraper, react]

# Dependency graph
requires:
  - phase: 02-01
    provides: scrapeAllSites returning { products, failedStores } shape
provides:
  - In-memory TTL cache for LGS scrape results (1-hour window, lowercased key)
  - Cache-wrapped scrapeLGS API route with maxDuration = 60
  - SearchLGS UI with per-store failure warning banner
affects: [03-cron-sync, 04-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [module-level Map for warm-invocation cache, TTL expiry on read, partial-result caching with failedStores]

key-files:
  created:
    - src/lib/scrapeLGS/lgsCache.ts
  modified:
    - src/app/api/scrapeLGS/route.ts
    - src/app/SearchLGS/page.tsx

key-decisions:
  - "Cache partial results (products + failedStores) — one flaky store should not invalidate the entire cache entry"
  - "maxDuration = 60 on scrapeLGS route — Vercel serverless function needs explicit 60s budget for browser scraping"

patterns-established:
  - "Pattern: module-level Map as warm-invocation cache; cold starts accepted as TTL reset (per prior user decision)"
  - "Pattern: getCached checks and deletes stale entries lazily on read"

requirements-completed: [SCRP-03, SCRP-04]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 2 Plan 02: Cache and failedStores Summary

**In-memory TTL cache (1h) for LGS scrapes via module-level Map, scrapeLGS route wrapped with cache + maxDuration=60, and SearchLGS UI showing per-store failure notice**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-17T17:45:14Z
- **Completed:** 2026-03-17T17:50:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created `lgsCache.ts` with `getCached`/`setCache` using a module-level Map, 1-hour TTL, lowercased cache key
- Rewrote `route.ts` to check cache first (skip browser launch on hit), cache results after scraping, return `failedStores` alongside `products`, export `maxDuration = 60`
- Updated `SearchLGS/page.tsx` to read `failedStores` from response and render a yellow warning banner when one or more stores are unavailable

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cache module and update scrapeLGS route** - `c2d064a` (feat)
2. **Task 2: Update SearchLGS UI to display failedStores notices** - `b4a2e79` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/lib/scrapeLGS/lgsCache.ts` - New module-level Map cache with getCached/setCache, 1h TTL
- `src/app/api/scrapeLGS/route.ts` - Cache-wrapped POST handler with maxDuration=60 and failedStores in response
- `src/app/SearchLGS/page.tsx` - Added failedStores state, warning banner, and cleared state per search

## Decisions Made
- Caching partial results (products + failedStores together) — a single flaky store should not discard a valid partial cache entry
- maxDuration = 60 set explicitly on the route — required for Vercel to allow the 60s function budget needed for browser scraping

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- LGS scraping is now cache-efficient and Vercel-compatible; repeated same-card searches within 1 hour skip browser launches
- failedStores propagation complete end-to-end (scraper → route → UI)
- Phase 3 (cron sync) can proceed independently

---
*Phase: 02-serverless-browser-migration*
*Completed: 2026-03-17*
