# Admin Deck/Player Reconciliation — Design

**Date:** 2026-06-14
**Status:** Approved (design), pending implementation plan
**Branch:** `master` (zero-migration feature; deploys directly)

## Goal

Give the admin full control over bridging **string-based game history** with the
**normalized `Deck`/`User` tables**. Surface every game-history deck name and
non-random player name that has no corresponding row, and let the admin either
**link** it (rename history to the canonical row's name) or **create** the row.

## Context

`GameParticipant` references players and decks **by string only** — `playerName`
and `deckName String?` — with no foreign key to `User` or `Deck`. The stats layer
(`src/lib/stats.ts`) groups entirely by these strings (`p.playerName`,
`p.deckName?.trim()`), with `isRandom` participants bucketed separately. `User`
and `Deck` are therefore a parallel universe that only touches game history by
name coincidence. This feature is the admin tool that reconciles the two.

### Linkage model: rename-to-match (decided)

Linking a game-history name to a canonical row **rewrites the history strings** to
the row's name. There is **no FK** added to `GameParticipant`. Because stats are
name-keyed, re-attribution is automatic once the names match. This keeps the
feature aligned with the existing architecture and requires **no schema
migration**.

## Non-Goals

- No FK normalization of `GameParticipant` (explicitly rejected in favor of rename).
- No new schema columns or status enums.
- No change to the stats layer, the user-facing Decks tab, or the leaderboard.
- No automatic backfill on deploy — reconciliation is admin-driven (with an
  optional one-click bulk action).

## Data Model & Matching (no schema change)

Everything is derived from existing tables using the same normalization already
used in `deckBackfill`/`stats`: `name.trim().toLowerCase()`.

- **Unlinked game decks** = distinct `GameParticipant.deckName` (trimmed,
  non-empty) with no normalized match to any `Deck.name`.
- **Unlinked game players** = distinct `GameParticipant.playerName` where
  `isRandom = false`, with no normalized match to any `User.name`.
- **Registered vs unregistered** is *derived*, not stored: a placeholder user has
  neither `moxfieldCollectionId` nor `username`. The 11 real members each have a
  `moxfieldCollectionId`, so they are never mislabeled as unregistered.

## Pure Logic (`src/lib/reconcile.ts`)

Mirrors the pure, DB-free style of `src/lib/deckBackfill.ts`.

```ts
export interface ParticipantRef { gameId: string; playerName: string; deckName: string | null; isRandom: boolean }
export interface UnlinkedEntry { name: string; gameCount: number }

// Distinct deckNames with no normalized match in existing Deck.name set.
export function computeUnlinkedDecks(
  participants: ParticipantRef[],
  deckNames: string[],
): UnlinkedEntry[]

// Distinct non-random playerNames with no normalized match in existing User.name set.
export function computeUnlinkedPlayers(
  participants: ParticipantRef[],
  userNames: string[],
): UnlinkedEntry[]
```

Rules:
- Skip null/empty/whitespace `deckName`; skip `isRandom` participants for players.
- Group case-insensitively; `gameCount` counts the distinct `gameId`s in which
  the name appears. The display `name` is the first-seen trimmed spelling.
- Output sorted by `name` (locale compare).

## API (all admin-guarded via `requireAdmin()`)

- `GET /api/admin/reconcile` → `{ unlinkedDecks: UnlinkedEntry[], unlinkedPlayers: UnlinkedEntry[] }`
- `POST /api/admin/reconcile/decks` — body:
  `{ action: 'link' | 'create' | 'createAll', name?, targetDeckId?, ownerUserId? }`
  - `link`: requires `name` + `targetDeckId`. Rename every participant whose
    `deckName` normalizes to `name` → the target deck's `name`. 404 if target
    deck missing.
  - `create`: requires `name`. Create a name-only `Deck { name, ownerUserId? }`
    (no cards). 400 if `ownerUserId` given but user missing.
  - `createAll`: create an ownerless `Deck` for every currently-unlinked deck
    name. Idempotent (skips names that already match a `Deck`).
- `POST /api/admin/reconcile/players` — body:
  `{ action: 'link' | 'create' | 'createAll', name?, targetUserId? }`
  - `link`: requires `name` + `targetUserId`. Rename every participant whose
    `playerName` normalizes to `name` → the target user's `name`. 404 if target
    user missing.
  - `create`: requires `name`. Create a placeholder `User { name }` (no
    `moxfieldCollectionId`, no `username`/`passwordHash`). **409 if a user with
    that name already exists.**
  - `createAll`: create a placeholder `User` for every currently-unlinked,
    non-random player name. Idempotent.

The link-target dropdowns reuse existing endpoints: `GET /api/admin/decks` (all
decks with owner) and `GET /api/admin/users` (bare array of users).

## Admin UI (`src/app/admin/page.tsx`)

The existing `DecksSection` (assign owners to `Deck` rows) is unchanged. Two new
focused client components are added below it:

- **`UnlinkedDecksSection`** — lists each unlinked game deck name with its game
  count. Per row: *Link to deck* (dropdown of all decks, labeled
  `"<deck> — <owner|Unassigned>"`) and *Create deck* (creates a name-only deck;
  owner optional). Header button **Add all as decks** → `createAll`.
- **`UnlinkedPlayersSection`** — lists each unlinked non-random player name with
  its game count. Per row: *Link to user* (dropdown of all users) and *Create
  user* (placeholder). Header button **Add all as users** → `createAll`.

After any action the affected list is refetched; reconciled names drop off.

## Edge Cases & Error Handling

- **One-directional rename**: history always follows the canonical row's name.
- **Idempotency**: `link`/`create` on an already-matched name is a no-op;
  `createAll` skips matched names.
- **Create-user dup guard**: `create` returns 409 when a same-name user exists
  (the action is only meaningful for unmatched names).
- **Random players** never appear in the players list (`isRandom` flag).
- **Intra-game collision**: a rename can merge two names that co-occur in a single
  game. This is allowed; the stats layer buckets per game and collapses
  duplicates, so totals are unaffected. Rare; noted, not blocked.
- **Empty inputs / bad JSON / unknown action** → 400.

## Testing

- `tests/reconcile.test.ts` — pure logic: normalization, random exclusion, empty
  deckName skip, game counts, match/no-match, sort order.
- `tests/admin-reconcile-api.test.ts` — route handlers with mocked Prisma:
  - GET returns both unlinked lists.
  - decks `link` renames exactly the matching participants to the target name.
  - decks `create` inserts a name-only deck (with/without owner; 400 on bad owner).
  - players `link` renames the matching participants.
  - players `create` inserts a placeholder; 409 on duplicate name.
  - `createAll` is idempotent (skips matched names).
  - admin guard: 401 (no session) / 403 (non-admin) without mutating.

## Rollout

Zero migration. Rollout = deploy the code to prod. Reconciliation is then
performed in the admin UI at the admin's pace, or via one click of each **Add
all** button. No Turso shell, no schema change, no pre-deploy data step.
