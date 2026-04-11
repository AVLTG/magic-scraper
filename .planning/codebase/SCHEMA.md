# Schema Design: Game Tracking & Sync Logs

**Landed:** Phase 5 (v1.1)
**Source of truth:** `prisma/schema.prisma`
**Decision context:** `.planning/phases/05-schema-migration-foundation/05-CONTEXT.md` (D-01 through D-19)

## Overview

v1.1 adds three tables to the existing `User` + `CollectionCard` schema: `Game`,
`GameParticipant`, and `SyncLog`. These power the game tracking UI (Phase 6),
stats dashboard (Phase 7), and admin sync history + Discord alerting (Phase 8).

The design is normalized: one `Game` row per played game, N `GameParticipant`
rows per game (1-4 per GAME-01), and one `SyncLog` row per user per cron sync
run. Winner identification lives on the participant rows, not the game — see
"Why no winner FK on Game" below.

## Tables

The three Prisma models introduced are `model Game`, `model GameParticipant`,
and `model SyncLog` (see `prisma/schema.prisma`).

### `games` (Prisma model `Game`)

| Column | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| date | DateTime | When the game was played (required) |
| wonByCombo | Boolean | Default false; "was this won via a combo finish?" |
| notes | String? | Free-text game notes (optional) |
| isImported | Boolean | Default false. Flags ~20 spreadsheet-ported legacy games (Phase 6.1 D-01). **Hidden from UI (D-02)** — never rendered, edited, or exposed in any form. Only read by Phase 7 stats queries to exclude combo-rate and deck-based metrics (D-06); player-rate / screwed-rate / weekly-frequency stats still include imported rows (D-07). |
| createdAt | DateTime | Audit timestamp; no `updatedAt` (D-01) |

Indexes: `@@index([date])` — powers GAME-07 newest-first history (D-09).

Relations: `participants GameParticipant[]` (1-4 rows per GAME-01).

Serves: GAME-01, GAME-07, GAME-08, STAT-04 (weekly frequency), STAT-07 (reactive updates).

**Phase 6.1 addendum — `isImported`:**

Added in Phase 6.1 via `prisma db push` (local dev) and `turso db shell` ALTER TABLE (production, additive-only per Phase 5 D-16). The 20 legacy rows whose `notes` contain the substring `"Ported from Spreadsheet"` were backfilled to `isImported = 1` via one-off UPDATE. The `notes` text was deliberately NOT cleaned up (D-04) — two redundant indicators for one fact is fine, and the human-readable note remains visible in the `/games` table.

**Phase 7 semantics:**
- Combo-rate and per-deck metrics MUST filter `WHERE isImported = false` (D-06)
- Player win-rate, screwed-rate, weekly frequency, and participation stats include imported rows (D-07 — `date`, `playerName`, `isWinner`, `isScrewed` were accurate in the source spreadsheet)

**UI invariant:** no file under `src/app/games/**` or `src/app/api/games/**` reads, writes, displays, or accepts this field (D-02). If any future plan needs to make it editable, a decision must be captured first — accidentally flipping the flag for a live game would silently corrupt Phase 7 stats.

### `game_participants` (Prisma model `GameParticipant`)

| Column | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| gameId | String | FK → `games.id`, onDelete Cascade (D-04) |
| playerName | String | Free-text; NO Player table (D-02, PROJECT.md Out of Scope) |
| isWinner | Boolean | Winner lives here, not on Game (D-03) |
| isScrewed | Boolean | Multi-select per GAME-06 |
| deckName | String? | Optional; winner's deck matters most (D-02) |

Indexes: `@@index([playerName])` — powers GAME-04 autocomplete union query (D-10).
No explicit `@@index([gameId])` — Prisma auto-creates relation indexes (D-12).

Serves: GAME-01, GAME-02, GAME-03, GAME-04, GAME-05, GAME-06, STAT-01, STAT-02,
STAT-03, STAT-05, STAT-06, STAT-08.

### `sync_logs` (Prisma model `SyncLog`)

| Column | Type | Notes |
|---|---|---|
| id | String (cuid) | PK |
| userId | String | FK → `users.id`, onDelete Cascade (D-07) |
| status | String | `"success"` or `"failure"` (D-07 — not a Prisma enum) |
| errorMessage | String? | Truncated error text; consumed by Phase 8 Discord alert |
| createdAt | DateTime | Audit timestamp |

Indexes: `@@index([userId, createdAt])` — powers Phase 8 ADM-02 per-user history view (D-11).

Granularity: **one row per user per sync** (D-06). Each nightly cron writes N rows.
Directly powers `WHERE userId=X ORDER BY createdAt DESC` without JSON parsing.

Serves: ADM-03 (Discord alerts on failure), foundation for ADM-02 (Phase 8).

## Design Rationale

### Why no winner FK on Game (D-03)

Winner is a boolean flag on `GameParticipant` rather than a FK like
`Game.winnerId → GameParticipant.id`. Two reasons:

1. Stats queries (Phase 7) become `count where isWinner = true` filters rather
   than join-dependent lookups.
2. Ties / unresolved games / multi-winner variants become cheap to represent
   (two participants both flagged isWinner).

Matches the "normalized Game + GameParticipant" call in `.planning/PROJECT.md`.

### Why free-text playerName (D-02)

A separate `Player` table was considered and explicitly rejected
(`.planning/REQUIREMENTS.md` Out of Scope). Free-text playerName lets users
type new names directly in the Phase 6 form, and GAME-04 autocomplete is
handled by a UNION query at read time:

```
SELECT DISTINCT name FROM users
UNION
SELECT DISTINCT playerName FROM game_participants
```

The `@@index([playerName])` on `game_participants` keeps that union fast
(D-10). No migration needed if the group changes composition — names just
start appearing in the autocomplete when they're first entered.

### Why optional deckName on every participant (D-02)

GAME-01 only requires *winner's deck*, but `deckName` is stored on every
participant row (optional). This leaves room for future "decks played per
game" stats (v2) without a migration, and Phase 6 can choose to surface a
deck field per participant or only for the winner.

### Why minimal SyncLog columns (D-07, D-08)

User explicitly requested "don't overdo it" on SyncLog. `durationMs`,
`cardsAdded`, `cardsRemoved`, and similar fields were all deferred. Phase 8
can extend the table when it has a concrete consumer for those metrics.

### Why String `status` instead of Prisma enum (D-07)

SQLite + Prisma enum support is awkward (CHECK constraints don't round-trip
cleanly across `prisma db push`). String storage with `"success" | "failure"`
values is simpler. The zod validator (`src/lib/validators.ts`) narrows input
to the two known values with `z.enum(["success", "failure"])`, providing
type safety at ingest without DB-side enum complexity.

### Why cascade delete on both new FKs (D-04, D-07)

Matches the existing `User → CollectionCard` cascade pattern. Deleting a
User cleans up their SyncLog history; deleting a Game wipes its
GameParticipant rows. No orphaned children, no manual cleanup code.

## What's NOT in This Schema (Deferred)

See `.planning/phases/05-schema-migration-foundation/05-CONTEXT.md` "Deferred
Ideas" section for the full list. Highlights:

- `updatedAt` on Game (only `createdAt` — D-01)
- Per-participant `notes` field
- `seat` / `turnOrder` on GameParticipant
- `durationMs` / `cardsAdded` / `cardsRemoved` on SyncLog
- Player table (Out of Scope per PROJECT.md)
- Commander/format, venue, Elo — all v2 per REQUIREMENTS.md

## Migration History

- **Phase 5 (v1.1):** Added `games`, `game_participants`, `sync_logs`. Additive
  only — no ALTER, no DROP, no data backfill (D-16). Applied via `prisma db
  push` on local dev and `turso db shell` + generated SQL on production
  (D-13, D-14).

## Validators

This design document itself was mandated by D-18 (Phase 5 foundation scope):
a single `.planning/codebase/SCHEMA.md` reference so that Phase 6/7/8
researchers do not have to re-derive the data model from `prisma/schema.prisma`.

Zod schemas for runtime validation of game/participant/sync-log inputs live in
`src/lib/validators.ts`:

- `gameSchema` — enforces 1-4 participants, coerces ISO date strings, trims
  string fields, clamps max lengths, defaults `wonByCombo` to `false`
- `gameParticipantSchema` — trims + non-empty playerName, optional deckName
- `syncLogSchema` — narrows `status` to `"success" | "failure"`

Phase 6 API routes should import from `@/lib/validators` rather than
re-deriving shapes from Prisma types. Phase 5 explicitly does NOT land
`src/lib/games.ts` or other query helpers (D-19) — those come with Phase 6
when real call sites inform their signature.
