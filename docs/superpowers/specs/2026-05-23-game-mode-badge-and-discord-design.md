# Game Mode Badge + Discord Notification Rework — Design

**Date:** 2026-05-23
**Scope:** Add a variant badge column on the games list, rework the Discord new-game notification to describe each variant accurately (including multi-winner KING/STAR cases with role labels), and rename the DB variant value `STANDARD` → `COMMANDER` to free the `STANDARD` slot for a future MTG-Standard 2-player format.
**Status:** Approved, pending implementation plan.

## Context

The commander-variants feature (spec `2026-05-18-commander-variants-design.md`) added `Game.variant` (`STANDARD` | `STAR` | `KING`) plus per-participant `role` to support multi-winner formats. Two follow-up gaps surfaced:

1. **Discord notification is variant-blind.** `src/app/api/games/[id]/notify/route.ts` picks the first `.find()` winner and ignores the variant. A 6-player King Commander game where Royalty wins shows up as a one-line "Alice won using Atraxa" — misleading.
2. **Games list shows no variant indicator.** Nothing on `src/app/games/page.tsx` tells a viewer that a row is Star or King. The winner column also only shows the first winner for multi-winner games.

The user also flagged that future variant work likely includes 2-player MTG formats (Brawl, MTG-Standard, Pre-release, Draft). Reserving the name `STANDARD` for the actual MTG Standard format means renaming the current `STANDARD` value to `COMMANDER` now — while there are still only a small number of rows — to avoid a footgun later.

## Decisions

- **D-25 (rename DB value now):** `Game.variant`'s `STANDARD` value is renamed to `COMMANDER` in this spec via an UPDATE migration. Frees `STANDARD` for the future MTG-Standard 2-player format.
- **D-26 (badge in its own column):** A new "Format" column lives between Date and Winner on the games-list table, rendering a small chip per variant. Visible on mobile.
- **D-27 (variant→display lookup in one place):** A single helper `getVariantBadge(variant)` returns `{ label, classes }`. Adding a new variant (Brawl, Draft, Pre-release, MTG-Standard, …) means one new map entry — no scattered string switches.
- **D-28 (multi-winner cell update):** The Winner column shows `Alice (Atraxa) + N others` for multi-winner games. KING-Royalty wins surface the KING as the primary; everything else uses alphabetically-first winner.
- **D-29 (variant-aware Discord templates):** Five message shapes — COMMANDER, STAR-1, STAR-2, KING-Royalty, KING-Assassins. Multi-winner shapes list every winner with their deck; KING-Royalty additionally labels each name with its role (King / Squire).
- **D-30 (no-winner enforcement stays at validator):** The existing validators already reject zero-winner games across all three variants. No new enforcement needed. Display helpers retain a defensive null-fallback that is unreachable in normal use.

## What ships

A DB value rename + Prisma + prod-SQL migration, a variant badge helper + new table column, a multi-winner-aware winner-cell helper, a rewritten Discord notify route with five templates, and updated tests across the affected modules.

## A. Data model — rename `STANDARD` → `COMMANDER`

### `prisma/schema.prisma`
```prisma
model Game {
  // ...
  variant String @default("COMMANDER")  // was: "STANDARD"
}
```

### `src/lib/validators.ts`
```ts
export const GAME_VARIANTS = ['COMMANDER', 'STAR', 'KING'] as const;
// ...
export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('COMMANDER') })
  // ...
```
All literal `'STANDARD'` references inside `applyVariantInvariants`, error messages, and `isGameVariant` (in `src/app/api/games/[id]/route.ts`) become `'COMMANDER'`.

### Prisma migration

`prisma/migrations/20260523_rename_standard_to_commander/migration.sql`:
```sql
UPDATE games SET variant = 'COMMANDER' WHERE variant = 'STANDARD';
```

The default-value change in the Prisma schema is metadata-only for SQLite — it only matters at INSERT time, and the validator's `.default('COMMANDER')` is what actually drives new-row defaults via the API.

### Prod migration

`.planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql` — same UPDATE wrapped in `BEGIN; … COMMIT;` plus pre/post `SELECT variant, COUNT(*) FROM games GROUP BY variant;` for verification. Applied via `turso db shell magic-scraper < ...sql`.

### Test fixtures

Every `tests/*.ts` fixture that sets `variant: 'STANDARD'` is updated to `'COMMANDER'`. This touches `tests/validators.test.ts`, `tests/games-api.test.ts`, `tests/game-form.test.ts`, `tests/games-filter.test.ts`, and `tests/stats.test.ts`.

## B. Format badge UI

### `src/lib/gameVariants.ts` (new)
```ts
export type GameVariantKey = 'COMMANDER' | 'STAR' | 'KING';

export interface VariantBadge {
  label: string;
  classes: string;  // Tailwind: bg, text, border
}

const VARIANT_BADGES: Record<GameVariantKey, VariantBadge> = {
  COMMANDER: {
    label: 'Commander',
    classes: 'bg-surface text-muted border border-border',
  },
  STAR: {
    label: 'Star',
    classes:
      'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200',
  },
  KING: {
    label: 'King',
    classes:
      'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200',
  },
};

export function getVariantBadge(variant: string): VariantBadge {
  return VARIANT_BADGES[variant as GameVariantKey] ?? VARIANT_BADGES.COMMANDER;
}
```

Adding a future variant (e.g. `BRAWL`, `DRAFT`, `STANDARD`, `PRERELEASE`) is one new entry in `VARIANT_BADGES` plus an enum/validator update — no other UI changes.

### `src/app/games/page.tsx`

The `Game` interface gains `variant: string`. The table header inserts a new `<th>Format</th>` between Date and Winner; the body row renders:

```tsx
<td className="py-2 pr-4">
  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
    {badge.label}
  </span>
</td>
```

`colSpan` on the expanded row goes from `5` to `6`. The column stays visible on mobile (no `hidden sm:table-cell`) — the chip is small enough.

The GET `/api/games` endpoint already returns `variant` via `findMany({ include: { participants: true } })`. No API changes required.

## C. Multi-winner Winner cell

### Helper `getDisplayWinner(game)` in `src/lib/gameDisplay.ts` (new)

```ts
import type { Game, Participant } from '@/app/games/page';

export function getDisplayWinner(
  game: Game
): { primary: Participant; othersCount: number } | null {
  const winners = game.participants.filter((p) => p.isWinner);
  if (winners.length === 0) return null;  // defensive; validator guarantees >=1
  if (winners.length === 1) return { primary: winners[0], othersCount: 0 };

  // KING + Royalty victory: surface the KING
  if (game.variant === 'KING') {
    const king = winners.find((w) => (w as Participant & { role?: string }).role === 'KING');
    if (king) return { primary: king, othersCount: winners.length - 1 };
  }

  // Default (STAR multi-winner, KING-Assassins): alphabetical first
  const sorted = [...winners].sort((a, b) =>
    a.playerName.toLowerCase().localeCompare(b.playerName.toLowerCase())
  );
  return { primary: sorted[0], othersCount: sorted.length - 1 };
}
```

> Note: The `Participant` interface currently does not carry `role`. To keep the helper typed cleanly, the `Participant` interface in `src/app/games/page.tsx` gains an optional `role?: string | null` field. The GET endpoint already returns it via Prisma include.

### Render
- 1 winner: `Alice (Atraxa)` — unchanged from today.
- Multi-winner: `Alice (Atraxa) + 2 others`.
- Random primary: `Alice* (Atraxa)` or `Random* (Atraxa)` — `*` only follows the displayed name; "+ N others" makes no claim about other winners' random status.
- Missing deck on primary: `Alice + 2 others` (omit deck parenthetical when null/empty).
- No winner: `—` (validator-guaranteed unreachable, kept as defensive fallback).

## D. Discord notification rework

### `src/app/api/games/[id]/notify/route.ts`

The route currently composes one hard-coded message. Replace with a variant dispatch that produces five message shapes. Combo suffix (`via combo` / `without any combos`) becomes a trailing clause separated by an em-dash on multi-winner templates.

The helper that builds the message body lives in `src/lib/notifyMessage.ts` (new, so it can be unit-tested in isolation):

```ts
export function buildNotifyMessage(game: GameForNotify, origin: string): string;
```

### Templates

Let `winners` = participants with `isWinner === true`. Names of random participants render as `Random` (matching existing autocomplete-exclusion pattern); real deck name still shows. Missing deck on a winner inside a multi-winner list omits the parenthetical (e.g. `Alice, Bob (Edric)`) rather than printing `Alice (a deck they forgot to list)` repeatedly.

| Variant | Winners | Template |
|---|---|---|
| `COMMANDER` | 1 | `New Commander game added! {name} won using {deck} {comboText}. Check it out at {origin}/games` |
| `STAR` | 1 | `New Star Commander game added! {name} won using {deck} {comboText}. Check it out at {origin}/games` |
| `STAR` | 2 | `New Star Commander game added! {nameA} ({deckA}) and {nameB} ({deckB}) won together {comboText}. Check it out at {origin}/games` |
| `KING` Royalty | 2+ | `New King Commander game added! Royalty won — {king} (King, {deck}), {squire1} (Squire, {deck1}), {squire2} (Squire, {deck2}) — {comboText}. Check it out at {origin}/games` |
| `KING` Assassins | 1+ | `New King Commander game added! Assassins won — {a1} ({deckA1}), {a2} ({deckA2}) — {comboText}. Check it out at {origin}/games` |

`{comboText}` = `via combo` if `game.wonByCombo` else `without any combos`.

Single-winner fallback deck text (`a deck they forgot to list`) remains for the COMMANDER and STAR-1 cases (current behaviour).

### Royalty/Assassin classification
The route already loads `participants`. After filtering winners:
- KING-Royalty: `winners.some(w => w.role === 'KING')` is true.
- KING-Assassins: otherwise (all winners have `role === 'ASSASSIN'`).

KING-Royalty winner ordering inside the message: KING first, then Squires alphabetically.
KING-Assassins ordering: alphabetical.
STAR-2 ordering: alphabetical.

## E. Tests

### Updated
- `tests/games-notify.test.ts` — existing fixtures gain `variant: 'COMMANDER'` (and `role: null` per participant where needed). Existing assertions update to the new `New Commander game added!` prefix.
- `tests/validators.test.ts`, `tests/games-api.test.ts`, `tests/game-form.test.ts`, `tests/games-filter.test.ts`, `tests/stats.test.ts` — `'STANDARD'` literals → `'COMMANDER'`.

### New
- `tests/games-notify.test.ts` — one test per new template shape (STAR-1, STAR-2, KING-Royalty, KING-Assassins). Each asserts the exact `content` string. Cover combo on/off where it materially changes phrasing.
- `tests/gameDisplay.test.ts` (new) — `getDisplayWinner`: single winner → primary+0; STAR multi → alphabetical primary; KING-Royalty → KING primary; KING-Assassins → alphabetical primary; no winner → null.
- `tests/gameVariants.test.ts` (new) — `getVariantBadge`: each variant maps to correct label/classes; unknown variant falls back to COMMANDER (and asserts behaviour is graceful, not throwing).

### Out of scope
- `tests/stats.test.ts` only needs the `STANDARD` → `COMMANDER` rename. The stats helpers don't read `variant`; no behavioural change.

## F. Migration plan (execution order)

1. Schema + validator rename in code; tsc clean.
2. Prisma dev migration runs locally; `prisma generate`.
3. Frontend changes (badge, winner cell, page table column).
4. Discord route rewrite + new `notifyMessage` helper.
5. All test updates; full suite green.
6. Prod migration applied to Turso via `turso db shell magic-scraper < .planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql`. Verification SELECT confirms zero `STANDARD` rows remain.
7. Single commit (or two — DB rename separate from UI — per user preference at commit time).

## Future scope (out of this spec)

- New variants slotting into `getVariantBadge` + the validators + the Discord templates: `BRAWL` (2-player commander), `STANDARD` (MTG Standard 2-player), `PRERELEASE`, `DRAFT`. Each gets its own design when added.
- "Won by scoop" / "won by roll" checkbox on the game form (variant-orthogonal loss type).
- Stats charts that segment by variant.
