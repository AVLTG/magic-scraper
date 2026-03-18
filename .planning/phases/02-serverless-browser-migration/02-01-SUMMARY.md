---
phase: 02-serverless-browser-migration
plan: 01
subsystem: infra
tags: [puppeteer-core, chromium-min, serverless, vercel, scraping]

# Dependency graph
requires:
  - phase: 01-database-migration
    provides: Prisma/Turso DB setup that scrape API routes write to
provides:
  - Per-request browser launch via chromium-min (no bundled binary)
  - LGS scrapers accepting browser param injection pattern
  - scrapeAllSites with Promise.allSettled + failedStores error isolation
  - Moxfield collection scraper using fetch() with no browser dependency
  - next.config.ts serverExternalPackages for puppeteer-core and chromium-min
affects:
  - 02-02 (cache layer + route.ts maxDuration will build on scrapeAllSites signature)
  - any phase touching /api/scrapeLGS or /api/admin/updateCollections

# Tech tracking
tech-stack:
  added:
    - "@sparticuz/chromium-min@143.0.4 (exact pin)"
    - "puppeteer-core@24.39.1 (exact pin)"
  patterns:
    - "Per-request browser launch: launchBrowser() called in scrapeAllSites, browser passed as param to each scraper, closed in finally block"
    - "Promise.allSettled for multi-store error isolation — partial results + failedStores string[] returned"
    - "fetch() with User-Agent spoofing for unauthenticated JSON API calls (Moxfield)"

key-files:
  created:
    - src/lib/scrapeLGS/browser.ts
    - .env.local (CHROMIUM_REMOTE_EXEC_PATH — gitignored)
  modified:
    - package.json
    - package-lock.json
    - next.config.ts
    - src/lib/scrapeLGS/scrapeAllSites.ts
    - src/lib/scrapeLGS/scrapeETB.ts
    - src/lib/scrapeLGS/scrapeDCC.ts
    - src/lib/scrapeLGS/scrapeFTF.ts
    - src/lib/scrapeLGS/scrape401.ts
    - src/lib/scrapeMoxfield/scrapeMoxfield.ts
    - src/scrapeETB.ts

key-decisions:
  - "Used chromium-min@143.0.4 + puppeteer-core@24.39.1 — chromium-min@133.0.4 no longer published; 143.0.4 is the latest stable, confirmed paired via sparticuz devDependencies"
  - "Tarball URL format changed to architecture-specific in v143: using chromium-v143.0.4-pack.x64.tar (Vercel runs x64 Linux)"
  - "Dropped defaultViewport from launchBrowser() — chromium-min v143 API removed that export; no functional impact since puppeteer defaults are fine"

patterns-established:
  - "Browser param injection: scrapeAllSites owns browser lifecycle, scrapers receive Browser as function argument"
  - "Promise.allSettled + storeNames index: consistent pattern for multi-store partial-failure handling"

requirements-completed: [SCRP-01, SCRP-02]

# Metrics
duration: 7min
completed: 2026-03-17
---

# Phase 02 Plan 01: Serverless Browser Migration Summary

**puppeteer full package replaced with chromium-min@143.0.4 + puppeteer-core@24.39.1; LGS scrapers accept browser param injection; Moxfield uses fetch(); npm run build passes**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-17T17:14:29Z
- **Completed:** 2026-03-17T17:21:11Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Full `puppeteer` package removed; `@sparticuz/chromium-min@143.0.4` and `puppeteer-core@24.39.1` installed at exact versions
- `browser.ts` rewritten from module-level singleton to per-request `launchBrowser()` factory using chromium-min
- All three LGS scrapers (ETB, DCC, FTF) updated to accept `{ card, browser }` param; `getBrowser()` call removed
- `scrapeAllSites` now launches browser, passes it to all scrapers, uses `Promise.allSettled`, returns `{ products, failedStores }`
- `scrapeMoxfield` replaced browser launch + `page.goto()` + `page.evaluate()` with `fetch()` + User-Agent header
- `next.config.ts` updated with `serverExternalPackages` for both new packages
- `npm run build` completes successfully (zero TypeScript errors, zero bundle warnings)

## Task Commits

Each task was committed atomically:

1. **Task 1: Swap packages, rewrite browser.ts, update next.config.ts** - `573558f` (feat)
2. **Task 2: Update LGS scraper signatures and rewrite scrapeAllSites** - `1aa0365` (feat)
3. **Task 3: Rewrite scrapeMoxfield to use fetch()** - `31010a5` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `src/lib/scrapeLGS/browser.ts` - Per-request launchBrowser() using chromium-min; replaces getBrowser/closeBrowser singleton
- `src/lib/scrapeLGS/scrapeAllSites.ts` - Orchestrates browser lifecycle, Promise.allSettled, returns { products, failedStores }
- `src/lib/scrapeLGS/scrapeETB.ts` - Updated signature: { card, browser }; getBrowser() call removed
- `src/lib/scrapeLGS/scrapeDCC.ts` - Updated signature: { card, browser }; getBrowser() call removed
- `src/lib/scrapeLGS/scrapeFTF.ts` - Updated signature: { card, browser }; getBrowser() call removed
- `src/lib/scrapeMoxfield/scrapeMoxfield.ts` - Rewritten: fetch() + User-Agent, no browser
- `next.config.ts` - serverExternalPackages added for puppeteer-core and chromium-min
- `package.json` - puppeteer removed, chromium-min@143.0.4 + puppeteer-core@24.39.1 added at exact versions
- `.env.local` - CHROMIUM_REMOTE_EXEC_PATH set to v143.0.4 x64 tarball URL (gitignored)

## Decisions Made
- **Version pair upgraded from plan**: `chromium-min@133.0.4` (specified in plan) is no longer published on npm. Used `143.0.4` (current latest stable) paired with `puppeteer-core@24.39.1`. The sparticuz chromium-min@143.0.4 package's own devDependencies use `puppeteer-core: "^24.34.0"`, confirming the pair is tested and compatible.
- **Architecture-specific tarball URL**: v143 GitHub releases split into `pack.x64.tar` and `pack.arm64.tar` (v133 had a single `pack.tar`). Used x64 for Vercel (Linux x64 environment).
- **Removed `defaultViewport` from launch config**: chromium-min@143 TypeScript types no longer export `defaultViewport` property. Omitting it uses puppeteer's defaults (1280x720), which is sufficient for all three LGS scrapers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] chromium-min version upgraded from 133.0.4 to 143.0.4**
- **Found during:** Task 1 (package installation)
- **Issue:** `@sparticuz/chromium-min@133.0.4` returns npm 404 — version no longer published
- **Fix:** Installed `@sparticuz/chromium-min@143.0.4` + `puppeteer-core@24.39.1`; updated tarball URL to v143.0.4 x64 pack
- **Files modified:** package.json, package-lock.json, .env.local
- **Verification:** `npm install` succeeded; `npm run build` passes
- **Committed in:** 573558f (Task 1 commit)

**2. [Rule 1 - Bug] Removed defaultViewport from launchBrowser()**
- **Found during:** Task 1 (TypeScript check after writing browser.ts)
- **Issue:** `chromium.defaultViewport` does not exist in chromium-min v143 types (`Property 'defaultViewport' does not exist on type 'typeof Chromium'`)
- **Fix:** Removed `defaultViewport: chromium.defaultViewport` from puppeteer.launch() options
- **Files modified:** src/lib/scrapeLGS/browser.ts
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** 573558f (Task 1 commit)

**3. [Rule 1 - Bug] Fixed scrape401.ts and src/scrapeETB.ts to use puppeteer-core**
- **Found during:** Task 1 (TypeScript check revealed two out-of-scope files with old imports)
- **Issue:** `scrape401.ts` imported `getBrowser` (no longer exported); `src/scrapeETB.ts` (legacy duplicate) imported full `puppeteer` package
- **Fix:** Updated both files to import `Browser` from `puppeteer-core` and accept browser as a parameter
- **Files modified:** src/lib/scrapeLGS/scrape401.ts, src/scrapeETB.ts
- **Verification:** TypeScript errors for those files resolved; `npx tsc --noEmit` exits 0
- **Committed in:** 573558f (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3x Rule 1 - Bug)
**Impact on plan:** All auto-fixes required for correct operation. Version pair change is the only substantive deviation — semantically equivalent outcome (serverless Chromium), newer stable release. No scope creep.

## Issues Encountered
- None beyond the deviations documented above.

## User Setup Required
**External services require manual configuration:**
- Add `CHROMIUM_REMOTE_EXEC_PATH=https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar` to Vercel project environment variables (for production)
- `.env.local` already contains this value for local development (gitignored)

## Next Phase Readiness
- scrapeAllSites now returns `{ products, failedStores }` — plan 02-02 (cache layer) can be added to route.ts directly
- `maxDuration = 60` export not yet added to `/api/scrapeLGS/route.ts` — will be done in plan 02-02 per RESEARCH.md Pattern 6
- Build is green; all TypeScript errors resolved

## Self-Check: PASSED

- src/lib/scrapeLGS/browser.ts: FOUND
- src/lib/scrapeLGS/scrapeAllSites.ts: FOUND
- src/lib/scrapeMoxfield/scrapeMoxfield.ts: FOUND
- next.config.ts: FOUND
- .planning/phases/02-serverless-browser-migration/02-01-SUMMARY.md: FOUND
- Commit 573558f: FOUND
- Commit 1aa0365: FOUND
- Commit 31010a5: FOUND

---
*Phase: 02-serverless-browser-migration*
*Completed: 2026-03-17*
