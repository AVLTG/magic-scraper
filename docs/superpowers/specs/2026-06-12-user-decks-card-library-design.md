# Per-User Decks & Card Library (+ Moxfield Import) — Design

**Issue:** #7 (Task 2 of parent #5). Depends on #6 (per-user accounts, merged via PR #8).
**Branch:** `feature/user-decks-library` → integrates into `develop` (human's call).
**Date:** 2026-06-12

## Goal

Make decks real per-user entities, give every logged-in user a Card Library page and a
Deck List page, tier the games-tab deck dropdown by ownership, and support importing
decks from Moxfield plaintext exports.

## Constraints & ground truth

- `CollectionCard` rows are **deleted and recreated wholesale** per user on every
  nightly Moxfield sync (`updateCollections.ts` transaction). Anything referencing
  those rows by id breaks daily. Therefore deck↔card links are **by value**
  (`cardName`), never FK to `CollectionCard`.
- `GameParticipant.deckName` is free text and is the historical record; it stays
  untouched. Tiering joins names against the new `Deck` table at read time.
- The legacy bootstrap admin (`__legacy_admin__`) has **no User row** — it cannot own
  decks or a library. Deck/library writes return 403 for it with a message to create a
  real account.
- All migrations run against local `dev.db` only; Turso **dev** (`tabletally-dev`)
  gets the `prisma migrate diff --script` + `turso db shell` treatment from #6.
  Production is never touched.

## Data model (one additive migration — no data loss)

### `CollectionCard.source` (modified)

```prisma
model CollectionCard {
  // ...existing fields...
  source String @default("moxfield") // 'moxfield' | 'manual'
}
```

- A user's **library** = all of their `CollectionCard` rows, both sources.
- `updateCollections.ts` (both `updateAllCollections` and `updateUserCollection`):
  `deleteMany({ where: { userId, source: 'moxfield' } })` so manual rows survive sync.
  Created scrape rows get `source: 'moxfield'` explicitly.
- Manual rows may duplicate a card the user later adds on Moxfield — acceptable
  (duplicate printings already display fine in checkDeck).

### `Deck` (new)

```prisma
model Deck {
  id          String   @id @default(cuid())
  ownerUserId String?            // nullable: legacy/ownerless decks
  name        String
  createdAt   DateTime @default(now())

  owner User?      @relation(fields: [ownerUserId], references: [id], onDelete: SetNull)
  cards DeckCard[]

  @@index([ownerUserId])
  @@map("decks")
}
```

- Name max length 100 (matches game-form deck validation). Names are NOT globally
  unique; the same name may exist under different owners. Per-owner duplicates are
  prevented at the API layer (case-insensitive check), not by a DB constraint
  (SQLite UNIQUE treats NULL owners as distinct anyway).
- `User` gains `decks Deck[]` back-relation.

### `DeckCard` (new)

```prisma
model DeckCard {
  id              String  @id @default(cuid())
  deckId          String
  cardName        String              // canonical library-format name ("A // B" for MDFCs)
  quantity        Int     @default(1)
  set             String?             // printing info captured from import, informational
  collectorNumber String?
  isFoil          Boolean @default(false)

  deck Deck @relation(fields: [deckId], references: [id], onDelete: Cascade)

  @@unique([deckId, cardName])
  @@index([cardName])
  @@map("deck_cards")
}
```

- One row per card name per deck; importing the same name twice (different printings)
  merges quantities, first printing info wins.
- Deck membership display joins `DeckCard.cardName` ↔ `CollectionCard.cardName` for
  `Deck.ownerUserId == CollectionCard.userId` (case-insensitive at query level where
  needed; names are stored in canonical scrape casing whenever resolvable).

## Moxfield plaintext parser — `src/lib/parseMoxfield.ts` (new)

Existing `parseDeck.ts` (checkDeck) is untouched.

Input: newline-separated Moxfield export lines. Per line:

```
1 Treasure Vault (AFR) 261 *F*
1 Spikefield Hazard / Spikefield Cave (ZNR) 166 *F*
1 Secluded Starforge (EOE) 257
```

Output per parsed line: `{ quantity, name, set?, collectorNumber?, isFoil }`.

Rules:
- `quantity` — leading integer + whitespace; required (a line without it is invalid).
- `name` — everything up to the trailing `(SET) NUM` group; may contain ` / `
  (MDFC) or any punctuation. Greedy capture with the set group anchored at line end.
- `set` — 2–6 alphanumerics inside parens; `collectorNumber` — non-space token
  (digits, letters, `-`, `★`, `†` all occur in the wild). Both optional **as a pair**:
  a plain `1 Sol Ring` line parses with `set`/`collectorNumber` undefined.
- `*F*` — optional trailing foil marker. Only `*F*` is recognized; any other `*X*`
  marker makes the line invalid (collected as an error) rather than silently dropped.
- Blank lines skipped. Invalid lines collected into an `errors: { line, raw }[]`
  return alongside `cards` — callers decide whether errors abort.
- **No basic-land skipping** (unlike `parseDeck.ts`) — a deck import must be faithful.

Name normalization helper `normalizeCardName(name)` for matching: lowercase, trim,
collapse internal whitespace, ` / ` → ` // `. Matching strategy (used by import diff
and library lookups): exact normalized match first, then front-face fallback
(library name starts with `front + ' //'`).

## Scryfall resolution — `src/lib/scryfall.ts` (new)

`resolveCards(identifiers: {set, collectorNumber}[])` → POSTs
`https://api.scryfall.com/cards/collection` in batches of 75 (API limit), returns
`{ found: Map<key, {name, scryfallId, set, setName, typeLine, ...}>, notFound: identifier[] }`.
Used by library plaintext add (and import-with-add-missing). Resolved cards are stored
with Scryfall's canonical `name` (`A // B`), keeping library naming consistent with
the Moxfield scrape. Network failure → the whole add request fails with 502-style
error; nothing is partially inserted (single transaction).

Lines without `(SET) NUM` cannot be resolved → returned in the response's `errors`
list and not inserted (no blank rows).

## APIs

All routes require a session (proxy already gates). "Owner-only" additionally checks
`deck.ownerUserId === session.userId`. ADMIN role does not bypass owner checks except
where stated. Legacy admin (`isLegacyAdmin`) → 403 on deck/library writes.
Rate limiting follows existing per-route `checkRateLimit(getIpKey(...))` patterns.

### `GET /api/decks` (rewritten — response shape changes)

Returns tiered data from the Deck table (single source of truth post-backfill):

```json
{
  "userDecks":  [{ "id": "...", "name": "Krenko" }],
  "otherDecks": [{ "id": "...", "name": "Esper", "ownerName": "Bob" | null }]
}
```

Sorted by name. `ownerName` null for ownerless decks. The old
`{ decks: string[] }` shape is gone; `game-form.tsx` is the only consumer and is
updated in the same change.

### `POST /api/decks`

Body `{ name }` (1–100 chars after trim). Creates a deck owned by the session user.
409 if the user already has a deck with that name (case-insensitive). Legacy admin →
403.

### `GET /api/decks/[id]`

Deck detail: `{ id, name, ownerUserId, ownerName, cards: [{ cardName, quantity, set,
collectorNumber, isFoil, inLibrary }] }`. `inLibrary` = whether the deck owner's
library currently contains the card (normalized name match). Any session may read any
deck (it's a shared friend group; Friends Collection already exposes ownership).

### `DELETE /api/decks/[id]`

Owner-only. ADMIN may also delete **ownerless** decks (cleanup). 404 unknown id,
403 otherwise.

### `PUT /api/decks/[id]/cards`

Owner-only. Body `{ add?: [{ cardName, quantity?, set?, collectorNumber?, isFoil? }],
remove?: string[], setQuantity?: [{ cardName, quantity }] }`. `add` upserts by
`(deckId, cardName)` summing quantities; `remove` deletes by cardName; `setQuantity`
with quantity ≤ 0 removes. Card names for `add` must come from the owner's library
(validated server-side by normalized name) — the Deck List page only offers library
cards; imports use the import route instead.

### `POST /api/decks/import` (two-phase, supports the yes/no prompt)

Body: `{ name, text, dryRun: true }` →
```json
{
  "cards":   [ ...parsed lines... ],
  "missing": [{ "cardName": "...", "set": "AFR", "collectorNumber": "261" }],
  "errors":  [{ "line": 4, "raw": "garbage" }]
}
```
`missing` = parsed cards whose normalized name is not in the session user's library.

Body: `{ name, text, dryRun: false, addMissingToLibrary: true | false }` →
- `true`: missing cards are Scryfall-resolved and inserted into the library
  (`source: 'manual'`), then the deck is created with **all** parsed cards.
  Missing cards that fail Scryfall resolution abort with 422 listing them (nothing
  written) — the user can fix lines and retry.
- `false`: the deck is created with only the cards already in the library; missing
  ones are silently excluded (per issue spec).
- Deck name rules identical to `POST /api/decks` (409 on duplicate). The whole commit
  runs in one transaction. The client re-sends `text`; the server re-parses and
  re-diffs on commit (stateless — no server-side draft between phases).

### `GET /api/library`

Session user's cards: `{ cards: [{ id, cardName, set, setName, quantity, condition,
isFoil, typeLine, source, decks: [{ id, name }] }] }`.
`decks` = the user's decks containing that card (normalized name join). Legacy admin
→ empty list with a notice flag.

### `POST /api/library/cards`

Body `{ text }` (Moxfield plaintext). Parse → require `(SET) NUM` on every valid line
→ Scryfall batch resolve → insert resolved cards as `source: 'manual'` rows
(condition `"NearMint"`, quantity from line, `isFoil` from `*F*`). Response:
`{ added: [...], errors: [{ line, raw, reason }] }` where reasons cover parse
failures, missing set/number, and Scryfall not-found. Valid rows insert even when
other lines error (per-line granularity, one transaction for the inserts).

### `PATCH /api/admin/decks/[id]` (ADMIN only)

Body `{ ownerUserId: string | null }`. Assigns/reassigns/clears a deck's owner.
Validates the target user exists. Covers ownerless legacy decks and backfill-heuristic
mistakes. Surfaced in the admin page as a small "Decks" section listing decks with an
owner dropdown.

### Games routes (`POST /api/games`, `PUT /api/games/[id]`) — deck auto-creation

After validating the payload, for each participant with `isRandom: false` and a
non-empty `deckName`: if no Deck exists with that name (case-insensitive) under the
owner resolved below, create a **name-only** Deck (no DeckCard rows):
- Owner = the User whose `name` case-insensitively equals the participant's
  `playerName`, if any; otherwise the deck is created **ownerless**.
- Random participants' decks are **not** saved at all (existing `/api/decks` distinct
  query already excluded them; the new behavior matches).
- Existing decks (any owner) with a matching name are left alone — typing "Krenko"
  when Alice owns "Krenko" does not spawn a duplicate.

## Legacy backfill — `src/scripts/backfillDecks.ts` (dev-only script)

Idempotent one-time script (run with the same local/dev-Turso discipline as #6; never
prod — prod runs it during the human-driven rollout):

1. Read all `GameParticipant` rows with `deckName != null` and `isRandom: false`.
2. Group by normalized deckName. For each name, tally plays per `playerName`.
3. Owner = User whose `name` matches the **most frequent** player for that deck name
   (case-insensitive; ties → most recent game's player). No matching user → ownerless.
4. Create the Deck if no deck with that normalized name already exists under that
   resolved owner (or ownerless pool). Re-running is a no-op.
5. Print a summary table (deck → owner | OWNERLESS) for human review.

The "most frequent player" heuristic absorbs borrow noise (Bob playing Alice's deck
once). Mistakes are fixable via the admin owner-assignment endpoint.

## Pages & UI

### Navigation (`header.tsx`)

Add `{ href: "/decks", label: "My Decks" }` and `{ href: "/library", label: "Library" }`
to `navLinks` (desktop + existing mobile menu render from the same array).

### `/decks` — Deck List page

- Lists the session user's decks (name, card count, created date) + a create form
  (name input → `POST /api/decks`).
- "Import from Moxfield" affordance: textarea → dry-run → if `missing.length > 0`,
  modal shows the plain-text list of missing cards with **"Add to library"** /
  **"Import without them"** buttons (the issue's yes/no prompt) → commit phase.
  Parse errors shown inline with line numbers.
- Each deck links to `/decks/[id]`.
- Legacy admin sees a notice ("Create your account via an invite to use decks")
  instead of the create/import forms.

### `/decks/[id]` — Deck detail page

- Card table: name, quantity (+/- via `setQuantity`), printing info, `inLibrary`
  indicator, remove button. Owner-only editing; other users see read-only view with
  the owner's name.
- "Add cards" search box listing the owner's library cards not yet in the deck
  (client-side filter over `GET /api/library` data) — owner only.

### `/library` — Card Library page

- Table of the user's cards: name, set/setName, quantity, condition, foil badge,
  source badge (Moxfield/Manual), deck-membership badges (from `decks`).
- Client-side **search** (name substring) and **filters**: set, foil, source, and
  type (coarse match on `typeLine`).
- "Add cards" plaintext box → `POST /api/library/cards`; per-line errors rendered.

### Games form — tiered deck dropdown

`Combobox` gains optional grouped mode: `groups?: { label: string; items: string[] }[]`
rendered with non-selectable group headers; existing flat `items` behavior unchanged
for player fields. Tier logic is a pure exported helper (unit-tested):

```
tieredDeckItems(userDecks, otherDecks, input):
  userMatches  = filterItems(userDecks, input)
  if userMatches.length > 0 → groups: [User decks: userMatches]
  else                      → groups: [Borrowed decks: filterItems(otherDecks, input)]
  "+ Add new" affordance: always last (existing shouldShowAddNew behavior, checked
  against the union of both tiers so an existing borrowed name never shows "Add new")
```

- Tiers are relative to the **logged-in user** (per issue spec), on every participant
  row. `game-form.tsx` fetches the new `/api/decks` shape once and passes tiers down.
- Selecting a borrowed deck stores its name in `deckName` exactly as today.

### Friends Collection (checkDeck)

`POST /api/checkDeck` owners gain `decks: string[]` — names of that owner's decks
containing the card (one extra `deckCard.findMany` joined through `deck.ownerUserId`,
matched per (userId, normalized cardName)). UI renders small deck badges under the
owner row.

## Error handling summary

- Parser: per-line errors, never throws on garbage input.
- Scryfall: batch failures → 502 with no partial library writes; per-card not-found →
  per-line errors (library add) or 422 abort (import addMissing commit).
- Deck routes: 400 zod validation, 401 no session (proxy), 403 not owner / legacy
  admin, 404 unknown deck, 409 duplicate name, 429 rate limit.
- Games deck auto-creation failures must not fail the game save: wrapped so a deck
  creation error logs + skips (the game and its deckName string still save).

## Testing (Jest, `tests/`)

- `parse-moxfield.test.ts` — all three issue example lines, MDFC, foil, name-only
  line, quantity >1, garbage/blank lines, `normalizeCardName` (` / ` ↔ ` // `).
- `scryfall.test.ts` — batching at 75, found/notFound split, fetch mocked.
- `decks-api.test.ts` — CRUD: create/409 dup/403 legacy/owner-only delete & edit,
  GET tiered shape.
- `deck-cards-api.test.ts` — add/remove/setQuantity semantics, library-membership
  validation.
- `deck-import.test.ts` — dry-run diff (missing list), commit yes (adds to library +
  full deck), commit no (partial deck), 422 unresolvable, duplicate name.
- `library-api.test.ts` — GET with deck associations; plaintext add with per-line
  errors; manual rows.
- `tiered-decks.test.ts` — ordering rules incl. borrowed-only-when-no-user-matches
  and add-new-always-last.
- `games-deck-autocreate.test.ts` — owner matched by playerName, ownerless fallback,
  random rows skipped, existing names not duplicated, creation failure doesn't fail
  game save.
- `backfill-decks.test.ts` — most-frequent-player heuristic, tie-break, idempotency
  (pure logic extracted; prisma mocked).
- `checkdeck-associations.test.ts` — owners include deck names.
- `update-collections` existing tests extended: sync deletes only `source:'moxfield'`.
- Full suite (`npx jest`) green before any task is declared complete.

## Rollout

1. Migration on local `dev.db` via `prisma migrate dev`.
2. Backfill script on local dev.db; eyeball the summary.
3. Same migration applied to Turso `tabletally-dev` via `migrate diff --script` +
   `turso db shell` (FK pragma discipline from #6); backfill script with
   `DATABASE_URL` pointed at dev Turso.
4. Prod: human-driven post-merge, following a DEPLOYMENT.md section added in this
   work (migration SQL + backfill + no env var changes).

## Out of scope

- Deck legality/format validation, price lookups (issue).
- `GameParticipant.deckId` FK / deck rename flows / deck stats.
- Library card deletion UI for scraped rows (manual rows only get removed if asked
  later; not in #7).
