# Multi-Format Games + Best-of Matches — Design

**Date:** 2026-05-24
**Scope:** Add seven new game-format variants (Brawl, Standard, Pauper, Draft, Prerelease, Sealed, Cube) alongside the existing three (Commander, Star, King). Brawl participates in the Commander stats; the other six are treated as 2-player formats that are excluded from current Commander-only stats. Add a "best-of" concept (Bo1/Bo3/Bo5) for the six non-Brawl 2-player formats with per-match combo-win counts. Add a Format multi-select filter to the games tab. Stats-page UI changes are explicitly out of scope.
**Status:** Approved, pending implementation plan.

## Context

The previous spec (`2026-05-23-game-mode-badge-and-discord-design.md`) renamed `STANDARD` → `COMMANDER` specifically to free the `STANDARD` slot for a future MTG-Standard 2-player format. This spec cashes in that reservation and brings the full set of common 2-player formats online.

The user plays a mix of multiplayer Commander (existing) and 2-player matches on MTGA and at LGS events. 2-player matches in MTG paper/digital frequently run as best-of-3 or best-of-5: a single recorded "game" in this app should represent the entire match (with one match-level winner), not each individual game inside the match. Combo wins need to be tracked numerically inside the match so the Discord notification can accurately describe how the match was won.

The stats page is presently Commander-only by accident of history (every existing row is a Commander variant). With non-Commander variants entering the dataset, stats need to explicitly gate to Commander formats so a Draft win doesn't inflate someone's Commander win rate. The stats-page UI itself does **not** change in this spec — the filtering happens silently at the compute layer. A future spec will add a non-Commander stats view.

## Decisions

- **D-31 (variant set expansion):** `GAME_VARIANTS` grows from `['COMMANDER','STAR','KING']` to ten entries: `['COMMANDER','STAR','KING','BRAWL','STANDARD','PAUPER','DRAFT','PRERELEASE','SEALED','CUBE']`. No DB enum migration needed — `variant` is a free-form String column. New values just work for existing reads.
- **D-32 (commander-format gate, single source of truth):** A new module `src/lib/gameFormats.ts` exports `COMMANDER_FORMATS = new Set(['COMMANDER','STAR','KING','BRAWL'])` and `isCommanderFormat(variant) → boolean`. Every stats compute function in `src/lib/stats.ts` filters the input via this helper. Brawl is a Commander format and contributes to Commander stats; Standard/Pauper/Draft/Prerelease/Sealed/Cube do not.
- **D-33 (2-player formats are strictly 2-player):** All six non-Brawl 2-player formats and Brawl itself require exactly 2 participants, exactly 1 winner, no roles, and `bestOf` set per D-34 (Brawl excluded — see D-35). All other booleans (`isWinner`, `isScrewed`, `isRandom`, `wonByCombo`) remain available.
- **D-34 (best-of column on the Game model):** A new nullable `bestOf Int?` column on `games`. For variants in `BEST_OF_FORMATS = {STANDARD,PAUPER,DRAFT,PRERELEASE,SEALED,CUBE}` it must be one of `1 | 3 | 5`. For all other variants it must be null. Validators enforce this; a Prisma migration adds the column.
- **D-35 (Brawl is Commander-shape, not best-of):** Brawl uses the same shape as COMMANDER for 2 players: single match, one winner, `wonByCombo` boolean, no `bestOf`, no `comboWins`. It is included in Commander stats per D-32.
- **D-36 (comboWins column for best-of):** A new nullable `comboWins Int?` column on `games`. For best-of formats it records how many of the match-winner's wins were combo wins, with `0 ≤ comboWins ≤ ceil(bestOf/2)`. For COMMANDER/STAR/KING/BRAWL it must be null and the existing `wonByCombo` boolean stays the sole combo indicator. For Bo1 it stores 0 or 1 and is functionally equivalent to a boolean.
- **D-37 (new-game flow — single "Pick format" modal for 2 players):** Selecting 2 players in the new-game flow now opens a format picker with eight buttons in this order: Commander, Brawl, Standard, Pauper, Draft, Prerelease, Sealed, Cube. Picking COMMANDER or BRAWL goes straight to the form. Picking any best-of format opens a "Best of?" modal with Bo1/Bo3/Bo5 buttons before the form. 3-4 player still defaults to COMMANDER with no chooser; 5-player still asks Star Y/N; 6-8-player still asks King Y/N.
- **D-38 (Random default for non-Commander 2-player rows):** When the form opens for any non-COMMANDER 2-player variant (BRAWL, STANDARD, PAUPER, DRAFT, PRERELEASE, SEALED, CUBE), participant row 2 starts with `isRandom: true`. Row 1 is unchecked. User can toggle either freely. Existing 2-player COMMANDER does not get this default — preserves current behavior.
- **D-39 (combo entry UX scales with bestOf):** For non-best-of variants and Bo1, the existing "Won by combo" checkbox is shown (Bo1 stores 0 or 1 in `comboWins`; non-best-of stores the value in `wonByCombo`). For Bo3 the form shows a "Combo wins" select with options 0/1/2. For Bo5 the options are 0/1/2/3.
- **D-40 (Format filter on the games tab):** A new multi-select dropdown labeled "Format" sits next to the existing Winner/Player count/Players/Decks filters. Options are listed in the order from `ALL_FORMATS` (Commander-formats first, then non-Commander). Empty = no filter applied. Within the Format filter: OR (Commander + Pauper shows both). Across filter types: AND (existing semantics, unchanged). bestOf is **not** filterable in v1 — too narrow to justify the UI cost.
- **D-41 (Format column on the games tab shows two chips when applicable):** The existing single-chip Format cell becomes a two-chip cell for best-of games: `[Standard] [Bo3]`. Bo1 also renders the Bo1 chip (chip-presence/absence would be ambiguous otherwise). The bestOf chip uses a neutral style; the format chip retains its per-variant color from `getVariantBadge`.
- **D-42 (Discord templates extend to all ten variants):** COMMANDER/STAR/KING templates are unchanged. BRAWL uses the COMMANDER template shape with "Brawl" as the format label. Best-of formats with Bo1 use the same "via combo" / "without any combos" text as COMMANDER. Best-of formats with Bo3/Bo5 use new combo phrasing: `winning N game(s) with combos` when `comboWins ≥ 1`, `without combos` when `comboWins == 0`. The format label parenthetical `(BoN)` is included in the message header for Bo3/Bo5 only — omitted for Bo1 (the trivial default) to keep messages clean.
- **D-43 (stats.ts gates silently to Commander formats):** Every exported compute function in `src/lib/stats.ts` calls a shared `isCommanderFormat(g.variant)` check on its input games before further processing. No UI surfaces this filter — non-Commander games simply do not appear in any current stats output. The existing stats page renders no new badges or notices about excluded games.
- **D-44 (no backfill, no data rewrite):** All existing rows are COMMANDER/STAR/KING. The new `bestOf` and `comboWins` columns are nullable and default to null. Existing rows remain valid without modification. Prod migration is a pure ALTER TABLE adding two columns; no UPDATE needed.
- **D-45 (variant + bestOf + comboWins are creation-time only):** The existing PATCH route does not allow changing `variant`. This spec extends that contract: PATCH also does not change `bestOf` or `comboWins`. A miss-input requires deleting and re-creating the game. Edit form continues to be variant-locked.

## What ships

A schema migration adding `bestOf` and `comboWins` columns to `games`, a new `src/lib/gameFormats.ts` module as the single source of truth for variant taxonomy and the Commander gate, extended validators with shared invariant branches for the six best-of formats and the Brawl format, a "Pick format" modal followed by a "Best of?" modal on the 2-player new-game flow, a Random-default rule for player 2 in non-Commander 2-player games, a combo-wins selector that scales with bestOf, badge entries for the seven new variants, a Format multi-select filter on the games tab, two-chip rendering in the Format column for best-of games, Discord template additions covering all ten variants and the new combo phrasing, an `isCommanderFormat` gate added at the top of every stats compute function, and updated tests across every affected module.

## A. Data model — schema, validators, invariants

### `prisma/schema.prisma`

```prisma
model Game {
  id              String              @id @default(cuid())
  date            DateTime
  wonByCombo      Boolean             @default(false)
  notes           String?
  isImported      Boolean             @default(false)
  discordNotified Boolean             @default(false)
  variant         String              @default("COMMANDER")
  bestOf          Int?                // NEW — 1|3|5 for best-of formats, null otherwise
  comboWins       Int?                // NEW — 0..ceil(bestOf/2) for best-of, null otherwise
  createdAt       DateTime            @default(now())

  participants    GameParticipant[]

  @@index([date])
  @@map("games")
}
```

Existing rows: all 51 are COMMANDER/STAR/KING, so both new columns default to NULL on backfill which is correct.

### `prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`

```sql
-- Phase 06.5: add best-of + combo-wins tracking for 2-player non-Commander formats.
ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;
```

No UPDATE needed (D-44).

### `src/lib/gameFormats.ts` (NEW)

```ts
export const ALL_FORMATS = [
  'COMMANDER', 'STAR', 'KING', 'BRAWL',
  'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
] as const;
export type GameFormat = (typeof ALL_FORMATS)[number];

export const COMMANDER_FORMATS = new Set<GameFormat>([
  'COMMANDER', 'STAR', 'KING', 'BRAWL',
]);

export const BEST_OF_FORMATS = new Set<GameFormat>([
  'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
]);

export const FORMAT_LABELS: Record<GameFormat, string> = {
  COMMANDER: 'Commander',
  STAR: 'Star Commander',
  KING: 'King Commander',
  BRAWL: 'Brawl',
  STANDARD: 'Standard',
  PAUPER: 'Pauper',
  DRAFT: 'Draft',
  PRERELEASE: 'Prerelease',
  SEALED: 'Sealed',
  CUBE: 'Cube',
};

export function isCommanderFormat(variant: string): boolean {
  return COMMANDER_FORMATS.has(variant as GameFormat);
}

export function requiresBestOf(variant: string): boolean {
  return BEST_OF_FORMATS.has(variant as GameFormat);
}

export function maxComboWinsFor(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}
```

### `src/lib/validators.ts` — extended GAME_VARIANTS + invariants

`GAME_VARIANTS` becomes the full ten-entry tuple (alias for `ALL_FORMATS` to keep one source of truth — `validators.ts` imports from `gameFormats.ts`).

The `applyVariantInvariants` function gains two new branches (BRAWL and a shared best-of branch). The function signature also changes to accept `bestOf` and `comboWins` so it can validate the new fields together with the variant:

```ts
type InvariantInput = {
  participants: ParticipantForInvariants[];
  bestOf?: number | null;
  comboWins?: number | null;
};

export function applyVariantInvariants(
  data: InvariantInput,
  variant: GameVariant
): InvariantResult {
  const ps = data.participants;
  const winnerCount = ps.filter((p) => p.isWinner).length;
  const withRole = ps.filter((p) => p.role != null);

  // ----- Existing branches preserved -----
  if (variant === 'COMMANDER') {
    if (winnerCount !== 1) return { ok: false, message: 'COMMANDER game must have exactly one winner' };
    if (withRole.length > 0) return { ok: false, message: 'COMMANDER game participants must not have roles' };
    if (data.bestOf != null) return { ok: false, message: 'COMMANDER game must not set bestOf' };
    if (data.comboWins != null) return { ok: false, message: 'COMMANDER game must not set comboWins' };
    return { ok: true };
  }

  if (variant === 'STAR') { /* unchanged + reject bestOf/comboWins */ }
  if (variant === 'KING') { /* unchanged + reject bestOf/comboWins */ }

  // ----- New: BRAWL -----
  if (variant === 'BRAWL') {
    if (ps.length !== 2) return { ok: false, message: 'BRAWL game must have exactly 2 participants' };
    if (winnerCount !== 1) return { ok: false, message: 'BRAWL game must have exactly one winner' };
    if (withRole.length > 0) return { ok: false, message: 'BRAWL game participants must not have roles' };
    if (data.bestOf != null) return { ok: false, message: 'BRAWL game must not set bestOf' };
    if (data.comboWins != null) return { ok: false, message: 'BRAWL game must not set comboWins' };
    return { ok: true };
  }

  // ----- New: shared best-of branch (STANDARD/PAUPER/DRAFT/PRERELEASE/SEALED/CUBE) -----
  if (BEST_OF_FORMATS.has(variant)) {
    if (ps.length !== 2) return { ok: false, message: `${variant} game must have exactly 2 participants` };
    if (winnerCount !== 1) return { ok: false, message: `${variant} game must have exactly one winner` };
    if (withRole.length > 0) return { ok: false, message: `${variant} game participants must not have roles` };
    if (data.bestOf !== 1 && data.bestOf !== 3 && data.bestOf !== 5) {
      return { ok: false, message: `${variant} game requires bestOf 1, 3, or 5` };
    }
    const maxCombo = maxComboWinsFor(data.bestOf);
    if (typeof data.comboWins !== 'number' || data.comboWins < 0 || data.comboWins > maxCombo) {
      return { ok: false, message: `${variant} Bo${data.bestOf} game requires comboWins in 0..${maxCombo}` };
    }
    return { ok: true };
  }

  // Defensive — should be unreachable thanks to z.enum on the schema.
  return { ok: false, message: `Unknown variant: ${variant}` };
}
```

The Zod schemas (`gameCreateSchema`, `gameUpdateSchema`) gain `bestOf` (`z.number().int().nullish()`) and `comboWins` (`z.number().int().nullish()`) fields and pass them into `applyVariantInvariants` via the existing `superRefine` path. The PATCH route does the same pass on update.

### `src/app/api/games/route.ts` — POST persists new fields

```ts
const { date, wonByCombo, notes, variant, bestOf, comboWins, participants } =
  gameCreateSchema.parse(body);

const created = await tx.game.create({
  data: { date, wonByCombo, notes, variant, bestOf, comboWins },
});
```

### `src/app/api/games/[id]/route.ts` — PATCH explicitly does NOT update bestOf/comboWins/variant

The PATCH handler continues to omit `variant` from the update payload and now also omits `bestOf` and `comboWins`. It DOES re-run `applyVariantInvariants` with the stored variant + stored bestOf/comboWins so an edit that violates invariants (e.g. removing a participant) still fails.

## B. New-game flow

### Modal sequence

```
Player-count modal
       │
       ├─ 2 → Format modal (8 buttons)
       │         ├─ COMMANDER, BRAWL → Form
       │         └─ STANDARD/PAUPER/DRAFT/PRERELEASE/SEALED/CUBE → Best-of modal → Form
       │
       ├─ 3 or 4 → Form (variant locked to COMMANDER, no chooser)
       │
       ├─ 5 → Star? Y/N → Form (existing behavior)
       │
       └─ 6, 7, 8 → King? Y/N → Form (existing behavior)
```

### `src/app/games/new/page.tsx`

State machine gains `formatChoice: GameVariant | null` and `bestOfChoice: 1 | 3 | 5 | null`. The existing `variant: GameVariant | null` is set as a final step.

For 2-player picks:

```tsx
// After playerCount === 2, before opening the form:
// Step 1: format picker (8 buttons)
if (formatChoice === null) {
  return <FormatPickerModal onPick={(v) => setFormatChoice(v)} />;
}
// Step 2: best-of picker, only for BEST_OF_FORMATS
if (BEST_OF_FORMATS.has(formatChoice) && bestOfChoice === null) {
  return <BestOfPickerModal format={formatChoice} onPick={(n) => { setBestOfChoice(n); setVariant(formatChoice); }} />;
}
// Otherwise: COMMANDER or BRAWL pick — set variant and proceed
if ((formatChoice === 'COMMANDER' || formatChoice === 'BRAWL') && variant === null) {
  setVariant(formatChoice);
}
```

For 3-4 player picks, behavior is unchanged: `setVariant('COMMANDER')` fires synchronously in the player-count callback.

For 5/6-7-8 player picks, behavior is unchanged: existing Star/King Y/N modal.

The page passes `bestOf` and `comboWins: 0` defaults into `GameForm` for best-of variants.

### `src/app/games/game-form.tsx`

`GameFormState` gains:
- `bestOf: number | null`
- `comboWins: number | null`

`GameFormPayload` gains the same. `validateGameForm` enforces:
- Non-best-of variants: `bestOf == null`, `comboWins == null`
- Best-of variants: `bestOf ∈ {1,3,5}`, `comboWins ∈ [0, ceil(bestOf/2)]`

**Random default (D-38):** When `GameForm` is mounted with `playerCount === 2` and `variant !== 'COMMANDER'`, the initial `rows[1]` is `{ ...emptyRow(), isRandom: true }`. All other rows remain `emptyRow()`. The `Combobox` excludeItems logic from `excludeItemsForRow` already treats Random rows as non-contributing, so the default works cleanly with existing dedup.

**Combo entry UI:** Replace the single "Won by combo" checkbox in the date+combo row with a conditional control:

```tsx
{state.variant in NON_BEST_OF || state.bestOf === 1 ? (
  // existing checkbox bound to state.wonByCombo (for non-best-of)
  // or to (state.comboWins === 1) for Bo1
  <CheckboxComboWin />
) : (
  // dropdown 0..ceil(state.bestOf/2)
  <select value={state.comboWins ?? 0} onChange={...}>
    {Array.from({ length: Math.ceil(state.bestOf!/2) + 1 }, (_, n) => (
      <option key={n} value={n}>{n} combo win{n === 1 ? '' : 's'}</option>
    ))}
  </select>
)}
```

`wonByCombo` is set by the form as follows:
- Non-best-of variants: from the checkbox (unchanged).
- Best-of variants: `wonByCombo = (comboWins ?? 0) > 0`. This keeps existing screens that read `wonByCombo` working without per-variant changes. Validator still requires explicit `bestOf` + `comboWins` for best-of.

## C. Games tab — Format column, Format filter, expanded row

### Format column (two chips when applicable)

```tsx
<td className="py-2 pr-4">
  {(() => {
    const badge = getVariantBadge(g.variant);
    return (
      <div className="flex gap-1 items-center flex-wrap">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badge.classes}`}>
          {badge.label}
        </span>
        {g.bestOf != null && (
          <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-surface text-muted border border-border">
            Bo{g.bestOf}
          </span>
        )}
      </div>
    );
  })()}
</td>
```

### Format filter (new — sits next to existing filters)

`FilterState` adds:
```ts
formats: string[];   // empty = no format filter
```

`matchesAllFilters` adds (after the existing decks check):
```ts
if (filters.formats.length > 0) {
  if (!filters.formats.includes(game.variant)) return false;
}
```

Filter UI matches the existing Players/Decks `<details>` pattern. Options come from `ALL_FORMATS`; each option label comes from `FORMAT_LABELS[variant]`. Default closed; chip-style "(N selected)" count in the label when populated.

### Expanded row — combo display

Replace the current bottom-of-list line:

```tsx
{g.wonByCombo && (
  <li className="text-xs text-muted italic">Won by combo</li>
)}
```

with:

```tsx
{g.bestOf != null ? (
  <li className="text-xs text-muted italic">
    Combo wins: {g.comboWins ?? 0}/{Math.ceil(g.bestOf / 2)}
  </li>
) : (
  g.wonByCombo && <li className="text-xs text-muted italic">Won by combo</li>
)}
```

### `Game` interface in `src/app/games/page.tsx`

```ts
interface Game {
  id: string;
  date: string;
  wonByCombo: boolean;
  variant: string;
  bestOf: number | null;     // NEW
  comboWins: number | null;  // NEW
  isImported: boolean;
  notes: string | null;
  createdAt: string;
  participants: Participant[];
}
```

## D. Badges + Discord templates

### `src/lib/gameVariants.ts` — add seven badge entries

```ts
export type GameVariantKey =
  | 'COMMANDER' | 'STAR' | 'KING' | 'BRAWL'
  | 'STANDARD' | 'PAUPER' | 'DRAFT' | 'PRERELEASE' | 'SEALED' | 'CUBE';

const VARIANT_BADGES: Record<GameVariantKey, VariantBadge> = {
  COMMANDER: { label: 'Commander',  classes: 'bg-surface text-muted border border-border' },
  STAR:      { label: 'Star',       classes: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200' },
  KING:      { label: 'King',       classes: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200' },
  BRAWL:     { label: 'Brawl',      classes: 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200' },
  STANDARD:  { label: 'Standard',   classes: 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200' },
  PAUPER:    { label: 'Pauper',     classes: 'bg-slate-200 text-slate-900 dark:bg-slate-700/40 dark:text-slate-200' },
  DRAFT:     { label: 'Draft',      classes: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200' },
  PRERELEASE:{ label: 'Prerelease', classes: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' },
  SEALED:    { label: 'Sealed',     classes: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200' },
  CUBE:      { label: 'Cube',       classes: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
};
```

The fallback in `getVariantBadge` (`?? VARIANT_BADGES.COMMANDER`) is preserved.

### `src/lib/notifyMessage.ts` — extended templates

`GameForNotify` gains `bestOf: number | null` and `comboWins: number | null`. The dispatch table grows:

```ts
export function buildNotifyMessage(game: GameForNotify, origin: string): string {
  const winners = game.participants.filter((p) => p.isWinner);
  const tail = `Check it out at ${origin}/games`;

  // COMMANDER / STAR / KING branches: unchanged.

  if (game.variant === 'BRAWL') {
    const w = winners[0];
    const deck = w?.deckName?.trim() ? w.deckName : NO_DECK_FALLBACK;
    const name = w ? displayName(w) : 'Someone';
    const combo = comboClause(game.wonByCombo);  // "via combo" / "without any combos"
    return `New Brawl game added! ${name} won using ${deck} ${combo}. ${tail}`;
  }

  if (BEST_OF_FORMATS.has(game.variant as GameFormat)) {
    const label = FORMAT_LABELS[game.variant as GameFormat];
    const w = winners[0];
    const deck = w?.deckName?.trim() ? w.deckName : NO_DECK_FALLBACK;
    const name = w ? displayName(w) : 'Someone';
    const isBo1 = game.bestOf === 1;
    const cw = game.comboWins ?? 0;

    // Combo phrasing
    let combo: string;
    if (isBo1) {
      combo = cw > 0 ? 'via combo' : 'without any combos';
    } else {
      combo = cw === 0 ? 'without combos' : `winning ${cw} game${cw === 1 ? '' : 's'} with combos`;
    }

    // Header parenthetical
    const header = isBo1
      ? `New ${label} game added!`
      : `New ${label} (Bo${game.bestOf}) game added!`;

    return `${header} ${name} won using ${deck} ${combo}. ${tail}`;
  }

  // Fallback (defensive — unreachable thanks to schema enum)
  return `New game added! ${tail}`;
}
```

### Example outputs

```
New Brawl game added! Alice won using Atraxa via combo. Check it out at .../games
New Standard game added! Bob won using Mono-Red without any combos. Check it out at .../games          (Bo1)
New Standard (Bo3) game added! Bob won using Mono-Red winning 2 games with combos. Check it out at .../games
New Draft (Bo5) game added! Carol won using Boros without combos. Check it out at .../games
New Cube (Bo5) game added! Dan won using Jeskai winning 1 game with combos. Check it out at .../games
```

## E. Stats integration

### `src/lib/stats.ts` — silent Commander gate

Every exported compute function gains a single `games = games.filter((g) => isCommanderFormat(g.variant))` line as its first executable statement, before any other filtering or grouping. Functions affected (full set):
- `computePlayerWinRate`
- `computeDeckWinRate`
- `computeDeckScrewedRate` and any `screwedByDeck` / `screwedByPlayer` helpers
- Time-bucketed per-week helpers
- Combo-rate helpers
- Any helper that consumes `Game[]` and returns aggregates

Tests in `tests/stats.test.ts` add fixture games with non-Commander variants and assert they are excluded.

The stats page (`src/app/stats/page.tsx`) renders unchanged. No badge, no notice, no filter UI surfaces the exclusion. (Future spec adds a non-Commander stats view.)

## F. Scope exclusions / future work

- **Stats-page UI for non-Commander formats:** out of scope. Future spec.
- **Tournament mode for Cube/Draft:** out of scope. The future feature would let a user record a tournament containing multiple rounds, each round being a 2-player match, tracking per-player round wins inside the tournament. This spec lays groundwork (the format variants exist) but does not implement the tournament container.
- **Format change on existing games:** not editable. `variant`, `bestOf`, and `comboWins` are creation-time only. The edit form remains variant-locked. To fix a misclassified game, delete and recreate.
- **Filter by bestOf or by comboWins:** not in v1. Adds UI complexity for a narrow benefit. Re-evaluate after the new formats see usage.
- **Loser-side scoring (2-1 vs 2-0):** not tracked. The Discord message only describes the winner's wins.
- **Per-game-in-match data (which specific games used combo):** not tracked. Only the count matters.

## G. Tests

New + updated tests live in `tests/`:

### New files

- `tests/gameFormats.test.ts` — `isCommanderFormat`, `requiresBestOf`, `maxComboWinsFor`, `ALL_FORMATS` ordering, `FORMAT_LABELS` completeness.

### Updated files

- `tests/validators.test.ts` — new test cases per new variant:
  - BRAWL accepts exactly 2 participants, 1 winner, no roles, no bestOf, no comboWins
  - BRAWL rejects 3 participants, 0 winners, role set, bestOf set, comboWins set
  - Best-of variants: accept Bo1 with comboWins 0/1; Bo3 with comboWins 0/1/2; Bo5 with comboWins 0/1/2/3
  - Best-of variants: reject Bo2/Bo4, reject comboWins > ceil(bestOf/2), reject missing comboWins, reject 1 participant
  - COMMANDER/STAR/KING reject any bestOf or comboWins value
- `tests/games-api.test.ts` — POST persists bestOf/comboWins; GET returns them.
- `tests/games-notify.test.ts` — full table-driven coverage of every variant × bestOf × comboWins combination listed in the example outputs. Asserts Bo1 omits the parenthetical, Bo3/Bo5 include it. Asserts the "winning N game(s) with combos" / "without combos" phrasing for Bo3/Bo5.
- `tests/games-filter.test.ts` — adds Format multi-select behavior: empty array = no filter; single format selected = filter to that variant; multiple formats = OR semantics; format filter ANDs with other filters.
- `tests/game-form.test.ts` — Random default for player 2 fires for all 7 non-COMMANDER 2-player variants; does NOT fire for 2-player COMMANDER. Validator behavior for bestOf/comboWins.
- `tests/stats.test.ts` — `mkGame` builder accepts `variant`. New cases: non-Commander games are excluded from win-rate, deck-rate, screwed-rate, combo-rate aggregations. Brawl IS included.

### Test fixtures

`mkGame` builders across `tests/games-filter.test.ts`, `tests/stats.test.ts`, and `tests/games-notify.test.ts` accept optional `bestOf`/`comboWins` with sensible defaults (`null` for non-best-of, `1`/`0` for best-of unless specified).

## H. Migration plan

### Prisma migration (committed)

`prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`:

```sql
-- Phase 06.5: add best-of + combo-wins tracking for 2-player non-Commander formats.
ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;
```

### Prod migration (gitignored — `.planning/`)

`.planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql`:

```sql
-- Phase 06.5 prod migration — add bestOf + comboWins columns.
-- Apply via: turso db shell magic-scraper < .planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql

-- Pre-state: confirm columns do not yet exist.
SELECT 'PRE-STATE' AS marker, COUNT(*) AS games_total FROM "games";

-- Add columns (idempotent: re-run via PRAGMA check would error gracefully on second apply).
ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;

-- Post-state: verify columns exist and are null for all existing rows.
SELECT 'POST-STATE' AS marker,
       COUNT(*) AS games_total,
       SUM(CASE WHEN "bestOf" IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_bestOf,
       SUM(CASE WHEN "comboWins" IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_comboWins
FROM "games";

-- Both rows_with_bestOf and rows_with_comboWins should be 0.
```

### Order of operations

1. Implementation lands locally (schema + code + tests).
2. Prisma migration applied to local dev DB.
3. Tests green.
4. Single commit (user pushes).
5. Prod migration applied via Turso (operator-run, output captured).
6. Vercel rebuild picks up the new code.

No application downtime: nullable columns are additive, and the deployed code only writes them for newly-created best-of games.
