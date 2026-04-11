---
phase: 06-game-tracking-core
plan: 05
subsystem: scraper-rate-limit
tags: [rate-limiting, scraper, surgical-edit, testing]
requirements: [OPT-01]
dependency_graph:
  requires:
    - "06-01-foundation-rate-limit"
  provides:
    - "10/60s rate limit enforced on POST /api/checkDeck"
    - "10/60s rate limit enforced on POST /api/scrapeLGS"
  affects: []
tech_stack:
  added: []
  patterns:
    - "Additive pre-guard: rate limit check inserted as first statement of POST before try/catch"
    - "Mock shared-helper import for route-handler isolation testing (jest.mock @/lib/rateLimit)"
key_files:
  created:
    - "tests/scraper-rate-limit.test.ts"
  modified:
    - "src/app/api/checkDeck/route.ts"
    - "src/app/api/scrapeLGS/route.ts"
decisions:
  - "10/60s threshold per D-24 (tighter than 30/60s game routes)"
  - "Guard placed BEFORE try/catch so 429 bypasses the generic 500 fallback"
  - "Mock signatures use any[] (matches admin-users.test.ts pattern)"
  - "mockGetIpKey uses .mockReturnValue('test-ip') to avoid jest.fn nullary signature inference"
metrics:
  completed: "2026-04-10"
  duration: "~10 minutes"
  tasks: 1
  commits: 2
  tests_added: 5
  tests_total: 50
---

# Phase 06 Plan 05: Scraper Rate Limit Summary

Applied the `checkRateLimit`/`getIpKey` helper from Plan 06-01 as a surgical pre-guard to the two existing scraper routes (`/api/checkDeck`, `/api/scrapeLGS`) at the tighter 10/60s threshold per D-24. Completes OPT-01 for scraper routes — game routes are already covered via Plans 06-03 and 06-04.

## What Was Built

### Task 1 — TDD applied to both scraper routes

**RED (commit `e54cdae`)** — Created `tests/scraper-rate-limit.test.ts` (148 lines, 5 tests):

- Mocks `@/lib/rateLimit`, `@/lib/prisma`, `@/lib/parseDeck`, `@/lib/scrapeLGS/scrapeAllSites`, `@/lib/scrapeLGS/lgsCache`, and `next/server`.
- `POST /api/checkDeck rate limiting` describe block:
  1. Calls `checkRateLimit` with `('test-ip', 10, 60000)` before DB work
  2. Returns 429 with `Retry-After: 42` when denied and does NOT call `prisma.collectionCard.findMany`
  3. Proceeds to prisma when allowed (200 status)
- `POST /api/scrapeLGS rate limiting` describe block:
  4. Returns 429 with `Retry-After: 15` and does NOT call `scrapeAllSites` or `getCached`
  5. Calls `checkRateLimit` with `('test-ip', 10, 60000)`

Verified RED: 4/5 failed as expected (only the "proceeds when allowed" test passed since the existing route already returns 200 for a valid request).

**GREEN (commit `3ed6d94`)** — Surgical additive edits to both routes:

**`src/app/api/checkDeck/route.ts`** — Added import and pre-guard (no existing lines changed):

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDeckList } from '@/lib/parseDeck';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    // ... EXISTING LOGIC UNCHANGED ...
```

Preserved verbatim: `decklist` validation, `parseDeckList(decklist)` call, `prisma.collectionCard.findMany(...)` query with its `where/include/orderBy` shape, the per-card grouping loop, the `results` array transform, the `{ results }` response body, and the error handler (`console.error('Deck check error:', error)` + 500 shape).

**`src/app/api/scrapeLGS/route.ts`** — Same additive pattern:

```typescript
import { NextResponse } from "next/server";
import { scrapeAllSites } from "@/lib/scrapeLGS/scrapeAllSites";
import { getCached, setCache } from "@/lib/scrapeLGS/lgsCache";
import { checkRateLimit, getIpKey } from "@/lib/rateLimit";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }
  try {
    // ... EXISTING LOGIC UNCHANGED ...
```

Preserved verbatim: `card` extraction and empty-string 400 check, `getCached(card)` short-circuit, `scrapeAllSites(card)` invocation, `setCache(card, ...)` call, `{ products, failedStores }` response body, and the error handler (`console.error("Scrape failed", error)` + 500 shape).

## Verification Results

| Check                                      | Result                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `npx jest tests/scraper-rate-limit.test.ts` | 5/5 pass, ~640ms                                  |
| `npx jest` (full suite)                    | 50/50 pass (45 pre-existing + 5 new), ~950ms      |
| `npx tsc --noEmit`                         | Clean, no errors                                  |
| checkDeck literal `checkRateLimit(getIpKey(request), 10, 60000)` | Present (1 match)        |
| checkDeck preserved `parseDeckList`        | Present (2 matches — import + call)               |
| checkDeck preserved `prisma.collectionCard.findMany` | Present (1 match)                       |
| scrapeLGS literal `checkRateLimit(getIpKey(request), 10, 60000)` | Present (1 match)        |
| scrapeLGS preserved `scrapeAllSites`       | Present (2 matches — import + call)               |
| `/api/cron` files modified                 | None (per D-22 exclusion)                         |
| `/api/auth` files modified                 | None (per D-22 exclusion)                         |

## Deviations from Plan

Three small adjustments, all additive/non-structural:

**1. [Rule 3 - Blocking] Mock type annotations `unknown[]` → `any[]`**
- **Found during:** Running `npx tsc --noEmit` after GREEN edit
- **Issue:** `TS2556: A spread argument must either have a tuple type or be passed to a rest parameter` on `mockFn(...args)` where `args: unknown[]`
- **Fix:** Changed all mock rest-arg signatures from `(...args: unknown[])` to `(...args: any[])` to match the existing pattern in `tests/admin-users.test.ts`
- **Files modified:** `tests/scraper-rate-limit.test.ts`
- **Included in:** Commit `3ed6d94` (GREEN)

**2. [Rule 3 - Blocking] `mockGetIpKey` initializer form**
- **Found during:** Running `npx tsc --noEmit`
- **Issue:** `const mockGetIpKey = jest.fn(() => 'test-ip')` infers a nullary signature `() => string`, which rejected the `(...args: any[]) => mockGetIpKey(...args)` spread
- **Fix:** Declared `const mockGetIpKey = jest.fn();` then set behavior via `mockGetIpKey.mockReturnValue('test-ip');` at module scope. `clearAllMocks()` in `beforeEach` does not clear the `mockReturnValue` so behavior persists across tests.
- **Files modified:** `tests/scraper-rate-limit.test.ts`
- **Included in:** Commit `3ed6d94` (GREEN)

**3. [Rule 3 - Missing mock] Added `@/lib/parseDeck` mock**
- **Found during:** Writing the test file (plan only listed prisma, scrapeAllSites, rateLimit, next/server)
- **Issue:** The "proceeds when allowed" checkDeck test passes a real decklist string; without mocking `parseDeckList` the test would depend on the real implementation. Plan anticipated this was fine, but mocking it explicitly makes the test fully hermetic and prevents false positives.
- **Fix:** Added a lightweight `jest.mock('@/lib/parseDeck', ...)` returning a simple `"N Name"` line parser.
- **Files modified:** `tests/scraper-rate-limit.test.ts`
- **Included in:** Commit `e54cdae` (RED)

**4. Test structure simplified vs plan**
- Plan suggested using `require('../src/app/api/scrapeLGS/route')` with try/catch guards for the scrapeLGS route because it imports Puppeteer transitively. In practice the `@/lib/scrapeLGS/scrapeAllSites` mock short-circuits that import chain before Puppeteer loads, so a top-level `import { POST as scrapeLGSPost } from '../src/app/api/scrapeLGS/route'` works cleanly. No `require` / `isolateModules` / import-error guards needed.

No scope violations — all changes are confined to the files listed in the plan's `files_modified` block.

## Key Decisions Made

- Honored D-24 literally: `(getIpKey(request), 10, 60000)` — not 30/60s.
- Guard placed BEFORE the `try` block so a 429 never flows through the generic `catch` → 500 fallback.
- No changes to `/api/cron` or `/api/auth` (D-22 exclusion preserved).
- No cache-control header added — rate limiting is orthogonal to caching (which is handled by the existing `getCached`/`setCache` in scrapeLGS, left untouched).
- Kept `Request` type for the parameter (not `NextRequest`) — matches the existing helper signature in `src/lib/rateLimit.ts` and both existing route handlers.

## Threat Model Coverage

| Threat ID | Status     | Notes                                                                                                                                                |
| --------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-06-04   | mitigated  | `checkDeck` 429s before `prisma.collectionCard.findMany` is reached. Verified by the "does NOT call prisma" assertion in the rate-limited test case.  |
| T-06-04b  | mitigated  | `scrapeLGS` 429s before `getCached` or `scrapeAllSites` are reached. Verified by the dual `not.toHaveBeenCalled()` assertions on both mocks.          |
| T-06-REG  | mitigated  | Only additive lines introduced; no existing line modified. All 45 pre-existing tests still pass. Preserved literals verified via grep.                |

## Threat Flags

None — this plan adds a rate-limit pre-guard to two existing routes. No new network surface, no auth/schema/file-access changes, no new trust boundaries. OPT-01 is now fully covered across the phase: game routes (via Plans 06-03/06-04 at 30/60s) and scraper routes (via this plan at 10/60s).

## Known Stubs

None — no placeholder data, no hardcoded empty UI values, no TODOs introduced.

## Commits

| Commit    | Type | Message                                                        |
| --------- | ---- | -------------------------------------------------------------- |
| `e54cdae` | test | add failing tests for scraper route rate limiting (RED)        |
| `3ed6d94` | feat | apply rate limit guard to scraper routes (10/60s) (GREEN)      |

## Self-Check: PASSED

- `tests/scraper-rate-limit.test.ts` exists (verified)
- `src/app/api/checkDeck/route.ts` contains `import { checkRateLimit, getIpKey } from '@/lib/rateLimit'` (verified via grep)
- `src/app/api/checkDeck/route.ts` contains `checkRateLimit(getIpKey(request), 10, 60000)` (verified via grep)
- `src/app/api/checkDeck/route.ts` still contains `parseDeckList` and `prisma.collectionCard.findMany` (verified via grep)
- `src/app/api/scrapeLGS/route.ts` contains `import { checkRateLimit, getIpKey } from "@/lib/rateLimit"` (verified via grep)
- `src/app/api/scrapeLGS/route.ts` contains `checkRateLimit(getIpKey(request), 10, 60000)` (verified via grep)
- `src/app/api/scrapeLGS/route.ts` still contains `scrapeAllSites` (verified via grep)
- Commit `e54cdae` exists in git log
- Commit `3ed6d94` exists in git log
- 50/50 jest tests pass
- `tsc --noEmit` clean
- `/api/cron` and `/api/auth` routes unmodified (verified via `git status`)
