# Multi-Format Games + Best-of Matches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seven new game-format variants (Brawl, Standard, Pauper, Draft, Prerelease, Sealed, Cube) with best-of (Bo1/Bo3/Bo5) match tracking for the non-Brawl 2-player formats, plus a Format filter on the games tab and silent Commander-only gating in stats.

**Architecture:** A new pure helper module `src/lib/gameFormats.ts` becomes the single source of truth for the variant taxonomy and the Commander-format gate. Two new nullable columns (`bestOf`, `comboWins`) on `games` capture best-of match state. Validators, the API, the new-game flow, the games tab, and the Discord notifier all consume the new types and helpers; stats silently filters non-Commander games at the compute layer with no UI surface.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma + Turso (SQLite), Zod, Tailwind v4, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-05-24-multi-format-games-and-best-of-design.md`

**Commit policy:** The user prefers no commits during execution — all work lands as a single consolidated commit at the end (Task 9). Each task's Step "Verify" replaces "Commit". Do NOT run `git commit` inside Tasks 1–8.

**Model policy:** Use Opus for all subagents (orchestrator and implementers).

---

## File map

### New files
- `src/lib/gameFormats.ts` — `ALL_FORMATS`, `COMMANDER_FORMATS`, `BEST_OF_FORMATS`, `FORMAT_LABELS`, `isCommanderFormat`, `requiresBestOf`, `maxComboWinsFor`
- `tests/gameFormats.test.ts`
- `prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`
- `.planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql` (gitignored — operator script)

### Modified files
- `prisma/schema.prisma` — add `bestOf Int?`, `comboWins Int?` to `Game`
- `src/lib/validators.ts` — extend `GAME_VARIANTS`, add BRAWL + shared best-of invariant branches, pass `bestOf`/`comboWins` into `applyVariantInvariants`
- `src/lib/gameVariants.ts` — seven new badge entries
- `src/lib/notifyMessage.ts` — BRAWL + best-of templates, extend `GameForNotify`
- `src/lib/stats.ts` — `isCommanderFormat` gate at the top of every compute function
- `src/app/api/games/route.ts` — POST persists `bestOf`/`comboWins`
- `src/app/api/games/[id]/route.ts` — PATCH re-validates with stored `bestOf`/`comboWins`; expand `isGameVariant`
- `src/app/api/games/[id]/notify/route.ts` — pass `bestOf`/`comboWins` into `buildNotifyMessage`
- `src/app/games/page.tsx` — `Game` interface gains `bestOf`/`comboWins`, Format filter UI, two-chip Format cell, expanded-row combo display
- `src/app/games/new/page.tsx` — Format picker modal + Best-of picker modal
- `src/app/games/game-form.tsx` — `bestOf`/`comboWins` on state + payload, Random default for player 2, combo-entry UI conditional
- `tests/validators.test.ts`, `tests/games-api.test.ts`, `tests/games-notify.test.ts`, `tests/games-filter.test.ts`, `tests/game-form.test.ts`, `tests/stats.test.ts`

---

## Task 1: Foundation — `gameFormats.ts`, Prisma schema, migration

**Files:**
- Create: `src/lib/gameFormats.ts`
- Create: `tests/gameFormats.test.ts`
- Modify: `prisma/schema.prisma:42-56`
- Create: `prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`

- [ ] **Step 1: Write the failing test for `gameFormats.ts`**

Create `tests/gameFormats.test.ts`:

```ts
import {
  ALL_FORMATS,
  COMMANDER_FORMATS,
  BEST_OF_FORMATS,
  FORMAT_LABELS,
  isCommanderFormat,
  requiresBestOf,
  maxComboWinsFor,
  type GameFormat,
} from '@/lib/gameFormats';

describe('gameFormats — constants', () => {
  it('ALL_FORMATS lists the 10 variants in canonical order', () => {
    expect(ALL_FORMATS).toEqual([
      'COMMANDER', 'STAR', 'KING', 'BRAWL',
      'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
    ]);
  });

  it('COMMANDER_FORMATS contains exactly the four Commander-shape variants', () => {
    expect([...COMMANDER_FORMATS].sort()).toEqual(
      ['BRAWL', 'COMMANDER', 'KING', 'STAR'].sort()
    );
  });

  it('BEST_OF_FORMATS contains exactly the six best-of variants', () => {
    expect([...BEST_OF_FORMATS].sort()).toEqual(
      ['CUBE', 'DRAFT', 'PAUPER', 'PRERELEASE', 'SEALED', 'STANDARD'].sort()
    );
  });

  it('FORMAT_LABELS has an entry for every variant in ALL_FORMATS', () => {
    for (const v of ALL_FORMATS) {
      expect(typeof FORMAT_LABELS[v]).toBe('string');
      expect(FORMAT_LABELS[v].length).toBeGreaterThan(0);
    }
  });

  it('COMMANDER_FORMATS and BEST_OF_FORMATS are disjoint and partition ALL_FORMATS', () => {
    for (const v of ALL_FORMATS) {
      const inCommander = COMMANDER_FORMATS.has(v);
      const inBestOf = BEST_OF_FORMATS.has(v);
      expect(inCommander !== inBestOf).toBe(true);
    }
  });
});

describe('gameFormats — predicates', () => {
  it('isCommanderFormat is true for COMMANDER/STAR/KING/BRAWL', () => {
    for (const v of ['COMMANDER', 'STAR', 'KING', 'BRAWL']) {
      expect(isCommanderFormat(v)).toBe(true);
    }
  });

  it('isCommanderFormat is false for the six best-of formats', () => {
    for (const v of ['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE']) {
      expect(isCommanderFormat(v)).toBe(false);
    }
  });

  it('isCommanderFormat is false for unknown variants', () => {
    expect(isCommanderFormat('UNKNOWN')).toBe(false);
    expect(isCommanderFormat('')).toBe(false);
  });

  it('requiresBestOf is true for the six best-of formats and false otherwise', () => {
    for (const v of ['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE']) {
      expect(requiresBestOf(v)).toBe(true);
    }
    for (const v of ['COMMANDER', 'STAR', 'KING', 'BRAWL', 'UNKNOWN']) {
      expect(requiresBestOf(v)).toBe(false);
    }
  });
});

describe('gameFormats — maxComboWinsFor', () => {
  it('returns 1 for Bo1', () => {
    expect(maxComboWinsFor(1)).toBe(1);
  });
  it('returns 2 for Bo3', () => {
    expect(maxComboWinsFor(3)).toBe(2);
  });
  it('returns 3 for Bo5', () => {
    expect(maxComboWinsFor(5)).toBe(3);
  });
});

describe('gameFormats — type', () => {
  it('GameFormat is a typed union (compile-time check via assignment)', () => {
    const f: GameFormat = 'COMMANDER';
    expect(f).toBe('COMMANDER');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest tests/gameFormats.test.ts`
Expected: FAIL with "Cannot find module '@/lib/gameFormats'".

- [ ] **Step 3: Create `src/lib/gameFormats.ts`**

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/gameFormats.test.ts`
Expected: PASS (all groups green).

- [ ] **Step 5: Update Prisma schema**

In `prisma/schema.prisma`, replace the `Game` model body so it reads:

```prisma
model Game {
  id              String              @id @default(cuid())
  date            DateTime
  wonByCombo      Boolean             @default(false)
  notes           String?
  isImported      Boolean             @default(false)
  discordNotified Boolean             @default(false)
  variant         String              @default("COMMANDER")
  bestOf          Int?
  comboWins       Int?
  createdAt       DateTime            @default(now())

  participants    GameParticipant[]

  @@index([date])
  @@map("games")
}
```

- [ ] **Step 6: Create the Prisma migration file**

Create `prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`:

```sql
-- Phase 06.5: add best-of + combo-wins tracking for 2-player non-Commander formats.
ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;
```

- [ ] **Step 7: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" success line. No errors.

- [ ] **Step 8: Apply migration to local dev DB**

Run: `npx prisma migrate deploy`
Expected: "1 migration found" → applied successfully. If local DB is fresh (no `migrations` table), `npx prisma migrate dev --name add_best_of_and_combo_wins` is acceptable; just confirm the generated SQL matches Step 6 byte-for-byte (rename the folder if Prisma assigns a different timestamp).

- [ ] **Step 9: Verify tsc clean**

Run: `npx tsc --noEmit`
Expected: zero errors. The `bestOf`/`comboWins` Prisma fields are now visible to the Prisma client; no consumer references them yet so existing code is unaffected.

- [ ] **Step 10: Verify full test suite still green**

Run: `npx jest`
Expected: only `tests/cron-sync.test.ts` failing (baseline). All other tests pass, including the new `tests/gameFormats.test.ts`.

**DO NOT COMMIT.** Hand off to Task 2.

---

## Task 2: Validators — extend `GAME_VARIANTS`, add BRAWL + shared best-of invariant branches

**Files:**
- Modify: `src/lib/validators.ts:1-187` (most of the file)
- Modify: `tests/validators.test.ts`

- [ ] **Step 1: Write the new validator tests**

Append to `tests/validators.test.ts` (after the existing KING block):

```ts
// ===========================================================================
// New variants: BRAWL + best-of formats
// ===========================================================================

describe('GAME_VARIANTS — expanded to 10 entries', () => {
  it('lists every variant in the canonical order from gameFormats.ts', () => {
    expect(GAME_VARIANTS).toEqual([
      'COMMANDER', 'STAR', 'KING', 'BRAWL',
      'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
    ]);
  });
});

describe('gameCreateSchema — BRAWL', () => {
  it('accepts a 2-player BRAWL game with one winner and no bestOf/comboWins', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(true);
  });

  it('rejects BRAWL with 3 participants', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true }), p('B'), p('C')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with zero winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A'), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with bestOf set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      bestOf: 3,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with comboWins set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      comboWins: 1,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL participants with roles', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
    });
    expect(res.success).toBe(false);
  });
});

describe.each(['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE'] as const)(
  'gameCreateSchema — best-of variant %s',
  (variant) => {
    it('accepts Bo1 with comboWins 0', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 1,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(true);
    });

    it('accepts Bo1 with comboWins 1', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 1,
        comboWins: 1,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(true);
    });

    it('accepts Bo3 with comboWins 0, 1, and 2', () => {
      for (const comboWins of [0, 1, 2]) {
        const res = gameCreateSchema.safeParse({
          date: baseDate,
          variant,
          bestOf: 3,
          comboWins,
          participants: [p('A', { isWinner: true }), p('B')],
        });
        expect(res.success).toBe(true);
      }
    });

    it('accepts Bo5 with comboWins 0, 1, 2, and 3', () => {
      for (const comboWins of [0, 1, 2, 3]) {
        const res = gameCreateSchema.safeParse({
          date: baseDate,
          variant,
          bestOf: 5,
          comboWins,
          participants: [p('A', { isWinner: true }), p('B')],
        });
        expect(res.success).toBe(true);
      }
    });

    it('rejects bestOf 2', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 2,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects bestOf 4', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 4,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects missing bestOf', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects missing comboWins', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects Bo3 with comboWins 3', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 3,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects Bo5 with comboWins 4', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 5,
        comboWins: 4,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects negative comboWins', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: -1,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects 1 participant', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true })],
      });
      expect(res.success).toBe(false);
    });

    it('rejects 3 participants', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B'), p('C')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects zero winners', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A'), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects two winners', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B', { isWinner: true })],
      });
      expect(res.success).toBe(false);
    });

    it('rejects role on participants', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
      });
      expect(res.success).toBe(false);
    });
  }
);

describe('gameCreateSchema — non-best-of variants reject bestOf/comboWins', () => {
  it.each(['COMMANDER', 'STAR', 'KING'] as const)(
    '%s rejects bestOf when set',
    (variant) => {
      const participants =
        variant === 'STAR'
          ? [p('A', { isWinner: true }), p('B'), p('C'), p('D'), p('E')]
          : variant === 'KING'
          ? [
              p('A', { isWinner: true, role: 'KING' }),
              p('B', { isWinner: true, role: 'SQUIRE' }),
              p('C', { isWinner: true, role: 'SQUIRE' }),
              p('D', { role: 'ASSASSIN' }),
              p('E', { role: 'ASSASSIN' }),
              p('F', { role: 'ASSASSIN' }),
            ]
          : [p('A', { isWinner: true }), p('B'), p('C'), p('D')];

      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        participants,
      });
      expect(res.success).toBe(false);
    }
  );
});
```

- [ ] **Step 2: Run the new tests — expect failures**

Run: `npx jest tests/validators.test.ts`
Expected: many failures referencing missing variants (`BRAWL`, `STANDARD`, ...), `bestOf`/`comboWins` unknown fields, and shape mismatches.

- [ ] **Step 3: Rewrite `src/lib/validators.ts`**

Replace the file contents with:

```ts
import { z } from 'zod';
import {
  ALL_FORMATS,
  BEST_OF_FORMATS,
  maxComboWinsFor,
  type GameFormat,
} from '@/lib/gameFormats';

// -----------------------------------------------------------------------------
// Variant + role enums — variants now sourced from gameFormats.ts (D-31, D-32)
// -----------------------------------------------------------------------------
export const GAME_VARIANTS = ALL_FORMATS;
export type GameVariant = GameFormat;

export const PARTICIPANT_ROLES = ['KING', 'SQUIRE', 'ASSASSIN'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

// -----------------------------------------------------------------------------
// GameParticipant validator (unchanged)
// -----------------------------------------------------------------------------
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

export type GameParticipantInput = z.infer<typeof gameParticipantSchema>;

// -----------------------------------------------------------------------------
// Base game schema — now carries optional bestOf + comboWins
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
  bestOf: z
    .number()
    .int()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  comboWins: z
    .number()
    .int()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  participants: z
    .array(gameParticipantSchema)
    .min(1, 'at least one participant required')
    .max(8, 'at most eight participants per game')
    .refine(
      (arr) => {
        const regulars = arr.filter((p) => !p.isRandom);
        const names = new Set(regulars.map((p) => p.playerName.toLowerCase()));
        return names.size === regulars.length;
      },
      { message: 'duplicate player names not allowed (non-random rows)' }
    ),
});

// -----------------------------------------------------------------------------
// Variant invariants — branches for COMMANDER, STAR, KING, BRAWL, and a shared
// best-of branch covering STANDARD/PAUPER/DRAFT/PRERELEASE/SEALED/CUBE.
// -----------------------------------------------------------------------------
type ParticipantForInvariants = {
  isWinner: boolean;
  role?: ParticipantRole | null;
};

type InvariantInput = {
  participants: ParticipantForInvariants[];
  bestOf?: number | null;
  comboWins?: number | null;
};

export type InvariantResult =
  | { ok: true }
  | { ok: false; message: string };

function rejectBestOfFields(data: InvariantInput, variant: string): InvariantResult | null {
  if (data.bestOf != null) {
    return { ok: false, message: `${variant} game must not set bestOf` };
  }
  if (data.comboWins != null) {
    return { ok: false, message: `${variant} game must not set comboWins` };
  }
  return null;
}

export function applyVariantInvariants(
  data: InvariantInput,
  variant: GameVariant
): InvariantResult {
  const ps = data.participants;
  const winnerCount = ps.filter((p) => p.isWinner).length;
  const withRole = ps.filter((p) => p.role != null);

  if (variant === 'COMMANDER') {
    if (winnerCount !== 1) {
      return { ok: false, message: 'COMMANDER game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'COMMANDER game participants must not have roles' };
    }
    const r = rejectBestOfFields(data, 'COMMANDER');
    if (r) return r;
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
    const r = rejectBestOfFields(data, 'STAR');
    if (r) return r;
    return { ok: true };
  }

  if (variant === 'KING') {
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
    const r = rejectBestOfFields(data, 'KING');
    if (r) return r;
    return { ok: true };
  }

  if (variant === 'BRAWL') {
    if (ps.length !== 2) {
      return { ok: false, message: 'BRAWL game must have exactly 2 participants' };
    }
    if (winnerCount !== 1) {
      return { ok: false, message: 'BRAWL game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'BRAWL game participants must not have roles' };
    }
    const r = rejectBestOfFields(data, 'BRAWL');
    if (r) return r;
    return { ok: true };
  }

  // Shared best-of branch: STANDARD / PAUPER / DRAFT / PRERELEASE / SEALED / CUBE
  if (BEST_OF_FORMATS.has(variant)) {
    if (ps.length !== 2) {
      return { ok: false, message: `${variant} game must have exactly 2 participants` };
    }
    if (winnerCount !== 1) {
      return { ok: false, message: `${variant} game must have exactly one winner` };
    }
    if (withRole.length > 0) {
      return { ok: false, message: `${variant} game participants must not have roles` };
    }
    if (data.bestOf !== 1 && data.bestOf !== 3 && data.bestOf !== 5) {
      return { ok: false, message: `${variant} game requires bestOf 1, 3, or 5` };
    }
    const maxCombo = maxComboWinsFor(data.bestOf);
    if (
      typeof data.comboWins !== 'number' ||
      data.comboWins < 0 ||
      data.comboWins > maxCombo
    ) {
      return {
        ok: false,
        message: `${variant} Bo${data.bestOf} game requires comboWins in 0..${maxCombo}`,
      };
    }
    return { ok: true };
  }

  // Defensive — unreachable thanks to z.enum on the schema.
  return { ok: false, message: `Unknown variant: ${variant}` };
}

// -----------------------------------------------------------------------------
// Create schema — sets variant (default COMMANDER) and enforces invariants
// -----------------------------------------------------------------------------
export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('COMMANDER') })
  .superRefine((data, ctx) => {
    const result = applyVariantInvariants(
      {
        participants: data.participants,
        bestOf: data.bestOf,
        comboWins: data.comboWins,
      },
      data.variant
    );
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
// Update schema — no variant/bestOf/comboWins (creation-time only per D-45);
// PATCH route fetches stored values and runs applyVariantInvariants.
// -----------------------------------------------------------------------------
export const gameUpdateSchema = baseGameSchema.omit({
  bestOf: true,
  comboWins: true,
});
export type GameUpdateInput = z.infer<typeof gameUpdateSchema>;

// -----------------------------------------------------------------------------
// Back-compat alias
// -----------------------------------------------------------------------------
export const gameSchema = gameCreateSchema;
export type GameInput = GameCreateInput;
```

- [ ] **Step 4: Run validator tests — expect green**

Run: `npx jest tests/validators.test.ts`
Expected: PASS (all groups including the new BRAWL + best-of describe blocks).

- [ ] **Step 5: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors. Other modules that consume `GAME_VARIANTS` or `applyVariantInvariants` will continue to compile because the union now contains the existing values as a subset, and `applyVariantInvariants`'s new fields are optional.

- [ ] **Step 6: Run full test suite — sanity check**

Run: `npx jest`
Expected: only baseline `tests/cron-sync.test.ts` failure; everything else passes. If `tests/games-api.test.ts` or `tests/game-form.test.ts` start failing because they relied on `applyVariantInvariants` not rejecting `bestOf` for COMMANDER, that's a real bug — investigate and fix.

**DO NOT COMMIT.** Hand off to Task 3.

---

## Task 3: API integration — POST/PATCH/Notify wiring

**Files:**
- Modify: `src/app/api/games/route.ts:18-38`
- Modify: `src/app/api/games/[id]/route.ts:23-25, 79-104`
- Modify: `src/app/api/games/[id]/notify/route.ts:37-50`
- Modify: `tests/games-api.test.ts`
- Modify: `tests/games-notify.test.ts`

- [ ] **Step 1: Write API persistence tests**

Add to `tests/games-api.test.ts` (within the existing POST describe block — mirror the structure of existing tests; the mock pattern is in place):

```ts
describe('POST /api/games — bestOf + comboWins persistence', () => {
  it('persists bestOf and comboWins for a Bo3 STANDARD game', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: true });
    mockTxGameCreate.mockResolvedValueOnce({ id: 'g-bo3-1' });
    mockTxParticipantCreateMany.mockResolvedValueOnce({ count: 2 });

    const body = {
      date: '2026-05-24T00:00:00.000Z',
      variant: 'STANDARD',
      bestOf: 3,
      comboWins: 2,
      wonByCombo: true,
      participants: [
        { playerName: 'Alice', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Burn' },
        { playerName: 'Bob', isWinner: false, isScrewed: false, isRandom: true },
      ],
    };

    const res = await POST(
      new Request('http://localhost/api/games', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );

    expect(res.status).toBe(201);
    const createCall = mockTxGameCreate.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      variant: 'STANDARD',
      bestOf: 3,
      comboWins: 2,
    });
  });

  it('persists bestOf=null/comboWins=null for COMMANDER', async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: true });
    mockTxGameCreate.mockResolvedValueOnce({ id: 'g-cmd-1' });
    mockTxParticipantCreateMany.mockResolvedValueOnce({ count: 4 });

    const body = {
      date: '2026-05-24T00:00:00.000Z',
      variant: 'COMMANDER',
      wonByCombo: false,
      participants: [
        { playerName: 'A', isWinner: true, isScrewed: false, isRandom: false },
        { playerName: 'B', isWinner: false, isScrewed: false, isRandom: false },
        { playerName: 'C', isWinner: false, isScrewed: false, isRandom: false },
        { playerName: 'D', isWinner: false, isScrewed: false, isRandom: false },
      ],
    };

    const res = await POST(
      new Request('http://localhost/api/games', {
        method: 'POST',
        body: JSON.stringify(body),
      })
    );

    expect(res.status).toBe(201);
    const createCall = mockTxGameCreate.mock.calls[0][0];
    expect(createCall.data.bestOf).toBeNull();
    expect(createCall.data.comboWins).toBeNull();
  });
});
```

Read the top of `tests/games-api.test.ts` first to confirm the exact mock-symbol names (`mockTxGameCreate`, `mockTxParticipantCreateMany`, etc.) used by the existing tests; copy those names in the new tests. If symbol names differ, adapt mechanically.

- [ ] **Step 2: Run failing test**

Run: `npx jest tests/games-api.test.ts -t "bestOf"`
Expected: FAIL — the POST handler does not yet pass `bestOf` / `comboWins` to `prisma.game.create`.

- [ ] **Step 3: Update `src/app/api/games/route.ts` POST handler**

Replace the inside of the `try` block in POST so it reads:

```ts
const body = await request.json();
const { date, wonByCombo, notes, variant, bestOf, comboWins, participants } =
  gameCreateSchema.parse(body);
const game = await prisma.$transaction(async (tx) => {
  const created = await tx.game.create({
    data: { date, wonByCombo, notes, variant, bestOf, comboWins },
  });
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
  return created;
});
return NextResponse.json({ game }, { status: 201 });
```

- [ ] **Step 4: Run POST test — expect green**

Run: `npx jest tests/games-api.test.ts -t "bestOf"`
Expected: PASS.

- [ ] **Step 5: Update PATCH route to re-run invariants with stored bestOf/comboWins**

In `src/app/api/games/[id]/route.ts`:

Replace `isGameVariant`:

```ts
import { GAME_VARIANTS } from '@/lib/validators';

function isGameVariant(value: unknown): value is GameVariant {
  return typeof value === 'string' && (GAME_VARIANTS as readonly string[]).includes(value);
}
```

Replace the `existing` fetch + invariant call inside the PATCH handler so it reads:

```ts
const existing = await prisma.game.findUnique({
  where: { id },
  select: { variant: true, bestOf: true, comboWins: true },
});
if (!existing) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

const variant = existing.variant;
if (!isGameVariant(variant)) {
  console.error('PATCH /api/games/[id]: invalid stored variant', { id, variant });
  return NextResponse.json(
    { error: 'Invalid stored variant' },
    { status: 500 }
  );
}
const invariantResult = applyVariantInvariants(
  {
    participants: parsed.participants,
    bestOf: existing.bestOf,
    comboWins: existing.comboWins,
  },
  variant
);
if (!invariantResult.ok) {
  return NextResponse.json(
    { error: [{ message: invariantResult.message, path: ['participants'] }] },
    { status: 400 }
  );
}
```

The `prisma.game.update` block below it is unchanged — it intentionally does not write `bestOf` or `comboWins` (creation-time only per D-45).

- [ ] **Step 6: Update the notify route to pass new fields**

In `src/app/api/games/[id]/notify/route.ts`, change the `buildNotifyMessage` call so it reads:

```ts
const message = buildNotifyMessage(
  {
    variant: game.variant,
    wonByCombo: game.wonByCombo,
    bestOf: game.bestOf,
    comboWins: game.comboWins,
    participants: game.participants.map((p) => ({
      playerName: p.playerName,
      isWinner: p.isWinner,
      isRandom: p.isRandom,
      deckName: p.deckName,
      role: p.role,
    })),
  },
  origin
);
```

(`buildNotifyMessage`'s signature is updated in Task 4. Step 7 below verifies via tsc that this Task-3 wiring still compiles after Task 4 lands; for now, this call signature is the target.)

- [ ] **Step 7: Run tsc — expect a known temporary error**

Run: `npx tsc --noEmit`
Expected: a single error in `src/app/api/games/[id]/notify/route.ts` saying `bestOf`/`comboWins` are not assignable to `GameForNotify`. This is expected and resolved by Task 4. Note the error for the orchestrator's review; do not move on to Task 4 if any OTHER tsc errors exist.

- [ ] **Step 8: Run tests — expect notify tests broken**

Run: `npx jest tests/games-notify.test.ts`
Expected: failures because the type doesn't yet accept the new fields. The other API tests must pass.

Run: `npx jest --testPathIgnorePatterns="games-notify"`
Expected: only baseline `tests/cron-sync.test.ts` failing; everything else green.

**DO NOT COMMIT.** Hand off to Task 4.

---

## Task 4: Discord templates — BRAWL + best-of in `notifyMessage.ts`

**Files:**
- Modify: `src/lib/notifyMessage.ts:1-85` (whole file)
- Modify: `tests/notifyMessage.test.ts`
- Modify: `tests/games-notify.test.ts`

- [ ] **Step 1: Write failing template tests**

Append to `tests/notifyMessage.test.ts`:

```ts
describe('buildNotifyMessage — BRAWL', () => {
  const origin = 'https://example.com';

  it('produces a Commander-shape line labeled "Brawl" with combo text', () => {
    const msg = buildNotifyMessage(
      {
        variant: 'BRAWL',
        wonByCombo: true,
        bestOf: null,
        comboWins: null,
        participants: [
          { playerName: 'Alice', isWinner: true, isRandom: false, deckName: 'Atraxa', role: null },
          { playerName: 'Bob', isWinner: false, isRandom: false, deckName: 'Mono-Red', role: null },
        ],
      },
      origin
    );
    expect(msg).toBe(
      'New Brawl game added! Alice won using Atraxa via combo. Check it out at https://example.com/games'
    );
  });

  it('shows "without any combos" when wonByCombo is false', () => {
    const msg = buildNotifyMessage(
      {
        variant: 'BRAWL',
        wonByCombo: false,
        bestOf: null,
        comboWins: null,
        participants: [
          { playerName: 'Alice', isWinner: true, isRandom: false, deckName: 'Atraxa', role: null },
          { playerName: 'Bob', isWinner: false, isRandom: false, deckName: 'Burn', role: null },
        ],
      },
      origin
    );
    expect(msg).toBe(
      'New Brawl game added! Alice won using Atraxa without any combos. Check it out at https://example.com/games'
    );
  });

  it('falls back to NO_DECK_FALLBACK when winner has no deck', () => {
    const msg = buildNotifyMessage(
      {
        variant: 'BRAWL',
        wonByCombo: false,
        bestOf: null,
        comboWins: null,
        participants: [
          { playerName: 'Alice', isWinner: true, isRandom: false, deckName: null, role: null },
          { playerName: 'Bob', isWinner: false, isRandom: false, deckName: null, role: null },
        ],
      },
      origin
    );
    expect(msg).toBe(
      'New Brawl game added! Alice won using a deck they forgot to list without any combos. Check it out at https://example.com/games'
    );
  });
});

describe.each([
  { variant: 'STANDARD', label: 'Standard' },
  { variant: 'PAUPER', label: 'Pauper' },
  { variant: 'DRAFT', label: 'Draft' },
  { variant: 'PRERELEASE', label: 'Prerelease' },
  { variant: 'SEALED', label: 'Sealed' },
  { variant: 'CUBE', label: 'Cube' },
] as const)('buildNotifyMessage — best-of variant %p', ({ variant, label }) => {
  const origin = 'https://example.com';
  const winner = { playerName: 'Alice', isWinner: true, isRandom: false, deckName: 'Boros', role: null };
  const loser = { playerName: 'Bob', isWinner: false, isRandom: true, deckName: null, role: null };

  it('Bo1 with comboWins 0 → "without any combos", no parenthetical', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: false,
        bestOf: 1,
        comboWins: 0,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} game added! Alice won using Boros without any combos. Check it out at https://example.com/games`
    );
  });

  it('Bo1 with comboWins 1 → "via combo", no parenthetical', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: true,
        bestOf: 1,
        comboWins: 1,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} game added! Alice won using Boros via combo. Check it out at https://example.com/games`
    );
  });

  it('Bo3 with comboWins 0 → "without combos", includes (Bo3)', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: false,
        bestOf: 3,
        comboWins: 0,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros without combos. Check it out at https://example.com/games`
    );
  });

  it('Bo3 with comboWins 1 → "winning 1 game with combos"', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: true,
        bestOf: 3,
        comboWins: 1,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros winning 1 game with combos. Check it out at https://example.com/games`
    );
  });

  it('Bo3 with comboWins 2 → "winning 2 games with combos"', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: true,
        bestOf: 3,
        comboWins: 2,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros winning 2 games with combos. Check it out at https://example.com/games`
    );
  });

  it('Bo5 with comboWins 3 → "winning 3 games with combos"', () => {
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: true,
        bestOf: 5,
        comboWins: 3,
        participants: [winner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} (Bo5) game added! Alice won using Boros winning 3 games with combos. Check it out at https://example.com/games`
    );
  });

  it('falls back to NO_DECK_FALLBACK when winner has no deck (Bo3)', () => {
    const noDeckWinner = { ...winner, deckName: null };
    const msg = buildNotifyMessage(
      {
        variant,
        wonByCombo: false,
        bestOf: 3,
        comboWins: 0,
        participants: [noDeckWinner, loser],
      },
      origin
    );
    expect(msg).toBe(
      `New ${label} (Bo3) game added! Alice won using a deck they forgot to list without combos. Check it out at https://example.com/games`
    );
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx jest tests/notifyMessage.test.ts`
Expected: failures referencing the new BRAWL + best-of branches and the new `bestOf`/`comboWins` fields on `GameForNotify`.

- [ ] **Step 3: Rewrite `src/lib/notifyMessage.ts`**

```ts
import {
  BEST_OF_FORMATS,
  FORMAT_LABELS,
  type GameFormat,
} from '@/lib/gameFormats';

export interface NotifyParticipant {
  playerName: string;
  isWinner: boolean;
  isRandom: boolean;
  deckName: string | null;
  role: string | null;
}

export interface GameForNotify {
  variant: string;
  wonByCombo: boolean;
  bestOf: number | null;
  comboWins: number | null;
  participants: NotifyParticipant[];
}

const NO_DECK_FALLBACK = 'a deck they forgot to list';

function displayName(p: NotifyParticipant): string {
  return p.isRandom ? 'Random' : p.playerName;
}

function comboClause(wonByCombo: boolean): string {
  return wonByCombo ? 'via combo' : 'without any combos';
}

function alphabetical<T extends { playerName: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) =>
    a.playerName.toLowerCase().localeCompare(b.playerName.toLowerCase())
  );
}

function formatNameWithDeck(p: NotifyParticipant): string {
  const name = displayName(p);
  if (p.deckName && p.deckName.trim() !== '') {
    return `${name} (${p.deckName})`;
  }
  return name;
}

function formatRoyaltyWinner(p: NotifyParticipant): string {
  const name = displayName(p);
  const roleLabel = p.role === 'KING' ? 'King' : 'Squire';
  if (p.deckName && p.deckName.trim() !== '') {
    return `${name} (${roleLabel}, ${p.deckName})`;
  }
  return `${name} (${roleLabel})`;
}

function deckOrFallback(p: NotifyParticipant): string {
  return p.deckName && p.deckName.trim() !== '' ? p.deckName : NO_DECK_FALLBACK;
}

function bestOfComboClause(comboWins: number): string {
  if (comboWins === 0) return 'without combos';
  return `winning ${comboWins} game${comboWins === 1 ? '' : 's'} with combos`;
}

export function buildNotifyMessage(game: GameForNotify, origin: string): string {
  const winners = game.participants.filter((p) => p.isWinner);
  const tail = `Check it out at ${origin}/games`;

  if (game.variant === 'STAR') {
    const combo = comboClause(game.wonByCombo);
    if (winners.length === 1) {
      const w = winners[0];
      return `New Star Commander game added! ${displayName(w)} won using ${deckOrFallback(w)} ${combo}. ${tail}`;
    }
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    const joined =
      parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts.join(', ');
    return `New Star Commander game added! ${joined} won together ${combo}. ${tail}`;
  }

  if (game.variant === 'KING') {
    const combo = comboClause(game.wonByCombo);
    const isRoyalty = winners.some((w) => w.role === 'KING');
    if (isRoyalty) {
      const king = winners.find((w) => w.role === 'KING')!;
      const squires = alphabetical(winners.filter((w) => w.role !== 'KING'));
      const parts = [formatRoyaltyWinner(king), ...squires.map(formatRoyaltyWinner)];
      return `New King Commander game added! Royalty won — ${parts.join(', ')} — ${combo}. ${tail}`;
    }
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    return `New King Commander game added! Assassins won — ${parts.join(', ')} — ${combo}. ${tail}`;
  }

  if (game.variant === 'BRAWL') {
    const combo = comboClause(game.wonByCombo);
    const w = winners[0];
    const name = w ? displayName(w) : 'Someone';
    const deck = w ? deckOrFallback(w) : NO_DECK_FALLBACK;
    return `New Brawl game added! ${name} won using ${deck} ${combo}. ${tail}`;
  }

  if (BEST_OF_FORMATS.has(game.variant as GameFormat)) {
    const label = FORMAT_LABELS[game.variant as GameFormat];
    const w = winners[0];
    const name = w ? displayName(w) : 'Someone';
    const deck = w ? deckOrFallback(w) : NO_DECK_FALLBACK;
    const isBo1 = game.bestOf === 1;
    const cw = game.comboWins ?? 0;
    const combo = isBo1 ? comboClause(game.wonByCombo) : bestOfComboClause(cw);
    const header = isBo1
      ? `New ${label} game added!`
      : `New ${label} (Bo${game.bestOf}) game added!`;
    return `${header} ${name} won using ${deck} ${combo}. ${tail}`;
  }

  // COMMANDER (default)
  const combo = comboClause(game.wonByCombo);
  const w = winners[0];
  const deck = w ? deckOrFallback(w) : NO_DECK_FALLBACK;
  const name = w ? displayName(w) : 'Someone';
  return `New Commander game added! ${name} won using ${deck} ${combo}. ${tail}`;
}
```

- [ ] **Step 4: Run notify tests**

Run: `npx jest tests/notifyMessage.test.ts`
Expected: PASS (existing COMMANDER/STAR/KING templates unchanged, all new BRAWL + best-of cases green).

- [ ] **Step 5: Update games-notify.test.ts fixtures**

Existing `tests/games-notify.test.ts` builds game fixtures inline. Each existing fixture must add `bestOf: null` and `comboWins: null` to satisfy the new `GameForNotify` shape. Mechanically: in every place the test constructs the object passed to `buildNotifyMessage` (or returned by `prisma.game.findUnique`), add the two fields. Example fix:

```ts
mockGameFindUnique.mockResolvedValueOnce({
  id: 'g1',
  variant: 'COMMANDER',
  wonByCombo: true,
  bestOf: null,        // NEW
  comboWins: null,     // NEW
  discordNotified: false,
  participants: [...],
});
```

Add at least one new test that exercises a Bo3 game end-to-end through the notify route:

```ts
it('builds Bo3 STANDARD message from stored bestOf/comboWins', async () => {
  mockCheckRateLimit.mockReturnValueOnce({ allowed: true });
  mockGameFindUnique.mockResolvedValueOnce({
    id: 'g-bo3',
    variant: 'STANDARD',
    wonByCombo: true,
    bestOf: 3,
    comboWins: 2,
    discordNotified: false,
    participants: [
      { playerName: 'Alice', isWinner: true, isRandom: false, deckName: 'Burn', role: null },
      { playerName: 'Bob', isWinner: false, isRandom: true, deckName: null, role: null },
    ],
  });
  mockGameUpdate.mockResolvedValueOnce({});
  mockSendDiscordAlert.mockResolvedValueOnce(undefined);

  await POST(
    new Request('http://localhost/api/games/g-bo3/notify', { method: 'POST' }),
    { params: Promise.resolve({ id: 'g-bo3' }) }
  );

  const content = (mockSendDiscordAlert.mock.calls[0][0] as { content: string }).content;
  expect(content).toContain('New Standard (Bo3) game added!');
  expect(content).toContain('Alice won using Burn winning 2 games with combos.');
});
```

- [ ] **Step 6: Run games-notify tests**

Run: `npx jest tests/games-notify.test.ts`
Expected: PASS.

- [ ] **Step 7: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors. The notify-route wiring from Task 3 now compiles because `GameForNotify` accepts `bestOf` and `comboWins`.

- [ ] **Step 8: Run the full suite**

Run: `npx jest`
Expected: only `tests/cron-sync.test.ts` failing; everything else green.

**DO NOT COMMIT.** Hand off to Task 5.

---

## Task 5: Stats — silent Commander-format gate

**Files:**
- Modify: `src/lib/stats.ts` (top of every exported compute function)
- Modify: `tests/stats.test.ts`

- [ ] **Step 1: Write failing exclusion tests**

Add to `tests/stats.test.ts` (after existing test groups; update the `mkGame` builder if necessary to accept `variant`):

```ts
// ----- Verify mkGame accepts variant -----
// If mkGame's signature doesn't already accept `variant`, add an options param:
//   function mkGame(opts: { variant?: string; participants: ...; ... }) { ... }
// and default `variant ?? 'COMMANDER'` so existing call sites stay green.

describe('stats — silent Commander-format gate (D-32, D-43)', () => {
  it('excludes STANDARD games from computePlayerWinRate', () => {
    const games: Game[] = [
      mkGame({
        variant: 'COMMANDER',
        participants: [
          mkParticipant('Alice', { isWinner: true }),
          mkParticipant('Bob'),
        ],
      }),
      mkGame({
        variant: 'STANDARD',
        bestOf: 3,
        comboWins: 0,
        participants: [
          mkParticipant('Alice'),
          mkParticipant('Bob', { isWinner: true }),
        ],
      }),
    ];
    const rates = computePlayerWinRate(games);
    const alice = rates.find((r) => r.player === 'Alice');
    expect(alice).toBeDefined();
    expect(alice?.wins).toBe(1);
    expect(alice?.played).toBe(1); // STANDARD game excluded
  });

  it('INCLUDES BRAWL games in computePlayerWinRate (BRAWL is a Commander format)', () => {
    const games: Game[] = [
      mkGame({
        variant: 'BRAWL',
        participants: [
          mkParticipant('Alice', { isWinner: true }),
          mkParticipant('Bob'),
        ],
      }),
    ];
    const rates = computePlayerWinRate(games);
    expect(rates.find((r) => r.player === 'Alice')?.wins).toBe(1);
  });

  it('excludes non-Commander variants from computeDeckWinRate', () => {
    const games: Game[] = [
      mkGame({
        variant: 'COMMANDER',
        participants: [
          mkParticipant('A', { isWinner: true, deckName: 'Atraxa' }),
          mkParticipant('B', { deckName: 'Burn' }),
        ],
      }),
      mkGame({
        variant: 'DRAFT',
        bestOf: 3,
        comboWins: 1,
        participants: [
          mkParticipant('C', { isWinner: true, deckName: 'Boros' }),
          mkParticipant('D', { deckName: 'UB' }),
        ],
      }),
    ];
    const rates = computeDeckWinRate(games);
    expect(rates.find((r) => r.deck === 'Boros')).toBeUndefined();
    expect(rates.find((r) => r.deck === 'Atraxa')?.wins).toBe(1);
  });

  it('excludes non-Commander variants from computeScrewedRate', () => {
    const games: Game[] = [
      mkGame({
        variant: 'PAUPER',
        bestOf: 1,
        comboWins: 0,
        participants: [
          mkParticipant('A', { isWinner: true, isScrewed: true }),
          mkParticipant('B'),
        ],
      }),
    ];
    const rates = computeScrewedRate(games);
    expect(rates.find((r) => r.player === 'A')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx jest tests/stats.test.ts -t "Commander-format gate"`
Expected: FAIL — non-Commander games are still counted.

- [ ] **Step 3: Add gate to every exported compute function in `src/lib/stats.ts`**

Open `src/lib/stats.ts`. Add the import at the top:

```ts
import { isCommanderFormat } from '@/lib/gameFormats';
```

For EVERY exported function that takes `Game[]` (or a derivative) and returns aggregates, insert as the FIRST executable statement (before any other filter, map, or destructure):

```ts
games = games.filter((g) => isCommanderFormat(g.variant));
```

Functions to update (per the test imports — confirm by grepping `^export function compute` and `^export function filter`):
- `computePlayerWinRate`
- `computeDeckWinRate`
- `computeScrewedRate`
- `computeWeeklyFrequency`
- `computeMostLikelyToPlay`
- `computeMostLikelyToPlayBump`
- `computeWinsByPlayerPie`
- `computeGamesByDeckPie`
- `computeScrewedByPlayerBar`
- `computeScrewedByDeckPie`
- `computePlayerRadar`
- `filterGamesByTimeframe`
- Any additional `screwedByDeck` / `screwedByPlayer` / `comboRate` helpers found in the file

If `games` is a `const` parameter, rebind locally:

```ts
export function computePlayerWinRate(input: Game[]): ... {
  const games = input.filter((g) => isCommanderFormat(g.variant));
  // ... rest unchanged
}
```

Same pattern for every function. The change is intentionally repetitive (DRY at the helper level — `isCommanderFormat` is one call — but spelled out per function for clarity at read sites).

- [ ] **Step 4: Run stats tests**

Run: `npx jest tests/stats.test.ts`
Expected: PASS. If a previously-passing test now fails because its `mkGame` calls didn't specify `variant`, confirm `mkGame` defaults `variant` to `'COMMANDER'` (existing fixtures stay valid).

- [ ] **Step 5: Run tsc + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: zero tsc errors; only baseline `tests/cron-sync.test.ts` failing in jest.

**DO NOT COMMIT.** Hand off to Task 6.

---

## Task 6: Badges + Games tab UI — Format column, Format filter, expanded-row combo

**Files:**
- Modify: `src/lib/gameVariants.ts` (whole file)
- Modify: `src/app/games/page.tsx:8-28, 35-79, 142-503`
- Modify: `tests/games-filter.test.ts`
- Modify: `tests/gameVariants.test.ts`

- [ ] **Step 1: Extend badge tests**

Append to `tests/gameVariants.test.ts`:

```ts
describe('getVariantBadge — new variants', () => {
  it.each([
    ['BRAWL', 'Brawl'],
    ['STANDARD', 'Standard'],
    ['PAUPER', 'Pauper'],
    ['DRAFT', 'Draft'],
    ['PRERELEASE', 'Prerelease'],
    ['SEALED', 'Sealed'],
    ['CUBE', 'Cube'],
  ])('returns label %s for variant %s', (variant, expectedLabel) => {
    expect(getVariantBadge(variant).label).toBe(expectedLabel);
  });

  it('returns a non-empty class string for every new variant', () => {
    for (const v of ['BRAWL', 'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE']) {
      expect(getVariantBadge(v).classes.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx jest tests/gameVariants.test.ts`
Expected: FAIL — new variants fall back to the COMMANDER badge so labels are wrong.

- [ ] **Step 3: Rewrite `src/lib/gameVariants.ts`**

```ts
export type GameVariantKey =
  | 'COMMANDER' | 'STAR' | 'KING' | 'BRAWL'
  | 'STANDARD' | 'PAUPER' | 'DRAFT' | 'PRERELEASE' | 'SEALED' | 'CUBE';

export interface VariantBadge {
  label: string;
  classes: string;
}

const VARIANT_BADGES: Record<GameVariantKey, VariantBadge> = {
  COMMANDER:  { label: 'Commander',  classes: 'bg-surface text-muted border border-border' },
  STAR:       { label: 'Star',       classes: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200' },
  KING:       { label: 'King',       classes: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200' },
  BRAWL:      { label: 'Brawl',      classes: 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200' },
  STANDARD:   { label: 'Standard',   classes: 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200' },
  PAUPER:     { label: 'Pauper',     classes: 'bg-slate-200 text-slate-900 dark:bg-slate-700/40 dark:text-slate-200' },
  DRAFT:      { label: 'Draft',      classes: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200' },
  PRERELEASE: { label: 'Prerelease', classes: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' },
  SEALED:     { label: 'Sealed',     classes: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200' },
  CUBE:       { label: 'Cube',       classes: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
};

export function getVariantBadge(variant: string): VariantBadge {
  return VARIANT_BADGES[variant as GameVariantKey] ?? VARIANT_BADGES.COMMANDER;
}
```

- [ ] **Step 4: Run badge tests**

Run: `npx jest tests/gameVariants.test.ts`
Expected: PASS.

- [ ] **Step 5: Add Format-filter tests**

Append to `tests/games-filter.test.ts` (the existing `matchesAllFilters` test file). First, every existing `mkGame` call in that file must accept `variant` — confirm by inspecting the builder; if it doesn't, expand its options to include `variant` defaulting to `'COMMANDER'`. Then add:

```ts
describe('matchesAllFilters — formats (D-40)', () => {
  const cmd = mkGame({ variant: 'COMMANDER', participants: [mkParticipant('A', { isWinner: true })] });
  const std = mkGame({
    variant: 'STANDARD',
    bestOf: 1,
    comboWins: 0,
    participants: [mkParticipant('A', { isWinner: true }), mkParticipant('B')],
  });
  const pauper = mkGame({
    variant: 'PAUPER',
    bestOf: 3,
    comboWins: 1,
    participants: [mkParticipant('A', { isWinner: true }), mkParticipant('B')],
  });
  const baseFilter: FilterState = {
    winner: null,
    playerCount: null,
    players: [],
    decks: [],
    formats: [],
  };

  it('empty formats[] matches every variant', () => {
    expect(matchesAllFilters(cmd, baseFilter)).toBe(true);
    expect(matchesAllFilters(std, baseFilter)).toBe(true);
    expect(matchesAllFilters(pauper, baseFilter)).toBe(true);
  });

  it('single format filters to only that variant', () => {
    const f = { ...baseFilter, formats: ['STANDARD'] };
    expect(matchesAllFilters(cmd, f)).toBe(false);
    expect(matchesAllFilters(std, f)).toBe(true);
    expect(matchesAllFilters(pauper, f)).toBe(false);
  });

  it('multiple formats OR within the filter', () => {
    const f = { ...baseFilter, formats: ['COMMANDER', 'PAUPER'] };
    expect(matchesAllFilters(cmd, f)).toBe(true);
    expect(matchesAllFilters(std, f)).toBe(false);
    expect(matchesAllFilters(pauper, f)).toBe(true);
  });

  it('format filter ANDs with other filter types', () => {
    const fNoMatch = { ...baseFilter, formats: ['STANDARD'], winner: 'C' };
    expect(matchesAllFilters(std, fNoMatch)).toBe(false);
    const fMatch = { ...baseFilter, formats: ['STANDARD'], winner: 'A' };
    expect(matchesAllFilters(std, fMatch)).toBe(true);
  });
});
```

- [ ] **Step 6: Run failing test**

Run: `npx jest tests/games-filter.test.ts`
Expected: FAIL — `FilterState` does not yet have `formats`, and `matchesAllFilters` doesn't check it.

- [ ] **Step 7: Update `src/app/games/page.tsx`**

Apply all of the following edits to the file:

(a) Extend the `Game` interface:

```ts
interface Game {
  id: string;
  date: string;
  wonByCombo: boolean;
  variant: string;
  bestOf: number | null;
  comboWins: number | null;
  isImported: boolean;
  notes: string | null;
  createdAt: string;
  participants: Participant[];
}
```

(b) Extend `FilterState`:

```ts
export interface FilterState {
  winner: string | null;
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
  players: string[];
  decks: string[];
  formats: string[];
}
```

(c) Extend `matchesAllFilters` — insert after the decks block, before the `return true`:

```ts
if (filters.formats.length > 0) {
  if (!filters.formats.includes(game.variant)) return false;
}
```

(d) Add new state hooks alongside the existing filter hooks:

```ts
const [formatFilters, setFormatFilters] = useState<string[]>([]);
```

(e) Add format options derivation. Import at the top:

```ts
import { ALL_FORMATS, FORMAT_LABELS } from '@/lib/gameFormats';
```

(f) Include `formatFilters` in the `filteredGames` memo's filter object:

```ts
const filteredGames = useMemo(
  () =>
    games.filter((g) =>
      matchesAllFilters(g, {
        winner: winnerFilter,
        playerCount: countFilter,
        players: playerFilters,
        decks: deckFilters,
        formats: formatFilters,
      })
    ),
  [games, winnerFilter, countFilter, playerFilters, deckFilters, formatFilters]
);
```

(g) Include format filter in `anyFilterActive` and `clearFilters`:

```ts
const anyFilterActive =
  winnerFilter !== null ||
  countFilter !== null ||
  playerFilters.length > 0 ||
  deckFilters.length > 0 ||
  formatFilters.length > 0;

const clearFilters = () => {
  setWinnerFilter(null);
  setCountFilter(null);
  setPlayerFilters([]);
  setDeckFilters([]);
  setFormatFilters([]);
};
```

(h) Add a `toggleFormatFilter` helper next to the existing toggle helpers:

```ts
const toggleFormatFilter = (name: string) => {
  setFormatFilters((prev) =>
    prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
  );
};
```

(i) Add the Format filter UI in the filter row (place it FIRST, before Winner, since variant is the most discriminating attribute):

```tsx
<div className="flex-1 min-w-[12rem]">
  <label className="block text-xs text-muted mb-1">
    Format {formatFilters.length > 0 && `(${formatFilters.length} selected)`}
  </label>
  <details className="relative">
    <summary className="px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm cursor-pointer list-none">
      {formatFilters.length === 0
        ? 'Any format'
        : formatFilters.map((v) => FORMAT_LABELS[v as keyof typeof FORMAT_LABELS] ?? v).join(', ')}
    </summary>
    <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-surface shadow-lg p-2">
      {ALL_FORMATS.map((v) => (
        <label
          key={v}
          className="flex items-center gap-2 px-1 py-1 text-sm text-foreground hover:bg-surface-hover rounded cursor-pointer"
        >
          <input
            type="checkbox"
            checked={formatFilters.includes(v)}
            onChange={() => toggleFormatFilter(v)}
          />
          <span>{FORMAT_LABELS[v]}</span>
        </label>
      ))}
    </div>
  </details>
</div>
```

(j) Replace the Format `<td>` cell with two-chip rendering:

```tsx
<td className="py-2 pr-4">
  {(() => {
    const badge = getVariantBadge(g.variant);
    return (
      <div className="flex gap-1 items-center flex-wrap">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badge.classes}`}
        >
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

(k) Replace the expanded-row combo line. Find:

```tsx
{g.wonByCombo && (
  <li className="text-xs text-muted italic">Won by combo</li>
)}
```

Replace with:

```tsx
{g.bestOf != null ? (
  <li className="text-xs text-muted italic">
    Combo wins: {g.comboWins ?? 0}/{Math.ceil(g.bestOf / 2)}
  </li>
) : (
  g.wonByCombo && <li className="text-xs text-muted italic">Won by combo</li>
)}
```

- [ ] **Step 8: Run filter test**

Run: `npx jest tests/games-filter.test.ts`
Expected: PASS.

- [ ] **Step 9: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors. The `Game` interface now has `bestOf`/`comboWins`; `tests/gameDisplay.test.ts` consumes `Game`, so any fixture there missing those fields will surface. Add `bestOf: null, comboWins: null` to those fixtures as a one-line mechanical fix and re-run.

- [ ] **Step 10: Run full suite**

Run: `npx jest`
Expected: only baseline `tests/cron-sync.test.ts` failing.

**DO NOT COMMIT.** Hand off to Task 7.

---

## Task 7: Game form — `bestOf`/`comboWins` state, Random default, combo-entry UI

**Files:**
- Modify: `src/app/games/game-form.tsx:1-516`
- Modify: `tests/game-form.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/game-form.test.ts`:

```ts
describe('GameForm — Random default for non-COMMANDER 2-player variants (D-38)', () => {
  it.each(['BRAWL', 'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE'] as const)(
    'auto-checks isRandom on row 2 for variant %s',
    (variant) => {
      const { getAllByLabelText } = render(
        <GameForm playerCount={2} variant={variant} onSubmit={jest.fn()} />
      );
      const randomBoxes = getAllByLabelText(/random/i) as HTMLInputElement[];
      expect(randomBoxes).toHaveLength(2);
      expect(randomBoxes[0].checked).toBe(false);
      expect(randomBoxes[1].checked).toBe(true);
    }
  );

  it('does NOT auto-check isRandom for 2-player COMMANDER', () => {
    const { getAllByLabelText } = render(
      <GameForm playerCount={2} variant="COMMANDER" onSubmit={jest.fn()} />
    );
    const randomBoxes = getAllByLabelText(/random/i) as HTMLInputElement[];
    expect(randomBoxes[0].checked).toBe(false);
    expect(randomBoxes[1].checked).toBe(false);
  });
});

describe('validateGameForm — bestOf/comboWins (D-34, D-36, D-39)', () => {
  function baseState(over: Partial<GameFormState> = {}): GameFormState {
    return {
      date: '2026-05-24',
      notes: '',
      wonByCombo: false,
      rows: [
        { playerName: 'Alice', deckName: 'Burn', isWinner: true, isScrewed: false, isRandom: false },
        { playerName: 'Bob',   deckName: 'UB',   isWinner: false, isScrewed: false, isRandom: false },
      ],
      winnerIndex: 0,
      winnerIndices: [0],
      roles: [null, null],
      winningTeam: null,
      variant: 'STANDARD',
      bestOf: 3,
      comboWins: 1,
      ...over,
    };
  }

  it('accepts a valid STANDARD Bo3 with comboWins 1', () => {
    const res = validateGameForm(baseState());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.variant).toBe('STANDARD');
      expect(res.payload.bestOf).toBe(3);
      expect(res.payload.comboWins).toBe(1);
    }
  });

  it('rejects comboWins greater than ceil(bestOf/2)', () => {
    const res = validateGameForm(baseState({ bestOf: 3, comboWins: 3 }));
    expect(res.ok).toBe(false);
  });

  it('derives wonByCombo=true from comboWins > 0', () => {
    const res = validateGameForm(baseState({ bestOf: 3, comboWins: 2, wonByCombo: false }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload.wonByCombo).toBe(true);
  });

  it('derives wonByCombo=false from comboWins === 0', () => {
    const res = validateGameForm(baseState({ bestOf: 3, comboWins: 0, wonByCombo: true }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.payload.wonByCombo).toBe(false);
  });

  it('requires bestOf for best-of variants', () => {
    const res = validateGameForm(baseState({ bestOf: null, comboWins: null }));
    expect(res.ok).toBe(false);
  });

  it('forbids bestOf for COMMANDER', () => {
    const res = validateGameForm(
      baseState({
        variant: 'COMMANDER',
        bestOf: 3,
        comboWins: 0,
        rows: [
          { playerName: 'A', deckName: '', isWinner: true,  isScrewed: false, isRandom: false },
          { playerName: 'B', deckName: '', isWinner: false, isScrewed: false, isRandom: false },
          { playerName: 'C', deckName: '', isWinner: false, isScrewed: false, isRandom: false },
          { playerName: 'D', deckName: '', isWinner: false, isScrewed: false, isRandom: false },
        ],
        winnerIndex: 0,
        winnerIndices: [],
      })
    );
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx jest tests/game-form.test.ts`
Expected: FAIL — `GameFormState` doesn't yet have `bestOf`/`comboWins`; Random default not implemented.

- [ ] **Step 3: Update `src/app/games/game-form.tsx`**

(a) Extend imports + types at the top:

```ts
import { useState, useEffect, FormEvent } from 'react';
import { Combobox } from '@/app/components/combobox';
import type { GameVariant, ParticipantRole } from '@/lib/validators';
import { BEST_OF_FORMATS, maxComboWinsFor } from '@/lib/gameFormats';

export type { GameVariant, ParticipantRole };

export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
}

export type WinningTeam = 'ROYALTY' | 'ASSASSINS';

export interface GameFormState {
  date: string;
  notes: string;
  wonByCombo: boolean;
  rows: ParticipantRow[];
  winnerIndex: number;
  winnerIndices: number[];
  roles: (ParticipantRole | null)[];
  winningTeam: WinningTeam | null;
  variant: GameVariant;
  bestOf: number | null;     // NEW
  comboWins: number | null;  // NEW
}

export interface GameFormPayload {
  date: string;
  wonByCombo: boolean;
  notes?: string;
  variant?: GameVariant;
  bestOf?: number | null;     // NEW
  comboWins?: number | null;  // NEW
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

(b) Update `validateGameForm` — after the existing variant branches, before the participants are mapped, add the best-of validation:

```ts
const isBestOf = BEST_OF_FORMATS.has(state.variant);
if (isBestOf) {
  if (state.bestOf !== 1 && state.bestOf !== 3 && state.bestOf !== 5) {
    errors.form = 'Best-of must be 1, 3, or 5';
  } else {
    const max = maxComboWinsFor(state.bestOf);
    if (
      state.comboWins == null ||
      state.comboWins < 0 ||
      state.comboWins > max
    ) {
      errors.form = `Combo wins must be between 0 and ${max}`;
    }
  }
} else {
  if (state.bestOf != null || state.comboWins != null) {
    errors.form = `${state.variant} games must not set bestOf/comboWins`;
  }
}
```

(c) Update payload construction so `wonByCombo` is derived for best-of:

```ts
const wonByCombo = isBestOf ? (state.comboWins ?? 0) > 0 : state.wonByCombo;

return {
  ok: true,
  payload: {
    date: new Date(state.date).toISOString(),
    wonByCombo,
    notes: state.notes.trim() === '' ? undefined : state.notes.trim(),
    variant: state.variant,
    bestOf: isBestOf ? state.bestOf : null,
    comboWins: isBestOf ? state.comboWins : null,
    participants,
  },
};
```

(d) Update `emptyRow` callers — replace inline `Array.from({ length: playerCount }, emptyRow)` in the initial state with a helper that applies the Random default:

```ts
function initialRows(playerCount: number, variant: GameVariant): ParticipantRow[] {
  const rows = Array.from({ length: playerCount }, emptyRow);
  if (playerCount === 2 && variant !== 'COMMANDER') {
    rows[1] = { ...rows[1], isRandom: true };
  }
  return rows;
}
```

Use it in the `useState` initializer (replace the existing `rows: Array.from(...)` line):

```ts
rows: initialRows(playerCount, variant),
```

(e) Also update `buildInitialState` to set `bestOf`/`comboWins`:

```ts
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
  bestOf: (game as { bestOf?: number | null }).bestOf ?? null,
  comboWins: (game as { comboWins?: number | null }).comboWins ?? null,
};
```

Update the `buildInitialState` parameter type to accept the two new optional fields:

```ts
export function buildInitialState(game: {
  date: string | Date;
  wonByCombo: boolean;
  notes: string | null;
  variant?: GameVariant;
  bestOf?: number | null;
  comboWins?: number | null;
  participants: { /* unchanged */ }[];
}): GameFormState {
  // existing body, plus the two extra return fields above
}
```

(f) Extend `GameFormProps`:

```ts
export interface GameFormProps {
  playerCount: number;
  variant?: GameVariant;
  bestOf?: number | null;       // NEW
  initial?: GameFormState;
  submitLabel?: string;
  onSubmit: (payload: GameFormPayload) => Promise<void> | void;
}
```

And in `GameForm`'s `useState` initializer, set the initial `bestOf` from the prop and `comboWins` to `0` (so the dropdown lands on the safe default):

```ts
const [state, setState] = useState<GameFormState>(
  initial ?? {
    date: new Date().toLocaleDateString('en-CA'),
    notes: '',
    wonByCombo: false,
    rows: initialRows(playerCount, variant),
    winnerIndex: -1,
    winnerIndices: [],
    roles: Array.from({ length: playerCount }, () => null) as (ParticipantRole | null)[],
    winningTeam: null,
    variant,
    bestOf: bestOf ?? null,
    comboWins: bestOf != null ? 0 : null,
  }
);
```

(g) Replace the "Won by combo" checkbox in the header row with the conditional control. Find:

```tsx
<label className="flex items-center gap-2 pb-2 shrink-0">
  <input
    type="checkbox"
    checked={state.wonByCombo}
    onChange={(e) => setState((s) => ({ ...s, wonByCombo: e.target.checked }))}
  />
  <span className="text-sm text-foreground"><span className="sm:hidden">Combo Win</span><span className="hidden sm:inline">Won by combo</span></span>
</label>
```

Replace with:

```tsx
{(() => {
  const isBestOf = BEST_OF_FORMATS.has(state.variant);
  const showSelect = isBestOf && state.bestOf != null && state.bestOf > 1;
  if (showSelect) {
    const max = maxComboWinsFor(state.bestOf!);
    return (
      <label className="flex items-center gap-2 pb-2 shrink-0">
        <span className="text-sm text-foreground">Combo wins</span>
        <select
          value={state.comboWins ?? 0}
          onChange={(e) =>
            setState((s) => ({ ...s, comboWins: Number(e.target.value) }))
          }
          className="px-2 py-1 rounded-md border border-border bg-surface text-foreground text-sm"
          aria-label="Combo wins"
        >
          {Array.from({ length: max + 1 }, (_, n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    );
  }
  // Bo1 OR non-best-of → checkbox
  const checked = isBestOf ? (state.comboWins ?? 0) > 0 : state.wonByCombo;
  const onChange = (next: boolean) => {
    if (isBestOf) {
      setState((s) => ({ ...s, comboWins: next ? 1 : 0, wonByCombo: next }));
    } else {
      setState((s) => ({ ...s, wonByCombo: next }));
    }
  };
  return (
    <label className="flex items-center gap-2 pb-2 shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-foreground">
        <span className="sm:hidden">Combo Win</span>
        <span className="hidden sm:inline">Won by combo</span>
      </span>
    </label>
  );
})()}
```

- [ ] **Step 4: Run form tests**

Run: `npx jest tests/game-form.test.ts`
Expected: PASS.

- [ ] **Step 5: Run tsc + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: zero tsc errors; only baseline `tests/cron-sync.test.ts` failing in jest.

**DO NOT COMMIT.** Hand off to Task 8.

---

## Task 8: New-game flow — Format picker + Best-of picker modals

**Files:**
- Modify: `src/app/games/new/page.tsx:1-222`

This task is mostly UI plumbing; no unit tests exist for the modals (the existing file has none). Validation happens via manual browser exercise.

- [ ] **Step 1: Update `src/app/games/new/page.tsx`**

Replace the whole file body with the version below. The diff vs. existing: adds `formatChoice` + `bestOfChoice` state, swaps the post-count branching for the new 2-player format-picker flow, and threads `bestOf` into `GameForm`.

```tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GameForm, type GameFormPayload } from '@/app/games/game-form';
import type { GameVariant } from '@/lib/validators';
import { BEST_OF_FORMATS, FORMAT_LABELS } from '@/lib/gameFormats';

type NotifyStatus = 'idle' | 'sending' | 'sent' | 'error';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

const TWO_PLAYER_FORMAT_OPTIONS: GameVariant[] = [
  'COMMANDER', 'BRAWL', 'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
];

export interface VariantQuestion {
  variantOnYes: Exclude<GameVariant, 'COMMANDER'>;
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
  const [formatChoice, setFormatChoice] = useState<GameVariant | null>(null);
  const [bestOf, setBestOf] = useState<1 | 3 | 5 | null>(null);
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
      const res = await fetch(`/api/games/${createdGameId}/notify`, { method: 'POST' });
      if (res.ok || res.status === 409) setNotifyStatus('sent');
      else setNotifyStatus('error');
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
                onClick={() => { setNotifyStatus('idle'); handleNotify(); }}
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
              {notifyStatus === 'sent' && <span className="text-green-300">Sent! ✓</span>}
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

  // ----- Player-count modal -----
  if (playerCount === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="player-count-title">
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="player-count-title" className="text-xl font-bold text-foreground mb-4">How many players?</h2>
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setPlayerCount(n);
                  // For 3/4 player, variant is COMMANDER. 5/6-7-8 fall through to the Star/King Y/N modal.
                  // For 2 player, fall through to the new format-picker modal.
                  if (n !== 2 && variantQuestionForCount(n) === null) {
                    setVariant('COMMANDER');
                  }
                }}
                className="basis-[calc((100%-1.5rem)/4)] py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
              >
                {n}
              </button>
            ))}
          </div>
          <Link href="/games" className="block text-center text-sm text-muted underline hover:text-foreground">Cancel</Link>
        </div>
      </div>
    );
  }

  // ----- 2-player format picker (D-37) -----
  if (playerCount === 2 && formatChoice === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="format-pick-title">
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="format-pick-title" className="text-xl font-bold text-foreground mb-4">Pick a format</h2>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {TWO_PLAYER_FORMAT_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormatChoice(f);
                  if (f === 'COMMANDER' || f === 'BRAWL') {
                    setVariant(f);
                  }
                }}
                className="py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
              >
                {FORMAT_LABELS[f]}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => setPlayerCount(null)} className="text-muted underline hover:text-foreground">Back</button>
            <Link href="/games" className="text-muted underline hover:text-foreground">Cancel</Link>
          </div>
        </div>
      </div>
    );
  }

  // ----- 2-player best-of picker (only for BEST_OF_FORMATS) -----
  if (playerCount === 2 && formatChoice != null && BEST_OF_FORMATS.has(formatChoice) && bestOf === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="best-of-title">
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="best-of-title" className="text-xl font-bold text-foreground mb-4">Best of?</h2>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {([1, 3, 5] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { setBestOf(n); setVariant(formatChoice); }}
                className="py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
              >
                Bo{n}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => setFormatChoice(null)} className="text-muted underline hover:text-foreground">Back</button>
            <Link href="/games" className="text-muted underline hover:text-foreground">Cancel</Link>
          </div>
        </div>
      </div>
    );
  }

  // ----- 5/6-7-8 player Star/King Y/N (unchanged) -----
  if (variant === null) {
    const q = variantQuestionForCount(playerCount);
    if (q === null) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-labelledby="variant-title">
        <div className="bg-surface border border-border rounded-lg p-8 max-w-md w-full mx-4 shadow-xl">
          <h2 id="variant-title" className="text-xl font-bold text-foreground mb-4">{q.label}</h2>
          <div className="flex gap-3 mb-4">
            <button type="button" onClick={() => setVariant(q.variantOnYes)} className="flex-1 py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]">Yes</button>
            <button type="button" onClick={() => setVariant('COMMANDER')} className="flex-1 py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]">No</button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <button type="button" onClick={() => setPlayerCount(null)} className="text-muted underline hover:text-foreground">Back</button>
            <Link href="/games" className="text-muted underline hover:text-foreground">Cancel</Link>
          </div>
        </div>
      </div>
    );
  }

  // ----- Form -----
  const headerSuffix = variant === 'COMMANDER'
    ? ''
    : ` (${FORMAT_LABELS[variant]}${bestOf ? ` Bo${bestOf}` : ''})`;

  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">
        Log a {playerCount}-player game{headerSuffix}
      </h1>
      <GameForm
        playerCount={playerCount}
        variant={variant}
        bestOf={bestOf}
        onSubmit={handleSubmit}
        submitLabel="Save game"
      />
    </main>
  );
}
```

- [ ] **Step 2: Run tsc**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run jest**

Run: `npx jest`
Expected: only baseline `tests/cron-sync.test.ts` failing. No regressions in `tests/games-api.test.ts`, `tests/games-notify.test.ts`, `tests/game-form.test.ts`, `tests/games-filter.test.ts`, `tests/stats.test.ts`, `tests/gameVariants.test.ts`, `tests/gameDisplay.test.ts`, `tests/notifyMessage.test.ts`, `tests/validators.test.ts`, `tests/gameFormats.test.ts`.

- [ ] **Step 4: Manual smoke test in the browser**

Start the dev server: `npm run dev`

Navigate through each path and verify the UI:
1. `/games/new` → 2 players → Pick format modal appears with 8 buttons.
2. Pick **Commander** → form opens immediately (no best-of modal). Player count locked at 2, no Random pre-check.
3. Back; pick **Brawl** → form opens immediately. Row 2 has Random pre-checked.
4. Back; pick **Standard** → Best of? modal with Bo1/Bo3/Bo5. Pick **Bo3** → form opens. Row 2 has Random pre-checked. Header reads "Log a 2-player game (Standard Bo3)". Replace "Won by combo" checkbox with "Combo wins: 0/1/2" select.
5. Fill in players + decks, set combo wins to 2, submit. Confirm POST succeeds, Discord modal appears.
6. Go to `/games` → new row appears with `[Standard] [Bo3]` chips. Expand the row → shows "Combo wins: 2/2".
7. Apply the Format filter; pick Standard only → only the Bo3 row shows. Add Commander → both show.
8. Pick **Cube** with **Bo5**, set combo wins to 1, submit. Notify Discord. Inspect the Discord webhook payload (logs or actual channel) → confirms "New Cube (Bo5) game added! ... winning 1 game with combos."
9. Pick a 4-player game → still defaults to COMMANDER, no chooser.
10. Pick a 5-player game → still asks Star? Y/N.
11. Pick a 6-player game → still asks King? Y/N.

If any path breaks, fix in this task; do not advance to Task 9 with a broken UI.

**DO NOT COMMIT.** Hand off to Task 9.

---

## Task 9: Production migration + final consolidated commit

**Files:**
- Create: `.planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql` (gitignored — operator script)

This task is owned by the controller (you), not delegated to an implementer subagent. It runs the prod migration against Turso, then crafts the single consolidated commit covering Tasks 1-8.

- [ ] **Step 1: Write the prod migration script**

Create the directory if needed (`mkdir -p .planning/phases/06.5-multi-format-games`) and write `.planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql`:

```sql
-- Phase 06.5 prod migration — add bestOf + comboWins columns to games.
-- Frees no values; pure additive schema change.
-- Spec: docs/superpowers/specs/2026-05-24-multi-format-games-and-best-of-design.md
-- Apply via: turso db shell magic-scraper < .planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql

-- Pre-state: row count + confirm columns do not yet exist (PRAGMA query).
SELECT 'PRE-STATE' AS marker, COUNT(*) AS games_total FROM "games";
SELECT 'PRE-STATE-COLUMNS' AS marker, name FROM pragma_table_info('games') WHERE name IN ('bestOf', 'comboWins');

ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;

-- Post-state: verify columns exist and are null for all existing rows.
SELECT 'POST-STATE' AS marker,
       COUNT(*) AS games_total,
       SUM(CASE WHEN "bestOf" IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_bestOf,
       SUM(CASE WHEN "comboWins" IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_comboWins
FROM "games";

-- Hard guard: both counts should be 0.
SELECT 'GUARD-LEFTOVER-VALUES' AS marker,
       SUM(CASE WHEN "bestOf" IS NOT NULL THEN 1 ELSE 0 END)
       + SUM(CASE WHEN "comboWins" IS NOT NULL THEN 1 ELSE 0 END) AS unexpected_non_null
FROM "games";
```

- [ ] **Step 2: Apply prod migration to Turso**

Run: `turso db shell magic-scraper < .planning/phases/06.5-multi-format-games/06.5-01-PROD-MIGRATION.sql`

Expected output:
- PRE-STATE: `games_total` = current row count (51 as of spec-write).
- PRE-STATE-COLUMNS: returns zero rows (columns do not yet exist).
- POST-STATE: `games_total` unchanged, `rows_with_bestOf` = 0, `rows_with_comboWins` = 0.
- GUARD-LEFTOVER-VALUES: `unexpected_non_null` = 0.

If POST-STATE shows any non-null values, halt — investigate (someone else may have written test data between the schema being deployed and now). Do not commit until prod is in the expected state.

- [ ] **Step 3: Final `git status` review**

Run: `git status` and `git diff --stat`

Expected files modified or added:
- `prisma/schema.prisma`
- `prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql`
- `src/lib/gameFormats.ts` (new)
- `src/lib/gameVariants.ts`
- `src/lib/notifyMessage.ts`
- `src/lib/stats.ts`
- `src/lib/validators.ts`
- `src/app/api/games/route.ts`
- `src/app/api/games/[id]/route.ts`
- `src/app/api/games/[id]/notify/route.ts`
- `src/app/games/page.tsx`
- `src/app/games/new/page.tsx`
- `src/app/games/game-form.tsx`
- `tests/gameFormats.test.ts` (new)
- `tests/validators.test.ts`
- `tests/games-api.test.ts`
- `tests/games-notify.test.ts`
- `tests/notifyMessage.test.ts`
- `tests/games-filter.test.ts`
- `tests/game-form.test.ts`
- `tests/stats.test.ts`
- `tests/gameVariants.test.ts`
- `tests/gameDisplay.test.ts` (only fixture additions for `bestOf: null`/`comboWins: null` if needed)

The `.planning/...` script should NOT appear in `git status` (gitignored).

- [ ] **Step 4: Create the consolidated commit**

```bash
git add prisma/schema.prisma \
        prisma/migrations/20260524_add_best_of_and_combo_wins/migration.sql \
        src/lib/gameFormats.ts \
        src/lib/gameVariants.ts \
        src/lib/notifyMessage.ts \
        src/lib/stats.ts \
        src/lib/validators.ts \
        src/app/api/games/route.ts \
        src/app/api/games/[id]/route.ts \
        src/app/api/games/[id]/notify/route.ts \
        src/app/games/page.tsx \
        src/app/games/new/page.tsx \
        src/app/games/game-form.tsx \
        tests/

git commit -m "$(cat <<'EOF'
feat(games): add 2-player formats (Brawl, Standard, Pauper, Draft, Prerelease, Sealed, Cube) with best-of match tracking

- Variant taxonomy expands to 10 (4 Commander + 6 best-of). New `gameFormats.ts` is
  the single source of truth (ALL_FORMATS, COMMANDER_FORMATS, BEST_OF_FORMATS,
  FORMAT_LABELS, isCommanderFormat, requiresBestOf, maxComboWinsFor).
- Game model gains nullable bestOf + comboWins columns. Best-of formats require
  bestOf in {1,3,5} and comboWins in [0, ceil(bestOf/2)]; other variants must
  leave both null. Brawl is treated as a 2-player Commander format (no best-of)
  and participates in Commander stats; Standard/Pauper/Draft/Prerelease/Sealed/Cube
  are excluded.
- Stats compute functions gate input via isCommanderFormat — silent at the UI,
  enforced at every aggregator.
- New-game flow: 2-player picks open a Format modal (8 options); best-of formats
  then prompt Bo1/Bo3/Bo5. Player row 2 is auto-Random in all non-Commander
  2-player variants (MTGA default).
- Games tab: new Format multi-select filter, two-chip rendering for best-of
  games ([Format] [BoN]), expanded-row combo display switches to "Combo wins:
  N/M" for best-of.
- Discord templates extend: Brawl uses Commander shape with "Brawl" label;
  best-of Bo1 uses existing combo phrasing; Bo3/Bo5 use
  "winning N game(s) with combos" / "without combos" with "(BoN)" header
  parenthetical.

Prod migration applied to Turso (additive ALTER TABLE — zero existing rows
affected). No data backfill.

Spec: docs/superpowers/specs/2026-05-24-multi-format-games-and-best-of-design.md
Plan: docs/superpowers/plans/2026-05-24-multi-format-games-and-best-of.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Verify the commit**

Run: `git log --oneline -1 && git status -sb`
Expected: HEAD now points at the new commit; working tree contains only the pre-existing dirty `.planning/.continue-here.md`, `.gitignore`, etc. (carry-over state, not part of this change).

- [ ] **Step 6: Hand off to user for push**

Per the user's standing instruction (`never git push, always leave that to the user`), do NOT push. Report the commit SHA and let the user push.

---

## Final cross-cutting checklist

After Task 9, run one more end-to-end pass before declaring done:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npx jest` — only baseline `tests/cron-sync.test.ts` failing
- [ ] `npx prisma migrate status` — no pending migrations
- [ ] Manual: create a game in each of the new variants (Brawl, Standard Bo1/Bo3/Bo5, Cube Bo5), confirm display + Discord notify both render correctly
- [ ] Manual: confirm `/stats` still renders and that a freshly-added Standard game does NOT shift any stats numbers
