# Random Players Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isRandom` boolean to `GameParticipant` that marks a participant as a "Random" player — kept in DB and shown on the games list (with `★`) and edit page, but aggregated into a single `'Random'` bucket in player stats, excluded entirely from deck stats, and hidden from autocomplete + filter dropdowns for both players and decks.

**Architecture:** One additive DB column. The validator drops the new field through; its dupe-refine is updated to skip random rows. API routes persist and surface `isRandom`; `/api/players` and `/api/decks` add `isRandom: false` to their `where`. The form gets a per-row Random checkbox (mobile-stacked, sm-inline). All player-aggregating stats helpers + filter-option helpers replace `p.playerName` with `p.isRandom ? 'Random' : p.playerName` AND collapse random contributions to at most one per game via a per-game `Set`. All deck-aggregating helpers + the deck-filter helper skip `isRandom: true` participants entirely.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma + Turso (SQLite), Zod, Jest + ts-jest, Tailwind v4.

**User preference — no commits during execution:** Per the user's established pattern, do NOT create commits between steps. Leave all changes in the working tree. The user will inspect the final diff and commit at the end.

**Spec:** `docs/superpowers/specs/2026-05-18-random-players-design.md`

---

## File map

**Modified:**
- `prisma/schema.prisma` — add `isRandom` column to `GameParticipant`
- `src/lib/validators.ts` — `gameParticipantSchema.isRandom`; dupe-refine update
- `src/app/api/games/route.ts` — POST persists `isRandom`
- `src/app/api/games/[id]/route.ts` — PATCH persists `isRandom`
- `src/app/api/players/route.ts` — exclude random participants
- `src/app/api/decks/route.ts` — exclude random participants
- `src/app/games/game-form.tsx` — `ParticipantRow.isRandom`, checkbox UI, `excludeItemsForRow`, payload, `buildInitialState`
- `src/app/games/page.tsx` — filter-option helpers collapse/skip; `matchesAllFilters`; `★` marker
- `src/lib/stats.ts` — 7 player-aggregating helpers (collapse) + 3 deck-aggregating helpers (skip)
- `tests/validators.test.ts` — dupe-refine cases
- `tests/game-form.test.ts` — form behavior cases
- `tests/games-filter.test.ts` — filter helper cases
- `tests/games-api.test.ts` — POST/PATCH persistence cases
- `tests/stats.test.ts` — stats helper cases
- `tests/autocomplete-api.test.ts` — `/api/players` and `/api/decks` exclusion cases

**Created:**
- `prisma/migrations/20260518b_add_israndom_to_participants/migration.sql`
- `.planning/phases/06.3-random-players/06.3-01-PROD-MIGRATION.sql`

**Helpers affected (for quick lookup):**
- **Player-collapse** (replace `playerName` with `'Random'` when `isRandom`, AND ensure per-game contribution caps at 1):
  - `computePlayerWinRate`, `computeScrewedRate`, `computeMostLikelyToPlay`, `computeMostLikelyToPlayBump`, `computeWinsByPlayerPie`, `computePlayerRadar`, `computeScrewedByPlayerBar`
- **Deck-skip** (skip `p.isRandom === true` participants):
  - `computeDeckWinRate`, `computeGamesByDeckPie`, `computeScrewedByDeckPie`
- **Filter-option collapse** (game-page):
  - `deriveWinnerOptions`, `derivePlayerOptions`
- **Filter-option skip** (game-page):
  - `deriveDeckOptions`
- **Filter logic** (game-page):
  - `matchesAllFilters` — winner / players / decks branches

**Conventions:**
- Jest config: `testMatch: '**/tests/**/*.test.ts'` (no .tsx). Pure-logic tests.
- All new code LF-terminated (verify with `file <path>` after writes).

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260518b_add_israndom_to_participants/migration.sql`
- Create: `.planning/phases/06.3-random-players/06.3-01-PROD-MIGRATION.sql`

- [ ] **Step 1.1: Add `isRandom` to the `GameParticipant` model**

In `prisma/schema.prisma`, find the `GameParticipant` model and add `isRandom` between `isScrewed` and `deckName`:

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

- [ ] **Step 1.2: Write the dev migration SQL**

Create `prisma/migrations/20260518b_add_israndom_to_participants/migration.sql`:

```sql
-- Phase 6.3: add GameParticipant.isRandom flag for random-player aggregation
-- Additive-only, per Phase 5 D-14 pattern. Existing rows backfill to 0 (false).
-- Spec: docs/superpowers/specs/2026-05-18-random-players-design.md

ALTER TABLE "game_participants" ADD COLUMN "isRandom" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 1.3: Write the prod-migration doc**

Create `.planning/phases/06.3-random-players/06.3-01-PROD-MIGRATION.sql`:

```sql
-- Phase 6.3 production migration: add GameParticipant.isRandom
-- Matches prisma/schema.prisma (D-25 — see random-players design spec)
-- Apply via: turso db shell <PROD-DB-NAME> < 06.3-01-PROD-MIGRATION.sql
--
-- Phase 5 D-14 pattern: additive only, no DROP, no ALTER of existing columns.

-- Step 1: Add the column (default 0 = false; SQLite stores booleans as INTEGER)
ALTER TABLE game_participants ADD COLUMN isRandom INTEGER NOT NULL DEFAULT 0;

-- Step 2: Verify the column exists and all rows defaulted to 0
SELECT name, type, "notnull", dflt_value FROM pragma_table_info('game_participants') WHERE name = 'isRandom';
-- Expected: isRandom | INTEGER | 1 | 0

SELECT COUNT(*) AS total_participants,
       SUM(CASE WHEN isRandom = 0 THEN 1 ELSE 0 END) AS default_false
  FROM game_participants;
-- Expected: default_false == total_participants
```

- [ ] **Step 1.4: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client`.

- [ ] **Step 1.5: Apply the dev migration**

Run: `npx prisma migrate deploy`
Expected: `Applying migration \`20260518b_add_israndom_to_participants\``, then `All migrations have been successfully applied.`

- [ ] **Step 1.6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 2: Validator + dupe-refine update

**Files:**
- Modify: `src/lib/validators.ts`
- Modify: `tests/validators.test.ts`

- [ ] **Step 2.1: Write failing tests for the new isRandom field + dupe exception**

In `tests/validators.test.ts`, append at the end of the file (after the existing `describe('gameUpdateSchema ...')` block):

```ts
describe('gameCreateSchema — isRandom field', () => {
  function withVariantOmitted() {
    return { date: baseDate };
  }

  it('accepts participants with isRandom: true', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Alice', { isWinner: true }),
        { ...p('Bob'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('defaults isRandom to false when omitted', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Alice', { isWinner: true }),
        p('Bob'),
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.participants.every((pp) => pp.isRandom === false)).toBe(true);
    }
  });

  it('rejects two regular rows with the same name', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Alice', { isWinner: true }),
        p('alice'),
      ],
    });
    expect(res.success).toBe(false);
  });

  it('accepts two random rows with the same name', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Conny', { isWinner: true, isRandom: true }),
        { ...p('Conny'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('accepts a regular row sharing a name with a random row', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Conny', { isWinner: true }),
        { ...p('Conny'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty playerName even when isRandom is true', () => {
    const res = gameCreateSchema.safeParse({
      ...withVariantOmitted(),
      participants: [
        p('Alice', { isWinner: true }),
        { ...p(''), isRandom: true },
      ],
    });
    expect(res.success).toBe(false);
  });
});
```

The existing `p()` helper at the top of this test file accepts an `opts` parameter; verify it takes `isRandom` as a field. If not, the inline-spread pattern above (`{ ...p('Conny'), isRandom: true }`) overrides correctly without modifying the helper.

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx jest tests/validators.test.ts -t 'isRandom field'`
Expected: FAIL — either the parser rejects `isRandom` (Zod strict mode would, but the existing schema isn't strict) or the dupe-refine rejects same-named random rows.

- [ ] **Step 2.3: Add `isRandom` to `gameParticipantSchema`**

In `src/lib/validators.ts`, find the existing `gameParticipantSchema`:

```ts
export const gameParticipantSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, 'playerName is required')
    .max(100, 'playerName too long'),
  isWinner: z.boolean(),
  isScrewed: z.boolean(),
  deckName: z
    .string()
    .trim()
    .max(100, 'deckName too long')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  role: z
    .enum(PARTICIPANT_ROLES)
    .nullish()
    .transform((v) => v ?? undefined),
});
```

Replace with (adds `isRandom` with default `false`):

```ts
export const gameParticipantSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, 'playerName is required')
    .max(100, 'playerName too long'),
  isWinner: z.boolean(),
  isScrewed: z.boolean(),
  isRandom: z.boolean().default(false),
  deckName: z
    .string()
    .trim()
    .max(100, 'deckName too long')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  role: z
    .enum(PARTICIPANT_ROLES)
    .nullish()
    .transform((v) => v ?? undefined),
});
```

- [ ] **Step 2.4: Update the dupe-refine to skip random rows**

In `src/lib/validators.ts`, find the existing `baseGameSchema`:

```ts
const baseGameSchema = z.object({
  date: z.coerce.date(),
  wonByCombo: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(1000, 'notes too long')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  participants: z
    .array(gameParticipantSchema)
    .min(1, 'at least one participant required')
    .max(8, 'at most eight participants per game')
    .refine(
      (arr) => new Set(arr.map((p) => p.playerName.toLowerCase())).size === arr.length,
      { message: 'duplicate player names not allowed' }
    ),
});
```

Replace the `.refine(...)` block with:

```ts
    .refine(
      (arr) => {
        const regulars = arr.filter((p) => !p.isRandom);
        const names = new Set(regulars.map((p) => p.playerName.toLowerCase()));
        return names.size === regulars.length;
      },
      { message: 'duplicate player names not allowed (non-random rows)' }
    ),
```

- [ ] **Step 2.5: Run validator tests to verify they pass**

Run: `npx jest tests/validators.test.ts`
Expected: all tests PASS, including the 6 new `isRandom field` cases and all prior tests.

- [ ] **Step 2.6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 3: API routes — persist `isRandom`; autocomplete exclusion

**Files:**
- Modify: `src/app/api/games/route.ts`
- Modify: `src/app/api/games/[id]/route.ts`
- Modify: `src/app/api/players/route.ts`
- Modify: `src/app/api/decks/route.ts`
- Modify: `tests/games-api.test.ts`
- Modify: `tests/autocomplete-api.test.ts`

- [ ] **Step 3.1: Persist `isRandom` in POST `/api/games`**

In `src/app/api/games/route.ts`, find the `createMany` call:

```ts
await tx.gameParticipant.createMany({
  data: participants.map((p) => ({
    gameId: created.id,
    playerName: p.playerName,
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    deckName: p.deckName,
    role: p.role,
  })),
});
```

Replace with (adds `isRandom`):

```ts
await tx.gameParticipant.createMany({
  data: participants.map((p) => ({
    gameId: created.id,
    playerName: p.playerName,
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    isRandom: p.isRandom,
    deckName: p.deckName,
    role: p.role,
  })),
});
```

- [ ] **Step 3.2: Persist `isRandom` in PATCH `/api/games/[id]`**

In `src/app/api/games/[id]/route.ts`, find the `createMany` call inside the PATCH transaction:

```ts
await tx.gameParticipant.createMany({
  data: participants.map((p) => ({
    gameId: g.id,
    playerName: p.playerName,
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    deckName: p.deckName,
    role: p.role,
  })),
});
```

Replace with:

```ts
await tx.gameParticipant.createMany({
  data: participants.map((p) => ({
    gameId: g.id,
    playerName: p.playerName,
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    isRandom: p.isRandom,
    deckName: p.deckName,
    role: p.role,
  })),
});
```

- [ ] **Step 3.3: Exclude random participants from `/api/players`**

In `src/app/api/players/route.ts`, find:

```ts
prisma.gameParticipant.findMany({
  select: { playerName: true },
  distinct: ['playerName'],
}),
```

Replace with:

```ts
prisma.gameParticipant.findMany({
  where: { isRandom: false },
  select: { playerName: true },
  distinct: ['playerName'],
}),
```

- [ ] **Step 3.4: Exclude random participants from `/api/decks`**

In `src/app/api/decks/route.ts`, find:

```ts
const rows = await prisma.gameParticipant.findMany({
  select: { deckName: true },
  distinct: ['deckName'],
  where: { deckName: { not: null } },
});
```

Replace with:

```ts
const rows = await prisma.gameParticipant.findMany({
  select: { deckName: true },
  distinct: ['deckName'],
  where: { deckName: { not: null }, isRandom: false },
});
```

- [ ] **Step 3.5: Write a failing test for POST persisting isRandom**

In `tests/games-api.test.ts`, find the `describe('POST /api/games', ...)` block. Append (before its closing `});`):

```ts
  it('persists isRandom on each participant', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    const gameCreateSpy = jest.fn().mockResolvedValue({ id: 'g-rand' });
    const participantCreateManySpy = jest.fn().mockResolvedValue({ count: 3 });
    mockTransaction.mockImplementation(async (cb: any) =>
      cb({
        game: { create: gameCreateSpy },
        gameParticipant: { createMany: participantCreateManySpy },
      })
    );

    const body = {
      date: new Date('2026-05-01').toISOString(),
      participants: [
        { playerName: 'Alice', isWinner: true, isScrewed: false, isRandom: false },
        { playerName: 'Conny', isWinner: false, isScrewed: false, isRandom: true },
        { playerName: 'Conny', isWinner: false, isScrewed: false, isRandom: true },
      ],
    };

    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(201);

    const participantRows = participantCreateManySpy.mock.calls[0][0].data;
    expect(participantRows).toHaveLength(3);
    expect(participantRows.find((r: any) => r.playerName === 'Alice').isRandom).toBe(false);
    const connys = participantRows.filter((r: any) => r.playerName === 'Conny');
    expect(connys).toHaveLength(2);
    expect(connys.every((r: any) => r.isRandom === true)).toBe(true);
  });
```

- [ ] **Step 3.6: Run the test to verify it passes**

Run: `npx jest tests/games-api.test.ts -t 'persists isRandom'`
Expected: PASS (the route changes from Steps 3.1-3.2 are already in place).

- [ ] **Step 3.7: Write failing tests for autocomplete-api exclusion**

In `tests/autocomplete-api.test.ts`, find the existing test that exercises `/api/players` or `/api/decks`. Append (or insert into appropriate describe blocks) the two new tests below.

**For `/api/players`** — find the `describe` block exercising the players route. Append:

```ts
  it('excludes random participants from the player list', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    const participantFindManySpy = jest.fn().mockResolvedValue([
      { playerName: 'Alice' },
      { playerName: 'Bob' },
    ]);
    mockParticipantFindMany.mockImplementation(participantFindManySpy);
    mockUserFindMany.mockResolvedValue([]);

    const res: any = await getPlayers(makeRequest());
    expect(res.status).toBe(200);
    expect(participantFindManySpy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isRandom: false } })
    );
  });
```

**For `/api/decks`** — find the `describe` block exercising the decks route. Append:

```ts
  it('excludes random participants from the deck list', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    const participantFindManySpy = jest.fn().mockResolvedValue([
      { deckName: 'Atraxa' },
      { deckName: 'Selvala' },
    ]);
    mockParticipantFindMany.mockImplementation(participantFindManySpy);

    const res: any = await getDecks(makeRequest());
    expect(res.status).toBe(200);
    const whereArg = participantFindManySpy.mock.calls[0][0].where;
    expect(whereArg).toEqual(
      expect.objectContaining({ isRandom: false })
    );
  });
```

NOTE: the exact mock identifiers (`mockParticipantFindMany`, `mockUserFindMany`, `getPlayers`, `getDecks`) depend on the existing test file's setup. Read the file's imports and mock declarations first; adapt the test naming to match. The shape of the assertion (`where.isRandom: false`) stays the same.

- [ ] **Step 3.8: Run the autocomplete-api tests**

Run: `npx jest tests/autocomplete-api.test.ts`
Expected: all pass, including the 2 new exclusion tests.

- [ ] **Step 3.9: Run the full games-api test file**

Run: `npx jest tests/games-api.test.ts`
Expected: all pass.

- [ ] **Step 3.10: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 4: GameForm — `ParticipantRow.isRandom`, checkbox UI, helper updates

**Files:**
- Modify: `src/app/games/game-form.tsx`
- Modify: `tests/game-form.test.ts`

- [ ] **Step 4.1: Update test helpers to add `isRandom` field**

In `tests/game-form.test.ts`, find the `row()` helper at the top:

```ts
function row(playerName: string, extra: Partial<ParticipantRow> = {}): ParticipantRow {
  return { playerName, deckName: '', isWinner: false, isScrewed: false, ...extra };
}
```

Replace with:

```ts
function row(playerName: string, extra: Partial<ParticipantRow> = {}): ParticipantRow {
  return { playerName, deckName: '', isWinner: false, isScrewed: false, isRandom: false, ...extra };
}
```

The `ParticipantRow` interface in game-form.tsx will gain `isRandom: boolean` (required) in Step 4.4; this helper update keeps all ~30 existing test call sites compiling after that change.

- [ ] **Step 4.2: Write failing tests for the form behavior**

In `tests/game-form.test.ts`, at the bottom (after the last existing `describe(...)`), append:

```ts
describe('excludeItemsForRow — isRandom interaction', () => {
  it('returns empty array when the caller row is random', () => {
    const state = {
      rows: [
        row('Alice'),
        row('Bob'),
        { ...row('Conny'), isRandom: true },
      ],
    };
    expect(excludeItemsForRow(2, state)).toEqual([]);
  });

  it('excludes non-random rows from the dedupe set when caller is non-random', () => {
    const state = {
      rows: [
        row('Alice'),
        { ...row('Conny'), isRandom: true },
        row('Bob'),
      ],
    };
    // Caller is row 0 (non-random). Should see only the OTHER non-random row's name.
    expect(excludeItemsForRow(0, state)).toEqual(['Bob']);
  });
});

describe('validateGameForm — isRandom payload', () => {
  it('includes isRandom on each participant in the payload', () => {
    const state = baseState(
      [
        row('Alice', { isWinner: true }),
        { ...row('Conny'), isRandom: true },
      ],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants[0].isRandom).toBe(false);
      expect(result.payload.participants[1].isRandom).toBe(true);
    }
  });
});

describe('buildInitialState — isRandom hydration', () => {
  it('hydrates isRandom from the loaded game', () => {
    const game = {
      date: '2026-05-01T00:00:00.000Z',
      wonByCombo: false,
      notes: null,
      participants: [
        { playerName: 'Alice', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa' },
        { playerName: 'Conny', isWinner: false, isScrewed: false, isRandom: true, deckName: 'Selvala' },
      ],
    };
    const state = buildInitialState(game);
    expect(state.rows[0].isRandom).toBe(false);
    expect(state.rows[1].isRandom).toBe(true);
  });

  it('defaults isRandom to false when the API row omits it', () => {
    const game = {
      date: '2026-05-01T00:00:00.000Z',
      wonByCombo: false,
      notes: null,
      participants: [
        // Legacy row missing the field
        { playerName: 'Alice', isWinner: true, isScrewed: false, deckName: 'Atraxa' } as any,
      ],
    };
    const state = buildInitialState(game);
    expect(state.rows[0].isRandom).toBe(false);
  });
});
```

You'll also need to import `excludeItemsForRow` and `buildInitialState` if they aren't already imported. Check the existing imports at the top of the test file; add what's missing.

- [ ] **Step 4.3: Run the new tests to verify they fail**

Run: `npx jest tests/game-form.test.ts -t 'isRandom'`
Expected: FAIL — `ParticipantRow` doesn't have `isRandom` yet, so TypeScript errors at compile time; runtime errors otherwise.

- [ ] **Step 4.4: Update `ParticipantRow`, `emptyRow`, `GameFormPayload`, and initial state in `src/app/games/game-form.tsx`**

Find the `ParticipantRow` interface:

```ts
export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
}
```

Replace with:

```ts
export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
}
```

Find `emptyRow`:

```ts
function emptyRow(): ParticipantRow {
  return { playerName: '', deckName: '', isWinner: false, isScrewed: false };
}
```

Replace with:

```ts
function emptyRow(): ParticipantRow {
  return { playerName: '', deckName: '', isWinner: false, isScrewed: false, isRandom: false };
}
```

Find `GameFormPayload`:

```ts
export interface GameFormPayload {
  date: string;
  wonByCombo: boolean;
  notes?: string;
  variant?: GameVariant;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    deckName?: string;
    role?: ParticipantRole;
  }[];
}
```

Replace with:

```ts
export interface GameFormPayload {
  date: string;
  wonByCombo: boolean;
  notes?: string;
  variant?: GameVariant;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    isRandom: boolean;
    deckName?: string;
    role?: ParticipantRole;
  }[];
}
```

- [ ] **Step 4.5: Update `validateGameForm` to forward `isRandom` into the payload**

Find the `participants.map((r, i) => { ... })` block at the end of `validateGameForm` that constructs the payload. Specifically find the return shape:

```ts
    return {
      playerName: r.playerName.trim(),
      isWinner,
      isScrewed: r.isScrewed,
      deckName: r.deckName.trim() === '' ? undefined : r.deckName.trim(),
      role,
    };
```

Replace with:

```ts
    return {
      playerName: r.playerName.trim(),
      isWinner,
      isScrewed: r.isScrewed,
      isRandom: r.isRandom,
      deckName: r.deckName.trim() === '' ? undefined : r.deckName.trim(),
      role,
    };
```

- [ ] **Step 4.6: Update `buildInitialState` to hydrate `isRandom`**

Find `buildInitialState`'s `rows` construction:

```ts
  const rows: ParticipantRow[] = game.participants.map((p) => ({
    playerName: p.playerName,
    deckName: p.deckName ?? '',
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
  }));
```

Replace with:

```ts
  const rows: ParticipantRow[] = game.participants.map((p) => ({
    playerName: p.playerName,
    deckName: p.deckName ?? '',
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    isRandom: (p as { isRandom?: boolean }).isRandom ?? false,
  }));
```

Also update the input type for `buildInitialState`:

```ts
export function buildInitialState(game: {
  date: string | Date;
  wonByCombo: boolean;
  notes: string | null;
  variant?: GameVariant;
  participants: { playerName: string; isWinner: boolean; isScrewed: boolean; deckName: string | null; role?: ParticipantRole | null }[];
}): GameFormState {
```

Replace the `participants:` type with:

```ts
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    isRandom?: boolean;
    deckName: string | null;
    role?: ParticipantRole | null;
  }[];
```

- [ ] **Step 4.7: Update `excludeItemsForRow` to skip random rows on both sides**

Find:

```ts
export function excludeItemsForRow(
  rowIndex: number,
  state: { rows: ParticipantRow[] }
): string[] {
  return state.rows
    .map((r, i) => ({ name: r.playerName.trim(), i }))
    .filter((r) => r.i !== rowIndex && r.name.length > 0)
    .map((r) => r.name);
}
```

Replace with:

```ts
export function excludeItemsForRow(
  rowIndex: number,
  state: { rows: ParticipantRow[] }
): string[] {
  // Random rows can share names with anyone, so they neither contribute to
  // nor consume the dedupe set.
  if (state.rows[rowIndex]?.isRandom) return [];

  return state.rows
    .map((r, i) => ({ row: r, i }))
    .filter((entry) => entry.i !== rowIndex && !entry.row.isRandom && entry.row.playerName.trim().length > 0)
    .map((entry) => entry.row.playerName.trim());
}
```

- [ ] **Step 4.8: Update the initial-state `useState` seed inside the `GameForm` component to include `isRandom`**

Find the `useState<GameFormState>(initial ?? { ... })` block. The participants array is initialized via `Array.from({ length: playerCount }, emptyRow)` which now picks up `isRandom: false` automatically from Step 4.4 — no change needed here. Confirm by reading the surrounding lines.

- [ ] **Step 4.9: Add the Random checkbox to the per-row JSX (mobile-aware)**

Find the existing per-row JSX that renders the Screwed checkbox. It looks roughly like:

```tsx
<label className="flex items-center gap-1 text-xs text-muted">
  <input
    type="checkbox"
    checked={r.isScrewed}
    onChange={(e) => updateRow(i, { isScrewed: e.target.checked })}
  />
  Screwed
</label>
```

Wrap the Screwed `<label>` AND a new Random `<label>` in a flex container that stacks on mobile and goes inline on `sm:`:

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

- [ ] **Step 4.10: Run the form tests**

Run: `npx jest tests/game-form.test.ts`
Expected: all tests pass, including the 5 new isRandom tests across 3 describe blocks.

- [ ] **Step 4.11: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 5: Games-page filter helpers + `★` row marker

**Files:**
- Modify: `src/app/games/page.tsx`
- Modify: `tests/games-filter.test.ts`

- [ ] **Step 5.1: Update the test helper to add `isRandom`**

In `tests/games-filter.test.ts`, find `mkParticipant`:

```ts
function mkParticipant(
  playerName: string,
  isWinner = false,
  isScrewed = false,
  deckName: string | null = null
) {
  return {
    id: `p-${playerName}`,
    gameId: 'g-1',
    playerName,
    isWinner,
    isScrewed,
    deckName,
  };
}
```

Replace with (adds `isRandom` as a 5th positional optional arg, default false):

```ts
function mkParticipant(
  playerName: string,
  isWinner = false,
  isScrewed = false,
  deckName: string | null = null,
  isRandom = false
) {
  return {
    id: `p-${playerName}`,
    gameId: 'g-1',
    playerName,
    isWinner,
    isScrewed,
    isRandom,
    deckName,
  };
}
```

This keeps all existing `mkParticipant('Alice', true)` call sites passing — they get `isRandom: false` automatically.

- [ ] **Step 5.2: Write failing tests for the filter helpers**

In `tests/games-filter.test.ts`, at the bottom (after the last existing `describe(...)`), append:

```ts
describe('derive*Options with random participants', () => {
  it('deriveWinnerOptions returns "Random" instead of the real name when a random wins', () => {
    const g1 = mkGame('g1', [mkParticipant('Conny', true, false, 'Atraxa', true), mkParticipant('Bob')]);
    expect(deriveWinnerOptions([g1])).toEqual(['Random']);
  });

  it('derivePlayerOptions returns "Random" instead of the real name for random participants', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, 'Atraxa', true),
    ]);
    expect(derivePlayerOptions([g1])).toEqual(['Alice', 'Random']);
  });

  it('derivePlayerOptions deduplicates multiple randoms across games into one "Random"', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, null, true),
    ]);
    const g2 = mkGame('g2', [
      mkParticipant('Bob', true),
      mkParticipant('Dave', false, false, null, true),
    ]);
    expect(derivePlayerOptions([g1, g2])).toEqual(['Alice', 'Bob', 'Random']);
  });

  it('deriveDeckOptions skips random participants entirely', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true, false, 'Atraxa'),
      mkParticipant('Conny', false, false, 'Selvala', true),
    ]);
    expect(deriveDeckOptions([g1])).toEqual(['Atraxa']);
  });

  it('a real player who ONLY ever played as random does NOT appear in derivePlayerOptions', () => {
    const g1 = mkGame('g1', [
      mkParticipant('Alice', true),
      mkParticipant('Conny', false, false, null, true),
    ]);
    expect(derivePlayerOptions([g1])).not.toContain('Conny');
  });
});

describe('matchesAllFilters — random handling', () => {
  const aliceVsRandom = mkGame('g1', [
    mkParticipant('Alice', true, false, 'Atraxa'),
    mkParticipant('Conny', false, false, 'Selvala', true),
  ]);
  const randomWins = mkGame('g2', [
    mkParticipant('Alice', false),
    mkParticipant('Conny', true, false, 'Selvala', true),
  ]);
  const allRandom = mkGame('g3', [
    mkParticipant('Conny', true, false, 'Atraxa', true),
    mkParticipant('Eve', false, false, 'Selvala', true),
  ]);

  it('winner filter "Random" matches games where any random won', () => {
    expect(matchesAllFilters(randomWins, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(true);
    expect(matchesAllFilters(allRandom, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(true);
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, winner: 'Random' })).toBe(false);
  });

  it('winner filter does NOT match the real name of a random winner', () => {
    expect(matchesAllFilters(randomWins, { ...EMPTY_FILTERS, winner: 'Conny' })).toBe(false);
  });

  it('players filter "Random" matches games with any random participant', () => {
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, players: ['Random'] })).toBe(true);
    expect(matchesAllFilters(allRandom, { ...EMPTY_FILTERS, players: ['Random'] })).toBe(true);
  });

  it('players filter does NOT match the real name of a random participant', () => {
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, players: ['Conny'] })).toBe(false);
  });

  it('decks filter ignores decks played only by randoms', () => {
    // 'Selvala' is only played by random Conny in g1 → should not match
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, decks: ['Selvala'] })).toBe(false);
    // 'Atraxa' is played by non-random Alice → should match
    expect(matchesAllFilters(aliceVsRandom, { ...EMPTY_FILTERS, decks: ['Atraxa'] })).toBe(true);
  });
});
```

- [ ] **Step 5.3: Run the new tests to verify they fail**

Run: `npx jest tests/games-filter.test.ts -t 'with random participants|random handling'`
Expected: FAIL — the helpers don't know about `isRandom` yet.

- [ ] **Step 5.4: Update the `Participant` interface to include `isRandom`**

In `src/app/games/page.tsx`, find:

```ts
interface Participant {
  id: string;
  gameId: string;
  playerName: string;
  isWinner: boolean;
  isScrewed: boolean;
  deckName: string | null;
}
```

Replace with:

```ts
interface Participant {
  id: string;
  gameId: string;
  playerName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
  deckName: string | null;
}
```

- [ ] **Step 5.5: Update `deriveWinnerOptions` to collapse randoms to 'Random'**

Find:

```ts
export function deriveWinnerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) set.add(p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

Replace with:

```ts
export function deriveWinnerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) set.add(p.isRandom ? 'Random' : p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

- [ ] **Step 5.6: Update `derivePlayerOptions` to collapse randoms to 'Random'**

Find:

```ts
export function derivePlayerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      set.add(p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

Replace with:

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

- [ ] **Step 5.7: Update `deriveDeckOptions` to skip random participants**

Find:

```ts
export function deriveDeckOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      const trimmed = p.deckName?.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
```

Replace with:

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

- [ ] **Step 5.8: Update `matchesAllFilters` (winner, players, decks branches)**

Find the existing `matchesAllFilters` and replace the entire function with:

```ts
export function matchesAllFilters(game: Game, filters: FilterState): boolean {
  if (filters.winner !== null) {
    if (filters.winner === 'Random') {
      const anyRandomWon = game.participants.some((p) => p.isWinner && p.isRandom);
      if (!anyRandomWon) return false;
    } else {
      const winner = game.participants.find((p) => p.isWinner && !p.isRandom);
      if (!winner || winner.playerName !== filters.winner) return false;
    }
  }
  if (filters.playerCount !== null) {
    if (game.participants.length !== filters.playerCount) return false;
  }
  if (filters.players.length > 0) {
    const buckets = new Set<string>();
    for (const p of game.participants) {
      buckets.add(p.isRandom ? 'Random' : p.playerName);
    }
    const anyMatch = filters.players.some((p) => buckets.has(p));
    if (!anyMatch) return false;
  }
  if (filters.decks.length > 0) {
    const usedDecks = new Set(
      game.participants
        .filter((p) => !p.isRandom)
        .map((p) => p.deckName?.trim())
        .filter((d): d is string => !!d && d !== '')
    );
    const anyMatch = filters.decks.some((d) => usedDecks.has(d));
    if (!anyMatch) return false;
  }
  return true;
}
```

Key changes:
- Winner branch: `'Random'` matches any winning random participant; otherwise matches non-random winners only (a random winner with `playerName === 'Alice'` does NOT satisfy a filter looking for `'Alice'`).
- Players branch: now uses the same bucketing (`'Random'` for random rows, real name otherwise) and checks set membership.
- Decks branch: random participants' decks excluded entirely.

- [ ] **Step 5.9: Run the filter tests**

Run: `npx jest tests/games-filter.test.ts`
Expected: all tests pass, including the new ~10 random-handling cases.

- [ ] **Step 5.10: Add the `★` marker to the participant render in the games list**

In `src/app/games/page.tsx`, find the JSX that renders participant names in the games list. Search for `participant.playerName` or similar — there are typically multiple render sites (collapsed row summary, expanded detail row).

For each render site that displays a participant's name, wrap it with the random marker. Example transformation:

```tsx
<span>{p.playerName}</span>
```

becomes:

```tsx
<span>
  {p.playerName}
  {p.isRandom && <span aria-label="Random player" title="Random player"> ★</span>}
</span>
```

Apply consistently anywhere `p.playerName` is rendered for a participant in a game row. Deck rendering stays unchanged (still shows the real deck name).

Read the file's render section first (`return (...)` at the bottom of the component) and patch every site. Typically: the comma-separated participant summary line and the expanded participant table.

- [ ] **Step 5.11: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 6: Stats helpers — player collapse + deck skip

**Files:**
- Modify: `src/lib/stats.ts`
- Modify: `tests/stats.test.ts`

This task updates 10 helpers. They split into two patterns:
- **Player-collapse** (7 helpers): treat each game's contribution to a player bucket as at-most-one. The bucket key is `p.isRandom ? 'Random' : p.playerName`.
- **Deck-skip** (3 helpers): inside the participant loop, `if (p.isRandom) continue;` before any deck logic.

- [ ] **Step 6.1: Write failing tests for the stats helpers**

In `tests/stats.test.ts`, at the bottom (after the last existing `describe(...)`), append (the existing file's `mkParticipant` / `mkGame` helpers may need updating to accept `isRandom`; do that first, parallel to Task 5.1):

First, in the same file at the top, find the existing `mkParticipant` helper (similar shape to `tests/games-filter.test.ts`'s). Update it to accept an `isRandom` field via an `opts` argument (preserve backward compatibility). The exact existing signature may differ — read it first and adapt.

If the existing helper looks like:

```ts
function mkParticipant(name: string, opts: Partial<{ isWinner: boolean; isScrewed: boolean; deckName: string }> = {}) { ... }
```

extend its `opts` type to include `isRandom?: boolean` and return that field on the participant object (default `false`).

Then append:

```ts
describe('player-collapse: computeWinsByPlayerPie', () => {
  it('treats a game with 2 winning randoms as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
        mkParticipant('Eve', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Random')?.wins).toBe(1);
  });

  it('counts a non-random win AND a random win in the same game separately', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Alice')?.wins).toBe(1);
    expect(result.find((r) => r.player === 'Random')?.wins).toBe(1);
  });

  it('a random winner does NOT show up under the real name', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computeWinsByPlayerPie(games);
    expect(result.find((r) => r.player === 'Conny')).toBeUndefined();
  });
});

describe('player-collapse: computeScrewedByPlayerBar', () => {
  it('treats a game with 2 screwed randoms as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isScrewed: true, isRandom: true, isWinner: true }),
        mkParticipant('Eve', { isScrewed: true, isRandom: true }),
      ]),
    ];
    const result = computeScrewedByPlayerBar(games);
    expect(result.find((r) => r.player === 'Random')?.screwed).toBe(1);
  });
});

describe('player-collapse: computeMostLikelyToPlay', () => {
  it('treats a game with 2 random participants as +1 to Random', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true }),
        mkParticipant('Conny', { isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
    ];
    const result = computeMostLikelyToPlay(games);
    expect(result.find((r) => r.player === 'Random')?.participations).toBe(1);
    expect(result.find((r) => r.player === 'Alice')?.participations).toBe(1);
  });
});

describe('player-collapse: computePlayerWinRate', () => {
  it('aggregates random plays + wins into a single Random bucket per game', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
      mkGame('2026-04-02', [
        mkParticipant('Conny', { isRandom: true }),
        mkParticipant('Eve', { isWinner: true, isRandom: true }),
      ]),
    ];
    const result = computePlayerWinRate(games);
    const random = result.find((r) => r.player === 'Random');
    expect(random?.played).toBe(2);
    expect(random?.wins).toBe(2);
    expect(random?.rate).toBe(1);
  });
});

describe('player-collapse: computePlayerRadar', () => {
  it('emits a single Random row aggregating across random participants', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Conny', { isWinner: true, isScrewed: true, isRandom: true }),
        mkParticipant('Eve', { isRandom: true }),
      ]),
    ];
    const result = computePlayerRadar(games);
    const random = result.find((r) => r.player === 'Random');
    expect(random).toBeDefined();
    expect(random?.played).toBe(1);
    expect(random?.wins).toBe(1);
    expect(random?.screwed).toBe(1);
    expect(result.find((r) => r.player === 'Conny')).toBeUndefined();
    expect(result.find((r) => r.player === 'Eve')).toBeUndefined();
  });
});

describe('deck-skip: computeGamesByDeckPie', () => {
  it('skips random participants when counting deck appearances', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeGamesByDeckPie(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.games).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});

describe('deck-skip: computeScrewedByDeckPie', () => {
  it('skips random participants when counting deck screwed counts', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, isScrewed: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isScrewed: true, isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeScrewedByDeckPie(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.screwed).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});

describe('deck-skip: computeDeckWinRate', () => {
  it('skips random participants when counting deck plays and wins', () => {
    const games = [
      mkGame('2026-04-01', [
        mkParticipant('Alice', { isWinner: true, deckName: 'Atraxa' }),
        mkParticipant('Conny', { isRandom: true, deckName: 'Selvala' }),
      ]),
    ];
    const result = computeDeckWinRate(games);
    expect(result.find((d) => d.deck === 'Atraxa')?.played).toBe(1);
    expect(result.find((d) => d.deck === 'Selvala')).toBeUndefined();
  });
});
```

- [ ] **Step 6.2: Run the new tests to verify they fail**

Run: `npx jest tests/stats.test.ts -t 'player-collapse|deck-skip'`
Expected: FAIL — helpers don't account for `isRandom` yet.

- [ ] **Step 6.3: Update `computeWinsByPlayerPie` (collapse)**

In `src/lib/stats.ts`, find:

```ts
export function computeWinsByPlayerPie(
  games: Game[]
): { player: string; wins: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) {
        map.set(p.playerName, (map.get(p.playerName) ?? 0) + 1);
      }
    }
  }
  return Array.from(map.entries())
    .filter(([, wins]) => wins > 0)
    .map(([player, wins]) => ({ player, wins }))
    .sort((a, b) => b.wins - a.wins);
}
```

Replace with:

```ts
export function computeWinsByPlayerPie(
  games: Game[]
): { player: string; wins: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
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

- [ ] **Step 6.4: Update `computeScrewedByPlayerBar` (collapse)**

Find and replace:

```ts
export function computeScrewedByPlayerBar(
  games: Game[]
): { player: string; screwed: number }[] {
  const map = new Map<string, number>();
  for (const g of games) {
    const screwedBuckets = new Set<string>();
    for (const p of g.participants) {
      if (!p.isScrewed) continue;
      screwedBuckets.add(p.isRandom ? 'Random' : p.playerName);
    }
    for (const bucket of screwedBuckets) {
      map.set(bucket, (map.get(bucket) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, screwed]) => screwed > 0)
    .map(([player, screwed]) => ({ player, screwed }))
    .sort((a, b) => b.screwed - a.screwed);
}
```

- [ ] **Step 6.5: Update `computeMostLikelyToPlay` (collapse)**

Find:

```ts
export function computeMostLikelyToPlay(
  games: Game[]
): { player: string; participations: number; totalGames: number; rate: number }[] {
  if (games.length === 0) return [];
  const totalGames = games.length;
  const map = new Map<string, number>();
  for (const g of games) {
    for (const p of g.participants) {
      map.set(p.playerName, (map.get(p.playerName) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([player, participations]) => ({
      player,
      participations,
      totalGames,
      rate: participations / totalGames,
    }))
    .sort((a, b) => b.rate - a.rate);
}
```

Replace with:

```ts
export function computeMostLikelyToPlay(
  games: Game[]
): { player: string; participations: number; totalGames: number; rate: number }[] {
  if (games.length === 0) return [];
  const totalGames = games.length;
  const map = new Map<string, number>();
  for (const g of games) {
    const buckets = new Set<string>();
    for (const p of g.participants) {
      buckets.add(p.isRandom ? 'Random' : p.playerName);
    }
    for (const bucket of buckets) {
      map.set(bucket, (map.get(bucket) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([player, participations]) => ({
      player,
      participations,
      totalGames,
      rate: participations / totalGames,
    }))
    .sort((a, b) => b.rate - a.rate);
}
```

- [ ] **Step 6.6: Update `computeMostLikelyToPlayBump` (collapse)**

In `computeMostLikelyToPlayBump`, the cumulative rate is computed by aggregating participations per player as games are walked. Find every `p.playerName` reference inside the function and replace with `(p.isRandom ? 'Random' : p.playerName)`. The function processes games chronologically and builds a per-week cumulative-rate ranking; the bucketing rule is the same — collapse random participants to 'Random' at the participant level. If the function uses a per-game inner-loop pattern, follow the per-game-`Set` pattern from Step 6.5 to ensure at-most-one contribution per game per bucket.

Read the existing function (lines 207–265 of `src/lib/stats.ts`) carefully before editing. The function shape varies but the principle is: every `p.playerName` becomes `(p.isRandom ? 'Random' : p.playerName)`, AND any per-game accumulation must use a Set so 2 randoms per game don't double-contribute.

- [ ] **Step 6.7: Update `computePlayerRadar` (collapse)**

Find:

```ts
export function computePlayerRadar(
  games: Game[]
): { player: string; played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number; totalGames: number }[] {
  const totalGames = games.length;
  const map = new Map<string, { played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number }>();

  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { played: 0, wins: 0, screwed: 0, wonByCombo: 0, nonImportedPlayed: 0 };
      entry.played++;
      if (!g.isImported) entry.nonImportedPlayed++;
      if (p.isWinner) entry.wins++;
      if (p.isScrewed) entry.screwed++;
      if (p.isWinner && g.wonByCombo && !g.isImported) entry.wonByCombo++;
      map.set(p.playerName, entry);
    }
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, ...v, totalGames }));
}
```

Replace with (per-game bucket-sets ensure each metric collapses per game):

```ts
export function computePlayerRadar(
  games: Game[]
): { player: string; played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number; totalGames: number }[] {
  const totalGames = games.length;
  type Entry = { played: number; wins: number; screwed: number; wonByCombo: number; nonImportedPlayed: number };
  const map = new Map<string, Entry>();

  const getOrCreate = (key: string): Entry => {
    let entry = map.get(key);
    if (!entry) {
      entry = { played: 0, wins: 0, screwed: 0, wonByCombo: 0, nonImportedPlayed: 0 };
      map.set(key, entry);
    }
    return entry;
  };

  for (const g of games) {
    const playedBuckets = new Set<string>();
    const winningBuckets = new Set<string>();
    const screwedBuckets = new Set<string>();

    for (const p of g.participants) {
      const key = p.isRandom ? 'Random' : p.playerName;
      playedBuckets.add(key);
      if (p.isWinner) winningBuckets.add(key);
      if (p.isScrewed) screwedBuckets.add(key);
    }

    for (const key of playedBuckets) {
      const e = getOrCreate(key);
      e.played++;
      if (!g.isImported) e.nonImportedPlayed++;
    }
    for (const key of winningBuckets) {
      const e = getOrCreate(key);
      e.wins++;
      if (g.wonByCombo && !g.isImported) e.wonByCombo++;
    }
    for (const key of screwedBuckets) {
      getOrCreate(key).screwed++;
    }
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, ...v, totalGames }));
}
```

- [ ] **Step 6.8: Update `computePlayerWinRate` (collapse)**

Find:

```ts
export function computePlayerWinRate(
  games: Game[]
): { player: string; wins: number; played: number; rate: number }[] {
  const map = new Map<string, { wins: number; played: number }>();
  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { wins: 0, played: 0 };
      entry.played++;
      if (p.isWinner) entry.wins++;
      map.set(p.playerName, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, wins: v.wins, played: v.played, rate: v.wins / v.played }))
    .sort((a, b) => b.rate - a.rate);
}
```

Replace with:

```ts
export function computePlayerWinRate(
  games: Game[]
): { player: string; wins: number; played: number; rate: number }[] {
  const map = new Map<string, { wins: number; played: number }>();
  for (const g of games) {
    const playedBuckets = new Set<string>();
    const winningBuckets = new Set<string>();
    for (const p of g.participants) {
      const key = p.isRandom ? 'Random' : p.playerName;
      playedBuckets.add(key);
      if (p.isWinner) winningBuckets.add(key);
    }
    for (const key of playedBuckets) {
      const entry = map.get(key) ?? { wins: 0, played: 0 };
      entry.played++;
      map.set(key, entry);
    }
    for (const key of winningBuckets) {
      const entry = map.get(key) ?? { wins: 0, played: 0 };
      entry.wins++;
      map.set(key, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({ player, wins: v.wins, played: v.played, rate: v.wins / v.played }))
    .sort((a, b) => b.rate - a.rate);
}
```

- [ ] **Step 6.9: Update `computeScrewedRate` (collapse)**

Find:

```ts
export function computeScrewedRate(
  games: Game[]
): { player: string; screwed: number; played: number; rate: number }[] {
  const map = new Map<string, { screwed: number; played: number }>();
  for (const g of games) {
    for (const p of g.participants) {
      const entry = map.get(p.playerName) ?? { screwed: 0, played: 0 };
      entry.played++;
      if (p.isScrewed) entry.screwed++;
      map.set(p.playerName, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({
      player,
      screwed: v.screwed,
      played: v.played,
      rate: v.screwed / v.played,
    }))
    .sort((a, b) => b.rate - a.rate);
}
```

Replace with:

```ts
export function computeScrewedRate(
  games: Game[]
): { player: string; screwed: number; played: number; rate: number }[] {
  const map = new Map<string, { screwed: number; played: number }>();
  for (const g of games) {
    const playedBuckets = new Set<string>();
    const screwedBuckets = new Set<string>();
    for (const p of g.participants) {
      const key = p.isRandom ? 'Random' : p.playerName;
      playedBuckets.add(key);
      if (p.isScrewed) screwedBuckets.add(key);
    }
    for (const key of playedBuckets) {
      const entry = map.get(key) ?? { screwed: 0, played: 0 };
      entry.played++;
      map.set(key, entry);
    }
    for (const key of screwedBuckets) {
      const entry = map.get(key) ?? { screwed: 0, played: 0 };
      entry.screwed++;
      map.set(key, entry);
    }
  }
  return Array.from(map.entries())
    .filter(([, v]) => v.played > 0)
    .map(([player, v]) => ({
      player,
      screwed: v.screwed,
      played: v.played,
      rate: v.screwed / v.played,
    }))
    .sort((a, b) => b.rate - a.rate);
}
```

- [ ] **Step 6.10: Update `computeGamesByDeckPie` (skip)**

Find:

```ts
export function computeGamesByDeckPie(
  games: Game[]
): { deck: string; games: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const map = new Map<string, number>();
  for (const g of nonImported) {
    for (const p of g.participants) {
      const deck = p.deckName?.trim();
      if (!deck) continue;
      map.set(deck, (map.get(deck) ?? 0) + 1);
    }
  }
```

Add `if (p.isRandom) continue;` immediately inside the inner participant loop. Full replacement:

```ts
export function computeGamesByDeckPie(
  games: Game[]
): { deck: string; games: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const map = new Map<string, number>();
  for (const g of nonImported) {
    for (const p of g.participants) {
      if (p.isRandom) continue;
      const deck = p.deckName?.trim();
      if (!deck) continue;
      map.set(deck, (map.get(deck) ?? 0) + 1);
    }
  }
  const all = Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([deck, count]) => ({ deck, games: count }))
    .sort((a, b) => b.games - a.games);

  return all.slice(0, 15);
}
```

- [ ] **Step 6.11: Update `computeScrewedByDeckPie` (skip)**

Find and replace:

```ts
export function computeScrewedByDeckPie(
  games: Game[]
): { deck: string; screwed: number }[] {
  const nonImported = games.filter((g) => !g.isImported);
  const map = new Map<string, number>();
  for (const g of nonImported) {
    for (const p of g.participants) {
      if (p.isRandom) continue;
      if (!p.isScrewed) continue;
      const deck = p.deckName?.trim();
      if (!deck) continue;
      map.set(deck, (map.get(deck) ?? 0) + 1);
    }
  }
  const all = Array.from(map.entries())
    .filter(([, screwed]) => screwed > 0)
    .map(([deck, screwed]) => ({ deck, screwed }))
    .sort((a, b) => b.screwed - a.screwed);
  return all.slice(0, 15);
}
```

- [ ] **Step 6.12: Update `computeDeckWinRate` (skip)**

Find the inner loop that processes participants in `computeDeckWinRate`. Add `if (p.isRandom) continue;` as the first line inside the inner participant loop:

```ts
    for (const p of g.participants) {
      if (p.isRandom) continue;
      const deck = p.deckName?.trim();
      if (!deck) continue;
      decksInGame.add(deck);
      if (p.isWinner) winnerDeck = deck;
    }
```

This is the only change inside `computeDeckWinRate`. The rest of the function stays.

- [ ] **Step 6.13: Run the stats tests**

Run: `npx jest tests/stats.test.ts`
Expected: all tests pass, including the new ~8 player-collapse + deck-skip cases.

- [ ] **Step 6.14: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 7: Final integration

**Files:** none modified (verification only).

- [ ] **Step 7.1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7.2: Full test suite**

Run: `npm test`
Expected: same baseline failure profile as before this feature — only `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` failing. All new tests (validators, game-form, games-filter, games-api, stats, autocomplete-api) pass.

- [ ] **Step 7.3: Line-ending hygiene**

Run: `file <each-modified-file>` and confirm all are LF. Normalize any CRLF with `tr -d '\r' < FILE > FILE.tmp && mv FILE.tmp FILE`.

Files to check:
```
prisma/schema.prisma
prisma/migrations/20260518b_add_israndom_to_participants/migration.sql
src/lib/validators.ts
src/app/api/games/route.ts
src/app/api/games/[id]/route.ts
src/app/api/players/route.ts
src/app/api/decks/route.ts
src/app/games/game-form.tsx
src/app/games/page.tsx
src/lib/stats.ts
tests/validators.test.ts
tests/game-form.test.ts
tests/games-filter.test.ts
tests/games-api.test.ts
tests/stats.test.ts
tests/autocomplete-api.test.ts
```

- [ ] **Step 7.4: Working-tree summary**

Run: `git status --short` and confirm the in-scope files are modified, plus the new migration and prod-migration directories created. All other modified files in the tree are pre-existing CRLF/LF noise (don't include in commit).

- [ ] **Step 7.5: Manual smoke (FOR THE USER)**

The user will smoke-test in a browser at `/games` and `/games/new`:

1. **New game with a Random:** `/games/new` → pick 4 players → submit form with `Alice / Bob / Conny (Random checked) / Dave`. Verify save succeeds.
2. **Random ★ marker:** `/games` → the new game's row shows `Conny ★` and `Conny`'s real deck name (if entered).
3. **Player autocomplete excludes random-only names:** `/games/new` → if `Conny` only ever played as Random, typing 'C' in the player-name combobox should NOT suggest `Conny`. If Conny played in a separate non-random game, the suggestion appears.
4. **Deck autocomplete excludes random-only decks:** same idea — a deck only played by a random doesn't appear in suggestions.
5. **Player filter:** `/games` → Players dropdown shows `Random` alphabetically. Selecting it filters to games with any random participant.
6. **Winner filter:** Winner dropdown shows `Random` when at least one game has a random winner. Selecting it filters appropriately.
7. **Deck filter:** Random-only decks do NOT appear in the dropdown.
8. **Stats page (`/stats`):** Player charts show a `Random` entry aggregated across all games with random participants. Deck charts do NOT include random-only decks.
9. **Edit a game with randoms:** `/games/[id]/edit` → form pre-populates with the Random checkbox set for the right rows, real names + decks intact.
10. **King Commander interaction:** create a 6-player King Commander game where one player is Random. Verify the King role works as normal regardless of `isRandom`.

- [ ] **Step 7.6: Report status**

Report: tsc status, test counts, line-ending status, working-tree summary, and any concerns. Do NOT commit.

---

## Self-review notes

**Spec coverage:**
- A. Data model → Task 1
- B. Validator → Task 2
- C. API routes → Task 3
- D. Form → Task 4
- E. Filter helpers → Task 5
- F. Stats helpers → Task 6
- G. Tests → embedded in each task (1: none; 2: validators; 3: games-api + autocomplete; 4: game-form; 5: games-filter; 6: stats)
- H. Out of scope → respected
- I. File inventory → matches plan File map

**Placeholder scan:** None. Every step has executable code or a concrete command.

**Type consistency:**
- `ParticipantRow.isRandom: boolean` (Task 4.4) consumed by `validateGameForm` (4.5), `buildInitialState` (4.6), `excludeItemsForRow` (4.7), and the form JSX (4.9). Consistent.
- `Participant.isRandom: boolean` in `page.tsx` (Task 5.4) consumed by `deriveWinnerOptions` / `derivePlayerOptions` / `deriveDeckOptions` (5.5-5.7), `matchesAllFilters` (5.8), and the row render (5.10). Consistent.
- `gameParticipantSchema.isRandom` (Task 2.3) flows to POST and PATCH routes (Task 3.1-3.2). Consistent.
- `GameFormPayload.participants[].isRandom: boolean` (Task 4.4) consumed by the new-game page's submit and the edit page's submit (no change needed — they pass payload through). Consistent.

**Pre-existing baseline failure:** `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` was failing before this feature. Do not investigate as part of this work.
