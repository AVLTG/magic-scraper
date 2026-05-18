# Commander Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-game `variant` field (`STANDARD` | `STAR` | `KING`) and per-participant `role` field (`KING` | `SQUIRE` | `ASSASSIN`), gated by a second-step modal after player-count, with form rendering tailored to each variant. Stats consumers come in a later feature.

**Architecture:** Schema adds two nullable-friendly columns (variant non-null with `STANDARD` default; role nullable). Validator splits into `gameCreateSchema` (sets variant) and `gameUpdateSchema` (preserves it). A shared `applyVariantInvariants` helper enforces winner/role rules in both POST and PATCH. `GameForm` learns a `variant` prop and branches rendering for the per-row choice column; KING also gets a "Who won?" team toggle above the grid that derives `isWinner` from `role` + `winningTeam`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma + Turso (SQLite), Zod, Jest + ts-jest.

**User preference — no commits during execution:** Per the user's stated pattern, do NOT create commits between tasks. Leave all changes in the working tree. The user will inspect the final diff and create a single combined commit at the end. The skip applies to `git add`/`git commit` only — `git status` / `git diff` for situational awareness is fine.

**Spec:** `docs/superpowers/specs/2026-05-18-commander-variants-design.md`

---

## File map

**Created:**
- `prisma/migrations/20260518_add_game_variant_and_role/migration.sql`
- `.planning/phases/06.2-commander-variants/06.2-01-PROD-MIGRATION.sql`
- `tests/validators.test.ts` (new — there is no validator-specific test file today; `gameSchema` is currently exercised only via `tests/games-api.test.ts`)

**Modified:**
- `prisma/schema.prisma`
- `src/lib/validators.ts`
- `src/app/api/games/route.ts`
- `src/app/api/games/[id]/route.ts`
- `src/app/games/game-form.tsx`
- `src/app/games/new/page.tsx`
- `src/app/games/[id]/edit/page.tsx`
- `tests/game-form.test.ts`
- `tests/games-api.test.ts` (rename `gameSchema` → `gameCreateSchema` and add variant to valid bodies)

**Conventions confirmed:**
- Jest config (`jest.config.js`): `testMatch: '**/tests/**/*.test.ts'`, `testEnvironment: 'node'`. **No `.tsx` tests, no jsdom.** All new tests are pure logic; gate-page coverage uses a pure helper extracted from the page component, not a React render test.
- Path alias `@/` → `src/`.
- Existing migration pattern: `prisma migrate diff`-shaped SQL with comments, plus a paired prod-migration doc applied via `turso db shell`.

---

## Task 1: Schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260518_add_game_variant_and_role/migration.sql`
- Create: `.planning/phases/06.2-commander-variants/06.2-01-PROD-MIGRATION.sql`

- [ ] **Step 1.1: Add the `variant` field to the `Game` model**

In `prisma/schema.prisma`, replace the `Game` model block with:

```prisma
model Game {
  id           String              @id @default(cuid())
  date         DateTime
  wonByCombo   Boolean             @default(false)
  notes        String?
  isImported        Boolean             @default(false)
  discordNotified   Boolean             @default(false)
  variant           String              @default("STANDARD")
  createdAt         DateTime            @default(now())

  participants GameParticipant[]

  @@index([date])
  @@map("games")
}
```

(Only the new `variant` line and its position relative to `createdAt` are new.)

- [ ] **Step 1.2: Add the `role` field to the `GameParticipant` model**

Replace the `GameParticipant` model block with:

```prisma
model GameParticipant {
  id          String  @id @default(cuid())
  gameId      String
  playerName  String
  isWinner    Boolean
  isScrewed   Boolean
  deckName    String?
  role        String?

  game Game @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@index([playerName])
  @@map("game_participants")
}
```

- [ ] **Step 1.3: Write the dev migration SQL**

Create `prisma/migrations/20260518_add_game_variant_and_role/migration.sql`:

```sql
-- Phase 6.2: add Game.variant (Star/King commander) + GameParticipant.role
-- Additive-only, per Phase 5 D-14 pattern (no DROP, no ALTER of existing columns).
-- Spec: docs/superpowers/specs/2026-05-18-commander-variants-design.md

ALTER TABLE "games" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "game_participants" ADD COLUMN "role" TEXT;
```

- [ ] **Step 1.4: Write the prod-migration doc**

Create `.planning/phases/06.2-commander-variants/06.2-01-PROD-MIGRATION.sql`:

```sql
-- Phase 6.2 production migration: add Game.variant + GameParticipant.role
-- Matches prisma/schema.prisma (D-20, D-23 — see commander-variants design spec)
-- Apply via: turso db shell <PROD-DB-NAME> < 06.2-01-PROD-MIGRATION.sql
-- Or interactively paste section by section into: turso db shell <PROD-DB-NAME>
--
-- Phase 5 D-14 pattern: additive only, no DROP, no ALTER of existing columns.

-- Step 1: Add Game.variant (default 'STANDARD' so all existing rows backfill cleanly)
ALTER TABLE games ADD COLUMN variant TEXT NOT NULL DEFAULT 'STANDARD';

-- Step 2: Verify the column exists and all rows defaulted to 'STANDARD'
SELECT name, type, "notnull", dflt_value FROM pragma_table_info('games') WHERE name = 'variant';
-- Expected: variant | TEXT | 1 | 'STANDARD'

SELECT COUNT(*) AS total_games,
       SUM(CASE WHEN variant = 'STANDARD' THEN 1 ELSE 0 END) AS std_count
  FROM games;
-- Expected: std_count == total_games

-- Step 3: Add GameParticipant.role (nullable; only KING-variant games will populate it)
ALTER TABLE game_participants ADD COLUMN role TEXT;

-- Step 4: Verify
SELECT name, type, "notnull", dflt_value FROM pragma_table_info('game_participants') WHERE name = 'role';
-- Expected: role | TEXT | 0 | NULL

SELECT COUNT(*) AS total_participants,
       SUM(CASE WHEN role IS NULL THEN 1 ELSE 0 END) AS null_role
  FROM game_participants;
-- Expected: null_role == total_participants (no participants have roles yet)
```

- [ ] **Step 1.5: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` (or equivalent success line). No errors.

- [ ] **Step 1.6: Apply the dev migration**

Run: `npx prisma migrate deploy`
Expected: `1 migration found`, then `Applying migration \`20260518_add_game_variant_and_role\``, then `All migrations have been successfully applied.`

(If the dev DB is `prisma/dev.db` based on env, this is local-only and reversible by deleting the row from `_prisma_migrations` and re-creating the DB if needed.)

- [ ] **Step 1.7: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (no new errors). At this stage the new fields exist in the Prisma client types; nothing else has been touched yet.

---

## Task 2: Validator constants, schemas, and variant invariants

**Files:**
- Modify: `src/lib/validators.ts`
- Create: `tests/validators.test.ts`

- [ ] **Step 2.1: Write failing tests for the variant invariants**

Create `tests/validators.test.ts`:

```ts
import {
  gameCreateSchema,
  applyVariantInvariants,
  GAME_VARIANTS,
  PARTICIPANT_ROLES,
} from '../src/lib/validators';

const baseDate = new Date('2026-05-01T00:00:00.000Z').toISOString();

function p(
  name: string,
  opts: Partial<{ isWinner: boolean; isScrewed: boolean; deckName?: string; role?: string }> = {}
) {
  return {
    playerName: name,
    isWinner: opts.isWinner ?? false,
    isScrewed: opts.isScrewed ?? false,
    deckName: opts.deckName,
    role: opts.role,
  };
}

describe('GAME_VARIANTS / PARTICIPANT_ROLES constants', () => {
  it('exports the expected variant values', () => {
    expect(GAME_VARIANTS).toEqual(['STANDARD', 'STAR', 'KING']);
  });
  it('exports the expected role values', () => {
    expect(PARTICIPANT_ROLES).toEqual(['KING', 'SQUIRE', 'ASSASSIN']);
  });
});

describe('gameCreateSchema — STANDARD', () => {
  it('accepts a 4-player STANDARD game with exactly one winner', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B'), p('C'), p('D')],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.variant).toBe('STANDARD');
  });

  it('rejects STANDARD with two winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B', { isWinner: true })],
    });
    expect(res.success).toBe(false);
  });

  it('rejects STANDARD with zero winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A'), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects STANDARD when any participant has a role set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
    });
    expect(res.success).toBe(false);
  });
});

describe('gameCreateSchema — STAR', () => {
  function star(participants: ReturnType<typeof p>[]) {
    return { date: baseDate, variant: 'STAR' as const, participants };
  }

  it('accepts a 5-player STAR with one winner', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B'), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(true);
  });

  it('accepts a 5-player STAR with two winners', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B', { isWinner: true }), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(true);
  });

  it('rejects STAR with three winners', () => {
    const res = gameCreateSchema.safeParse(
      star([
        p('A', { isWinner: true }),
        p('B', { isWinner: true }),
        p('C', { isWinner: true }),
        p('D'),
        p('E'),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR with zero winners', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A'), p('B'), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR with a participant count other than 5', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B'), p('C'), p('D')])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR when any participant has a role set', () => {
    const res = gameCreateSchema.safeParse(
      star([
        p('A', { isWinner: true, role: 'SQUIRE' }),
        p('B'),
        p('C'),
        p('D'),
        p('E'),
      ])
    );
    expect(res.success).toBe(false);
  });
});

describe('gameCreateSchema — KING', () => {
  function king(participants: ReturnType<typeof p>[]) {
    return { date: baseDate, variant: 'KING' as const, participants };
  }

  it('accepts a 6-player KING where Royalty won', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(true);
  });

  it('accepts a 7-player KING where Assassins won', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { role: 'KING' }),
        p('S1', { role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { isWinner: true, role: 'ASSASSIN' }),
        p('A2', { isWinner: true, role: 'ASSASSIN' }),
        p('A3', { isWinner: true, role: 'ASSASSIN' }),
        p('A4', { isWinner: true, role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(true);
  });

  it('rejects KING with a participant count outside 6-8', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with two KING participants', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K1', { isWinner: true, role: 'KING' }),
        p('K2', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with a participant having no role', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
        p('X'),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING when Royalty winners exclude a squire', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING when winners mix Royalty and Assassins', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { isWinner: true, role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with no winners at all', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { role: 'KING' }),
        p('S1', { role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });
});

describe('applyVariantInvariants — used by PATCH route', () => {
  it('accepts a STANDARD body against a STANDARD variant', () => {
    const result = applyVariantInvariants(
      { participants: [p('A', { isWinner: true }), p('B')] },
      'STANDARD'
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a STANDARD body against a KING variant (wrong roles)', () => {
    const result = applyVariantInvariants(
      { participants: [p('A', { isWinner: true }), p('B')] },
      'KING'
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a valid KING body against a KING variant', () => {
    const result = applyVariantInvariants(
      {
        participants: [
          p('K', { isWinner: true, role: 'KING' }),
          p('S1', { isWinner: true, role: 'SQUIRE' }),
          p('S2', { isWinner: true, role: 'SQUIRE' }),
          p('A1', { role: 'ASSASSIN' }),
          p('A2', { role: 'ASSASSIN' }),
          p('A3', { role: 'ASSASSIN' }),
        ],
      },
      'KING'
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `npx jest tests/validators.test.ts`
Expected: All tests in the file FAIL with a module-resolution error (the new exports don't exist yet) or `gameCreateSchema is not a function`. That's the expected red state.

- [ ] **Step 2.3: Implement the new constants, schemas, and invariant helper**

Replace the entire contents of `src/lib/validators.ts` with:

```ts
import { z } from 'zod';

// -----------------------------------------------------------------------------
// Variant + role enums (D-20, D-23 — see 2026-05-18-commander-variants-design.md)
// -----------------------------------------------------------------------------
export const GAME_VARIANTS = ['STANDARD', 'STAR', 'KING'] as const;
export type GameVariant = (typeof GAME_VARIANTS)[number];

export const PARTICIPANT_ROLES = ['KING', 'SQUIRE', 'ASSASSIN'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

// -----------------------------------------------------------------------------
// GameParticipant validator
// -----------------------------------------------------------------------------
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

export type GameParticipantInput = z.infer<typeof gameParticipantSchema>;

// -----------------------------------------------------------------------------
// Base game schema (no variant; shared by create + update)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// Variant invariants — shared by gameCreateSchema.superRefine and the PATCH route
// -----------------------------------------------------------------------------
type ParticipantForInvariants = {
  isWinner: boolean;
  role?: ParticipantRole;
};

type InvariantInput = { participants: ParticipantForInvariants[] };

export type InvariantResult =
  | { ok: true }
  | { ok: false; message: string };

export function applyVariantInvariants(
  data: InvariantInput,
  variant: GameVariant
): InvariantResult {
  const ps = data.participants;
  const winnerCount = ps.filter((p) => p.isWinner).length;
  const withRole = ps.filter((p) => p.role != null);

  if (variant === 'STANDARD') {
    if (winnerCount !== 1) {
      return { ok: false, message: 'STANDARD game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'STANDARD game participants must not have roles' };
    }
    return { ok: true };
  }

  if (variant === 'STAR') {
    if (ps.length !== 5) {
      return { ok: false, message: 'STAR game must have exactly 5 participants' };
    }
    if (winnerCount < 1 || winnerCount > 2) {
      return { ok: false, message: 'STAR game must have 1 or 2 winners' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'STAR game participants must not have roles' };
    }
    return { ok: true };
  }

  // KING
  if (ps.length < 6 || ps.length > 8) {
    return { ok: false, message: 'KING game must have 6-8 participants' };
  }
  if (withRole.length !== ps.length) {
    return { ok: false, message: 'KING game requires a role for every participant' };
  }
  const kings = ps.filter((p) => p.role === 'KING');
  if (kings.length !== 1) {
    return { ok: false, message: 'KING game must have exactly one KING' };
  }
  const others = ps.filter((p) => p.role !== 'KING');
  const allSquireOrAssassin = others.every(
    (p) => p.role === 'SQUIRE' || p.role === 'ASSASSIN'
  );
  if (!allSquireOrAssassin) {
    return {
      ok: false,
      message: 'KING game non-king participants must be SQUIRE or ASSASSIN',
    };
  }

  const winners = ps.filter((p) => p.isWinner);
  const royaltyMembers = ps.filter(
    (p) => p.role === 'KING' || p.role === 'SQUIRE'
  );
  const assassins = ps.filter((p) => p.role === 'ASSASSIN');

  const isRoyaltyWin =
    winners.length === royaltyMembers.length &&
    winners.every((w) => w.role === 'KING' || w.role === 'SQUIRE');
  const isAssassinWin =
    winners.length === assassins.length &&
    winners.length > 0 &&
    winners.every((w) => w.role === 'ASSASSIN');

  if (!isRoyaltyWin && !isAssassinWin) {
    return {
      ok: false,
      message:
        'KING game winners must be either {king + all squires} or {all assassins}',
    };
  }

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Create schema — sets variant (default STANDARD) and enforces invariants
// -----------------------------------------------------------------------------
export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('STANDARD') })
  .superRefine((data, ctx) => {
    const result = applyVariantInvariants(data, data.variant);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message,
        path: ['participants'],
      });
    }
  });

export type GameCreateInput = z.infer<typeof gameCreateSchema>;

// -----------------------------------------------------------------------------
// Update schema — no variant; PATCH route fetches the stored variant and runs
// applyVariantInvariants separately after parsing.
// -----------------------------------------------------------------------------
export const gameUpdateSchema = baseGameSchema;
export type GameUpdateInput = z.infer<typeof gameUpdateSchema>;

// -----------------------------------------------------------------------------
// Back-compat alias — keeps existing imports of `gameSchema` working until they
// migrate to the explicit name in Task 3.
// -----------------------------------------------------------------------------
export const gameSchema = gameCreateSchema;
export type GameInput = GameCreateInput;
```

- [ ] **Step 2.4: Run validator tests to verify they pass**

Run: `npx jest tests/validators.test.ts`
Expected: All ~24 tests PASS.

- [ ] **Step 2.5: Run full test suite to verify nothing else broke**

Run: `npm test`
Expected: All previously-passing tests still pass. There is one pre-existing baseline failure in `tests/cron-sync.test.ts` (`does NOT call sendDiscordAlert when all users succeed`) — leave it alone, it's unrelated.

- [ ] **Step 2.6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 3: Wire validator into API routes

**Files:**
- Modify: `src/app/api/games/route.ts`
- Modify: `src/app/api/games/[id]/route.ts`
- Modify: `tests/games-api.test.ts`

- [ ] **Step 3.1: Update existing API tests for the new schema name and variant default**

Open `tests/games-api.test.ts`. Make these changes:

1. **Imports:** the file currently does `import { gameSchema } from '../src/lib/validators';`. Leave that line as-is (the back-compat alias still exports it). No change.
2. **No body changes needed for STANDARD tests** — bodies without `variant` will validate as `STANDARD` by default, and the existing "exactly 1 winner" cases already satisfy the new STANDARD invariant. Run the file first to confirm, then patch any test that previously sent a body with zero or multiple winners under the looser old schema.

Run: `npx jest tests/games-api.test.ts`
Expected: most tests pass; if any fail, they will be tests that sent multi-winner or zero-winner STANDARD bodies and previously passed. For each such failure, update the test body to send a valid STANDARD shape (exactly one `isWinner: true`). No semantic change — these tests existed before the invariant was enforced at the schema level; now they need to satisfy it.

- [ ] **Step 3.2: Write a failing test for KING-variant POST round-trip**

In `tests/games-api.test.ts`, find the `describe('POST /api/games', ...)` block. Append the following test inside that block (just before its closing `});`):

```ts
  it('persists variant and role for a KING-variant game', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockTransaction.mockImplementation(async (cb: any) =>
      cb({
        game: { create: jest.fn().mockResolvedValue({ id: 'g-king', variant: 'KING' }) },
        gameParticipant: { createMany: jest.fn().mockResolvedValue({ count: 6 }) },
      })
    );

    const body = {
      date: new Date('2026-05-01').toISOString(),
      variant: 'KING',
      participants: [
        { playerName: 'K', isWinner: true, isScrewed: false, role: 'KING' },
        { playerName: 'S1', isWinner: true, isScrewed: false, role: 'SQUIRE' },
        { playerName: 'S2', isWinner: true, isScrewed: false, role: 'SQUIRE' },
        { playerName: 'A1', isWinner: false, isScrewed: false, role: 'ASSASSIN' },
        { playerName: 'A2', isWinner: false, isScrewed: false, role: 'ASSASSIN' },
        { playerName: 'A3', isWinner: false, isScrewed: false, role: 'ASSASSIN' },
      ],
    };

    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(201);
  });
```

- [ ] **Step 3.3: Run the test to verify it fails**

Run: `npx jest tests/games-api.test.ts -t 'persists variant and role'`
Expected: FAIL. Either `res.status` is 400 because the route is still using `gameSchema` and rejecting the body in some way, or `mockGameCreate` is called without `variant`. Either way, the route doesn't yet persist these fields.

- [ ] **Step 3.4: Update the POST route to use `gameCreateSchema` and persist variant + role**

Replace `src/app/api/games/route.ts` with:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { gameCreateSchema } from '@/lib/validators';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }
  try {
    const body = await request.json();
    const { date, wonByCombo, notes, variant, participants } =
      gameCreateSchema.parse(body);
    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: { date, wonByCombo, notes, variant },
      });
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
      return created;
    });
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('POST /api/games error:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }
  try {
    const games = await prisma.game.findMany({
      include: { participants: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ games });
  } catch (error) {
    console.error('GET /api/games error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3.5: Run the KING POST test to verify it passes**

Run: `npx jest tests/games-api.test.ts -t 'persists variant and role'`
Expected: PASS.

- [ ] **Step 3.6: Write a failing test for PATCH that enforces invariants against the stored variant**

In `tests/games-api.test.ts`, find the `describe('PATCH /api/games/[id]', ...)` block (or the section where PATCH tests live — search for `patchGame`). Append:

```ts
  it('rejects PATCH that violates the stored KING variant invariants', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: true });
    mockGameFindUnique.mockResolvedValue({ id: 'g-1', variant: 'KING' });

    const body = {
      date: new Date('2026-05-01').toISOString(),
      participants: [
        { playerName: 'A', isWinner: true, isScrewed: false },
        { playerName: 'B', isWinner: false, isScrewed: false },
      ],
    };

    const res: any = await patchGame(
      makeRequest(body),
      { params: Promise.resolve({ id: 'g-1' }) }
    );
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 3.7: Run the test to verify it fails**

Run: `npx jest tests/games-api.test.ts -t 'rejects PATCH that violates the stored KING'`
Expected: FAIL (either 200 or 500 depending on how the current route handles the mismatch).

- [ ] **Step 3.8: Update the PATCH route**

Replace the `PATCH` function in `src/app/api/games/[id]/route.ts` (lines 52-101 in the current file) with:

```ts
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = gameUpdateSchema.parse(body);

    const existing = await prisma.game.findUnique({
      where: { id },
      select: { variant: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const variant = existing.variant as GameVariant;
    const invariantResult = applyVariantInvariants(
      { participants: parsed.participants },
      variant
    );
    if (!invariantResult.ok) {
      return NextResponse.json(
        { error: [{ message: invariantResult.message, path: ['participants'] }] },
        { status: 400 }
      );
    }

    const { date, wonByCombo, notes, participants } = parsed;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.gameParticipant.deleteMany({ where: { gameId: id } });
      const g = await tx.game.update({
        where: { id },
        data: { date, wonByCombo, notes },
      });
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
      return g;
    });
    return NextResponse.json({ game: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('PATCH /api/games/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    );
  }
}
```

Update the top-of-file imports to:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  gameUpdateSchema,
  applyVariantInvariants,
  type GameVariant,
} from '@/lib/validators';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
```

- [ ] **Step 3.9: Run the PATCH test to verify it passes**

Run: `npx jest tests/games-api.test.ts -t 'rejects PATCH that violates the stored KING'`
Expected: PASS.

- [ ] **Step 3.10: Run the full API test file and full suite**

Run: `npx jest tests/games-api.test.ts`
Expected: all tests in this file PASS.

Run: `npm test`
Expected: same baseline as before (only the pre-existing `cron-sync` failure).

- [ ] **Step 3.11: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 4: GameForm — types, variant prop, validateGameForm branches

**Files:**
- Modify: `src/app/games/game-form.tsx`
- Modify: `tests/game-form.test.ts`

This task changes the shared form code to accept a `variant` prop and branch `validateGameForm` derivation. The new fields are added but the UI still only renders the STANDARD layout — Tasks 5 and 6 add the STAR and KING rendering on top.

- [ ] **Step 4.1: Update the existing `baseState` helper so old tests keep compiling**

Once Step 4.4 lands, `GameFormState` requires four new fields (`winnerIndices`, `roles`, `winningTeam`, `variant`). The existing `baseState` helper at the top of `tests/game-form.test.ts` returns a partial shape — every call site (~20 tests) would fail to type-check after the interface change. Update `baseState` first so all existing tests continue to compile and pass.

In `tests/game-form.test.ts`, replace the `baseState` function with:

```ts
function baseState(
  rows: ParticipantRow[],
  winnerIndex: number,
  overrides: Partial<{
    date: string;
    notes: string;
    wonByCombo: boolean;
    winnerIndices: number[];
    roles: (ParticipantRole | null)[];
    winningTeam: 'ROYALTY' | 'ASSASSINS' | null;
    variant: GameVariant;
  }> = {}
) {
  return {
    date: '2026-04-10',
    notes: '',
    wonByCombo: false,
    rows,
    winnerIndex,
    winnerIndices: [],
    roles: rows.map(() => null) as (ParticipantRole | null)[],
    winningTeam: null as 'ROYALTY' | 'ASSASSINS' | null,
    variant: 'STANDARD' as GameVariant,
    ...overrides,
  };
}
```

(All existing tests already assume STANDARD/single-winner semantics, so adding `variant: 'STANDARD'` as the implicit default leaves their behavior unchanged.)

- [ ] **Step 4.2: Write failing tests for the new state fields and validateGameForm branches**

Open `tests/game-form.test.ts`. Add the following imports near the top (just after the existing `excludeItemsForRow, validateGameForm` import):

```ts
import type {
  GameFormState,
  GameVariant,
  ParticipantRole,
} from '../src/app/games/game-form';
```

At the bottom of the file (after the last `describe(...)`), append:

```ts
function baseStateV(
  variant: GameVariant,
  rows: ParticipantRow[],
  extras: Partial<GameFormState> = {}
): GameFormState {
  return {
    date: '2026-04-10',
    notes: '',
    wonByCombo: false,
    rows,
    winnerIndex: -1,
    winnerIndices: [],
    roles: rows.map(() => null) as (ParticipantRole | null)[],
    winningTeam: null,
    variant,
    ...extras,
  };
}

describe('validateGameForm — STAR variant', () => {
  it('accepts a 5-player STAR with one winner', () => {
    const state = baseStateV('STAR', [
      row('A'), row('B'), row('C'), row('D'), row('E'),
    ], { winnerIndices: [0] });
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.variant).toBe('STAR');
      expect(result.payload.participants.filter((p) => p.isWinner)).toHaveLength(1);
      expect(result.payload.participants.every((p) => p.role === undefined)).toBe(true);
    }
  });

  it('accepts a 5-player STAR with two winners', () => {
    const state = baseStateV('STAR', [
      row('A'), row('B'), row('C'), row('D'), row('E'),
    ], { winnerIndices: [1, 3] });
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants.filter((p) => p.isWinner)).toHaveLength(2);
    }
  });

  it('rejects STAR with zero winners', () => {
    const state = baseStateV('STAR', [
      row('A'), row('B'), row('C'), row('D'), row('E'),
    ], { winnerIndices: [] });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });

  it('rejects STAR with three winners', () => {
    const state = baseStateV('STAR', [
      row('A'), row('B'), row('C'), row('D'), row('E'),
    ], { winnerIndices: [0, 1, 2] });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });
});

describe('validateGameForm — KING variant', () => {
  function kingRoles(picks: (ParticipantRole | null)[]) {
    return picks;
  }

  it('derives Royalty winners when winningTeam is ROYALTY', () => {
    const state = baseStateV('KING', [
      row('K'), row('S1'), row('S2'), row('A1'), row('A2'), row('A3'),
    ], {
      roles: kingRoles(['KING', 'SQUIRE', 'SQUIRE', 'ASSASSIN', 'ASSASSIN', 'ASSASSIN']),
      winningTeam: 'ROYALTY',
    });
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.variant).toBe('KING');
      const winners = result.payload.participants.filter((p) => p.isWinner).map((p) => p.playerName);
      expect(winners.sort()).toEqual(['K', 'S1', 'S2']);
      expect(result.payload.participants.find((p) => p.playerName === 'K')!.role).toBe('KING');
    }
  });

  it('derives Assassin winners when winningTeam is ASSASSINS', () => {
    const state = baseStateV('KING', [
      row('K'), row('S1'), row('S2'), row('A1'), row('A2'), row('A3'),
    ], {
      roles: kingRoles(['KING', 'SQUIRE', 'SQUIRE', 'ASSASSIN', 'ASSASSIN', 'ASSASSIN']),
      winningTeam: 'ASSASSINS',
    });
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const winners = result.payload.participants.filter((p) => p.isWinner).map((p) => p.playerName);
      expect(winners.sort()).toEqual(['A1', 'A2', 'A3']);
    }
  });

  it('rejects KING with no team selected', () => {
    const state = baseStateV('KING', [
      row('K'), row('S1'), row('S2'), row('A1'), row('A2'), row('A3'),
    ], {
      roles: kingRoles(['KING', 'SQUIRE', 'SQUIRE', 'ASSASSIN', 'ASSASSIN', 'ASSASSIN']),
      winningTeam: null,
    });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });

  it('rejects KING with no KING role assigned', () => {
    const state = baseStateV('KING', [
      row('A'), row('B'), row('C'), row('D'), row('E'), row('F'),
    ], {
      roles: kingRoles(['SQUIRE', 'SQUIRE', 'SQUIRE', 'ASSASSIN', 'ASSASSIN', 'ASSASSIN']),
      winningTeam: 'ROYALTY',
    });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });

  it('rejects KING with an unassigned role', () => {
    const state = baseStateV('KING', [
      row('K'), row('S1'), row('S2'), row('A1'), row('A2'), row('X'),
    ], {
      roles: kingRoles(['KING', 'SQUIRE', 'SQUIRE', 'ASSASSIN', 'ASSASSIN', null]),
      winningTeam: 'ROYALTY',
    });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });
});

describe('validateGameForm — STANDARD passthrough', () => {
  it('still works with the new state shape (defaults pass through)', () => {
    const state = baseStateV('STANDARD', [
      row('A', { isWinner: true }), row('B'),
    ], { winnerIndex: 0 });
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.variant).toBe('STANDARD');
      expect(result.payload.participants[0].isWinner).toBe(true);
      expect(result.payload.participants.every((p) => p.role === undefined)).toBe(true);
    }
  });
});
```

- [ ] **Step 4.3: Run the new tests to verify they fail**

Run: `npx jest tests/game-form.test.ts -t 'STAR variant'`
Expected: FAIL (type errors at compile time or runtime errors — the new fields/types don't exist yet).

- [ ] **Step 4.4: Update `src/app/games/game-form.tsx` with new types, state fields, props, and validation branches**

This step modifies the file in three places. Apply them in order so the file remains internally consistent.

**3a. Add type exports near the top of the file** (replace the line `import { Combobox } from '@/app/components/combobox';` and the section just below it with):

```tsx
"use client";
import { useState, useEffect, FormEvent } from 'react';
import { Combobox } from '@/app/components/combobox';
import type { GameVariant, ParticipantRole } from '@/lib/validators';

export type { GameVariant, ParticipantRole };

export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
}

export type WinningTeam = 'ROYALTY' | 'ASSASSINS';

export interface GameFormState {
  date: string;
  notes: string;
  wonByCombo: boolean;
  rows: ParticipantRow[];
  winnerIndex: number;                    // STANDARD only
  winnerIndices: number[];                // STAR only (0-2 entries)
  roles: (ParticipantRole | null)[];      // KING only — index-aligned with rows
  winningTeam: WinningTeam | null;        // KING only
  variant: GameVariant;
}

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

export interface GameFormErrors {
  date?: string;
  form?: string;
  rows?: Record<number, string>;
}

export type ValidationResult =
  | { ok: true; payload: GameFormPayload }
  | { ok: false; errors: GameFormErrors };
```

**3b. Replace `validateGameForm`** with the new variant-aware version:

```tsx
export function validateGameForm(state: GameFormState): ValidationResult {
  const errors: GameFormErrors = {};

  if (!state.date || state.date.trim() === '') {
    errors.date = 'Date is required';
  }

  const allFilled = state.rows.every((r) => r.playerName.trim() !== '');
  if (!allFilled) {
    errors.form = `All ${state.rows.length} participant names are required`;
  }

  const rowErrors: Record<number, string> = {};
  state.rows.forEach((r, i) => {
    if (r.playerName.length > 100) rowErrors[i] = 'Player name too long (max 100)';
    else if (r.deckName.length > 100) rowErrors[i] = 'Deck name too long (max 100)';
  });
  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;

  // Variant-specific structural checks
  if (!errors.form) {
    if (state.variant === 'STANDARD') {
      if (state.winnerIndex < 0 || state.winnerIndex >= state.rows.length) {
        errors.form = 'Exactly one winner required';
      }
    } else if (state.variant === 'STAR') {
      if (state.winnerIndices.length < 1 || state.winnerIndices.length > 2) {
        errors.form = 'Star Commander games need 1 or 2 winners';
      }
    } else {
      // KING
      const kingCount = state.roles.filter((r) => r === 'KING').length;
      const unassigned = state.roles.some((r) => r == null);
      if (unassigned) {
        errors.form = 'Every player needs a role (King, Squire, or Assassin)';
      } else if (kingCount !== 1) {
        errors.form = 'King Commander games need exactly one King';
      } else if (state.winningTeam == null) {
        errors.form = 'Pick the winning team (Royalty or Assassins)';
      }
    }
  }

  if (errors.date || errors.form || errors.rows) {
    return { ok: false, errors };
  }

  // Derive participants per variant
  const participants = state.rows.map((r, i) => {
    let isWinner = false;
    let role: ParticipantRole | undefined;

    if (state.variant === 'STANDARD') {
      isWinner = i === state.winnerIndex;
    } else if (state.variant === 'STAR') {
      isWinner = state.winnerIndices.includes(i);
    } else {
      role = state.roles[i] as ParticipantRole;
      if (state.winningTeam === 'ROYALTY') {
        isWinner = role === 'KING' || role === 'SQUIRE';
      } else {
        isWinner = role === 'ASSASSIN';
      }
    }

    return {
      playerName: r.playerName.trim(),
      isWinner,
      isScrewed: r.isScrewed,
      deckName: r.deckName.trim() === '' ? undefined : r.deckName.trim(),
      role,
    };
  });

  return {
    ok: true,
    payload: {
      date: new Date(state.date).toISOString(),
      wonByCombo: state.wonByCombo,
      notes: state.notes.trim() === '' ? undefined : state.notes.trim(),
      variant: state.variant,
      participants,
    },
  };
}
```

**3c. Update `buildInitialState`** to also populate the new fields:

```tsx
export function buildInitialState(game: {
  date: string | Date;
  wonByCombo: boolean;
  notes: string | null;
  variant?: GameVariant;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    deckName: string | null;
    role?: ParticipantRole | null;
  }[];
}): GameFormState {
  const variant: GameVariant = game.variant ?? 'STANDARD';
  const rows: ParticipantRow[] = game.participants.map((p) => ({
    playerName: p.playerName,
    deckName: p.deckName ?? '',
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
  }));
  const winnerIndex = game.participants.findIndex((p) => p.isWinner);
  const winnerIndices = game.participants
    .map((p, i) => (p.isWinner ? i : -1))
    .filter((i) => i >= 0);
  const roles: (ParticipantRole | null)[] = game.participants.map(
    (p) => (p.role as ParticipantRole | null | undefined) ?? null
  );

  let winningTeam: WinningTeam | null = null;
  if (variant === 'KING') {
    const royaltyWon = game.participants.some(
      (p) => p.isWinner && (p.role === 'KING' || p.role === 'SQUIRE')
    );
    const assassinsWon = game.participants.some(
      (p) => p.isWinner && p.role === 'ASSASSIN'
    );
    if (royaltyWon) winningTeam = 'ROYALTY';
    else if (assassinsWon) winningTeam = 'ASSASSINS';
  }

  const dateStr =
    typeof game.date === 'string'
      ? new Date(game.date).toISOString().slice(0, 10)
      : game.date.toISOString().slice(0, 10);

  return {
    date: dateStr,
    notes: game.notes ?? '',
    wonByCombo: game.wonByCombo,
    rows,
    winnerIndex,
    winnerIndices,
    roles,
    winningTeam,
    variant,
  };
}
```

**3d. Update `GameFormProps` and the `GameForm` component default state.**

Replace the existing `GameFormProps` interface and the `GameForm` function body's initial `useState` setup with:

```tsx
export interface GameFormProps {
  playerCount: number;
  variant?: GameVariant;
  initial?: GameFormState;
  submitLabel?: string;
  onSubmit: (payload: GameFormPayload) => Promise<void> | void;
}

export function GameForm({
  playerCount,
  variant = 'STANDARD',
  initial,
  submitLabel = 'Save game',
  onSubmit,
}: GameFormProps) {
  const [state, setState] = useState<GameFormState>(
    initial ?? {
      date: new Date().toLocaleDateString('en-CA'),
      notes: '',
      wonByCombo: false,
      rows: Array.from({ length: playerCount }, emptyRow),
      winnerIndex: -1,
      winnerIndices: [],
      roles: Array.from({ length: playerCount }, () => null) as (ParticipantRole | null)[],
      winningTeam: null,
      variant,
    }
  );
```

Leave the rest of the component (the `useEffect` for autocomplete seed, `updateRow`, `handleSubmit`, and the existing JSX) **unchanged** for now — Tasks 5 and 6 will add the variant-aware rendering. The form continues to render the existing STANDARD layout for all variants until then; STAR/KING submissions made via the current UI before Tasks 5-6 would fail validation, which is fine because the new modal in Task 8 hasn't been wired in yet either.

- [ ] **Step 4.5: Run the form tests to verify they pass**

Run: `npx jest tests/game-form.test.ts`
Expected: all tests PASS, including the new STAR/KING/STANDARD-passthrough cases.

- [ ] **Step 4.6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (If TypeScript complains about the existing `winnerIndex`-only JSX in the unchanged render block — it shouldn't, because all new state fields have defaults — adjust narrowly without changing the render output.)

---

## Task 5: GameForm — render STAR variant (multi-checkbox winner column)

**Files:**
- Modify: `src/app/games/game-form.tsx`

- [ ] **Step 5.1: Add the STAR-aware winner control to the per-row JSX**

In `src/app/games/game-form.tsx`, find the existing per-row block inside `state.rows.map((r, i) => (...))` — specifically the `Winner` `<label>` that wraps a radio:

```tsx
<label className="flex items-center gap-1 text-xs text-muted">
  <input
    type="radio"
    name="winner"
    checked={state.winnerIndex === i}
    onChange={() => setState((s) => ({ ...s, winnerIndex: i }))}
  />
  Winner
</label>
```

Replace it with a variant-branched version:

```tsx
{state.variant === 'STANDARD' && (
  <label className="flex items-center gap-1 text-xs text-muted">
    <input
      type="radio"
      name="winner"
      checked={state.winnerIndex === i}
      onChange={() => setState((s) => ({ ...s, winnerIndex: i }))}
    />
    Winner
  </label>
)}
{state.variant === 'STAR' && (
  <label className="flex items-center gap-1 text-xs text-muted">
    <input
      type="checkbox"
      checked={state.winnerIndices.includes(i)}
      disabled={
        !state.winnerIndices.includes(i) && state.winnerIndices.length >= 2
      }
      onChange={(e) =>
        setState((s) => {
          const isChecked = e.target.checked;
          const next = isChecked
            ? [...s.winnerIndices, i]
            : s.winnerIndices.filter((idx) => idx !== i);
          return { ...s, winnerIndices: next };
        })
      }
    />
    Winner
  </label>
)}
```

(KING gets its own role-picker block in Task 6; for this task, leave KING unhandled — submitting a KING game without Task 6's controls will fail validation, which matches reality since the new-game gate that produces KING state doesn't exist yet either.)

- [ ] **Step 5.2: Run the full form test suite**

Run: `npx jest tests/game-form.test.ts`
Expected: same green as Step 4.6 (no test depends on rendering; this is purely UI for the STAR branch).

- [ ] **Step 5.3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 6: GameForm — render KING variant (role picker + team toggle)

**Files:**
- Modify: `src/app/games/game-form.tsx`

- [ ] **Step 6.1: Add the team-winner toggle above the participants fieldset**

In `src/app/games/game-form.tsx`, find the JSX where the participants `<fieldset>` opens — it begins with:

```tsx
<fieldset className="space-y-2">
  <legend className="text-sm font-medium text-foreground">Participants</legend>
```

Immediately **before** that `<fieldset>`, insert:

```tsx
{state.variant === 'KING' && (
  <div>
    <label className="block text-sm font-medium text-foreground mb-1">Who won?</label>
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() =>
          setState((s) => ({ ...s, winningTeam: 'ROYALTY' }))
        }
        className={`flex-1 px-4 py-2 rounded-md border font-medium transition-colors ${
          state.winningTeam === 'ROYALTY'
            ? 'bg-accent text-background border-accent'
            : 'bg-surface text-foreground border-border hover:bg-accent/10'
        }`}
      >
        Royalty
      </button>
      <button
        type="button"
        onClick={() =>
          setState((s) => ({ ...s, winningTeam: 'ASSASSINS' }))
        }
        className={`flex-1 px-4 py-2 rounded-md border font-medium transition-colors ${
          state.winningTeam === 'ASSASSINS'
            ? 'bg-accent text-background border-accent'
            : 'bg-surface text-foreground border-border hover:bg-accent/10'
        }`}
      >
        Assassins
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6.2: Add the KING role picker to the per-row JSX**

Find the variant-branched winner block from Task 5 (the `{state.variant === 'STANDARD' && ...}` and `{state.variant === 'STAR' && ...}` blocks). After them, add a third branch for KING:

```tsx
{state.variant === 'KING' && (
  <div className="flex items-center gap-1 text-xs text-muted">
    {(['KING', 'SQUIRE', 'ASSASSIN'] as const).map((r) => (
      <label key={r} className="flex items-center gap-0.5">
        <input
          type="radio"
          name={`role-${i}`}
          checked={state.roles[i] === r}
          onChange={() =>
            setState((s) => ({
              ...s,
              roles: s.roles.map((existing, idx) =>
                idx === i
                  ? r
                  : // Enforce single-KING: if this row becomes KING, clear any other KING.
                    r === 'KING' && existing === 'KING'
                  ? null
                  : existing
              ),
            }))
          }
        />
        {r[0]}
      </label>
    ))}
  </div>
)}
```

The KING-only enforcement of "only one KING at a time" is handled in the `setState` callback: when assigning `'KING'` to row `i`, any other row that was previously `'KING'` is cleared to `null`. This keeps the validator's invariant satisfied as the user picks.

- [ ] **Step 6.3: Run the form test suite**

Run: `npx jest tests/game-form.test.ts`
Expected: same green as Task 5.2.

- [ ] **Step 6.4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 7: New-game page — variant gate flow

**Files:**
- Modify: `src/app/games/new/page.tsx`
- Modify: `tests/game-form.test.ts` (one new describe block for the pure helper)

- [ ] **Step 7.1: Write a failing test for the pure variant-question helper**

In `tests/game-form.test.ts`, at the bottom, append:

```ts
import { variantQuestionForCount } from '../src/app/games/new/page';

describe('variantQuestionForCount — gate helper', () => {
  it('returns null for 2-4 player games (no variant question)', () => {
    expect(variantQuestionForCount(2)).toBeNull();
    expect(variantQuestionForCount(3)).toBeNull();
    expect(variantQuestionForCount(4)).toBeNull();
  });

  it('returns STAR question for 5-player games', () => {
    expect(variantQuestionForCount(5)).toEqual({
      variantOnYes: 'STAR',
      label: 'Was this a Star Commander game?',
    });
  });

  it('returns KING question for 6/7/8-player games', () => {
    for (const n of [6, 7, 8]) {
      expect(variantQuestionForCount(n)).toEqual({
        variantOnYes: 'KING',
        label: 'Was this a King Commander game?',
      });
    }
  });
});
```

- [ ] **Step 7.2: Run the test to verify it fails**

Run: `npx jest tests/game-form.test.ts -t 'variantQuestionForCount'`
Expected: FAIL — `variantQuestionForCount` is not exported from `page.tsx` yet.

- [ ] **Step 7.3: Update `src/app/games/new/page.tsx`**

Replace the entire file with:

```tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GameForm, type GameFormPayload } from '@/app/games/game-form';
import type { GameVariant } from '@/lib/validators';

type NotifyStatus = 'idle' | 'sending' | 'sent' | 'error';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export interface VariantQuestion {
  variantOnYes: Exclude<GameVariant, 'STANDARD'>;
  label: string;
}

export function variantQuestionForCount(count: number): VariantQuestion | null {
  if (count === 5) {
    return { variantOnYes: 'STAR', label: 'Was this a Star Commander game?' };
  }
  if (count >= 6 && count <= 8) {
    return { variantOnYes: 'KING', label: 'Was this a King Commander game?' };
  }
  return null;
}

export default function NewGamePage() {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [variant, setVariant] = useState<GameVariant | null>(null);
  const [createdGameId, setCreatedGameId] = useState<string | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<NotifyStatus>('idle');

  const handleSubmit = async (payload: GameFormPayload) => {
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to save game'
      );
    }
    const data = await res.json();
    setCreatedGameId(data.game.id);
  };

  const handleNotify = async () => {
    if (!createdGameId) return;
    setNotifyStatus('sending');
    try {
      const res = await fetch(`/api/games/${createdGameId}/notify`, {
        method: 'POST',
      });
      if (res.ok || res.status === 409) {
        setNotifyStatus('sent');
      } else {
        setNotifyStatus('error');
      }
    } catch {
      setNotifyStatus('error');
    }
  };

  const handleSkip = () => {
    router.push('/games');
    router.refresh();
  };

  // ----- Post-save Discord notify modal (unchanged) -----
  if (createdGameId !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 className="text-xl font-bold text-foreground mb-2">Game saved!</h2>
          <p className="text-foreground/70 mb-6">
            Would you like to notify the Discord channel about this game?
          </p>

          {notifyStatus === 'error' && (
            <div className="mb-4 flex items-center gap-3">
              <span className="text-sm text-red-500">Failed to send notification</span>
              <button
                onClick={() => {
                  setNotifyStatus('idle');
                  handleNotify();
                }}
                className="text-sm underline text-foreground/60 hover:text-foreground"
              >
                Retry
              </button>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleNotify}
              disabled={notifyStatus !== 'idle'}
              className="flex-1 px-4 py-2 rounded bg-accent text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {notifyStatus === 'sending' && 'Sending...'}
              {notifyStatus === 'sent' && (
                <span className="text-green-300">Sent! ✓</span>
              )}
              {(notifyStatus === 'idle' || notifyStatus === 'error') && 'Send notification'}
            </button>

            <button
              onClick={handleSkip}
              className="flex-1 px-4 py-2 rounded border border-border text-foreground font-medium hover:bg-surface/80 transition-colors"
            >
              {notifyStatus === 'sent' ? 'Go to games' : 'Skip'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Player-count popup gate -----
  if (playerCount === null) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-count-title"
      >
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="player-count-title" className="text-xl font-bold text-foreground mb-4">
            How many players?
          </h2>
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPlayerCount(n);
                  if (variantQuestionForCount(n) === null) {
                    setVariant('STANDARD');
                  }
                }}
                className="basis-[calc((100%-1.5rem)/4)] py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
              >
                {n}
              </button>
            ))}
          </div>
          <Link
            href="/games"
            className="block text-center text-sm text-muted underline hover:text-foreground"
          >
            Cancel
          </Link>
        </div>
      </div>
    );
  }

  // ----- Variant gate (5-player or 6-8-player only) -----
  if (variant === null) {
    const q = variantQuestionForCount(playerCount);
    // q is non-null here because 2-4 player picks set variant synchronously above.
    if (q === null) {
      // Defensive: should not happen, but rather than render nothing, fall through to STANDARD.
      setVariant('STANDARD');
      return null;
    }
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-labelledby="variant-title"
      >
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="variant-title" className="text-xl font-bold text-foreground mb-4">
            {q.label}
          </h2>
          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => setVariant(q.variantOnYes)}
              className="flex-1 py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setVariant('STANDARD')}
              className="flex-1 py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
            >
              No
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setPlayerCount(null)}
              className="text-muted underline hover:text-foreground"
            >
              Back
            </button>
            <Link href="/games" className="text-muted underline hover:text-foreground">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ----- Form (count + variant locked once chosen) -----
  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">
        Log a {playerCount}-player game{variant !== 'STANDARD' ? ` (${variant === 'STAR' ? 'Star' : 'King'} Commander)` : ''}
      </h1>
      <GameForm playerCount={playerCount} variant={variant} onSubmit={handleSubmit} submitLabel="Save game" />
    </main>
  );
}
```

- [ ] **Step 7.4: Run the helper test to verify it passes**

Run: `npx jest tests/game-form.test.ts -t 'variantQuestionForCount'`
Expected: PASS.

- [ ] **Step 7.5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 8: Edit page — pass variant to GameForm

**Files:**
- Modify: `src/app/games/[id]/edit/page.tsx`

- [ ] **Step 8.1: Update the edit page to pass `variant` to `GameForm`**

Replace `src/app/games/[id]/edit/page.tsx` with:

```tsx
"use client";
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GameForm,
  buildInitialState,
  type GameFormPayload,
  type GameFormState,
} from '@/app/games/game-form';

export default function EditGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [initial, setInitial] = useState<GameFormState | null>(null);
  const [loadError, setLoadError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/games/${id}`);
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(res.status === 404 ? 'Game not found' : 'Failed to load game');
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setInitial(buildInitialState(data.game));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load game');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (payload: GameFormPayload) => {
    // PATCH: strip variant defensively — the API ignores it anyway, but
    // omitting it from the wire payload matches the design intent.
    const { variant: _omit, ...patchBody } = payload;
    const res = await fetch(`/api/games/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to update game'
      );
    }
    router.push('/games');
    router.refresh();
  };

  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">Edit game</h1>
      {loadError && <p className="text-red-600">{loadError}</p>}
      {!loadError && !initial && <p className="text-muted">Loading...</p>}
      {initial && (
        <GameForm
          playerCount={initial.rows.length}
          variant={initial.variant}
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      )}
    </main>
  );
}
```

- [ ] **Step 8.2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

## Task 9: Final integration — full type-check, full test run, manual smoke

**Files:** (none modified in this task — verification only)

- [ ] **Step 9.1: Full type-check**

Run: `npx tsc --noEmit`
Expected: clean (zero errors).

- [ ] **Step 9.2: Full test suite**

Run: `npm test`
Expected: same baseline failure profile as before this feature — only `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` failing. All new and existing variant/role/form/api/gate tests PASS.

- [ ] **Step 9.3: Manual smoke (dev server)**

Run: `npm run dev` (background)

In a browser at `http://localhost:3000/games/new`:
1. Pick `3` players → expect form to render directly (no second modal), title "Log a 3-player game".
2. Refresh, pick `5` → expect "Was this a Star Commander game?" modal. Click "No" → form renders with single-winner radio.
3. Refresh, pick `5` → click "Yes" → form renders with multi-checkbox winner. Verify the 3rd box disables after 2 are checked.
4. Refresh, pick `7` → expect "Was this a King Commander game?". Click "Back" → returns to player-count. Pick `7` again → click "Yes". Verify K/S/A radios per row + Royalty/Assassins toggle above the participants list. Fill in roles, pick "Royalty", submit. Expect the post-save Discord notify modal.
5. Click into an existing game → Edit. Verify the form pre-populates correctly per the game's variant. A pre-existing STANDARD game should look identical to before.

Stop the dev server (`Ctrl+C` in its terminal).

- [ ] **Step 9.4: Report status**

After the smoke run, report:
- Type-check status (clean / errors)
- Test run summary (X passed, Y failed — list any new failures)
- Smoke checklist outcomes (pass/fail per step above)
- Working-tree summary (`git status --short`)

The user will inspect the diff and create the final combined commit. Do NOT commit.

---

## Self-review notes

**Spec coverage:**
- A. Data model → Task 1
- B. Validator → Task 2 + Task 3
- C. Gate flow → Task 7
- D. Form (state + rendering + hydration + payload) → Tasks 4, 5, 6
- E. Edit mode → Task 8
- F. API routes → Task 3
- G. Tests → Tasks 2, 3, 4 (validators, games-api, game-form, gate helper)
- H. Out of scope → respected (no stats / Discord text / variant edit)
- I. File inventory → matches Task file paths

**Placeholder scan:** searched for TBD/TODO/"implement later" — none present. All steps contain executable code or exact commands. No "Similar to Task N" — each variant's code is shown in full where it appears.

**Type consistency:** `GameVariant`, `ParticipantRole`, `WinningTeam`, `GameFormState`, `GameFormPayload`, `applyVariantInvariants`, `variantQuestionForCount`, `gameCreateSchema`, `gameUpdateSchema` are introduced in Tasks 2 / 4 / 7 and used consistently in later tasks. The KING role single-assignment helper logic (clear-other-KING) lives in the JSX `setState` callback in Task 6, not as a separate helper, to keep file count down.

**Edge case caught during review:** Task 8's PATCH body strips `variant` from the wire payload via a rest destructure. The API would ignore it anyway (it's not in `gameUpdateSchema`), but stripping it on the client matches the design intent stated in spec section D ("sent on POST only; PATCH ignores it") and avoids any future warning if Zod's strictness changes.

**Pre-existing baseline failure:** `tests/cron-sync.test.ts › does NOT call sendDiscordAlert when all users succeed` was failing before this feature and is unrelated. Do not investigate or "fix" it as part of this work.
