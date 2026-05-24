# Game Mode Badge + Discord Notification Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the DB variant value `STANDARD` → `COMMANDER`, add a Format badge column on the games list, surface multi-winner detail in the Winner cell (with KING-Royalty surfacing the King), and rewrite the Discord new-game notification with five variant-aware templates.

**Architecture:** A pure-helper-first approach. Two new pure modules (`src/lib/gameVariants.ts`, `src/lib/gameDisplay.ts`, `src/lib/notifyMessage.ts`) carry all the logic and are unit-tested in isolation. The games-list page composes the helpers into UI; the Discord route composes `buildNotifyMessage` and posts. The DB rename happens first as its own atomic task so subsequent tasks can use `'COMMANDER'` without churn.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma + Turso (SQLite), Zod, Jest + ts-jest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-23-game-mode-badge-and-discord-design.md`

**Prod DB:** Turso, name `magic-scraper`. Migration applied via `turso db shell magic-scraper < ...sql`.

**Pre-existing conventions to honor:**
- Path alias `@/` → `src/`.
- Jest config: `testMatch: '**/tests/**/*.test.ts'` (no `.tsx`, no jsdom). Pure helpers go in `src/lib/`; tests in `tests/`.
- LF line endings only. After any Edit/Write, verify with `file <path>` if there is any chance the file picked up CRLF (recurring environmental issue).
- NO COMMITS during subagent execution. Final commit(s) happen after all tasks pass review.
- Subagents must be Opus-only.

---

## File Structure

**New:**
- `src/lib/gameVariants.ts` — variant→{label, classes} lookup. Pure.
- `src/lib/gameDisplay.ts` — `getDisplayWinner(game)` helper. Pure.
- `src/lib/notifyMessage.ts` — `buildNotifyMessage(game, origin)` helper. Pure. Five templates.
- `tests/gameVariants.test.ts` — unit tests for `getVariantBadge`.
- `tests/gameDisplay.test.ts` — unit tests for `getDisplayWinner`.
- `tests/notifyMessage.test.ts` — unit tests for `buildNotifyMessage` (all five shapes + edges).
- `prisma/migrations/20260523_rename_standard_to_commander/migration.sql` — UPDATE statement.
- `.planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql` — prod migration with verification.

**Modified:**
- `prisma/schema.prisma:49` — `@default("COMMANDER")`.
- `src/lib/validators.ts` — `GAME_VARIANTS`, default value, error messages, `applyVariantInvariants` branch label.
- `src/app/api/games/[id]/route.ts:24` — `isGameVariant` accepts `'COMMANDER'`.
- `src/app/games/new/page.tsx` — `Exclude<GameVariant, 'STANDARD'>` → `Exclude<GameVariant, 'COMMANDER'>`; two `setVariant('STANDARD')` calls and one `variant !== 'STANDARD'` check updated.
- `src/app/games/game-form.tsx` — five `STANDARD` references updated.
- `src/app/games/page.tsx` — `Game` interface gains `variant: string`; `Participant` gains `role?: string | null`; insert `<th>Format</th>` between Date and Winner; render badge cell; replace Winner cell with `getDisplayWinner` output; `colSpan` 5 → 6.
- `src/app/api/games/[id]/notify/route.ts` — body replaced with `buildNotifyMessage` invocation; participants fetched include role (already included via `participants: true`).
- `tests/validators.test.ts` — 12 `STANDARD` literals → `COMMANDER`.
- `tests/games-api.test.ts` — 2 `STANDARD` literals → `COMMANDER`.
- `tests/game-form.test.ts` — 4 `STANDARD` literals → `COMMANDER`.
- `tests/games-notify.test.ts` — existing fixtures gain `variant: 'COMMANDER'` + `role: null` per participant; assertions updated to new `New Commander game added!` prefix; new tests added for STAR/KING shapes.
- `tests/games-filter.test.ts` — fixtures gain `variant` field (use `'COMMANDER'`).

---

## Task 1: Rename `STANDARD` → `COMMANDER` (DB value + code + tests)

**Goal:** Single-shot rename across schema, validators, route guard, all UI flow code, all tests. After this task: tsc clean, full test suite green, no `'STANDARD'` literal anywhere in `src/` or `tests/` or `prisma/`.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260523_rename_standard_to_commander/migration.sql`
- Modify: `src/lib/validators.ts`
- Modify: `src/app/api/games/[id]/route.ts`
- Modify: `src/app/games/new/page.tsx`
- Modify: `src/app/games/game-form.tsx`
- Modify: `tests/validators.test.ts`
- Modify: `tests/games-api.test.ts`
- Modify: `tests/game-form.test.ts`
- Modify: `tests/games-notify.test.ts` (just rename for now; new variant-aware tests come in T4)
- Modify: `tests/games-filter.test.ts` (add `variant: 'COMMANDER'` to fixtures since `Game` interface will require it in T2; pre-staging here avoids re-touching this file)

- [ ] **Step 1: Verify the starting state — no surprises.**

Run from repo root:
```bash
grep -rn "'STANDARD'\|\"STANDARD\"" src/ tests/ prisma/ | grep -v node_modules
```

Expected: matches in `src/lib/validators.ts`, `src/app/api/games/[id]/route.ts`, `src/app/games/new/page.tsx`, `src/app/games/game-form.tsx`, `tests/validators.test.ts`, `tests/games-api.test.ts`, `tests/game-form.test.ts`. No matches in `tests/games-filter.test.ts`, `tests/stats.test.ts`, `tests/games-notify.test.ts` (those don't reference variant literals at all currently).

- [ ] **Step 2: Update `prisma/schema.prisma`.**

Find line 49:
```prisma
  variant           String              @default("STANDARD")
```
Change to:
```prisma
  variant           String              @default("COMMANDER")
```

- [ ] **Step 3: Create the Prisma migration.**

Create `prisma/migrations/20260523_rename_standard_to_commander/migration.sql`:
```sql
-- Phase 06.4: rename game variant value 'STANDARD' -> 'COMMANDER'.
-- Frees 'STANDARD' for a future MTG-Standard 2-player format.
-- Spec: docs/superpowers/specs/2026-05-23-game-mode-badge-and-discord-design.md

UPDATE "games" SET "variant" = 'COMMANDER' WHERE "variant" = 'STANDARD';
```

(Schema `@default` change is metadata-only on SQLite. The validator's `.default('COMMANDER')` is what drives new-row defaults via the API.)

- [ ] **Step 4: Update `src/lib/validators.ts`.**

Replace line 6:
```ts
export const GAME_VARIANTS = ['STANDARD', 'STAR', 'KING'] as const;
```
with:
```ts
export const GAME_VARIANTS = ['COMMANDER', 'STAR', 'KING'] as const;
```

Replace the body of `applyVariantInvariants` for the STANDARD branch — the entire block:
```ts
  if (variant === 'STANDARD') {
    if (winnerCount !== 1) {
      return { ok: false, message: 'STANDARD game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'STANDARD game participants must not have roles' };
    }
    return { ok: true };
  }
```
becomes:
```ts
  if (variant === 'COMMANDER') {
    if (winnerCount !== 1) {
      return { ok: false, message: 'COMMANDER game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'COMMANDER game participants must not have roles' };
    }
    return { ok: true };
  }
```

Replace the create-schema default. Line 157-160 area:
```ts
// Create schema — sets variant (default STANDARD) and enforces invariants
// ...
  .extend({ variant: z.enum(GAME_VARIANTS).default('STANDARD') })
```
becomes:
```ts
// Create schema — sets variant (default COMMANDER) and enforces invariants
// ...
  .extend({ variant: z.enum(GAME_VARIANTS).default('COMMANDER') })
```

- [ ] **Step 5: Update `src/app/api/games/[id]/route.ts`.**

Line 24:
```ts
  return value === 'STANDARD' || value === 'STAR' || value === 'KING';
```
becomes:
```ts
  return value === 'COMMANDER' || value === 'STAR' || value === 'KING';
```

- [ ] **Step 6: Update `src/app/games/new/page.tsx`.**

Line 13:
```ts
  variantOnYes: Exclude<GameVariant, 'STANDARD'>;
```
→
```ts
  variantOnYes: Exclude<GameVariant, 'COMMANDER'>;
```

Line 143 — inside the `playerCount` click handler:
```ts
                    setVariant('STANDARD');
```
→
```ts
                    setVariant('COMMANDER');
```

Line 189 — the "No" button in the variant gate:
```ts
              onClick={() => setVariant('STANDARD')}
```
→
```ts
              onClick={() => setVariant('COMMANDER')}
```

Line 216 — header label:
```tsx
        Log a {playerCount}-player game{variant !== 'STANDARD' ? ` (${variant === 'STAR' ? 'Star' : 'King'} Commander)` : ''}
```
→
```tsx
        Log a {playerCount}-player game{variant !== 'COMMANDER' ? ` (${variant === 'STAR' ? 'Star' : 'King'} Commander)` : ''}
```

- [ ] **Step 7: Update `src/app/games/game-form.tsx`.**

There are five references. Update each:

Line 23 (comment):
```ts
  winnerIndex: number;                    // STANDARD only
```
→
```ts
  winnerIndex: number;                    // COMMANDER only
```

Line 99:
```ts
    if (state.variant === 'STANDARD') {
```
→
```ts
    if (state.variant === 'COMMANDER') {
```

Line 128:
```ts
    if (state.variant === 'STANDARD') {
```
→
```ts
    if (state.variant === 'COMMANDER') {
```

Line 182:
```ts
  const variant: GameVariant = game.variant ?? 'STANDARD';
```
→
```ts
  const variant: GameVariant = game.variant ?? 'COMMANDER';
```

Line 238 (default function argument):
```ts
  variant = 'STANDARD',
```
→
```ts
  variant = 'COMMANDER',
```

Line 417:
```tsx
            {state.variant === 'STANDARD' && (
```
→
```tsx
            {state.variant === 'COMMANDER' && (
```

- [ ] **Step 8: Update `tests/validators.test.ts`.**

There are 12 `STANDARD` occurrences. Replace each via the patterns below. Use Edit with `replace_all` on the literal strings where unique; for occurrences that are part of broader phrases (describe titles), do targeted edits.

Line 32:
```ts
    expect(GAME_VARIANTS).toEqual(['STANDARD', 'STAR', 'KING']);
```
→
```ts
    expect(GAME_VARIANTS).toEqual(['COMMANDER', 'STAR', 'KING']);
```

Describe-title and other-string updates:
- `describe('gameCreateSchema — STANDARD', ...)` → `describe('gameCreateSchema — COMMANDER', ...)`
- `it('accepts a 4-player STANDARD game with exactly one winner', ...)` → `'accepts a 4-player COMMANDER game with exactly one winner'`
- `if (res.success) expect(res.data.variant).toBe('STANDARD');` → `.toBe('COMMANDER')`
- `'rejects STANDARD with two winners'` → `'rejects COMMANDER with two winners'`
- `'rejects STANDARD with zero winners'` → `'rejects COMMANDER with zero winners'`
- `'rejects STANDARD when any participant has a role set'` → `'rejects COMMANDER when any participant has a role set'`
- `'accepts a STANDARD body against a STANDARD variant'` → `'accepts a COMMANDER body against a COMMANDER variant'`
- The `applyVariantInvariants(..., 'STANDARD')` call in that test → `'COMMANDER'`
- `'rejects a STANDARD body against a KING variant (wrong roles)'` → `'rejects a COMMANDER body against a KING variant (wrong roles)'`
- `'does NOT enforce STANDARD invariants (variant check happens in route, not schema)'` → `'does NOT enforce COMMANDER invariants (variant check happens in route, not schema)'`

Verify with: `grep -n "STANDARD" tests/validators.test.ts` → expected: no output.

Note: any test that asserted on the error message text (e.g. `'STANDARD game must have exactly one winner'`) must be updated to `'COMMANDER game must have exactly one winner'`. Scan with: `grep -n "STANDARD game" tests/validators.test.ts`.

- [ ] **Step 9: Update `tests/games-api.test.ts`.**

Lines 532 and 575:
```ts
    mockGameFindUnique.mockResolvedValue({ variant: 'STANDARD' });
```
→
```ts
    mockGameFindUnique.mockResolvedValue({ variant: 'COMMANDER' });
```

Verify with: `grep -n "STANDARD" tests/games-api.test.ts` → expected: no output.

- [ ] **Step 10: Update `tests/game-form.test.ts`.**

Lines 39, 352, 358 (literal payload/state values):
- `variant: 'STANDARD' as GameVariant` → `variant: 'COMMANDER' as GameVariant`
- `baseStateV('STANDARD', [...])` → `baseStateV('COMMANDER', [...])`
- `expect(result.payload.variant).toBe('STANDARD')` → `.toBe('COMMANDER')`

Line 350 (describe title):
- `describe('validateGameForm — STANDARD passthrough', ...)` → `describe('validateGameForm — COMMANDER passthrough', ...)`

Verify with: `grep -n "STANDARD" tests/game-form.test.ts` → expected: no output.

- [ ] **Step 11: Add `variant` + `role` to the `tests/games-notify.test.ts` baseGame fixture.**

The current `baseGame` fixture has no `variant`. The current route doesn't read `variant`, so this isn't tsc-required yet (the Prisma mock is loosely typed via `jest.fn()`). But T4 needs `variant` and per-participant `role` to be present at runtime. Add now to keep T4 focused on the new shape tests.

Find the `baseGame` definition (around line 59-85) and add `variant: 'COMMANDER',` to the object:
```ts
const baseGame = {
  id: 'g1',
  date: new Date('2026-04-10'),
  wonByCombo: false,
  notes: null,
  isImported: false,
  discordNotified: false,
  variant: 'COMMANDER',
  createdAt: new Date(),
  participants: [
    // ...
  ],
};
```

Also add `role: null,` and `isRandom: false,` to each participant object in that fixture (and the one inside the "uses fallback deck text" test override) — the helper reads both. Pre-existing test logic doesn't depend on these values.

Note: `tests/games-filter.test.ts` fixtures will need `variant` added in T2 Step 5 (atomically with the `Game` interface change). Do NOT touch it here.

- [ ] **Step 12: Regenerate Prisma client.**

Run:
```bash
npx prisma generate
```
Expected: "Generated Prisma Client" success message.

- [ ] **Step 13: tsc check.**

Run:
```bash
npx tsc --noEmit
```
Expected: zero errors.

If errors point to remaining `'STANDARD'` usage anywhere, fix them (the codebase grep in Step 1 should have caught everything, but if any new usage appears, treat it as a real gap and update).

- [ ] **Step 14: Run full test suite.**

Run:
```bash
npx jest
```
Expected: same baseline as before this task (T0 cron-sync test was the only pre-existing failure per project history). Every variant/games/notify/filter test passes.

If a previously-passing test now fails, the most likely cause is a missed string update. Re-grep for `STANDARD` across `src/` and `tests/`. The only acceptable post-T1 matches are in this plan, in `docs/`, in `.planning/`, or inside the migration files (the `'STANDARD'` literal in the new migration SQL is correct — that's the value we're updating from).

Verify cleanliness:
```bash
grep -rn "STANDARD" src/ tests/ prisma/schema.prisma 2>/dev/null | grep -v node_modules
```
Expected: matches only inside `prisma/migrations/20260523_rename_standard_to_commander/migration.sql` (the `WHERE "variant" = 'STANDARD'` clause).

- [ ] **Step 15: LF check on modified files.**

For each modified file, run:
```bash
file <path>
```
Expected: `ASCII text` (or `UTF-8 Unicode text`). If any file shows `with CRLF line terminators`, normalize:
```bash
tr -d '\r' < <path> > <path>.tmp && mv <path>.tmp <path>
```

Then re-run `npx tsc --noEmit` and `npx jest` to confirm no regression from the LF fix.

- [ ] **Step 16: Hand off — no commit.**

Per project convention: no commits during execution. Report task complete.

---

## Task 2: Variant badge helper + Format column on games list

**Goal:** A single source of truth for variant→display, plus a new "Format" column on the games table. Adding a future variant (Brawl, Draft, etc.) becomes a one-entry change.

**Files:**
- Create: `src/lib/gameVariants.ts`
- Create: `tests/gameVariants.test.ts`
- Modify: `src/app/games/page.tsx` (Game interface; table header; table body row; expanded-row colSpan)

- [ ] **Step 1: Write failing test for `getVariantBadge`.**

Create `tests/gameVariants.test.ts`:
```ts
import { getVariantBadge } from '../src/lib/gameVariants';

describe('getVariantBadge', () => {
  it('returns Commander label for COMMANDER', () => {
    const badge = getVariantBadge('COMMANDER');
    expect(badge.label).toBe('Commander');
    expect(badge.classes).toMatch(/bg-/);
    expect(badge.classes).toMatch(/text-/);
  });

  it('returns Star label for STAR', () => {
    const badge = getVariantBadge('STAR');
    expect(badge.label).toBe('Star');
    expect(badge.classes).toMatch(/yellow/);
  });

  it('returns King label for KING', () => {
    const badge = getVariantBadge('KING');
    expect(badge.label).toBe('King');
    expect(badge.classes).toMatch(/purple/);
  });

  it('falls back to COMMANDER for unknown variant', () => {
    const badge = getVariantBadge('SOMETHING_NEW');
    expect(badge.label).toBe('Commander');
  });

  it('accepts unknown values without throwing', () => {
    expect(() => getVariantBadge('')).not.toThrow();
    expect(() => getVariantBadge('definitely-unknown')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails.**

Run: `npx jest tests/gameVariants.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/gameVariants'`.

- [ ] **Step 3: Create `src/lib/gameVariants.ts`.**

```ts
export type GameVariantKey = 'COMMANDER' | 'STAR' | 'KING';

export interface VariantBadge {
  label: string;
  classes: string;
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

- [ ] **Step 4: Run test to confirm it passes.**

Run: `npx jest tests/gameVariants.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Update `Game` + `Participant` interfaces in `src/app/games/page.tsx`, then update `tests/games-filter.test.ts` fixtures atomically.**

Find the `Game` interface (lines 16-24):
```ts
interface Game {
  id: string;
  date: string;
  wonByCombo: boolean;
  isImported: boolean;
  notes: string | null;
  createdAt: string;
  participants: Participant[];
}
```
Add `variant: string` after `wonByCombo`:
```ts
interface Game {
  id: string;
  date: string;
  wonByCombo: boolean;
  variant: string;
  isImported: boolean;
  notes: string | null;
  createdAt: string;
  participants: Participant[];
}
```

Also update the `Participant` interface to include `role` (needed by T3 — pre-stage now since it's a one-line touch on the same file):
```ts
interface Participant {
  id: string;
  gameId: string;
  playerName: string;
  isWinner: boolean;
  isScrewed: boolean;
  isRandom: boolean;
  deckName: string | null;
  role?: string | null;
}
```

Immediately after the interface change, update `tests/games-filter.test.ts` fixtures so tsc stays green. Find every game-fixture object literal (search: `grep -n "participants:" tests/games-filter.test.ts`) and add `variant: 'COMMANDER',` adjacent to `wonByCombo` or `participants`. If a builder helper exists, update that one place; otherwise touch each literal individually. Verify with:
```bash
npx tsc --noEmit
```
Expected: zero errors. If tsc complains about any other missing field on game fixtures, add it with a sensible default (e.g. `role: null` per participant if `Participant` is the issue).

- [ ] **Step 6: Add the badge import in `src/app/games/page.tsx`.**

Near the top of the file, after the existing imports:
```ts
import { getVariantBadge } from '@/lib/gameVariants';
```

- [ ] **Step 7: Add the `<th>` to the table header.**

In `src/app/games/page.tsx` (around line 391), the header currently reads:
```tsx
            <tr className="border-b border-border text-left text-sm text-muted">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Winner</th>
              <th className="py-2 pr-4">Players</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Notes</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
```
Insert `<th className="py-2 pr-4">Format</th>` between Date and Winner:
```tsx
            <tr className="border-b border-border text-left text-sm text-muted">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Format</th>
              <th className="py-2 pr-4">Winner</th>
              <th className="py-2 pr-4">Players</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Notes</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
```

- [ ] **Step 8: Add the Format `<td>` in the row body.**

In the row mapping (around line 399-440), after the Date `<td>` and before the Winner `<td>`, insert:
```tsx
                    <td className="py-2 pr-4">
                      {(() => {
                        const badge = getVariantBadge(g.variant);
                        return (
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badge.classes}`}
                          >
                            {badge.label}
                          </span>
                        );
                      })()}
                    </td>
```

- [ ] **Step 9: Bump expanded-row `colSpan` from 5 to 6.**

Find (around line 443):
```tsx
                      <td colSpan={5} className="py-3 px-4">
```
→
```tsx
                      <td colSpan={6} className="py-3 px-4">
```

- [ ] **Step 10: tsc + tests.**

Run:
```bash
npx tsc --noEmit
npx jest
```
Expected: zero tsc errors. All tests pass (same baseline). T1's pre-staged fixture work ensured `games-filter.test.ts` already has `variant` on every game.

- [ ] **Step 11: LF check on modified/created files.**

`file src/lib/gameVariants.ts tests/gameVariants.test.ts src/app/games/page.tsx`
Fix any CRLF as in T1 Step 15.

- [ ] **Step 12: Hand off — no commit.**

---

## Task 3: `getDisplayWinner` + multi-winner Winner cell

**Goal:** Single winner renders unchanged; multi-winner renders `Alice (Atraxa) + 2 others`; KING-Royalty surfaces the KING as the primary; everything else uses alphabetical-first.

**Files:**
- Create: `src/lib/gameDisplay.ts`
- Create: `tests/gameDisplay.test.ts`
- Modify: `src/app/games/page.tsx` (replace the Winner `<td>` rendering, import the helper)

- [ ] **Step 1: Write failing tests for `getDisplayWinner`.**

Create `tests/gameDisplay.test.ts`:
```ts
import { getDisplayWinner } from '../src/lib/gameDisplay';
import type { Game, Participant } from '../src/app/games/page';

function mkP(over: Partial<Participant>): Participant {
  return {
    id: 'p-' + (over.playerName ?? 'x'),
    gameId: 'g1',
    playerName: 'X',
    isWinner: false,
    isScrewed: false,
    isRandom: false,
    deckName: null,
    role: null,
    ...over,
  };
}

function mkGame(over: Partial<Game>): Game {
  return {
    id: 'g1',
    date: '2026-05-23T00:00:00.000Z',
    wonByCombo: false,
    variant: 'COMMANDER',
    isImported: false,
    notes: null,
    createdAt: '2026-05-23T00:00:00.000Z',
    participants: [],
    ...over,
  };
}

describe('getDisplayWinner', () => {
  it('returns null for zero winners (defensive fallback)', () => {
    const g = mkGame({
      participants: [mkP({ playerName: 'A' }), mkP({ playerName: 'B' })],
    });
    expect(getDisplayWinner(g)).toBeNull();
  });

  it('returns the single winner with othersCount=0', () => {
    const g = mkGame({
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
    expect(out?.othersCount).toBe(0);
  });

  it('returns alphabetical-first for STAR multi-winner', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Charlie', isWinner: true, deckName: 'Kaalia' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
        mkP({ playerName: 'Dan' }),
        mkP({ playerName: 'Eve' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
    expect(out?.othersCount).toBe(1);
  });

  it('returns the KING participant for KING-Royalty win', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, role: 'SQUIRE', deckName: 'Atraxa' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Edric' }),
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: 'Voja' }),
        mkP({ playerName: 'Dan', isWinner: false, role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', isWinner: false, role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', isWinner: false, role: 'ASSASSIN' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Zelda');
    expect(out?.primary.role).toBe('KING');
    expect(out?.othersCount).toBe(2);
  });

  it('returns alphabetical-first for KING-Assassins win (no KING in winners)', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Alice', isWinner: false, role: 'KING' }),
        mkP({ playerName: 'Bob', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'ASSASSIN', deckName: 'Atraxa' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'ASSASSIN', deckName: 'Edric' }),
        mkP({ playerName: 'Dan', isWinner: true, role: 'ASSASSIN', deckName: 'Voja' }),
        mkP({ playerName: 'Eve', isWinner: false, role: 'SQUIRE' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Carol');
    expect(out?.othersCount).toBe(2);
  });

  it('is case-insensitive on alphabetical sort', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'bob', isWinner: true, deckName: 'X' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Y' }),
        mkP({ playerName: 'C' }),
        mkP({ playerName: 'D' }),
        mkP({ playerName: 'E' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail.**

Run: `npx jest tests/gameDisplay.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/gameDisplay'`.

- [ ] **Step 3: Create `src/lib/gameDisplay.ts`.**

```ts
import type { Game, Participant } from '@/app/games/page';

export function getDisplayWinner(
  game: Game
): { primary: Participant; othersCount: number } | null {
  const winners = game.participants.filter((p) => p.isWinner);
  if (winners.length === 0) return null;
  if (winners.length === 1) return { primary: winners[0], othersCount: 0 };

  if (game.variant === 'KING') {
    const king = winners.find((w) => w.role === 'KING');
    if (king) return { primary: king, othersCount: winners.length - 1 };
  }

  const sorted = [...winners].sort((a, b) =>
    a.playerName.toLowerCase().localeCompare(b.playerName.toLowerCase())
  );
  return { primary: sorted[0], othersCount: sorted.length - 1 };
}
```

- [ ] **Step 4: Run tests to confirm they pass.**

Run: `npx jest tests/gameDisplay.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Wire the helper into the Winner cell.**

In `src/app/games/page.tsx`, near the top imports:
```ts
import { getDisplayWinner } from '@/lib/gameDisplay';
```

Find the row body (around line 399-420). The current Winner-cell code:
```tsx
            {filteredGames.map((g) => {
              const winner = g.participants.find((p) => p.isWinner);
              return (
                <Fragment key={g.id}>
                  <tr
                    className="border-b border-border hover:bg-surface-hover cursor-pointer"
                    onClick={() => toggleExpanded(g.id)}
                  >
                    <td className="py-2 pr-4 text-sm text-foreground">{formatDate(g.date)}</td>
                    {/* (Format <td> from T2 inserted here) */}
                    <td className="py-2 pr-4 text-sm text-foreground">
                      {winner ? (
                        <>
                          {winner.playerName}
                          {winner.isRandom && (
                            <span aria-label="Random player (not counted toward deck stats)" title="Random (not counted toward deck stats)">*</span>
                          )}
                          {winner.deckName ? ` (${winner.deckName})` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
```

Replace the `const winner = g.participants.find(...)` line and the Winner-cell `<td>` with the helper-driven version:

```tsx
            {filteredGames.map((g) => {
              const displayWinner = getDisplayWinner(g);
              return (
                <Fragment key={g.id}>
                  <tr
                    className="border-b border-border hover:bg-surface-hover cursor-pointer"
                    onClick={() => toggleExpanded(g.id)}
                  >
                    <td className="py-2 pr-4 text-sm text-foreground">{formatDate(g.date)}</td>
                    {/* (Format <td> from T2 stays here) */}
                    <td className="py-2 pr-4 text-sm text-foreground">
                      {displayWinner ? (
                        <>
                          {displayWinner.primary.playerName}
                          {displayWinner.primary.isRandom && (
                            <span aria-label="Random player (not counted toward deck stats)" title="Random (not counted toward deck stats)">*</span>
                          )}
                          {displayWinner.primary.deckName ? ` (${displayWinner.primary.deckName})` : ''}
                          {displayWinner.othersCount > 0 && ` + ${displayWinner.othersCount} other${displayWinner.othersCount === 1 ? '' : 's'}`}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
```

- [ ] **Step 6: tsc + tests.**

Run:
```bash
npx tsc --noEmit
npx jest
```
Expected: zero tsc errors. All tests pass.

- [ ] **Step 7: LF check.**

`file src/lib/gameDisplay.ts tests/gameDisplay.test.ts src/app/games/page.tsx`
Fix any CRLF as before.

- [ ] **Step 8: Hand off — no commit.**

---

## Task 4: `buildNotifyMessage` helper + Discord route rewrite

**Goal:** Five variant-aware Discord templates. The route fetches the game (already does), runs `buildNotifyMessage`, posts. Logic lives in the helper for unit-testability.

**Files:**
- Create: `src/lib/notifyMessage.ts`
- Create: `tests/notifyMessage.test.ts`
- Modify: `src/app/api/games/[id]/notify/route.ts`
- Modify: `tests/games-notify.test.ts` (update existing assertions to new COMMANDER prefix; add four new variant-shape tests)

- [ ] **Step 1: Write failing tests for `buildNotifyMessage`.**

Create `tests/notifyMessage.test.ts`:
```ts
import { buildNotifyMessage, type GameForNotify } from '../src/lib/notifyMessage';

const ORIGIN = 'http://localhost:3000';

function mkP(over: Partial<GameForNotify['participants'][number]>): GameForNotify['participants'][number] {
  return {
    playerName: 'X',
    isWinner: false,
    isRandom: false,
    deckName: null,
    role: null,
    ...over,
  };
}

function mkGame(over: Partial<GameForNotify>): GameForNotify {
  return {
    variant: 'COMMANDER',
    wonByCombo: false,
    participants: [],
    ...over,
  };
}

describe('buildNotifyMessage — COMMANDER', () => {
  it('emits 1-winner message with deck and combo', () => {
    const g = mkGame({
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Alice won using Atraxa via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('falls back to "a deck they forgot to list" when winner has no deck', () => {
    const g = mkGame({
      participants: [mkP({ playerName: 'Alice', isWinner: true, deckName: null })],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Alice won using a deck they forgot to list without any combos. Check it out at http://localhost:3000/games'
    );
  });

  it('uses Random as display name for random winner but keeps real deck', () => {
    const g = mkGame({
      participants: [
        mkP({ playerName: 'Whoever', isWinner: true, isRandom: true, deckName: 'Edric' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Random won using Edric without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — STAR', () => {
  it('emits 1-winner message identical shape to COMMANDER but with Star prefix', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        ...Array(4).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice won using Atraxa without any combos. Check it out at http://localhost:3000/games'
    );
  });

  it('emits 2-winner "won together" message with both decks, alphabetical', () => {
    const g = mkGame({
      variant: 'STAR',
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, deckName: 'Edric' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        ...Array(3).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice (Atraxa) and Bob (Edric) won together via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('omits deck parenthetical for STAR-2 winners with no deck', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: null }),
        mkP({ playerName: 'Bob', isWinner: true, deckName: 'Edric' }),
        ...Array(3).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice and Bob (Edric) won together without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — KING Royalty', () => {
  it('lists KING first then squires alphabetical with role labels', () => {
    const g = mkGame({
      variant: 'KING',
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: 'Edric' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Atraxa' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'SQUIRE', deckName: 'Kaalia' }),
        mkP({ playerName: 'Dan', role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', role: 'ASSASSIN' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire, Edric), Carol (Squire, Kaalia) — via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('omits deck part when a royal winner has no deck', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: null }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Atraxa' }),
        mkP({ playerName: 'Dan', role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', role: 'ASSASSIN' }),
        mkP({ playerName: 'Gus', role: 'ASSASSIN' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire) — without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — KING Assassins', () => {
  it('lists assassins alphabetical with decks', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Zelda', isWinner: false, role: 'KING' }),
        mkP({ playerName: 'Alex', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Beth', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Dan', isWinner: true, role: 'ASSASSIN', deckName: 'Voja' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'ASSASSIN', deckName: 'Kaalia' }),
        mkP({ playerName: 'Eve', isWinner: true, role: 'ASSASSIN', deckName: 'Atraxa' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Assassins won — Carol (Kaalia), Dan (Voja), Eve (Atraxa) — without any combos. Check it out at http://localhost:3000/games'
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail.**

Run: `npx jest tests/notifyMessage.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/notifyMessage'`.

- [ ] **Step 3: Create `src/lib/notifyMessage.ts`.**

```ts
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

export function buildNotifyMessage(game: GameForNotify, origin: string): string {
  const winners = game.participants.filter((p) => p.isWinner);
  const combo = comboClause(game.wonByCombo);
  const tail = `Check it out at ${origin}/games`;

  if (game.variant === 'STAR') {
    if (winners.length === 1) {
      const w = winners[0];
      const deck = w.deckName && w.deckName.trim() !== '' ? w.deckName : NO_DECK_FALLBACK;
      return `New Star Commander game added! ${displayName(w)} won using ${deck} ${combo}. ${tail}`;
    }
    // 2+ winners
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    const joined =
      parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts.join(', ');
    return `New Star Commander game added! ${joined} won together ${combo}. ${tail}`;
  }

  if (game.variant === 'KING') {
    const isRoyalty = winners.some((w) => w.role === 'KING');
    if (isRoyalty) {
      const king = winners.find((w) => w.role === 'KING')!;
      const squires = alphabetical(winners.filter((w) => w.role !== 'KING'));
      const parts = [formatRoyaltyWinner(king), ...squires.map(formatRoyaltyWinner)];
      return `New King Commander game added! Royalty won — ${parts.join(', ')} — ${combo}. ${tail}`;
    }
    // Assassins
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    return `New King Commander game added! Assassins won — ${parts.join(', ')} — ${combo}. ${tail}`;
  }

  // COMMANDER (default)
  const w = winners[0];
  const deck = w?.deckName && w.deckName.trim() !== '' ? w.deckName : NO_DECK_FALLBACK;
  const name = w ? displayName(w) : 'Someone';
  return `New Commander game added! ${name} won using ${deck} ${combo}. ${tail}`;
}
```

- [ ] **Step 4: Run tests to confirm they pass.**

Run: `npx jest tests/notifyMessage.test.ts`
Expected: PASS — all eight tests pass.

If a test fails, the most likely culprits are: missing single-space before `via combo`/`without any combos`; wrong em-dash; wrong join separator on assassin list. Match the expected strings exactly.

- [ ] **Step 5: Rewrite `src/app/api/games/[id]/notify/route.ts`.**

Replace the existing imports + body that compose the message inline (lines 35-40) with the helper. The final file:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDiscordAlert } from '@/lib/discord';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildNotifyMessage } from '@/lib/notifyMessage';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
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
    const game = await prisma.game.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!game) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (game.discordNotified) {
      return NextResponse.json(
        { error: 'Notification already sent' },
        { status: 409 }
      );
    }
    const origin = new URL(request.url).origin;
    const message = buildNotifyMessage(
      {
        variant: game.variant,
        wonByCombo: game.wonByCombo,
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

    await sendDiscordAlert({ content: message });
    await prisma.game.update({
      where: { id },
      data: { discordNotified: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/games/[id]/notify error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Update `tests/games-notify.test.ts` assertions.**

The existing three success tests (`sends correct Discord message ...`, `uses fallback deck text ...`, `uses "without any combos" ...`) currently assert on the old message format. They must assert on the new COMMANDER prefix:

For "sends correct Discord message with winner name, deck, combo text and marks notified":
```ts
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Commander game added! Alice won using Atraxa via combo. Check it out at http://localhost:3000/games',
    });
```

For "uses fallback deck text":
```ts
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Commander game added! Alice won using a deck they forgot to list without any combos. Check it out at http://localhost:3000/games',
    });
```

For 'uses "without any combos" when wonByCombo is false':
```ts
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Commander game added! Alice won using Atraxa without any combos. Check it out at http://localhost:3000/games',
    });
```

- [ ] **Step 7: Add variant-shape integration tests in `tests/games-notify.test.ts`.**

After the existing tests but inside `describe('POST /api/games/[id]/notify', ...)`, add:

```ts
  it('sends STAR multi-winner message format', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'STAR',
      wonByCombo: true,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Bob', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Edric', role: null },
        { id: 'p2', gameId: 'g1', playerName: 'Alice', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: null },
        { id: 'p3', gameId: 'g1', playerName: 'C', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
        { id: 'p4', gameId: 'g1', playerName: 'D', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
        { id: 'p5', gameId: 'g1', playerName: 'E', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: null },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New Star Commander game added! Alice (Atraxa) and Bob (Edric) won together via combo. Check it out at http://localhost:3000/games',
    });
  });

  it('sends KING Royalty message with role labels and KING first', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'KING',
      wonByCombo: false,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Bob', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Edric', role: 'SQUIRE' },
        { id: 'p2', gameId: 'g1', playerName: 'Zelda', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: 'KING' },
        { id: 'p3', gameId: 'g1', playerName: 'Carol', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Kaalia', role: 'SQUIRE' },
        { id: 'p4', gameId: 'g1', playerName: 'Dan', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
        { id: 'p5', gameId: 'g1', playerName: 'Eve', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
        { id: 'p6', gameId: 'g1', playerName: 'Fred', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'ASSASSIN' },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire, Edric), Carol (Squire, Kaalia) — without any combos. Check it out at http://localhost:3000/games',
    });
  });

  it('sends KING Assassins message in alphabetical order', async () => {
    mockGameFindUnique.mockResolvedValue({
      ...baseGame,
      variant: 'KING',
      wonByCombo: true,
      participants: [
        { id: 'p1', gameId: 'g1', playerName: 'Zelda', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'KING' },
        { id: 'p2', gameId: 'g1', playerName: 'Alex', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'SQUIRE' },
        { id: 'p3', gameId: 'g1', playerName: 'Beth', isWinner: false, isScrewed: false, isRandom: false, deckName: null, role: 'SQUIRE' },
        { id: 'p4', gameId: 'g1', playerName: 'Dan', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Voja', role: 'ASSASSIN' },
        { id: 'p5', gameId: 'g1', playerName: 'Carol', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Kaalia', role: 'ASSASSIN' },
        { id: 'p6', gameId: 'g1', playerName: 'Eve', isWinner: true, isScrewed: false, isRandom: false, deckName: 'Atraxa', role: 'ASSASSIN' },
      ],
    });

    const res: any = await POST(makeRequest(), makeParams('g1'));

    expect(res.status).toBe(200);
    expect(mockSendDiscordAlert).toHaveBeenCalledWith({
      content:
        'New King Commander game added! Assassins won — Carol (Kaalia), Dan (Voja), Eve (Atraxa) — via combo. Check it out at http://localhost:3000/games',
    });
  });
```

- [ ] **Step 8: tsc + tests.**

Run:
```bash
npx tsc --noEmit
npx jest
```
Expected: zero tsc errors. All tests pass — including the new shape tests and the updated existing ones.

If the existing "uses fallback deck text" test fails, double-check that the helper's COMMANDER branch handles a missing deck via `NO_DECK_FALLBACK` rather than omitting the deck — STAR-2 and KING templates omit; COMMANDER 1-winner keeps the fallback (existing behaviour).

- [ ] **Step 9: LF check.**

`file src/lib/notifyMessage.ts tests/notifyMessage.test.ts src/app/api/games/[id]/notify/route.ts tests/games-notify.test.ts`
Fix any CRLF.

- [ ] **Step 10: Hand off — no commit.**

---

## Task 5: Prod migration + final integration + LF cleanup

**Goal:** Author the prod migration script, run the full suite once more end-to-end, fix any residual LF noise, and report ready-to-commit.

**Files:**
- Create: `.planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql`

- [ ] **Step 1: Create the phase directory and the prod migration script.**

```bash
mkdir -p .planning/phases/06.4-game-mode-badge
```

Create `.planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql`:
```sql
-- Phase 06.4 prod migration — rename Game.variant 'STANDARD' -> 'COMMANDER'.
-- Frees 'STANDARD' for a future MTG-Standard 2-player format.
-- Spec: docs/superpowers/specs/2026-05-23-game-mode-badge-and-discord-design.md

-- Pre-state: how many of each variant exist right now?
SELECT 'PRE-STATE' AS marker, variant, COUNT(*) AS count
FROM games
GROUP BY variant
ORDER BY variant;

BEGIN;

UPDATE games SET variant = 'COMMANDER' WHERE variant = 'STANDARD';

COMMIT;

-- Post-state: verify zero STANDARD rows remain.
SELECT 'POST-STATE' AS marker, variant, COUNT(*) AS count
FROM games
GROUP BY variant
ORDER BY variant;

-- Hard guard: this should return zero rows.
SELECT 'LEFTOVER-STANDARD-ROWS' AS marker, COUNT(*) AS count
FROM games
WHERE variant = 'STANDARD';
```

- [ ] **Step 2: Final tsc + jest sweep.**

```bash
npx tsc --noEmit
npx jest
```
Expected: zero tsc errors. Full suite green except the pre-existing cron-sync baseline failure (if it's still in the suite). Report exact pass/fail counts.

- [ ] **Step 3: Final repo-wide STANDARD audit.**

```bash
grep -rn "STANDARD" src/ tests/ prisma/ 2>/dev/null | grep -v node_modules
```
Expected: only matches inside `prisma/migrations/20260523_rename_standard_to_commander/migration.sql` (the WHERE clause references the old value, which is correct).

`docs/` and `.planning/` references to `STANDARD` in older specs/plans are fine — those are historical artifacts.

- [ ] **Step 4: Repo-wide LF audit on changed files.**

```bash
file \
  prisma/schema.prisma \
  prisma/migrations/20260523_rename_standard_to_commander/migration.sql \
  src/lib/validators.ts \
  src/lib/gameVariants.ts \
  src/lib/gameDisplay.ts \
  src/lib/notifyMessage.ts \
  src/app/api/games/[id]/route.ts \
  src/app/api/games/[id]/notify/route.ts \
  src/app/games/page.tsx \
  src/app/games/new/page.tsx \
  src/app/games/game-form.tsx \
  tests/validators.test.ts \
  tests/games-api.test.ts \
  tests/game-form.test.ts \
  tests/games-filter.test.ts \
  tests/games-notify.test.ts \
  tests/gameVariants.test.ts \
  tests/gameDisplay.test.ts \
  tests/notifyMessage.test.ts \
  .planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql
```
Expected: every line says `ASCII text` or `UTF-8 Unicode text` — none should say `CRLF`. If any do:
```bash
tr -d '\r' < <path> > <path>.tmp && mv <path>.tmp <path>
```

- [ ] **Step 5: Report.**

Report to the orchestrator:
- Full test results (pass/fail count + any unexpected failures).
- Files changed (paste the list above).
- Confirmation that LF + STANDARD audits are clean.
- Recommend single commit grouping. Recommended message:
  ```
  feat(games): variant badge + Discord rewrite, rename STANDARD→COMMANDER

  - Rename Game.variant 'STANDARD' to 'COMMANDER' (frees 'STANDARD' for future MTG-Standard 2p mode)
  - New Format column on games list (Commander/Star/King chip)
  - Multi-winner Winner cell ("Alice (Atraxa) + 2 others"; KING-Royalty surfaces the King)
  - Five variant-aware Discord notification templates with role labels
  - Helpers: src/lib/gameVariants.ts, src/lib/gameDisplay.ts, src/lib/notifyMessage.ts
  - Prisma + Turso prod migration: UPDATE games SET variant='COMMANDER' WHERE variant='STANDARD'

  Spec: docs/superpowers/specs/2026-05-23-game-mode-badge-and-discord-design.md
  ```
- Flag: prod migration script ready at `.planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql`; user runs `turso db shell magic-scraper < .planning/phases/06.4-game-mode-badge/06.4-01-PROD-MIGRATION.sql` and watches for `LEFTOVER-STANDARD-ROWS … 0` in output.

- [ ] **Step 6: Hand off — no commit.**

---

## Spec coverage check

| Spec section | Implemented in |
|---|---|
| D-25 (rename DB) | T1 entirely |
| D-26 (badge column) | T2 Steps 7-9 |
| D-27 (variant lookup helper) | T2 Steps 1-4 |
| D-28 (multi-winner cell) | T3 |
| D-29 (variant Discord templates) | T4 |
| D-30 (no-winner enforcement) | No new code — already enforced by validator; defensive `null` branch retained in `getDisplayWinner` (T3 Step 1 test asserts) |
| A. Data model rename | T1 |
| B. Format badge UI | T2 |
| C. Multi-winner Winner cell | T3 |
| D. Discord notification | T4 |
| E. Tests | All test files updated in T1; new test files in T2/T3/T4 |
| F. Migration plan | T1 Step 3 (Prisma) + T5 Step 1 (prod SQL) |
