# Random Players — Design

**Date:** 2026-05-18
**Scope:** Add an `isRandom` flag on `GameParticipant` so a participant can be marked as a "Random" player (an unknown / drop-in player or proxy slot). Random participants' real names and decks remain in the DB and on the games list / edit page for context, but they are excluded from autocomplete and filter dropdowns, aggregated into a single "Random" bucket in player stats, and excluded from deck stats entirely.
**Status:** Approved, pending implementation plan.

## Context

The group sometimes plays with people who aren't regulars — visiting friends, randomized seats, or proxy substitutes — and the user wants to record those participations without polluting the regular-player stats with one-off names. The desired behavior is "this slot was someone, here's their name and what they brought for the game record, but don't count them as a returning player in the stats and don't pollute autocomplete with their info."

## Decisions

- **D-25 (isRandom flag, not sentinel string):** A new `Boolean` column on `GameParticipant` carries the marker. `playerName` and `deckName` remain free-text and unaltered. A real player who happens to be named "Random" would still work normally.
- **D-26 (real values preserved, hidden from most surfaces):** The real `playerName` and `deckName` are stored and displayed on `/games` list rows (with a `★` marker) and in the `/games/[id]/edit` form. Everywhere else — stats, filters, autocomplete — they are aggregated/excluded.
- **D-27 (collapsed aggregation for player stats):** Random's contribution to player-level stats is a binary per-game flag: a game with N random participants contributes at most `+1` to Random's plays, wins, or screwed counts. Math is sensible: `Random.wins / Random.plays` = "games won by any random / games with any random".
- **D-28 (deck stats fully exclude random participants):** Same exclusion shape as the existing `isImported` games filter (D-16). Random participants' `deckName` doesn't contribute to any deck count or top-15 pie.
- **D-29 (autocomplete + filter dropdowns mirror stats):** `/api/players` and `/api/decks` exclude random participants. Game-page filter helpers (`deriveWinnerOptions`, `derivePlayerOptions`, `deriveDeckOptions`) replace random participants' names with `'Random'` (player/winner) or skip them entirely (decks).
- **D-30 (uniqueness exception for randoms):** The existing duplicate-player-name validator (Phase 6.1 D-14) applies ONLY among `isRandom: false` participants. Random rows can share names with each other or with non-random rows. All rows still require a non-empty trimmed `playerName`.

## What ships

A schema migration, a validator update, an `isRandom` checkbox in the new-game form, a `★` marker in the games list, stats/filter/autocomplete exclusion across all affected helpers and routes.

## A. Data model

`prisma/schema.prisma` — add to `GameParticipant`:

```prisma
model GameParticipant {
  id          String  @id @default(cuid())
  gameId      String
  playerName  String
  isWinner    Boolean
  isScrewed   Boolean
  isRandom    Boolean @default(false)
  deckName    String?
  role        String?

  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@index([playerName])
  @@map("game_participants")
}
```

Migration:
- `prisma/migrations/20260518b_add_israndom_to_participants/migration.sql`:
  ```sql
  ALTER TABLE "game_participants" ADD COLUMN "isRandom" BOOLEAN NOT NULL DEFAULT false;
  ```
- `.planning/phases/06.3-random-players/06.3-01-PROD-MIGRATION.sql` (verification-laden) following the established pattern.

Existing 183 participants in prod backfill to `isRandom = false` automatically via the default.

## B. Validator (`src/lib/validators.ts`)

### `gameParticipantSchema` adds:

```ts
isRandom: z.boolean().default(false),
```

### Duplicate-name refine update

The current refine in `baseGameSchema`:
```ts
.refine(
  (arr) => new Set(arr.map((p) => p.playerName.toLowerCase())).size === arr.length,
  { message: 'duplicate player names not allowed' }
)
```

Becomes:
```ts
.refine(
  (arr) => {
    const regulars = arr.filter((p) => !p.isRandom);
    const names = new Set(regulars.map((p) => p.playerName.toLowerCase()));
    return names.size === regulars.length;
  },
  { message: 'duplicate player names not allowed (non-random rows)' }
)
```

Random rows are skipped during dedup. All rows (random or not) still require non-empty `playerName` via the existing `min(1)` + `trim()`.

`applyVariantInvariants` is unchanged. Variant rules don't depend on `isRandom`. A KING game can have a Random as King/Squire/Assassin; same data layout, same winner derivation.

## C. API routes

### `POST /api/games` (`src/app/api/games/route.ts`)
Include `isRandom` in the participant create rows:
```ts
data: participants.map((p) => ({
  gameId: created.id,
  playerName: p.playerName,
  isWinner: p.isWinner,
  isScrewed: p.isScrewed,
  isRandom: p.isRandom,
  deckName: p.deckName,
  role: p.role,
})),
```

### `PATCH /api/games/[id]` (`src/app/api/games/[id]/route.ts`)
Same addition on the `createMany` after `deleteMany`.

### `GET /api/players` (`src/app/api/players/route.ts`)
Add `where: { isRandom: false }` to the participant query. Real names of players who only ever played as Random don't appear.

### `GET /api/decks` (`src/app/api/decks/route.ts`)
Add `where: { isRandom: false }` (plus the existing non-null deck filter). Random participants' decks don't appear in autocomplete.

### `GET /api/games` and `GET /api/games/[id]`
No code change — Prisma's default `include: { participants: true }` returns the new `isRandom` column automatically.

## D. Form (`src/app/games/game-form.tsx`)

### State

`ParticipantRow` adds `isRandom: boolean`:

```ts
export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
}
```

`emptyRow()` seeds `isRandom: false`. The two existing default-state seeds (in the `useState` initializer and the `Array.from({ length: playerCount }, emptyRow)` calls) pick this up for free.

### Per-row layout (mobile-aware)

The existing 4-column grid `[player_name | deck | choice | screwed]` is preserved. The choice column already varies per variant; the screwed column is where Random fits in.

Layout for the last cell (where "Screwed" lived):

```tsx
<div className="flex flex-col sm:flex-row sm:items-center gap-1 text-xs text-muted">
  <label className="flex items-center gap-1">
    <input
      type="checkbox"
      checked={r.isScrewed}
      onChange={(e) => updateRow(i, { isScrewed: e.target.checked })}
    />
    Screwed
  </label>
  <label className="flex items-center gap-1">
    <input
      type="checkbox"
      checked={r.isRandom}
      onChange={(e) => updateRow(i, { isRandom: e.target.checked })}
    />
    Random
  </label>
</div>
```

- On mobile (default / `<sm`): the two checkboxes stack vertically (`flex-col`) so they don't squeeze the row.
- On `sm:` and up: they sit side-by-side inline (`sm:flex-row`).
- Total cell footprint on `sm+` is ~150-180px — same column slot as before.

Implementation note: the existing grid template `grid-cols-[1fr_1fr_auto_auto]` was sized with one trailing `auto` cell for "Screwed". The 4-column shape stays the same; the last `auto` cell now wraps a small flex container with the two checkboxes.

### `excludeItemsForRow` update

The helper currently builds the list of names already used by OTHER rows so the player-name Combobox hides them. Update to skip random rows from BOTH sides:

```ts
export function excludeItemsForRow(
  rowIndex: number,
  state: { rows: ParticipantRow[] }
): string[] {
  // Don't exclude anything for a random row (random rows can share names).
  if (state.rows[rowIndex]?.isRandom) return [];

  // Otherwise, exclude names from OTHER non-random rows only.
  return state.rows
    .map((r, i) => ({ row: r, i }))
    .filter((entry) => entry.i !== rowIndex && !entry.row.isRandom && entry.row.playerName.trim().length > 0)
    .map((entry) => entry.row.playerName.trim());
}
```

### `validateGameForm`

No change to the row-by-row checks (all rows still need a non-empty playerName). The server-side dupe refine update in section B is the source of truth; the client doesn't need a parallel dupe check beyond what `excludeItemsForRow` enforces on the UI.

### `GameFormPayload`

Add `isRandom: boolean` to the participants type:

```ts
participants: {
  playerName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
  deckName?: string;
  role?: ParticipantRole;
}[];
```

`validateGameForm` populates `isRandom` from each row's state.

### `buildInitialState`

Read `isRandom` from each loaded participant in edit mode:

```ts
const rows: ParticipantRow[] = game.participants.map((p) => ({
  playerName: p.playerName,
  deckName: p.deckName ?? '',
  isWinner: p.isWinner,
  isScrewed: p.isScrewed,
  isRandom: p.isRandom ?? false,
}));
```

The `?? false` handles any legacy row missing the field (defensive — in practice all rows will have it after migration).

## E. Filter helpers (`src/app/games/page.tsx`)

### `deriveWinnerOptions(games)`

```ts
export function deriveWinnerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) {
        set.add(p.isRandom ? 'Random' : p.playerName);
      }
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

### `derivePlayerOptions(games)`

```ts
export function derivePlayerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      set.add(p.isRandom ? 'Random' : p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

### `deriveDeckOptions(games)`

```ts
export function deriveDeckOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isRandom) continue;
      const trimmed = p.deckName?.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

### `matchesAllFilters(game, filters)`

The function gains awareness of the random aggregation:

- **Winner filter** (`filters.winner`):
  - If `filters.winner === 'Random'`: match games where any winning participant has `isRandom: true`.
  - Otherwise: match games where a non-random winning participant has `playerName === filters.winner`.

- **Player filter** (`filters.players`):
  - Build the game's "filterable player set": `Set` containing `'Random'` if any participant is random, plus all `playerName`s of non-random participants. Then test `filters.players.some((p) => set.has(p))`.

- **Deck filter** (`filters.decks`):
  - Build `usedDecks` from non-random participants only (skip `isRandom: true` rows entirely). Existing trimmed/non-empty filter applies.

- **Player count filter** (`filters.playerCount`):
  - Unchanged — `game.participants.length` includes randoms.

### Games list row display

In the participant-rendering loop on `/games`, wherever the participant name is rendered:

```tsx
<span>{p.playerName}{p.isRandom && ' ★'}</span>
```

Applied consistently — whether the row is expanded or in summary mode. Deck rendering is unchanged (still shows the real deck name).

## F. Stats helpers (`src/lib/stats.ts`)

Each affected helper gets one of two treatments:

### Player-level helpers — COLLAPSE randoms

Affected: any helper that aggregates by `playerName`. Specifically:
- `computeWinsByPlayerPie` (winner counts per player)
- `computeScrewedByPlayerBar` (screwed counts per player)
- `computePlayerOverviewRadar` (and any underlying per-player aggregations feeding the radar)
- Any games-by-player helper currently exported

Pattern: instead of accumulating per-participant, accumulate per-game-per-player by computing the per-game contribution AT MOST ONCE per player bucket.

Reference implementation for the wins helper:

```ts
export function computeWinsByPlayerPie(games: Game[]): { player: string; wins: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
    // Determine the unique set of player buckets in this game that won.
    const winningBuckets = new Set<string>();
    for (const p of g.participants) {
      if (!p.isWinner) continue;
      winningBuckets.add(p.isRandom ? 'Random' : p.playerName);
    }
    for (const bucket of winningBuckets) {
      map.set(bucket, (map.get(bucket) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, wins]) => wins > 0)
    .map(([player, wins]) => ({ player, wins }))
    .sort((a, b) => b.wins - a.wins);
}
```

The `Set<string>` per game ensures that 2 winning randoms collapse to one bucket entry per game, and so do 2 winning non-randoms with the same name (which can't happen given the dupe-check, but the pattern is robust). Two real non-random players each contribute their own bucket entry independently.

The same pattern applies to:
- `computeScrewedByPlayerBar` (replace `p.isWinner` with `p.isScrewed`)
- `computeWinsByPlayerPie`'s denominator if any helper computes win RATE
- `computeGamesByPlayer` (if such helper exists — uses every participant regardless of win/screwed flags; collapse rule: contribute the bucket once if the game has any participant in that bucket)

### Deck-level helpers — EXCLUDE randoms entirely

Affected:
- `computeGamesByDeckPie`
- `computeScrewedByDeckPie`
- Any helper that aggregates by `deckName`

Pattern: prepend `if (p.isRandom) continue;` to the inner participant loop. Random participants don't contribute to any deck count.

The existing `D-16` filter (skip imported games entirely) stays. The new `isRandom` filter is an additional per-participant exclusion.

### Stats page render (`src/app/stats/page.tsx`)

No structural change. The "Random" entry will appear as a bar/slice/legend label in the player-aggregation charts. It will NOT appear in the deck-aggregation charts (because those exclude random participants).

If "Random" sorts to a position that displaces a real player from a top-N cap (currently top-15 decks have a cap), that's expected behavior — Random can be a legitimately frequent participant. No special pinning.

## G. Tests

Extend existing test files (no new ones):

- **`tests/validators.test.ts`** — dupe-name refine cases:
  - Two regular rows with the same name → rejected.
  - Two random rows with the same name → accepted.
  - One regular + one random with the same name → accepted.
  - All rows require non-empty playerName even when `isRandom: true` → rejected if any is empty.

- **`tests/game-form.test.ts`** — form behavior:
  - `validateGameForm` accepts random rows that share names; rejects non-random duplicates.
  - `excludeItemsForRow` returns `[]` for a random row regardless of other rows' names.
  - `excludeItemsForRow` excludes names from non-random rows only when called for a non-random row.
  - `buildInitialState` hydrates `isRandom` from API response; defaults to `false` if missing.
  - Payload includes `isRandom` for each participant.

- **`tests/games-filter.test.ts`** — filter helpers:
  - `deriveWinnerOptions` returns `'Random'` for games with random winners (not the real name).
  - `derivePlayerOptions` returns `'Random'` for games with random participants (not the real name).
  - `deriveDeckOptions` skips random participants' decks.
  - `matchesAllFilters` with `winner: 'Random'` matches games where any random won.
  - `matchesAllFilters` with `players: ['Random']` matches games with any random participant.
  - `matchesAllFilters` with `decks: ['Atraxa']` does NOT match a game where only randoms played Atraxa.

- **`tests/games-api.test.ts`** — API integration:
  - POST persists `isRandom` on each participant.
  - PATCH persists `isRandom` on each participant after `deleteMany` + `createMany`.

- **`tests/stats.test.ts`** — stats helpers:
  - `computeWinsByPlayerPie`: game with 2 winning randoms = +1 to Random's wins (not +2).
  - `computeWinsByPlayerPie`: game with 1 random and 1 non-random both winning = +1 to Random AND +1 to the real player.
  - `computeScrewedByPlayerBar`: game with 2 screwed randoms = +1 to Random's screwed.
  - `computeGamesByDeckPie`: skips a game where only randoms played a deck.
  - `computeScrewedByDeckPie`: skips random screwed participants.

- **`tests/autocomplete-api.test.ts`** — autocomplete routes (existing tests likely cover the structure):
  - `/api/players` excludes random participants.
  - `/api/decks` excludes random participants.

## H. Out of scope

- "Random ★" decoration in chart legends. Plain `'Random'` label is sufficient.
- Bulk-flipping existing games' participants to mark as Random. Manual via edit page only.
- KING-Commander role stats for randoms (deferred from the commander-variants feature already).
- A separate "Random win rate" sub-chart or callout. Aggregation is uniform with other players.

## I. File inventory

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `GameParticipant.isRandom` |
| `prisma/migrations/20260518b_add_israndom_to_participants/migration.sql` | New |
| `.planning/phases/06.3-random-players/06.3-01-PROD-MIGRATION.sql` | New |
| `src/lib/validators.ts` | `gameParticipantSchema.isRandom`; dupe-refine update |
| `src/app/api/games/route.ts` | Persist `isRandom` on POST createMany |
| `src/app/api/games/[id]/route.ts` | Persist `isRandom` on PATCH createMany |
| `src/app/api/players/route.ts` | `where: { isRandom: false }` |
| `src/app/api/decks/route.ts` | `where: { isRandom: false }` |
| `src/app/games/game-form.tsx` | `ParticipantRow.isRandom`; checkbox UI (mobile-aware stack); `excludeItemsForRow` skip; `buildInitialState` hydrate; payload `isRandom` |
| `src/app/games/page.tsx` | `deriveWinnerOptions` / `derivePlayerOptions` collapse; `deriveDeckOptions` skip; `matchesAllFilters` update; `★` marker on participant render |
| `src/lib/stats.ts` | Per-player helpers: collapse with per-game `Set`; per-deck helpers: skip `isRandom` participants |
| `tests/validators.test.ts` | Dupe-refine cases |
| `tests/game-form.test.ts` | Form behavior cases |
| `tests/games-filter.test.ts` | Filter helper cases |
| `tests/games-api.test.ts` | Persistence cases |
| `tests/stats.test.ts` | Stats helper cases |
| `tests/autocomplete-api.test.ts` | API exclusion cases |
