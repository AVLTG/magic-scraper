# Deck Management Enhancements — Design

**Date:** 2026-06-14
**Status:** Approved (design), pending implementation plan
**Branch:** `master` (zero-migration; deploys directly)

## Goal

Four deck-management improvements, all of which only touch existing columns
(`Deck.name`, `GameParticipant.deckName`/`.playerName`, `DeckCard` rows) — **no
schema migration**:

1. Admin can delete any deck; if it appears in games, warn, then detach it from
   those games (null the `deckName`, keep `playerName`).
2. A user can rename their own deck; the new name propagates to game history
   (games + stats).
3. A user can add cards to a deck via a Moxfield-format paste — choosing specific
   printings and adding many at once.
4. In the game-logging form, the "owned" deck tier follows the **selected
   player**, not the signed-in user.

## Context

`GameParticipant` references decks/players **by string** (`deckName String?`,
`playerName String`) with no FK; the stats layer groups by those strings. So
renaming/detaching a deck in history is a string rewrite. The reconcile tool
already established case-insensitive, global-by-name rewrites; these features
follow the same convention. **Match scope is global by name** (decided): a rename
or detach touches every participant whose `deckName` matches, regardless of
player. Collisions are resolved by users picking distinct names (e.g. "Y'shtola
Matt's" vs "Y'shtola Nathan's") — itself a use case for the rename feature.

## Shared Logic

### `matchDeckParticipants` (pure) — in `src/lib/reconcile.ts`

Backs both rename and admin-delete so the name-matching lives in one tested place.

```ts
export function matchDeckParticipants(
  participants: Array<{ id: string; gameId: string; deckName: string | null }>,
  name: string,
): { ids: string[]; gameCount: number }
```

Returns the ids of participants whose `deckName` normalizes (via the existing
`normalizeName`) to `name`, plus the count of distinct `gameId`s among them.
Routes fetch participants, call this, then `updateMany` the ids (to a new name or
`null`).

### `src/lib/deckImport.ts` — shared Moxfield-import pieces

Extracted from the existing `/api/decks/import` route so the new per-deck import
reuses them (DRY). The create-import route is refactored to call these; its
existing tests must stay green.

```ts
import type { ParsedMoxfieldCard } from '@/lib/parseMoxfield'

export interface ClassifiedCards {
  present: Array<{ card: ParsedMoxfieldCard; canonical: string }>
  missing: ParsedMoxfieldCard[]
  basics: ParsedMoxfieldCard[]
}

// Pure: split parsed cards against the owner's library name index.
// Basics bypass the library; present = matched canonical name; missing = rest.
export function classifyMoxfieldCards(
  cards: ParsedMoxfieldCard[],
  libIndex: ReturnType<typeof import('@/lib/parseMoxfield').buildLibraryNameIndex>,
): ClassifiedCards

export type ResolveMissingResult =
  | { ok: true; libraryInserts: Array<Record<string, unknown>>; resolved: Array<{ card: ParsedMoxfieldCard; name: string }> }
  | { ok: false; status: 422 | 502; error: string; cards: string[] }

// Async: resolve missing printings on Scryfall and build collection-card insert
// rows + the resolved canonical names. Mirrors today's create-import behavior
// (422 when a line lacks set/number or can't be resolved; 502 when Scryfall is down).
export async function resolveMissingToLibrary(
  missing: ParsedMoxfieldCard[],
  userId: string,
): Promise<ResolveMissingResult>
```

## Feature 1 — Admin delete any deck (+ detach from games)

- **`GET /api/admin/decks`** gains a `gameCount` per deck: build one map of
  `normalize(deckName) → Set<gameId>` from all participants, then
  `gameCount = map.get(normalize(deck.name))?.size ?? 0`. Response items become
  `{ id, name, ownerUserId, ownerName, cardCount, gameCount }`.
- **`DELETE /api/admin/decks/[id]`** (new; admin-only, matching the inline
  `getSession()`/`role` + rate-limit style of the existing `PATCH` in that file):
  - 404 if the deck is missing.
  - Fetch participants `{ id, gameId, deckName }` (where `deckName` not null);
    `matchDeckParticipants(parts, deck.name)`.
  - In a transaction: `updateMany({ where: { id: { in: ids } }, data: { deckName: null } })`,
    then `deck.delete` (its `DeckCard`s cascade).
  - Return `{ success: true, detachedGames: gameCount }`.
- **`DecksSection` UI**: each deck row gets a **Delete** button. If `gameCount > 0`,
  the confirm reads "This deck is used in N game(s). Deleting removes it from them
  (player names unchanged). Continue?"; otherwise a plain confirm. On success the
  row is removed from the list.

## Feature 2 — User rename own deck (+ propagate to games)

- **`PATCH /api/decks/[id]`** (new method on the existing user deck route) — body
  `{ name }`:
  - 401 no session; 404 missing; 403 unless `deck.ownerUserId === session.userId`.
  - Validate `name` (trim, 1–100). 409 if the owner has **another** deck whose
    name normalizes to the new name (`id != this`).
  - In a transaction: `deck.update({ data: { name } })`; fetch participants,
    `matchDeckParticipants(parts, oldName)`,
    `updateMany({ where: { id: { in: ids } }, data: { deckName: name } })`.
  - Return `{ deck: { id, name }, renamedGames: gameCount }`.
  - Same-name (only case/spacing changed) is allowed: it updates `Deck.name` and
    rewrites history to the new spelling.
- **UI** (`/decks/[id]`): for the owner, the deck name `<h1>` becomes an inline
  edit (click → input → Enter saves / Esc cancels), mirroring the admin
  collection-ID inline-edit pattern. On save it `PATCH`es then reloads the deck.

## Feature 3 — Moxfield card import into a deck

- **`POST /api/decks/[id]/import`** (new; owner-only) — two-phase, like the
  deck-create import but targeting an existing deck. Body
  `{ text, dryRun?, addMissingToLibrary? }`:
  - Parse with `parseMoxfieldText`; build the owner's library index;
    `classifyMoxfieldCards`.
  - `dryRun: true` → `{ cards, missing, errors }` (drives the yes/no prompt).
  - commit: if `missing.length > 0` and `addMissingToLibrary` is not boolean → 400.
    If adding, `resolveMissingToLibrary`; on its `ok:false`, return its status/
    error/cards. Then in a transaction: insert library rows (if any) and **upsert**
    each draft (`present` canonical, `basics`, resolved `missing`) into the deck —
    `increment` quantity if the card already exists, else create with
    `set`/`collectorNumber`/`isFoil` from the paste. If not adding, `missing` are
    `excluded`.
  - Return `{ cards: <updated deck cards>, addedToLibrary, excluded, errors }`.
- **UI** (`/decks/[id]`): a "Moxfield Import" panel (textarea + the same
  missing-cards yes/no prompt as the create-import). The existing
  "Add from your library" quick single-card search is **kept**.

## Feature 4 — Owned-deck tier follows the selected player

- **`GET /api/decks`** gains an additive `decksByOwner: Array<{ ownerName: string;
  deckNames: string[] }>` (one entry per owner that has ≥1 deck), grouped from the
  same query. `userDecks`/`otherDecks` are unchanged (My Decks page unaffected).
- **`tieredDeckItems`** (`src/lib/deckTiers.ts`) — signature becomes
  `tieredDeckItems(playerDecks: string[], otherDecks: string[], input: string)`;
  tier logic is unchanged but the first tier is now the **selected player's**
  decks. The label `'User decks'` is renamed to `'Owned decks'`
  (`DeckTierGroup.label` union updated accordingly).
- **`game-form.tsx`**: from `decksByOwner` build a
  `Map<normalize(ownerName), string[]>`. Keep `allDeckNames` (union of
  `userDecks` + `otherDecks` names). Per participant row:
  `playerDecks = map.get(normalize(row.playerName)) ?? []`,
  `otherDecks = allDeckNames` minus those, passed to `tieredDeckItems`. Changing
  the row's player re-tiers that row's deck dropdown live. Empty/unknown player →
  no owned tier; random rows unchanged.

## Edge Cases & Error Handling

- All new mutating routes guard auth before any DB write; invalid JSON → 400;
  Zod issues → 400.
- Delete/rename match is global, case-insensitive, trimmed.
- Rename to a name another of the user's decks already has → 409.
- Per-deck import: basics bypass the library; missing without set/number → 422;
  Scryfall down → 502; Scryfall miss → 422 (inherited from `resolveMissingToLibrary`).
- Deleting/renaming a deck with no matching games → `detachedGames`/`renamedGames`
  is 0; still succeeds.

## Testing

- **Unit:** `matchDeckParticipants` (match set + distinct-game count,
  case-insensitive, null skip); `classifyMoxfieldCards` (present/missing/basics);
  `tieredDeckItems` (player-scoped tiers + new label).
- **Route (mocked Prisma):**
  - `GET /api/admin/decks` gameCount; `DELETE /api/admin/decks/[id]` detaches +
    deletes, 404, non-admin 403.
  - `PATCH /api/decks/[id]` rename + propagation, owner-only 403, 409 dup,
    same-name update.
  - `POST /api/decks/[id]/import` dryRun, commit (upsert), missing prompt
    required, addMissing path, basics bypass, owner-only.
  - `GET /api/decks` includes `decksByOwner`.
  - Existing `deck-import-api` tests stay green through the `deckImport.ts`
    extraction.
- **Game form:** per-row deck tiering keys off the selected player's name.

## Rollout

Zero migration — deploy only, same as the reconcile feature. The deck-create
import refactor is internal (no behavior change).
