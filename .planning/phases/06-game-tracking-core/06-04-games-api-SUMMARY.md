---
phase: 06-game-tracking-core
plan: 04
subsystem: games-api
tags: [api, crud, prisma, transactions, rate-limit, zod]
requirements: [GAME-01, GAME-02, GAME-03, GAME-06, GAME-07, GAME-08, GAME-09, OPT-01]
dependency_graph:
  requires:
    - "src/lib/rateLimit.ts::checkRateLimit (06-01)"
    - "src/lib/rateLimit.ts::getIpKey (06-01)"
    - "src/lib/validators.ts::gameSchema (phase 5)"
    - "prisma.game + prisma.gameParticipant models (phase 5)"
  provides:
    - "POST /api/games"
    - "GET /api/games"
    - "GET /api/games/[id]"
    - "PATCH /api/games/[id]"
    - "DELETE /api/games/[id]"
  affects:
    - "06-06-games-pages (consumes these endpoints directly)"
tech_stack:
  added: []
  patterns:
    - "Prisma $transaction callback form for atomic Game + GameParticipant writes (D-16)"
    - "Next.js 16 async params contract (params: Promise<{ id: string }>, await params)"
    - "Prisma P2025 error code → 404 mapping for update/delete on missing rows"
    - "onDelete: Cascade relied upon for DELETE (no explicit participant cleanup)"
    - "All validation delegated to gameSchema.parse — no manual trim/substring at route layer (D-29)"
    - "checkRateLimit(ip, 30, 60000) gate before any body parse or DB work (D-24)"
    - "TDD red-green-refactor with two RED + two GREEN commits"
key_files:
  created:
    - "src/app/api/games/route.ts"
    - "src/app/api/games/[id]/route.ts"
    - "tests/games-api.test.ts"
  modified: []
decisions:
  - "ZodError → 400 with error.issues body (Zod v4 canonical field)"
  - "PATCH uses deleteMany+update+createMany inside one $transaction callback rather than per-row diff (D-16)"
  - "DELETE performs a single prisma.game.delete — GameParticipant rows cascade automatically via schema (onDelete: Cascade)"
  - "All 5 endpoints use the same rate limit bucket config: checkRateLimit(ip, 30, 60000) per D-24"
metrics:
  completed: "2026-04-10"
  duration: "~10 minutes"
  tasks: 2
  commits: 4
  tests_added: 22
  tests_total: 67
---

# Phase 06 Plan 04: Games API Summary

Implemented all five CRUD endpoints for `/api/games` — POST/GET on the collection and GET/PATCH/DELETE on `[id]` — using `gameSchema.parse` for validation (D-29), `prisma.$transaction` for atomic Game + GameParticipant writes (D-16), `onDelete: Cascade` for DELETE, and `checkRateLimit` from 06-01 on every method (D-24). These routes are the complete data layer that plan 06-06 (game pages) will consume directly.

## What Was Built

### Task 1 — `/api/games/route.ts` (POST + GET)

**RED commit `4edd466`** — Added `tests/games-api.test.ts` with 11 failing tests covering the collection endpoints. Mocks `@/lib/prisma`, `@/lib/rateLimit`, and `next/server` using the pattern established by `tests/auth-login.test.ts`.

**GREEN commit `fa4eab5`** — `src/app/api/games/route.ts`:

- **POST** (74 lines total across both handlers):
  1. `checkRateLimit(getIpKey(request), 30, 60000)` → 429 + `Retry-After` header if exceeded
  2. `gameSchema.parse(body)` → 400 with `error.issues` on ZodError
  3. `prisma.$transaction(async (tx) => { tx.game.create → tx.gameParticipant.createMany → return created })` → 201 with `{ game }`
  4. Non-Zod errors → 500 `{ error: 'Failed to create game' }`
- **GET**:
  1. Same rate limit gate
  2. `prisma.game.findMany({ include: { participants: true }, orderBy: { date: 'desc' } })` → 200 `{ games }`
  3. DB errors → 500 `{ error: 'Failed to fetch games' }`

### Task 2 — `/api/games/[id]/route.ts` (GET, PATCH, DELETE)

**RED commit `fffbc3b`** — Appended three new describe blocks (11 more failing tests) to `tests/games-api.test.ts` plus a `makeParams(id)` helper that returns `{ params: Promise.resolve({ id }) }` (Next.js 16 async contract).

**GREEN commit `705b9cc`** — `src/app/api/games/[id]/route.ts` (132 lines):

All three handlers use the signature `(request: Request, { params }: { params: Promise<{ id: string }> })` with `const { id } = await params` per Next.js 16 (RESEARCH.md Pattern 3).

- **GET**: `prisma.game.findUnique({ where: { id }, include: { participants: true } })` → 200 or 404.
- **PATCH**: `gameSchema.parse(body)` → `$transaction` callback running `deleteMany({ where: { gameId } }) → game.update({ where: { id }, data: {...} }) → createMany({ data: participants.map(...) })`. P2025 caught → 404; ZodError → 400.
- **DELETE**: Single `prisma.game.delete({ where: { id } })`. **Does not** call `gameParticipant.deleteMany` — `onDelete: Cascade` on the FK handles child rows. Verified by the test `'does NOT explicitly delete participants (cascade handles it)'`.

A small helper:

```typescript
const PRISMA_NOT_FOUND = 'P2025';
function isPrismaNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: string }).code === PRISMA_NOT_FOUND;
}
```

is used by PATCH and DELETE catch blocks to map Prisma's "record not found" error to HTTP 404.

## Endpoint Contracts (for Plan 06-06)

```
POST   /api/games          body=gameSchema   → 201 { game }      | 400 ZodIssue[] | 429 | 500
GET    /api/games          —                 → 200 { games: (Game & { participants: GameParticipant[] })[] }
GET    /api/games/[id]     —                 → 200 { game: Game & { participants: GameParticipant[] } } | 404
PATCH  /api/games/[id]     body=gameSchema   → 200 { game }      | 400 | 404 | 429 | 500
DELETE /api/games/[id]     —                 → 200 { ok: true }  | 404 | 429 | 500
```

All 429 responses include `Retry-After: <seconds>` header.
GET list is sorted `date desc`; no pagination (D-12).
PATCH is a full replace, not a partial merge.

## Verification Results

| Check                                   | Result                                       |
| --------------------------------------- | -------------------------------------------- |
| `npx jest tests/games-api.test.ts`      | 22/22 pass, 0.75s                            |
| `npx jest` (full suite)                 | 67/67 pass (45 baseline + 22 new), 1.0s      |
| `npx tsc --noEmit`                      | Clean                                        |
| POST + GET + GET[id] + PATCH + DELETE   | All 5 handlers exported                      |
| `checkRateLimit(..., 30, 60000)` usage  | Present in all 5 handlers                    |
| `gameSchema.parse(body)` usage          | Present in POST and PATCH (not GET/DELETE)   |
| `prisma.$transaction` usage             | Present in POST and PATCH                    |
| `include: { participants: true }`       | Present in GET list and GET by id            |
| `orderBy: { date: 'desc' }`             | Present in GET list                          |
| `await params`                          | Present in all three `[id]` handlers         |
| DELETE does NOT call `deleteMany`       | Verified by test; cascade handles children   |
| No manual `.trim()` / `.substring()`    | Confirmed — all sanitization in gameSchema   |

## Test Coverage (22 tests across 5 describe blocks)

- **POST /api/games** (8): atomic create, missing participants → 400, >4 participants → 400, empty playerName → 400, winner+screwed allowed, 429 + Retry-After, tx failure → 500, rate limit arg shape.
- **GET /api/games** (3): ordered list with include, 429, DB error → 500.
- **GET /api/games/[id]** (3): found 200, 404 null, 429.
- **PATCH /api/games/[id]** (4): full-replace tx (delete+update+create), ZodError → 400, P2025 → 404, 429.
- **DELETE /api/games/[id]** (4): success → `{ ok: true }`, cascade (no explicit deleteMany), P2025 → 404, 429.

## Deviations from Plan

**Auto-fixed issues:**

**1. [Rule 3 — Blocking] Fixed TypeScript strict signature on `mockGetIpKey`**
- **Found during:** Task 1 GREEN verification (`npx tsc --noEmit`)
- **Issue:** `const mockGetIpKey = jest.fn(() => 'test-ip')` created a zero-arg signature, but the mock is invoked with `mockGetIpKey(...args)` in the `jest.mock('@/lib/rateLimit', ...)` factory — causing `TS2556: A spread argument must either have a tuple type or be passed to a rest parameter`.
- **Fix:** Changed to `jest.fn((..._args: unknown[]) => 'test-ip')` so the mock accepts rest arguments.
- **Files modified:** `tests/games-api.test.ts`
- **Commit:** bundled into Task 1 GREEN commit `fa4eab5` (caught before the commit was finalized)

Plan otherwise executed exactly as written — literal test and implementation code from the `<action>` blocks was used verbatim.

## Key Decisions Made

- **Zod v4 `error.issues`:** Used the canonical Zod v4 field name. The installed version is `zod@^4.3.6` per `package.json`; `.issues` is the accessor. Tests assert `res.status === 400` only (not body shape), so the choice is validated behavior-wise and also TypeScript-clean.
- **Single rate limit config across all 5 endpoints:** 30 requests / 60s window per IP. Separate buckets per IP via `getIpKey` from 06-01.
- **PATCH full-replace over diff:** Per D-16 — simpler, atomic, and matches the Phase 6 UX (edit page always sends the full participant set).
- **DELETE relies solely on schema cascade:** No explicit `gameParticipant.deleteMany` call. The schema's `onDelete: Cascade` on `GameParticipant.gameId` handles children. Explicitly tested via `expect(mockParticipantDeleteMany).not.toHaveBeenCalled()`.
- **No auth checks in handlers:** `proxy.ts` middleware covers `/api/games/**` via the blocklist matcher per D-22 / RESEARCH.md Pattern 7. Adding per-handler auth would duplicate middleware work.

## Threat Model Coverage

| Threat ID | Status | Notes |
|-----------|--------|-------|
| T-06-01 (Spoofing: unauth access) | **mitigated (inherited)** | `proxy.ts` HMAC cookie middleware covers `/api/games/**` — no per-route auth code needed |
| T-06-02 (Tampering / SQL injection) | **mitigated** | All DB writes use Prisma parameterized methods (`create`, `findMany`, `findUnique`, `update`, `delete`, `createMany`, `deleteMany`). No `$queryRaw`. `gameSchema` enforces max lengths (playerName/deckName ≤ 100, notes ≤ 1000). |
| T-06-05 (Mass assignment) | **mitigated** | `gameSchema.parse` strips unknown fields (Zod default behavior); routes destructure only `{ date, wonByCombo, notes, participants }`; participant `.map` projects only the 5 allowed fields into Prisma. |
| T-06-06 (Tampering / Race: partial insert) | **mitigated** | POST wraps `game.create + gameParticipant.createMany` in a `prisma.$transaction` callback; PATCH wraps `deleteMany + update + createMany` in the same. Verified by test "creates game with participants atomically" (mockTransaction called exactly once per POST). |
| T-06-04 (DoS via bulk requests) | **mitigated** | `checkRateLimit(ip, 30, 60000)` gates every handler **before** body parse or DB work. Verified by tests "returns 429 ... prisma NEVER called" across all 5 endpoints. |
| T-06-09 (Info disclosure via error bodies) | **mitigated** | Catch blocks return only static `{ error: 'Failed to ...' }` strings; stack traces logged server-side via `console.error` only. ZodError returns `error.issues` (field-level errors needed by client) — issues contain no DB internals. |

## Threat Flags

None — this plan introduces 5 new network endpoints that are all explicitly listed in the plan's `<threat_model>` section with `mitigate` dispositions, all of which have been implemented as specified. No new schema, auth, or file-access surface was introduced.

## Known Stubs

None — all endpoints are fully wired to Prisma and return real data/responses. No hardcoded placeholder values, no TODO comments, no empty data flows.

## Commits

| Commit    | Type | Message                                                                      |
| --------- | ---- | ---------------------------------------------------------------------------- |
| `4edd466` | test | add failing tests for /api/games POST+GET (RED)                              |
| `fa4eab5` | feat | implement POST+GET /api/games with rate limit and transaction                |
| `fffbc3b` | test | add failing tests for /api/games/[id] GET+PATCH+DELETE (RED)                 |
| `705b9cc` | feat | implement GET+PATCH+DELETE /api/games/[id] with cascade delete               |

## Self-Check: PASSED

- `src/app/api/games/route.ts` exists (verified)
- `src/app/api/games/[id]/route.ts` exists (verified)
- `tests/games-api.test.ts` exists (verified)
- Commit `4edd466` exists in git log
- Commit `fa4eab5` exists in git log
- Commit `fffbc3b` exists in git log
- Commit `705b9cc` exists in git log
- 67/67 jest tests pass
- `tsc --noEmit` clean
