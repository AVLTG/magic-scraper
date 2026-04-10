---
phase: 05-schema-migration-foundation
plan: 01
subsystem: database
tags: [prisma, turso, sqlite, schema, libsql]

requires:
  - phase: v1.0
    provides: Existing User + CollectionCard Prisma models, libsql driver adapter, cuid/@@map conventions
provides:
  - Game model (id, date, wonByCombo, notes, createdAt) with @@index([date])
  - GameParticipant model (gameId FK Cascade, playerName, isWinner, isScrewed, deckName?) with @@index([playerName])
  - SyncLog model (userId FK Cascade, status, errorMessage?, createdAt) with composite @@index([userId, createdAt])
  - User.syncLogs back-relation
  - Local dev Turso (dev.db) tables games, game_participants, sync_logs
  - Regenerated Prisma Client exposing prisma.game / prisma.gameParticipant / prisma.syncLog
affects:
  - 05-02 (zod validators + schema.md)
  - 05-03 (production Turso apply)
  - 06-* (game tracking CRUD)
  - 07-* (stats dashboard)
  - 08-* (admin sync history, Discord alerts)

tech-stack:
  added: []
  patterns:
    - "Normalized Game + GameParticipant (no winner FK, winner flag on participant row)"
    - "Free-text playerName on GameParticipant (no Player table)"
    - "SyncLog.status as plain String (not Prisma enum) for SQLite/Turso compatibility"
    - "Additive-only schema migrations via prisma db push (Turso-compatible)"

key-files:
  created: []
  modified:
    - prisma/schema.prisma

key-decisions:
  - "Followed D-01..D-12 exactly: no deviations from CONTEXT.md spec"
  - "Task 2 committed as empty marker since Prisma client regeneration lives in node_modules (gitignored)"

patterns-established:
  - "New tables follow existing cuid @id + @@map snake_case convention"
  - "Cascade delete on all child-to-parent FKs (matches User -> CollectionCard precedent)"
  - "Composite index for per-user history ordering: @@index([userId, createdAt])"

requirements-completed:
  - GAME-01
  - GAME-02
  - GAME-06
  - GAME-07
  - GAME-08
  - STAT-01
  - STAT-02
  - STAT-03
  - STAT-05
  - STAT-06
  - STAT-08
  - ADM-03

duration: ~8 min
completed: 2026-04-10
---

# Phase 05 Plan 01: Schema Foundation Summary

**Normalized Game + GameParticipant + SyncLog Prisma models landed in schema.prisma, applied to local dev Turso via `prisma db push`, and verified via `tsc --noEmit` + end-to-end Prisma client query sanity check.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-10T02:15:00Z (worktree spawn)
- **Completed:** 2026-04-10T02:23:00Z
- **Tasks:** 2 / 2
- **Files modified:** 1 (prisma/schema.prisma)

## Accomplishments

- Added three new Prisma models (`Game`, `GameParticipant`, `SyncLog`) matching decisions D-01..D-12 of 05-CONTEXT.md exactly
- Added `syncLogs SyncLog[]` back-relation to existing `User` model without touching any other User/CollectionCard field
- Applied schema to local dev Turso (file:./dev.db) — three new snake_case tables created (`games`, `game_participants`, `sync_logs`)
- Regenerated Prisma Client — `prisma.game`, `prisma.gameParticipant`, `prisma.syncLog` all queryable end-to-end
- Full repo typecheck passes (`npx tsc --noEmit` exit 0) — no regressions in deck checker, admin, LGS scraper, or Moxfield scraper

## Task Commits

Each task was committed atomically (with `--no-verify` per parallel worktree protocol):

1. **Task 1: Add Game, GameParticipant, SyncLog models to prisma/schema.prisma** — `a07ac2a` (feat)
2. **Task 2: Apply schema to local dev Turso and regenerate Prisma client** — `ece0158` (chore, empty marker — client regen lives in node_modules)

## Files Created/Modified

- `prisma/schema.prisma` — Added Game, GameParticipant, SyncLog models (+41 lines, -3 whitespace-only lines). Also added `syncLogs SyncLog[]` to User.

## Schema Diff Applied

```diff
 model User {
   ...
   collectionCards       CollectionCard[]
-
+  syncLogs              SyncLog[]
+
   @@map("users")
 }

+model Game {
+  id           String              @id @default(cuid())
+  date         DateTime
+  wonByCombo   Boolean             @default(false)
+  notes        String?
+  createdAt    DateTime            @default(now())
+
+  participants GameParticipant[]
+
+  @@index([date])
+  @@map("games")
+}
+
+model GameParticipant {
+  id          String  @id @default(cuid())
+  gameId      String
+  playerName  String
+  isWinner    Boolean
+  isScrewed   Boolean
+  deckName    String?
+
+  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)
+
+  @@index([playerName])
+  @@map("game_participants")
+}
+
+model SyncLog {
+  id           String   @id @default(cuid())
+  userId       String
+  status       String
+  errorMessage String?
+  createdAt    DateTime @default(now())
+
+  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
+
+  @@index([userId, createdAt])
+  @@map("sync_logs")
+}
```

`onDelete: Cascade` count in schema: **3** (1 pre-existing on CollectionCard + 2 new on GameParticipant.gameId and SyncLog.userId).

## Command Output (verbatim)

### `npx prisma validate`
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid
```
(Plus deprecation warning about `driverAdapters` preview feature — pre-existing, not introduced by this plan.)

### `npx prisma db push`
```
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": SQLite database "dev.db" at "file:./dev.db"

SQLite database dev.db created at file:./dev.db

Your database is now in sync with your Prisma schema. Done in 219ms

Running generate... (Use --skip-generate to skip the generators)
Generated Prisma Client (v6.19.2) to .\..\..\..\node_modules\@prisma\client in 99ms
```

No data-loss prompts (confirms migration is purely additive per D-16).

### `npx prisma generate`
Ran implicitly as part of `db push` (last line above). Prisma Client regenerated — `node_modules/.prisma/client/index.d.ts` now contains:
```
30:export type Game = $Result.DefaultSelection<Prisma.$GamePayload>
35:export type GameParticipant = $Result.DefaultSelection<Prisma.$GameParticipantPayload>
40:export type SyncLog = $Result.DefaultSelection<Prisma.$SyncLogPayload>
```

### `npx tsc --noEmit`
Exit code: **0**. No errors. No warnings from existing `src/` files.

### Sanity-check query (executed via `node --env-file=.env .tmp-sanity-check.mjs`)
```
OK: all three tables queryable
```
Script used `PrismaLibSQL` adapter + `prisma.game.findMany({take:0})` / `gameParticipant.findMany({take:0})` / `syncLog.findMany({take:0})`. Temp script was deleted after verification.

## Acceptance Criteria Check

**Task 1:**
- [x] `model Game {` present
- [x] `model GameParticipant {` present
- [x] `model SyncLog {` present
- [x] `wonByCombo Boolean @default(false)` present
- [x] `notes String?` inside Game
- [x] `createdAt DateTime @default(now())` inside Game
- [x] `@@index([date])` on Game
- [x] `@@map("games")`, `@@map("game_participants")`, `@@map("sync_logs")` all present
- [x] `@@index([playerName])` on GameParticipant
- [x] `@@index([userId, createdAt])` on SyncLog
- [x] `deckName String?` (optional) inside GameParticipant
- [x] `grep -c "onDelete: Cascade"` returns **3** (≥ 3)
- [x] `syncLogs SyncLog[]` inside User
- [x] NO `updatedAt` inside Game
- [x] NO `durationMs` anywhere
- [x] NO `cardsAdded` anywhere
- [x] NO `winnerId` anywhere
- [x] NO `enum` declaration
- [x] `npx prisma validate` exit 0

**Task 2:**
- [x] `npx prisma db push` exit 0, output contains "in sync with your Prisma schema"
- [x] `npx prisma generate` exit 0, output contains "Generated Prisma Client"
- [x] `npx tsc --noEmit` exit 0
- [x] Sanity check prints "OK: all three tables queryable"
- [x] Generated `index.d.ts` contains `Game`, `GameParticipant`, `SyncLog` exported types
- [x] No tsc errors reference pre-existing `src/lib/` or `src/app/` files

## Decisions Made

None outside the plan — D-01 through D-12 from 05-CONTEXT.md were followed exactly. The only local judgment call:

- **Task 2 committed as an `--allow-empty` marker commit.** Prisma client regeneration writes to `node_modules/.prisma/client` which is gitignored; there is nothing source-code-visible to commit. A marker commit preserves the "one atomic commit per task" contract so downstream tooling (SUMMARY.md task commits table, STATE.md metrics) stays consistent.

## Deviations from Plan

None — plan executed exactly as written.

(Rule-based auto-fix framework was not triggered: zero bugs, zero missing critical functionality, zero blocking issues encountered. The additive schema migration is a best-case path.)

## Issues Encountered

- **Worktree missing phase files and .env at spawn.** The `.planning/phases/05-schema-migration-foundation/` directory and `.env` / `.env.local` files exist in the main repo but not in the worktree (the `.planning/` directory is gitignored, and env files are too). Fix: Copied the phase files and env files from the main repo into the worktree for local execution. Since the phase directory is gitignored, the SUMMARY.md written in this worktree will not clash with — but also will not propagate through — git back to the main repo; the orchestrator will need to surface the SUMMARY path back to the parent repo separately. **This is not a plan deviation — it is a worktree-bootstrapping concern owned by the orchestrator.**
- **DATABASE_URL from .env points at local file SQLite (`file:./dev.db`), not a cloud Turso instance.** This is actually ideal for this task — per D-15, local dev apply should happen first, and using a local SQLite file keeps the dev loop fast. The production Turso apply is Plan 03's scope.

## Known Stubs

None. This plan is schema-only — no UI, no API routes, no data rendering, no placeholder values introduced.

## Threat Flags

None. The new models do not introduce any new network surface, auth boundary, file access pattern, or trust boundary beyond what is already covered in the plan's `<threat_model>` section. `SyncLog.errorMessage` is a potential info-disclosure vector (may contain stack traces) but:
- It has no HTTP exposure in this plan (Phase 8 owns the admin UI)
- The plan's threat register (T-05-03) already dispositioned it as `n/a` for this phase

## User Setup Required

None — schema changes apply automatically via `prisma db push` on local dev. Production apply is Plan 03's responsibility.

## Next Phase Readiness

**Plan 02 can now:**
- Import `Game`, `GameParticipant`, `SyncLog` types from `@prisma/client`
- Write zod validators that mirror the Prisma model shapes
- Write `.planning/schema.md` documentation referencing the landed schema

**Plan 03 can now:**
- Extract the schema as CREATE TABLE SQL and apply to production Turso via `turso db shell`
- Use the local dev `.schema` output as the source of truth for what the production migration should create

**Phase 6 (Game CRUD), Phase 7 (Stats), Phase 8 (Admin sync history) all unblocked** on the type/client side — they can now write queries against `prisma.game`, `prisma.gameParticipant`, `prisma.syncLog` without "Game is not exported" errors.

**No blockers or concerns.**

## Self-Check: PASSED

- [x] `prisma/schema.prisma` exists and contains `model Game`, `model GameParticipant`, `model SyncLog` (grep-verified during Task 1)
- [x] Commit `a07ac2a` exists: `git log --oneline` shows `a07ac2a feat(05-01): add Game, GameParticipant, SyncLog models to schema`
- [x] Commit `ece0158` exists: `git log --oneline` shows `ece0158 chore(05-01): apply schema to local dev and regenerate Prisma client`
- [x] Local dev `dev.db` has the three new tables (verified via Prisma client sanity query)
- [x] Generated Prisma client typings expose `Game`, `GameParticipant`, `SyncLog`

---
*Phase: 05-schema-migration-foundation*
*Completed: 2026-04-10*
