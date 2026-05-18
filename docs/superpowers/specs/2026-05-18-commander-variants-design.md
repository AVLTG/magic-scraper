# Commander Variants (Star / King) — Design

**Date:** 2026-05-18
**Scope:** Add a second gate after the player-count modal that, for 5-player games, asks "Was this a Star Commander game?" and for 6-8-player games asks "Was this a King Commander game?" Persist a per-game variant and per-participant role so future stats can consume them. Stats themselves are out of scope.
**Status:** Approved, pending implementation plan.

## Context

The new-game flow currently shows a single modal ("How many players?") that picks the participant count (2-8) before rendering the form. Every game is implicitly a Standard Commander game with exactly one winner. The user wants to capture two additional formats their group plays:

- **Star Commander** (5 players) — allies can win together, so 1-2 winners are valid.
- **King Commander** (6-8 players) — one King; every other player is a Squire or an Assassin. Winners are decided by team: Royalty (king + all squires) or Assassins.

The data model needs to record both the format and per-player roles so a future stats feature can derive metrics like "times as king", "king win rate", "assassin win rate", etc. This spec covers the data + form + validator work only — no stats charts.

## Decisions

- **D-20 (variant locked at creation):** `Game.variant` is set during the create flow and is not editable. Existing games stay `STANDARD` forever (no retroactive annotation in this iteration).
- **D-21 (King winners are derived from team + roles):** The user picks "Who won? Royalty / Assassins"; the form derives each participant's `isWinner` from `role` + `winningTeam`. The API still receives `isWinner` per participant and validates it matches one of the two valid team configurations.
- **D-22 (Star is 1-2 winners):** Star Commander accepts 1 or 2 winners. Zero or 3+ are rejected. Multi-select replaces the single-winner radio.
- **D-23 (KING roles are mandatory):** Every participant in a KING game must have a non-null role (exactly one KING; every other is SQUIRE or ASSASSIN). STANDARD and STAR games must have all-null roles.
- **D-24 (no per-row team-winner control):** The "Who won? Royalty / Assassins" toggle lives above the participants grid; the per-row winner control is replaced by a role picker. This keeps team logic out of the row UI.

## What ships

A schema migration, a validator update, a second-step gate modal, and form rendering branches per variant.

## A. Data model

### `prisma/schema.prisma`

```prisma
model Game {
  id              String  @id @default(cuid())
  date            DateTime
  wonByCombo      Boolean @default(false)
  notes           String?
  isImported      Boolean @default(false)
  discordNotified Boolean @default(false)
  variant         String  @default("STANDARD")  // NEW: 'STANDARD' | 'STAR' | 'KING'
  createdAt       DateTime @default(now())
  participants    GameParticipant[]

  @@index([date])
  @@map("games")
}

model GameParticipant {
  id         String  @id @default(cuid())
  gameId     String
  playerName String
  isWinner   Boolean
  isScrewed  Boolean
  deckName   String?
  role       String?  // NEW: 'KING' | 'SQUIRE' | 'ASSASSIN' | null

  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@index([playerName])
  @@map("game_participants")
}
```

SQLite has no native enum type. Both columns use `String` constants enforced at the Zod layer.

### Migrations

- New Prisma migration: `prisma/migrations/20260518_add_game_variant_and_role/migration.sql`:
  ```sql
  ALTER TABLE "games" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'STANDARD';
  ALTER TABLE "game_participants" ADD COLUMN "role" TEXT;
  ```
- New prod-migration doc: `.planning/phases/06.2-commander-variants/06.2-01-PROD-MIGRATION.sql` (or wherever the next phase number lands — confirmed at plan time) mirroring the two `ALTER TABLE` statements.

Existing rows backfill to `variant = 'STANDARD'` automatically via the default; participants keep `role = NULL`. No data backfill script needed.

## B. Validator (`src/lib/validators.ts`)

### New constants

```ts
export const GAME_VARIANTS = ['STANDARD', 'STAR', 'KING'] as const;
export type GameVariant = (typeof GAME_VARIANTS)[number];

export const PARTICIPANT_ROLES = ['KING', 'SQUIRE', 'ASSASSIN'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];
```

### `gameParticipantSchema` adds:

```ts
role: z
  .enum(PARTICIPANT_ROLES)
  .nullish()
  .transform((v) => v ?? undefined),
```

### Split create vs update schemas

```ts
const baseGameSchema = z.object({
  date: z.coerce.date(),
  wonByCombo: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional().transform((v) => (v === '' ? undefined : v)),
  participants: z
    .array(gameParticipantSchema)
    .min(1)
    .max(8)
    .refine(
      (arr) => new Set(arr.map((p) => p.playerName.toLowerCase())).size === arr.length,
      { message: 'duplicate player names not allowed' }
    ),
});

export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('STANDARD') })
  .superRefine(variantInvariants);

// PATCH schema has no `variant` field. The PATCH route fetches the stored variant
// from the DB and runs `applyVariantInvariants(parsed, variant)` after parsing —
// equivalent enforcement, simpler than threading Zod context.
export const gameUpdateSchema = baseGameSchema;
```

`variantInvariants` is the shared check used both by `gameCreateSchema.superRefine` and by the post-parse helper in the PATCH route. Single source of truth for the rules in the table below.

### Variant invariants (`variantInvariants`)

| Variant | Participant count | Winner count | Role rules |
|---|---|---|---|
| STANDARD | 1-8 | exactly 1 | all roles must be null/undefined |
| STAR | exactly 5 | 1-2 | all roles must be null/undefined |
| KING | 6, 7, or 8 | derived from team (see below) | exactly 1 KING; every other player SQUIRE or ASSASSIN |

**KING winner consistency:** the set of winners must equal exactly one of:
- `{the KING} ∪ {all SQUIRES}` → Royalty won
- `{all ASSASSINS}` → Assassins won

Any other combination (empty winners, mixed teams, all winners, king-marked-winner-without-all-squires) is rejected with a clear message like `"KING game winners must be either {king + all squires} or {all assassins}"`.

## C. Gate flow (`src/app/games/new/page.tsx`)

State extends to two fields:

```ts
const [playerCount, setPlayerCount] = useState<number | null>(null);
const [variant, setVariant] = useState<GameVariant | null>(null);
```

Flow:

```
playerCount === null  → "How many players?" modal (unchanged)
  pick 2-4 → setPlayerCount(n); setVariant('STANDARD');  → form
  pick 5   → setPlayerCount(5);                          → second modal
  pick 6-8 → setPlayerCount(n);                          → second modal

playerCount !== null && variant === null → second-step variant modal
  5p:    "Was this a Star Commander game?  [ Yes ]  [ No ]"
  6-8p:  "Was this a King Commander game?  [ Yes ]  [ No ]"
    Yes → setVariant('STAR' or 'KING')  → form
    No  → setVariant('STANDARD')        → form

playerCount !== null && variant !== null → render <GameForm playerCount variant ... />
```

The variant modal reuses the same `fixed inset-0 z-50 ...` shell as the player-count modal. Two big Yes/No buttons (centered like the player-count buttons) and a "Back" link that returns the user to the player-count step (`setPlayerCount(null)`) so a misclick is recoverable. "Cancel" link goes to `/games`.

For player counts 2-4 the second modal never shows — variant is set to `STANDARD` synchronously alongside the player-count update.

## D. Form (`src/app/games/game-form.tsx`)

### Props

```ts
interface GameFormProps {
  playerCount: number;
  variant: GameVariant;  // NEW — immutable inside the form
  initial?: GameFormState;
  submitLabel?: string;
  onSubmit: (payload: GameFormPayload) => Promise<void> | void;
}
```

### State

`GameFormState` gains three new fields (all index-aligned with `rows` where relevant):

```ts
interface GameFormState {
  date: string;
  notes: string;
  wonByCombo: boolean;
  rows: ParticipantRow[];

  // STANDARD only — exactly one row index, or -1 (matches existing behavior)
  winnerIndex: number;

  // STAR only — 0..2 row indices selected
  winnerIndices: number[];

  // KING only — same length as rows; null means "not yet assigned"
  roles: (ParticipantRole | null)[];

  // KING only — null until user picks
  winningTeam: 'ROYALTY' | 'ASSASSINS' | null;
}
```

`ParticipantRow` itself stays as-is. Keeping role in a parallel array keeps the role-related branch logic in one place.

### Per-row column layout per variant

The existing 4-column grid `[player_name | deck | choice | screwed]` is preserved across all variants. Only the "choice" column changes:

- **STANDARD** (unchanged): `Winner` radio (one across rows)
- **STAR**: `Winner` checkbox per row. When 2 are checked, the others render disabled until a checked one is unchecked.
- **KING**: 3-option segmented control `K | S | A` per row. Exactly one row must be K; others must be S or A. The control's visual is a 3-button mini-radio matching the small `text-xs text-muted` styling of the existing Winner/Screwed labels.

### Above-grid team-winner control (KING only)

A new row rendered above the participants `<fieldset>`, below the Notes textarea:

```tsx
{variant === 'KING' && (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1">Who won?</label>
    <div className="flex gap-2">
      <button type="button" data-team="ROYALTY" ...>Royalty</button>
      <button type="button" data-team="ASSASSINS" ...>Assassins</button>
    </div>
  </div>
)}
```

Two large toggle buttons mirroring the visual treatment of the player-count modal buttons. The selected button gets the accent background; the other gets a transparent border. Required to submit.

### Submit-time derivation

`validateGameForm` branches on `variant`:

- **STANDARD**: as today — `participants[i].isWinner = (i === winnerIndex)`.
- **STAR**: `participants[i].isWinner = winnerIndices.includes(i)`. Validates `1 <= winnerIndices.length <= 2`.
- **KING**: `participants[i].isWinner` derived from `roles[i]` and `winningTeam`:
  - `winningTeam === 'ROYALTY'` → KING + all SQUIRES win.
  - `winningTeam === 'ASSASSINS'` → all ASSASSINS win.
  - Validates exactly 1 KING; all other roles set to S or A; `winningTeam` non-null.

Each participant also gets `role: roles[i]` in the outgoing payload (or undefined for STANDARD/STAR).

### Hydration (`buildInitialState`)

Reads `game.variant` from the API response and pre-populates:

- STANDARD: `winnerIndex` from the row whose `isWinner === true` (existing behavior).
- STAR: `winnerIndices` from indices where `isWinner === true`.
- KING: `roles` from each participant's `role`; `winningTeam` inferred — if KING (or any SQUIRE) has `isWinner === true` → `'ROYALTY'`; if any ASSASSIN has `isWinner === true` → `'ASSASSINS'`.

### `GameFormPayload` extension

```ts
export interface GameFormPayload {
  date: string;
  wonByCombo: boolean;
  notes?: string;
  variant?: GameVariant;  // sent on POST only; PATCH ignores it
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    deckName?: string;
    role?: ParticipantRole;
  }[];
}
```

The new-game page sets `variant` on the payload it sends; the edit page omits it. The PATCH route ignores `variant` defensively.

## E. Edit mode (`src/app/games/[id]/edit/page.tsx`)

Passes `variant: game.variant` from the API response into `<GameForm>`. No second-step gate is shown — variant is locked. The form renders the variant-specific controls and the role/team data is rehydrated by `buildInitialState`.

## F. API routes

### `POST /api/games`
- Validates body with `gameCreateSchema` (variant + invariants).
- Persists `variant` on `Game.create` and `role` on each `GameParticipant.createMany` row.

### `PATCH /api/games/[id]`
- Fetches the existing `game.variant` first.
- Validates body with `gameUpdateSchema` + `validateUpdateAgainstVariant(body, variant)` helper.
- Strips any `variant` field in the body (defense-in-depth — schema doesn't have it, but explicit ignore is documented).
- Persists role changes on the participant rows.

### `GET /api/games/[id]`
- Returns `variant` on the game and `role` on each participant.

## G. Tests

All in existing test files (no new test files unless coverage gap):

- **`tests/validators.test.ts`** (or wherever `gameSchema` is currently exercised):
  - STANDARD: exactly-1-winner enforced; roles must be null; rejects role set.
  - STAR: participant count must be 5; 1-2 winners; rejects 0 or 3+ winners; rejects role set.
  - KING: participant count 6-8; exactly 1 KING; every non-king is SQUIRE or ASSASSIN; rejects null roles; winners must be `{king + squires}` or `{all assassins}`; rejects mixed teams; rejects empty winners.
  - `gameUpdateSchema` (or update helper) rejects same invalid combinations.
- **`tests/game-form.test.ts`** (new file if absent, else extend):
  - `validateGameForm` derives `isWinner` correctly per variant.
  - `buildInitialState` reconstructs `roles` and `winningTeam` from a KING game (one test each for Royalty-won and Assassins-won).
  - `buildInitialState` reconstructs `winnerIndices` from a STAR game.
  - STAR cap at 2 (validation rejects 3 winners).
- **`tests/games-new-gate.test.tsx`** (new component test, or extend existing if any):
  - 2-4 player pick: variant modal does NOT appear; form renders with `variant='STANDARD'`.
  - 5 player pick + Yes: form renders with `variant='STAR'`.
  - 5 player pick + No: form renders with `variant='STANDARD'`.
  - 7 player pick + Yes: form renders with `variant='KING'`.
  - "Back" link from variant modal returns to player-count modal.

## H. Out of scope

- Stats charts for King/Star outcomes (king win rate, assassin win rate, role distribution, etc.). Future feature consumes the persisted data.
- Discord notification text updates (current notify body unchanged).
- Renaming `wonByCombo` (still applies to all variants).
- Changing variant on an existing game (D-20 — locked at creation).

## I. File inventory

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Add `Game.variant`, `GameParticipant.role` |
| `prisma/migrations/20260518_add_game_variant_and_role/migration.sql` | New |
| `.planning/phases/06.2-commander-variants/06.2-01-PROD-MIGRATION.sql` | New (path confirmed at plan time) |
| `src/lib/validators.ts` | New enums; `gameCreateSchema` / `gameUpdateSchema`; `variantInvariants`; update helper |
| `src/app/games/new/page.tsx` | Second-step variant modal + state machine |
| `src/app/games/game-form.tsx` | `variant` prop; new state fields; per-variant column rendering; team-winner toggle; derived isWinner; hydration |
| `src/app/games/[id]/edit/page.tsx` | Pass `variant` to `GameForm` |
| `src/app/api/games/route.ts` | Use `gameCreateSchema`; persist `variant` + `role` |
| `src/app/api/games/[id]/route.ts` | Use `gameUpdateSchema` + helper; persist `role`; ignore `variant` in body |
| `tests/validators.test.ts` | Variant + role invariant tests |
| `tests/game-form.test.ts` | Form state, derivation, hydration |
| `tests/games-new-gate.test.tsx` | Gate flow tests |
