---
phase: 06-game-tracking-core
plan: 01
subsystem: foundation
tags: [rate-limiting, testing, infrastructure]
requirements: [OPT-01]
dependency_graph:
  requires: []
  provides:
    - "src/lib/rateLimit.ts::checkRateLimit"
    - "src/lib/rateLimit.ts::getIpKey"
    - "npm test script"
  affects:
    - "06-03-autocomplete-api"
    - "06-04-games-api"
    - "06-05-scraper-rate-limit"
tech_stack:
  added: []
  patterns:
    - "Module-level singleton Map (mirrors src/lib/prisma.ts pattern)"
    - "Sliding-window rate limiting via timestamp array + filter prune"
    - "TDD red-green-refactor (RED commit 252181f, GREEN commit 6f31398)"
key_files:
  created:
    - "src/lib/rateLimit.ts"
    - "tests/rate-limit.test.ts"
  modified:
    - "package.json"
decisions:
  - "Per-instance memory Map accepted (no Redis) per D-28"
  - "IP-only keying via x-forwarded-for first entry per D-23"
  - "Sliding window over fixed-bucket per D-25"
  - "retryAfterSeconds floors at 1 (never 0) to guarantee client backoff"
metrics:
  completed: "2026-04-11"
  duration: "~8 minutes"
  tasks: 2
  commits: 3
  tests_added: 7
  tests_total: 34
---

# Phase 06 Plan 01: Foundation — Rate Limit Helper Summary

Established the Wave 0 foundation for Phase 6 game tracking: an in-memory sliding-window rate limiter (`checkRateLimit`), an `x-forwarded-for` IP extractor (`getIpKey`), unit tests for both, and the missing `npm test` script — unblocking 06-03, 06-04, and 06-05.

## What Was Built

### Task 1 — npm test script (commit `dcae5e2`)

Added `"test": "jest"` to `package.json` scripts block after the existing `"lint"` entry. The 27 pre-existing tests now run via `npm test` instead of requiring `npx jest`. No new dependencies installed — jest@^30, ts-jest@^29, and @types/jest@^30 were already in `devDependencies`.

### Task 2 — Rate limit helper (TDD: RED `252181f`, GREEN `6f31398`)

**`src/lib/rateLimit.ts`** (36 lines) — module-level singleton pattern mirroring `src/lib/prisma.ts`:

```typescript
const buckets = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function getIpKey(request: Request): string;
```

- **Algorithm:** On each call, retrieve the timestamp array for `key`, filter out entries older than `now - windowMs` (sliding window prune), compare length to `limit`. If at/above limit, compute `retryAfterSeconds` from the oldest in-window entry and return `{ allowed: false, retryAfterSeconds }`. Otherwise append `now` and return `{ allowed: true }`.
- **retryAfterSeconds formula:** `Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000))` — floors at 1 so clients always back off at least 1 second.
- **getIpKey:** Returns `request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'` — parses the first entry of the comma-separated header, trims whitespace, falls back to the literal `'unknown'` bucket per D-23.
- **No cleanup/GC logic:** Per RESEARCH.md Pitfall 5, the filter call naturally shrinks arrays and the ~10-user private app does not need active cleanup.

**`tests/rate-limit.test.ts`** (81 lines, 7 tests):

1. `checkRateLimit` allows calls up to the limit
2. Denies the first call past the limit with `retryAfterSeconds` in `(0, 60]`
3. Tracks different keys (`ip-a`, `ip-b`) independently
4. Resets after the window elapses (uses `jest.useFakeTimers()` + `jest.advanceTimersByTime(60001)`)
5. `getIpKey` returns the first entry from `'1.2.3.4, 5.6.7.8'`
6. `getIpKey` trims whitespace from `'  1.2.3.4  '`
7. `getIpKey` returns `'unknown'` when `x-forwarded-for` is missing

`jest.resetModules()` is called in `beforeEach` to get a fresh `buckets` Map per test — the module-level singleton would otherwise leak state across tests.

## Exported Contract (for downstream plans)

Downstream plans 06-03 (autocomplete API), 06-04 (games API), and 06-05 (scraper rate limit) consume this contract:

```typescript
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

// Game routes: 30 requests per 60s window per D-24
const rl = checkRateLimit(getIpKey(request), 30, 60_000);

// Scraper routes: 10 requests per 60s window per D-24
const rl = checkRateLimit(getIpKey(request), 10, 60_000);

if (!rl.allowed) {
  return NextResponse.json(
    { error: 'Rate limit exceeded' },
    {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSeconds) },
    }
  );
}
```

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` (was missing script error) | Runs `jest`, exits 0 |
| `npx jest tests/rate-limit.test.ts` | 7/7 pass, 604ms |
| `npx jest` (full suite) | 34/34 pass (27 existing + 7 new), 2.43s |
| `npx tsc --noEmit` | Clean, no errors |
| No new `dependencies` or `devDependencies` | Confirmed |

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the spec verbatim, including the literal implementation code and test structure provided in the plan's `<action>` blocks.

## Key Decisions Made

- Honored D-23 (IP-only keying, no cookie/auth-based keying), D-25 (sliding window, not fixed bucket), D-27 (single exported function + module-level Map), D-28 (per-instance memory accepted).
- Used `Request` (standard DOM type) instead of `NextRequest` so the helper works in any route handler signature, matching the existing pattern in `src/app/api/checkDeck/route.ts`.
- `retryAfterSeconds` floors at `1` (never `0`) so clients always back off at least one second even at window boundaries.

## Threat Model Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-06-04 (DoS via unbounded requests) | **mitigated** | `checkRateLimit` helper delivered; downstream 06-03/04/05 plans will call it at handler top |
| T-06-08 (x-forwarded-for spoofing) | **accepted** | `?? 'unknown'` fallback means a spoofed-empty header shares the 'unknown' bucket. Acceptable for private ~10-user app per D-28 |
| T-06-DoS-Map (Map growth) | **accepted** | Timestamp arrays prune on every call; Map keys stay but hold `[]`. Negligible memory for private app |

## Threat Flags

None — this plan introduces only an internal helper module with no new network surface, auth paths, or schema changes.

## Commits

| Commit | Type | Message |
|--------|------|---------|
| `dcae5e2` | chore | add npm test script |
| `252181f` | test | add failing tests for rate limit helper (RED) |
| `6f31398` | feat | implement sliding-window rate limit helper (GREEN) |

## Self-Check: PASSED

- `src/lib/rateLimit.ts` exists (verified)
- `tests/rate-limit.test.ts` exists (verified)
- `package.json` contains `"test": "jest"` (verified)
- Commit `dcae5e2` exists in git log
- Commit `252181f` exists in git log
- Commit `6f31398` exists in git log
- 34/34 jest tests pass
- `tsc --noEmit` clean
