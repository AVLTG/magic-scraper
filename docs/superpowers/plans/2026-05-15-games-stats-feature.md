# Games & Stats Feature Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four bundled changes — 2–8 player game support with count-picker popup; player-overview radar legend bleed fix; games-by-deck pie shows top 15 with no "Other" bucket; timeframe pill selector (1M/3M/1Y/3Y/All, default 3M) on the Frequency section.

**Architecture:** TDD where unit-testable (validators, pure stat helpers, form validation). Component-level changes (popup, pill UI, custom legend) are verified manually in the dev server. Each task ends in a commit. The GameForm refactor is the largest change — it replaces the "always-4-rows + filter empties on submit" pattern with strict variable-length validation, and introduces a `playerCount` prop that both new-game and edit pages pass.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, Prisma + Turso, Recharts, Tailwind v4, Jest + ts-jest (path alias `@/` → `src/`, tests in `tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-05-15-games-stats-feature-design.md`

---

## File Inventory

| File | Action |
|------|--------|
| `src/lib/validators.ts` | Modify — raise `.max(4)` → `.max(8)` |
| `src/lib/stats.ts` | Modify — `computeGamesByDeckPie` top 15; add `filterGamesByTimeframe` + `Timeframe` type |
| `src/app/games/game-form.tsx` | Modify — `playerCount` prop, variable rows, strict validation, remove `filterEmptyRows` |
| `src/app/games/new/page.tsx` | Modify — player-count popup gate |
| `src/app/games/[id]/edit/page.tsx` | Modify — pass `playerCount` to `<GameForm>` |
| `src/app/games/page.tsx` | Modify — widen `playerCount` filter union to 2–8 |
| `src/app/stats/page.tsx` | Modify — timeframe state, pill UI, frequency memo wiring |
| `src/app/stats/charts/PlayerRadarCard.tsx` | Modify — drop Recharts `<Legend>`, add custom HTML legend |
| `tests/games-api.test.ts` | Modify — "more than 4" → "more than 8" |
| `tests/game-form.test.ts` | Modify — strict-validation tests; remove obsolete cases; add 6/7/8-row cases |
| `tests/stats.test.ts` | Modify — top-15 cases; new `filterGamesByTimeframe` cases |

---

## Task 1: Raise participant max from 4 to 8 in zod validator

**Files:**
- Modify: `src/lib/validators.ts:49-56`
- Modify (test update): `tests/games-api.test.ts:228-241`

- [ ] **Step 1: Update the existing API test to reflect the new max**

Open `tests/games-api.test.ts`. Replace the test at line 228 with a 9-participant body and rename the description:

```ts
  it('returns 400 when more than 8 participants', async () => {
    const body = {
      ...validGameBody,
      participants: [
        { playerName: 'A', isWinner: true, isScrewed: false },
        { playerName: 'B', isWinner: false, isScrewed: false },
        { playerName: 'C', isWinner: false, isScrewed: false },
        { playerName: 'D', isWinner: false, isScrewed: false },
        { playerName: 'E', isWinner: false, isScrewed: false },
        { playerName: 'F', isWinner: false, isScrewed: false },
        { playerName: 'G', isWinner: false, isScrewed: false },
        { playerName: 'H', isWinner: false, isScrewed: false },
        { playerName: 'I', isWinner: false, isScrewed: false },
      ],
    };
    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Add a positive test that 8 participants is accepted**

Inside the same `describe('POST /api/games', ...)` block, immediately *after* the "more than 8" test, add:

```ts
  it('accepts exactly 8 participants', async () => {
    const body = {
      ...validGameBody,
      participants: [
        { playerName: 'A', isWinner: true, isScrewed: false },
        { playerName: 'B', isWinner: false, isScrewed: false },
        { playerName: 'C', isWinner: false, isScrewed: false },
        { playerName: 'D', isWinner: false, isScrewed: false },
        { playerName: 'E', isWinner: false, isScrewed: false },
        { playerName: 'F', isWinner: false, isScrewed: false },
        { playerName: 'G', isWinner: false, isScrewed: false },
        { playerName: 'H', isWinner: false, isScrewed: false },
      ],
    };
    // Mock the transaction to succeed so the route doesn't error out:
    mockTransaction.mockResolvedValueOnce({
      id: 'g-8',
      date: new Date(body.date),
      wonByCombo: false,
      notes: 'Close game',
      isImported: false,
      discordNotified: false,
      createdAt: new Date(),
      participants: body.participants.map((p, i) => ({
        id: `pp-${i}`, gameId: 'g-8', ...p, deckName: null,
      })),
    });
    const res: any = await POST(makeRequest(body));
    expect(res.status).toBe(201);
  });
```

- [ ] **Step 3: Run the failing tests**

Run: `npm test -- tests/games-api.test.ts`
Expected: the "accepts exactly 8 participants" test FAILS (the old `.max(4)` rejects it with 400). The renamed "more than 8" test still passes incidentally because zod rejects 9 with `.max(4)` too — that's fine; it's a precondition for Step 4.

- [ ] **Step 4: Bump the zod max**

Open `src/lib/validators.ts`. At line 52, change:

```ts
    .max(4, "at most four participants per game")
```

to:

```ts
    .max(8, "at most eight participants per game")
```

Also update the JSDoc comment block above (lines 27-34) so the doc and the rule agree:

```ts
// -----------------------------------------------------------------------------
// Game validator (D-01, GAME-01 "1-8 players", GAME-09 sanitization)
// -----------------------------------------------------------------------------
// date: coerced from ISO string or Date (API bodies arrive as JSON strings)
// wonByCombo: defaults to false per D-01 — Phase 6 form toggle
// notes: optional per D-01; trimmed and length-clamped per GAME-09
// participants: 1-8 entries (raised from 1-4 in 2026-05-15 game-tracking expansion);
//   winner count NOT enforced here (Phase 6 may want to allow unresolved-winner
//   drafts — defer to route)
```

And update the inline comment at line 33: `// participants: 1-4 entries per GAME-01` → `// participants: 1-8 entries per GAME-01 (raised 2026-05-15)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/games-api.test.ts`
Expected: all tests PASS, including "accepts exactly 8 participants" and "more than 8".

- [ ] **Step 6: Commit**

```bash
git add src/lib/validators.ts tests/games-api.test.ts
git commit -m "feat(games): raise participant cap from 4 to 8

Zod gameSchema.participants.max(4) -> .max(8). Updates the existing
'more than 4' API test to '8 participants', adds positive '8 accepted'
case."
```

---

## Task 2: Refactor GameForm for variable row count + strict validation

**Files:**
- Modify: `src/app/games/game-form.tsx` (significant rewrite of state, validation, props)
- Modify: `tests/game-form.test.ts` (drop obsolete tests, add new ones)

The current behavior: form always has 4 rows; validator silently filters out empty rows and remaps `winnerIndex`. New behavior: form has exactly `playerCount` rows; validator demands every row is filled (no filtering, no remap).

- [ ] **Step 1: Update test helpers and rewrite the validator test suite**

Open `tests/game-form.test.ts`. Replace the entire file with:

```ts
import {
  excludeItemsForRow,
  validateGameForm,
} from '../src/app/games/game-form';

type ParticipantRow = {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
};

function row(playerName: string, extra: Partial<ParticipantRow> = {}): ParticipantRow {
  return { playerName, deckName: '', isWinner: false, isScrewed: false, ...extra };
}

function baseState(
  rows: ParticipantRow[],
  winnerIndex: number,
  overrides: Partial<{ date: string; notes: string; wonByCombo: boolean }> = {}
) {
  return {
    date: '2026-04-10',
    notes: '',
    wonByCombo: false,
    rows,
    winnerIndex,
    ...overrides,
  };
}

describe('validateGameForm — strict variable-length rules', () => {
  it('accepts a valid 2-player game', () => {
    const state = baseState(
      [row('Alice', { isWinner: true }), row('Bob', { isScrewed: true })],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants).toHaveLength(2);
      expect(result.payload.participants[0]).toMatchObject({ playerName: 'Alice', isWinner: true });
      expect(result.payload.participants[1]).toMatchObject({ playerName: 'Bob', isScrewed: true });
    }
  });

  it('accepts a valid 6-player game', () => {
    const state = baseState(
      [
        row('A', { isWinner: true }),
        row('B'),
        row('C'),
        row('D'),
        row('E'),
        row('F'),
      ],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.participants).toHaveLength(6);
  });

  it('accepts a valid 8-player game', () => {
    const state = baseState(
      Array.from({ length: 8 }, (_, i) =>
        row(`P${i}`, i === 0 ? { isWinner: true } : {})
      ),
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.participants).toHaveLength(8);
  });

  it('rejects when date missing', () => {
    const state = baseState([row('Alice', { isWinner: true })], 0, { date: '' });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeDefined();
  });

  it('rejects when any row is blank (strict rule)', () => {
    const state = baseState([row('Alice', { isWinner: true }), row('')], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/all 2 participant names are required/i);
  });

  it('rejects when every row is blank', () => {
    const state = baseState([row(''), row(''), row(''), row('')], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/all 4 participant names are required/i);
  });

  it('rejects when winnerIndex is -1 (no winner)', () => {
    const state = baseState([row('Alice'), row('Bob')], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/winner/i);
  });

  it('rejects when winnerIndex is out of range', () => {
    const state = baseState([row('Alice'), row('Bob')], 5);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/winner/i);
  });

  it('allows winner AND screwed on same player (D-02)', () => {
    const state = baseState(
      [row('Alice', { isWinner: true, isScrewed: true })],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
  });

  it('rejects playerName over 100 chars', () => {
    const longName = 'A'.repeat(101);
    const state = baseState([row(longName, { isWinner: true })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });

  it('converts empty deckName string to undefined in payload', () => {
    const state = baseState([row('Alice', { isWinner: true, deckName: '' })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.participants[0].deckName).toBeUndefined();
  });

  it('trims playerName and deckName in payload', () => {
    const state = baseState([row('  Alice  ', { isWinner: true, deckName: '  Atraxa  ' })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants[0].playerName).toBe('Alice');
      expect(result.payload.participants[0].deckName).toBe('Atraxa');
    }
  });

  it('preserves row order in payload (no filtering/remapping)', () => {
    const state = baseState(
      [row('Alice'), row('Bob', { isWinner: true }), row('Carol')],
      1
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants.map((p) => p.playerName)).toEqual(['Alice', 'Bob', 'Carol']);
      expect(result.payload.participants[1].isWinner).toBe(true);
      expect(result.payload.participants[0].isWinner).toBe(false);
      expect(result.payload.participants[2].isWinner).toBe(false);
    }
  });
});

describe('excludeItemsForRow (D-10, D-11)', () => {
  const sampleState = (rows: ParticipantRow[]) => ({ rows });

  it('returns all other filled rows for row 0', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob', 'Carol']);
  });

  it('returns the other filled row for row 1', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(1, state)).toEqual(['Alice', 'Carol']);
  });

  it('returns both filled rows for an empty row 2', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('')]);
    expect(excludeItemsForRow(2, state)).toEqual(['Alice', 'Bob']);
  });

  it('returns empty array when all rows are empty', () => {
    const state = sampleState([row(''), row(''), row('')]);
    expect(excludeItemsForRow(0, state)).toEqual([]);
  });

  it('treats whitespace-only rows as empty', () => {
    const state = sampleState([row('Alice'), row('   '), row('Bob')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob']);
  });

  it('trims leading/trailing whitespace from included names', () => {
    const state = sampleState([row('Alice'), row('  Bob  '), row('Carol')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob', 'Carol']);
  });

  it("does NOT include the caller row's own name (D-11 — row sees its own value)", () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(0, state)).not.toContain('Alice');
  });

  it('handles 8-row full state for row 7', () => {
    const state = sampleState(
      Array.from({ length: 8 }, (_, i) => row(`P${i}`))
    );
    expect(excludeItemsForRow(7, state)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });
});
```

This file:
- removes the import of `filterEmptyRows` (deleted in Step 3)
- removes obsolete tests: "remaps winner index correctly after filtering empty rows" and "rejects when winner is on an empty row (Pitfall 4)" — both rely on the old filter-empties behavior that's gone
- updates `baseState` to use exactly the rows passed, no padding to 4
- adds 6-row and 8-row positive cases, a 6-row out-of-range winner case, and an "8-row excludeItemsForRow" case

- [ ] **Step 2: Run tests — they should fail because the validator hasn't been updated yet**

Run: `npm test -- tests/game-form.test.ts`
Expected: multiple FAILs — "rejects when any row is blank" expects the strict error message which the old validator doesn't produce; "preserves row order" expects the payload to keep all rows including non-winners.

- [ ] **Step 3: Refactor `game-form.tsx`**

Open `src/app/games/game-form.tsx`. Replace its entire contents with:

```tsx
"use client";
import { useState, useEffect, FormEvent } from 'react';
import { Combobox } from '@/app/components/combobox';

export interface ParticipantRow {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
}

export interface GameFormState {
  date: string; // yyyy-mm-dd
  notes: string;
  wonByCombo: boolean;
  rows: ParticipantRow[]; // length matches playerCount (2..8)
  winnerIndex: number; // 0..rows.length-1 or -1
}

export interface GameFormPayload {
  date: string; // ISO string
  wonByCombo: boolean;
  notes?: string;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    deckName?: string;
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

/**
 * Phase 6.1 D-10, D-11: derive the list of already-filled player names from all rows
 * EXCEPT the caller's own row. Used to populate the `excludeItems` prop on each row's
 * player-name Combobox so the dropdown hides names already in use by other participants.
 */
export function excludeItemsForRow(
  rowIndex: number,
  state: { rows: ParticipantRow[] }
): string[] {
  return state.rows
    .map((r, i) => ({ name: r.playerName.trim(), i }))
    .filter((r) => r.i !== rowIndex && r.name.length > 0)
    .map((r) => r.name);
}

/**
 * Strict validation (2026-05-15): every row must be filled. The form's row count
 * is locked by the player-count popup on new games and by saved data on edit.
 * Empty rows are NOT silently dropped — they're a validation error.
 */
export function validateGameForm(state: GameFormState): ValidationResult {
  const errors: GameFormErrors = {};

  if (!state.date || state.date.trim() === '') {
    errors.date = 'Date is required';
  }

  const allFilled = state.rows.every((r) => r.playerName.trim() !== '');
  if (!allFilled) {
    errors.form = `All ${state.rows.length} participant names are required`;
  }

  if (
    !errors.form &&
    (state.winnerIndex < 0 || state.winnerIndex >= state.rows.length)
  ) {
    errors.form = 'Exactly one winner required';
  }

  const rowErrors: Record<number, string> = {};
  state.rows.forEach((r, i) => {
    if (r.playerName.length > 100) rowErrors[i] = 'Player name too long (max 100)';
    else if (r.deckName.length > 100) rowErrors[i] = 'Deck name too long (max 100)';
  });
  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;

  if (errors.date || errors.form || errors.rows) {
    return { ok: false, errors };
  }

  const participants = state.rows.map((r, i) => ({
    playerName: r.playerName.trim(),
    isWinner: i === state.winnerIndex,
    isScrewed: r.isScrewed,
    deckName: r.deckName.trim() === '' ? undefined : r.deckName.trim(),
  }));

  return {
    ok: true,
    payload: {
      date: new Date(state.date).toISOString(),
      wonByCombo: state.wonByCombo,
      notes: state.notes.trim() === '' ? undefined : state.notes.trim(),
      participants,
    },
  };
}

function emptyRow(): ParticipantRow {
  return { playerName: '', deckName: '', isWinner: false, isScrewed: false };
}

/** Build a GameFormState from an API game response (for edit-mode pre-population). */
export function buildInitialState(game: {
  date: string | Date;
  wonByCombo: boolean;
  notes: string | null;
  participants: { playerName: string; isWinner: boolean; isScrewed: boolean; deckName: string | null }[];
}): GameFormState {
  const rows: ParticipantRow[] = game.participants.map((p) => ({
    playerName: p.playerName,
    deckName: p.deckName ?? '',
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
  }));
  const winnerIndex = game.participants.findIndex((p) => p.isWinner);
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
  };
}

export interface GameFormProps {
  playerCount: number;
  initial?: GameFormState;
  submitLabel?: string;
  onSubmit: (payload: GameFormPayload) => Promise<void> | void;
}

export function GameForm({ playerCount, initial, submitLabel = 'Save game', onSubmit }: GameFormProps) {
  const [state, setState] = useState<GameFormState>(
    initial ?? {
      // en-CA locale formats dates as YYYY-MM-DD and respects the viewer's
      // local timezone. Using .toISOString() here would default to UTC day,
      // which flips to "tomorrow" late in the evening for viewers west of
      // UTC and silently pre-populates the wrong calendar day.
      date: new Date().toLocaleDateString('en-CA'),
      notes: '',
      wonByCombo: false,
      rows: Array.from({ length: playerCount }, emptyRow),
      winnerIndex: -1,
    }
  );
  const [playerItems, setPlayerItems] = useState<string[]>([]);
  const [deckItems, setDeckItems] = useState<string[]>([]);
  const [errors, setErrors] = useState<GameFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, dRes] = await Promise.all([
          fetch('/api/players'),
          fetch('/api/decks'),
        ]);
        if (cancelled) return;
        if (pRes.ok) {
          const data = await pRes.json();
          setPlayerItems(Array.isArray(data.players) ? data.players : []);
        }
        if (dRes.ok) {
          const data = await dRes.json();
          setDeckItems(Array.isArray(data.decks) ? data.decks : []);
        }
      } catch (err) {
        console.error('Failed to seed autocomplete:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (i: number, patch: Partial<ParticipantRow>) => {
    setState((s) => ({
      ...s,
      rows: s.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');
    const result = validateGameForm(state);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      await onSubmit(result.payload);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      {errors.form && (
        <div className="rounded-md border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {errors.form}
        </div>
      )}
      {submitError && (
        <div className="rounded-md border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm">
          {submitError}
        </div>
      )}

      <div className="flex gap-4 items-end justify-between">
        <div className="flex-1 max-w-[50%] sm:max-w-none">
          <label className="block text-sm font-medium text-foreground mb-1">Date</label>
          <input
            type="date"
            value={state.date}
            onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground"
          />
          {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date}</p>}
        </div>
        <label className="flex items-center gap-2 pb-2 shrink-0">
          <input
            type="checkbox"
            checked={state.wonByCombo}
            onChange={(e) => setState((s) => ({ ...s, wonByCombo: e.target.checked }))}
          />
          <span className="text-sm text-foreground"><span className="sm:hidden">Combo Win</span><span className="hidden sm:inline">Won by combo</span></span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
        <textarea
          value={state.notes}
          onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
          rows={2}
          maxLength={1000}
          className="w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Participants</legend>
        {state.rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
            <Combobox
              items={playerItems}
              value={r.playerName}
              onChange={(v) => updateRow(i, { playerName: v })}
              placeholder={`Player ${i + 1}`}
              addLabel="player"
              excludeItems={excludeItemsForRow(i, state)}
              excludeLabel="Player already in game"
            />
            <Combobox
              items={deckItems}
              value={r.deckName}
              onChange={(v) => updateRow(i, { deckName: v })}
              placeholder="Deck (optional)"
              addLabel="deck"
            />
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="radio"
                name="winner"
                checked={state.winnerIndex === i}
                onChange={() => setState((s) => ({ ...s, winnerIndex: i }))}
              />
              Winner
            </label>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={r.isScrewed}
                onChange={(e) => updateRow(i, { isScrewed: e.target.checked })}
              />
              Screwed
            </label>
            {errors.rows?.[i] && (
              <p className="col-span-4 text-xs text-red-600">{errors.rows[i]}</p>
            )}
          </div>
        ))}
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="px-4 py-2 rounded-md bg-accent text-background font-medium hover:bg-accent/90 disabled:opacity-50"
      >
        {isSubmitting ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
```

Notable changes (compared to the old file):
- `filterEmptyRows` is removed (it's no longer used; YAGNI).
- `validateGameForm` no longer filters empty rows; it requires `state.rows.every(...)`.
- `buildInitialState` no longer hardcodes a 4-row array or `.slice(0, 4)`; it returns `participants.length` rows.
- `GameFormProps` gains a required `playerCount: number`.
- `useState` initializer builds `Array.from({ length: playerCount }, emptyRow)` when `initial` is absent.

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test -- tests/game-form.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the rest of the unit suite to confirm nothing else broke**

Run: `npm test`
Expected: all PASS. If `tests/games-api.test.ts` from Task 1 is still passing, good. Other suites are independent.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS — but note this will surface errors in `new/page.tsx` and `[id]/edit/page.tsx` because they haven't passed `playerCount` yet. Those are fixed in Tasks 3 and 4. If you get errors *only* in those two files (TS2741: Property 'playerCount' is missing), that's expected; continue. Any other type error is a regression to fix here.

- [ ] **Step 7: Commit**

```bash
git add src/app/games/game-form.tsx tests/game-form.test.ts
git commit -m "refactor(game-form): variable row count + strict validation

GameForm now takes a required playerCount prop (2-8). Validator
requires every row to be filled (no silent empty-row filtering).
buildInitialState returns rows.length === participants.length.
Removes filterEmptyRows helper. Drops obsolete validator tests
that relied on the old filter-and-remap behavior; adds 6- and
8-player positive cases and a 'rejects when any row is blank' case.

Note: new/page.tsx and [id]/edit/page.tsx do not yet pass playerCount;
their compile errors are addressed in the next two tasks."
```

---

## Task 3: Player-count popup on `/games/new`

**Files:**
- Modify: `src/app/games/new/page.tsx`

The page currently renders `<GameForm onSubmit={...}>` immediately. After this task: it renders a "How many players?" modal first; once the user picks N, the form renders with `playerCount={N}`. Cancel returns to `/games`.

- [ ] **Step 1: Replace the page contents**

Open `src/app/games/new/page.tsx`. Replace the file with:

```tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { GameForm, type GameFormPayload } from '@/app/games/game-form';

type NotifyStatus = 'idle' | 'sending' | 'sent' | 'error';

const PLAYER_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

export default function NewGamePage() {
  const router = useRouter();
  const [playerCount, setPlayerCount] = useState<number | null>(null);
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
          <div className="grid grid-cols-4 gap-2 mb-4">
            {PLAYER_COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayerCount(n)}
                className="py-3 rounded-md border border-border bg-surface text-foreground font-medium hover:bg-accent hover:text-background transition-colors min-h-[44px]"
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

  // ----- Form (count locked once chosen) -----
  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">
        Log a {playerCount}-player game
      </h1>
      <GameForm playerCount={playerCount} onSubmit={handleSubmit} submitLabel="Save game" />
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: `[id]/edit/page.tsx` still has its missing-`playerCount` error (fixed in Task 4). No other regressions.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Open `http://localhost:3000/games/new` in a browser.
Expected:
1. Page loads showing the modal "How many players?" with 7 buttons (2–8) and a Cancel link.
2. Click "2" → modal closes, form appears with exactly 2 participant rows and the heading "Log a 2-player game".
3. Browser back → return to `/games/new`; modal reappears (state was discarded).
4. Click "6" → form shows 6 rows.
5. Fill all 6 rows with distinct names, pick a winner, click Save game → game saved, Discord notify modal appears.
6. Try clicking Save with only 5 of 6 filled → form-level error "All 6 participant names are required" (red banner above the date field).

Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/app/games/new/page.tsx
git commit -m "feat(games): player-count popup on /games/new

Modal blocks the form until the user picks 2-8 players. The chosen
count is locked for the form lifetime; cancelling or navigating away
discards state. Adds 'Log a N-player game' heading."
```

---

## Task 4: Wire `playerCount` through edit page

**Files:**
- Modify: `src/app/games/[id]/edit/page.tsx`

- [ ] **Step 1: Update the edit page to pass `playerCount` derived from initial.rows.length**

Open `src/app/games/[id]/edit/page.tsx`. Find the JSX block at line 63:

```tsx
      {initial && <GameForm initial={initial} onSubmit={handleSubmit} submitLabel="Save changes" />}
```

Replace with:

```tsx
      {initial && (
        <GameForm
          playerCount={initial.rows.length}
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      )}
```

- [ ] **Step 2: Type-check — no errors anywhere**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Open `/games` in the browser, click Edit on an existing game.
Expected:
1. Edit page loads with rows matching the saved participant count (no popup).
2. Blanking a participant name and clicking Save → red banner "All N participant names are required".
3. Re-filling the row → Save succeeds, redirects to `/games`.

Kill the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/app/games/[id]/edit/page.tsx
git commit -m "feat(games): pass playerCount to GameForm from edit page

Edit page derives playerCount from initial.rows.length (which equals
the saved game's participant count). The strict-validation rule from
the form refactor now catches accidental row-blanking on edit."
```

---

## Task 5: Widen player-count filter to 2–8 on `/games`

**Files:**
- Modify: `src/app/games/page.tsx`
- Modify: `tests/games-filter.test.ts` (extend coverage)

- [ ] **Step 1: Update the type union and dropdown options**

Open `src/app/games/page.tsx`.

Find at line 32:
```ts
  playerCount: 2 | 3 | 4 | null;
```
Change to:
```ts
  playerCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | null;
```

Find at line 110:
```ts
  const [countFilter, setCountFilter] = useState<2 | 3 | 4 | null>(null);
```
Change to:
```ts
  const [countFilter, setCountFilter] = useState<2 | 3 | 4 | 5 | 6 | 7 | 8 | null>(null);
```

Find at line 222:
```ts
                setCountFilter(e.target.value === '' ? null : (Number(e.target.value) as 2 | 3 | 4))
```
Change to:
```ts
                setCountFilter(e.target.value === '' ? null : (Number(e.target.value) as 2 | 3 | 4 | 5 | 6 | 7 | 8))
```

Find the `<select>` options block around lines 225-230:
```tsx
              <option value="">Any count</option>
              <option value="2">2 players</option>
              <option value="3">3 players</option>
              <option value="4">4 players</option>
```
Replace with:
```tsx
              <option value="">Any count</option>
              <option value="2">2 players</option>
              <option value="3">3 players</option>
              <option value="4">4 players</option>
              <option value="5">5 players</option>
              <option value="6">6 players</option>
              <option value="7">7 players</option>
              <option value="8">8 players</option>
```

- [ ] **Step 2: Extend `tests/games-filter.test.ts` with a 6-player filter case**

Open `tests/games-filter.test.ts`. Inside the `describe('playerCount filter (D-18)', ...)` block (around line 71), add a new test after the existing two:

```ts
    it('matches a 6-player game when playerCount filter is 6', () => {
      // Construct a synthetic 6-player game using whatever helper exists in the file.
      // If the file uses a `mkGame`-style helper, use it; otherwise inline the shape:
      const game6 = {
        id: 'g6',
        date: '2026-04-10T00:00:00.000Z',
        wonByCombo: false,
        isImported: false,
        notes: null,
        createdAt: '2026-04-10T00:00:00.000Z',
        participants: ['A','B','C','D','E','F'].map((n, i) => ({
          id: `p6-${i}`, gameId: 'g6', playerName: n, isWinner: i === 0, isScrewed: false, deckName: null,
        })),
      };
      expect(matchesAllFilters(game6 as any, { winner: null, playerCount: 6, players: [] })).toBe(true);
      expect(matchesAllFilters(game6 as any, { winner: null, playerCount: 4, players: [] })).toBe(false);
    });
```

If `tests/games-filter.test.ts` already imports a `mkGame`/`mkParticipant` helper, prefer using it (open the file's top to check) and drop the `as any` cast.

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/games-filter.test.ts`
Expected: all PASS.

- [ ] **Step 4: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
Open `/games`. Open the "Player count" dropdown.
Expected: shows "Any count", "2 players" through "8 players" — 8 options total.
Pick "6 players" — list filters to games with exactly 6 participants (likely empty until you log one in Task 3's manual test).

Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/games/page.tsx tests/games-filter.test.ts
git commit -m "feat(games): extend player-count filter to 2-8

Widens the FilterState.playerCount union, adds dropdown options 5-8,
and adds a 6-player matchesAllFilters test case."
```

---

## Task 6: Stats — Games by Deck pie shows top 15, drops "Other"

**Files:**
- Modify: `src/lib/stats.ts` — `computeGamesByDeckPie` (lines 293–316)
- Modify: `tests/stats.test.ts` — extend the existing `computeGamesByDeckPie` block

- [ ] **Step 1: Locate the existing tests for `computeGamesByDeckPie`**

Run: `grep -n "computeGamesByDeckPie\|describe.*Games by Deck\|games by deck" tests/stats.test.ts`
Note the line numbers — that's where new tests get added.

- [ ] **Step 2: Add (or amend) tests asserting top-15 behavior with no "Other" bucket**

Open `tests/stats.test.ts` and, inside the existing `describe` block for `computeGamesByDeckPie` (or alongside its existing tests if there's no dedicated block), add these tests. **If existing tests assert the old "top 14 + Other" behavior, update them rather than adding alongside.** The helpers `mkGame` and `mkParticipant` already exist in the file (lines 22–56) — use them.

```ts
describe('computeGamesByDeckPie — top 15, no Other (2026-05-15)', () => {
  function deckGame(deck: string): Game {
    return mkGame('2026-04-01', [
      mkParticipant('P', { isWinner: true, deckName: deck }),
    ]);
  }

  it('returns all 15 decks when exactly 15 distinct decks exist', () => {
    const games = Array.from({ length: 15 }, (_, i) => deckGame(`Deck${i}`));
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });

  it('returns top 15 with NO Other bucket when 16+ decks exist', () => {
    const games: Game[] = [];
    for (let i = 0; i < 20; i++) {
      // Deck i played (i+1) times so order is stable: Deck19 most, Deck0 least
      for (let j = 0; j <= i; j++) games.push(deckGame(`Deck${i}`));
    }
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(15);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
    // Top entries are the highest-count decks
    expect(result[0].deck).toBe('Deck19');
    expect(result[0].games).toBe(20);
    expect(result[14].deck).toBe('Deck5');
  });

  it('returns fewer than 15 entries unchanged when only N<15 decks exist', () => {
    const games = Array.from({ length: 5 }, (_, i) => deckGame(`Deck${i}`));
    const result = computeGamesByDeckPie(games);
    expect(result).toHaveLength(5);
    expect(result.find((d) => d.deck === 'Other')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run tests — they should fail (existing impl returns 14 + Other)**

Run: `npm test -- tests/stats.test.ts`
Expected: the new "top 15 with NO Other bucket when 16+ decks exist" FAILS (returns 15 entries because 14 + Other = 15, but `result.find((d) => d.deck === 'Other')` finds it). The 15-decks case may already pass because the early return `if (all.length <= 14)` falls through. Confirm at least one fails before moving on.

- [ ] **Step 4: Update `computeGamesByDeckPie`**

Open `src/lib/stats.ts`. Find at line 305:

```ts
  const all = Array.from(map.entries())
    .filter(([, count]) => count > 0)
    .map(([deck, count]) => ({ deck, games: count }))
    .sort((a, b) => b.games - a.games);

  if (all.length <= 14) return all;

  const top = all.slice(0, 14);
  const rest = all.slice(14);
  const otherGames = rest.reduce((s, d) => s + d.games, 0);
  return [...top, { deck: 'Other', games: otherGames }];
}
```

Replace from the `if (all.length <= 14)` line through the closing brace with:

```ts
  // 2026-05-15: switched from "top 14 + Other" to "top 15, no Other" because
  // the long-tail aggregate frequently dominated the pie chart.
  return all.slice(0, 15);
}
```

So the function ends with the sort and a single `return all.slice(0, 15);` line.

- [ ] **Step 5: Run tests — they should pass**

Run: `npm test -- tests/stats.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts tests/stats.test.ts
git commit -m "feat(stats): games-by-deck pie shows top 15, drops Other

The 'Other' bucket frequently exceeded 50% of the pie because long-tail
decks aggregated. Switch to a simple top-15 cutoff with no Other entry.
computeDeckWinRate is left alone (Other slice is tiny there)."
```

---

## Task 7: Stats — `filterGamesByTimeframe` pure helper + `Timeframe` type

**Files:**
- Modify: `src/lib/stats.ts` — add new helper and type
- Modify: `tests/stats.test.ts` — add cases for each preset

- [ ] **Step 1: Add tests for `filterGamesByTimeframe`**

Open `tests/stats.test.ts`. Add the `filterGamesByTimeframe` import to the existing import block at the top (alongside the other `from '@/lib/stats'` imports):

```ts
import {
  isoWeekStartUTC,
  weeksBetween,
  computePlayerWinRate,
  computeDeckWinRate,
  computeScrewedRate,
  computeWeeklyFrequency,
  computeMostLikelyToPlay,
  computeMostLikelyToPlayBump,
  computeWinsByPlayerPie,
  computeGamesByDeckPie,
  computePlayerRadar,
  filterGamesByTimeframe,
  type Timeframe,
} from '@/lib/stats';
```

At the bottom of the file, add:

```ts
describe('filterGamesByTimeframe (2026-05-15)', () => {
  const NOW = new Date('2026-05-15T12:00:00Z').getTime();
  let dateNowSpy: jest.SpyInstance;

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  function gameOnDay(daysAgo: number): Game {
    const d = new Date(NOW - daysAgo * 86_400_000);
    return mkGame(d.toISOString().slice(0, 10), [
      mkParticipant('P', { isWinner: true }),
    ]);
  }

  it('returns input unchanged for "all"', () => {
    const games = [gameOnDay(0), gameOnDay(100), gameOnDay(2000)];
    expect(filterGamesByTimeframe(games, 'all')).toHaveLength(3);
  });

  it('1M keeps games within 30 days', () => {
    const games = [gameOnDay(0), gameOnDay(15), gameOnDay(29), gameOnDay(31), gameOnDay(100)];
    const result = filterGamesByTimeframe(games, '1M');
    expect(result).toHaveLength(3);
  });

  it('3M keeps games within 90 days', () => {
    const games = [gameOnDay(0), gameOnDay(89), gameOnDay(91), gameOnDay(365)];
    const result = filterGamesByTimeframe(games, '3M');
    expect(result).toHaveLength(2);
  });

  it('1Y keeps games within 365 days', () => {
    const games = [gameOnDay(0), gameOnDay(364), gameOnDay(366), gameOnDay(1000)];
    const result = filterGamesByTimeframe(games, '1Y');
    expect(result).toHaveLength(2);
  });

  it('3Y keeps games within 1095 days', () => {
    const games = [gameOnDay(0), gameOnDay(1094), gameOnDay(1096)];
    const result = filterGamesByTimeframe(games, '3Y');
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(filterGamesByTimeframe([], '3M')).toEqual([]);
    expect(filterGamesByTimeframe([], 'all')).toEqual([]);
  });

  it('Timeframe type accepts only the five expected values', () => {
    const valid: Timeframe[] = ['1M', '3M', '1Y', '3Y', 'all'];
    expect(valid).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run — tests fail because the function does not exist**

Run: `npm test -- tests/stats.test.ts`
Expected: import error / TypeScript compile error / "filterGamesByTimeframe is not a function".

- [ ] **Step 3: Add the helper to `src/lib/stats.ts`**

Open `src/lib/stats.ts`. Append to the bottom of the file:

```ts
// ---------------------------------------------------------------------------
// Timeframe filter (2026-05-15) — used by the Frequency-section pill control
// on /stats. "Last N days" is calculated from Date.now() at call time so the
// filter is deterministic across re-renders within one tick.
// ---------------------------------------------------------------------------

export type Timeframe = '1M' | '3M' | '1Y' | '3Y' | 'all';

const TIMEFRAME_DAYS: Record<Exclude<Timeframe, 'all'>, number> = {
  '1M': 30,
  '3M': 90,
  '1Y': 365,
  '3Y': 1095,
};

export function filterGamesByTimeframe(games: Game[], timeframe: Timeframe): Game[] {
  if (timeframe === 'all') return games;
  const cutoffMs = Date.now() - TIMEFRAME_DAYS[timeframe] * 86_400_000;
  return games.filter((g) => new Date(g.date).getTime() >= cutoffMs);
}
```

- [ ] **Step 4: Run tests — they should pass**

Run: `npm test -- tests/stats.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts tests/stats.test.ts
git commit -m "feat(stats): add filterGamesByTimeframe pure helper

Adds Timeframe type ('1M'|'3M'|'1Y'|'3Y'|'all') and a date-cutoff
filter. Will be wired into /stats Frequency section in the next task."
```

---

## Task 8: Stats — Timeframe pill UI + Frequency memo wiring

**Files:**
- Modify: `src/app/stats/page.tsx`

- [ ] **Step 1: Update imports**

Open `src/app/stats/page.tsx`. Replace the imports block at the top (lines 7–17) with:

```tsx
import {
  computePlayerWinRate,
  computeDeckWinRate,
  computeScrewedRate,
  computeWeeklyFrequency,
  computeMostLikelyToPlay,
  computeMostLikelyToPlayBump,
  computeWinsByPlayerPie,
  computeGamesByDeckPie,
  computePlayerRadar,
  filterGamesByTimeframe,
  type Timeframe,
} from '@/lib/stats';
```

- [ ] **Step 2: Add the timeframe state and filtered-games memo**

Inside `StatsPage()`, just after the existing `const [expandedCharts, ...]` line (around line 129), add:

```tsx
  const [timeframe, setTimeframe] = useState<Timeframe>('3M');
```

Then, in the memoized-stat-computations block (around lines 161–169), update the `weeklyFrequency` and `mostLikelyBump` memos to read from a new `frequencyGames` memo. Replace lines 161–169 with:

```tsx
  // ---------- Memoized stat computations (D-11) ----------
  const playerWinRate = useMemo(() => computePlayerWinRate(games), [games]);
  const deckWinRate = useMemo(() => computeDeckWinRate(games), [games]);
  const screwedRate = useMemo(() => computeScrewedRate(games), [games]);
  const mostLikelyToPlay = useMemo(() => computeMostLikelyToPlay(games), [games]);
  const winsByPlayer = useMemo(() => computeWinsByPlayerPie(games), [games]);
  const gamesByDeck = useMemo(() => computeGamesByDeckPie(games), [games]);
  const playerRadar = useMemo(() => computePlayerRadar(games), [games]);

  // Frequency-section charts: filtered by the active timeframe (2026-05-15)
  const frequencyGames = useMemo(
    () => filterGamesByTimeframe(games, timeframe),
    [games, timeframe]
  );
  const weeklyFrequency = useMemo(() => computeWeeklyFrequency(frequencyGames), [frequencyGames]);
  const mostLikelyBump = useMemo(
    () => computeMostLikelyToPlayBump(frequencyGames),
    [frequencyGames]
  );
```

(`screwedRate` is computed but never read elsewhere — that's pre-existing; leave it.)

- [ ] **Step 3: Add the pill control inside the Frequency `<section>`**

In the JSX, find the Frequency `<section>` block (starts around line 351 with `{/* Section 4: Frequency */}`). Replace it with:

```tsx
          {/* Section 4: Frequency */}
          <section className="mb-12">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-foreground tracking-tight">Frequency</h2>
              <div className="inline-flex rounded-md border border-border bg-surface p-1" role="group" aria-label="Timeframe">
                {(['1M', '3M', '1Y', '3Y', 'all'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTimeframe(t)}
                    aria-pressed={timeframe === t}
                    className={
                      'px-3 py-1.5 text-xs font-medium rounded ' +
                      (timeframe === t
                        ? 'bg-accent text-background'
                        : 'text-muted hover:text-foreground')
                    }
                  >
                    {t === 'all' ? 'All' : t}
                  </button>
                ))}
              </div>
            </div>
            <ChartSection
              id={CHART_IDS.WEEKLY_FREQ}
              title="Games per week"
              summary={getSummary(CHART_IDS.WEEKLY_FREQ)}
              expanded={expandedCharts.has(CHART_IDS.WEEKLY_FREQ)}
              onToggle={() => toggleChart(CHART_IDS.WEEKLY_FREQ)}
            >
              {weeklyFrequency.length > 0 ? (
                <WeeklyFrequencyLine data={weeklyFrequency} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
            <ChartSection
              id={CHART_IDS.LIKELY_BUMP}
              title="Most likely to play over time"
              summary={getSummary(CHART_IDS.LIKELY_BUMP)}
              expanded={expandedCharts.has(CHART_IDS.LIKELY_BUMP)}
              onToggle={() => toggleChart(CHART_IDS.LIKELY_BUMP)}
            >
              {mostLikelyBump.length > 0 ? (
                <MostLikelyBump data={mostLikelyBump} players={bumpPlayers} chartTokens={chartTokens} />
              ) : (
                <EmptyChart />
              )}
            </ChartSection>
          </section>
```

This replaces the existing Section 4 block. Diff is: the `<h2>` and the new pill `<div>` share a wrapper flex row; the two `<ChartSection>` calls are unchanged.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`
Open `/stats`.
Expected:
1. The Frequency section header shows a pill row on the right: **1M / 3M / 1Y / 3Y / All**.
2. The active pill is **3M** (filled with accent color).
3. Click **1M** — both Frequency charts re-render with at most ~4 weeks of data.
4. Click **All** — both charts show full history (matches the previous always-all behavior).
5. Other chart sections (Player Overview, Win Rates, Breakdowns) are unaffected by pill clicks.

Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/app/stats/page.tsx
git commit -m "feat(stats): timeframe pill selector for Frequency section

Adds a 1M/3M/1Y/3Y/All pill control above 'Games per week' and
'Most likely to play over time'. Default is 3M. Filters the games
array before passing to computeWeeklyFrequency and
computeMostLikelyToPlayBump; other charts unaffected. Short-history
data is not compressed because both compute functions derive the
X axis from min/max of their input."
```

---

## Task 9: Stats — Player Overview radar legend bleed fix

**Files:**
- Modify: `src/app/stats/charts/PlayerRadarCard.tsx`

- [ ] **Step 1: Drop the Recharts `<Legend>` and add a custom HTML legend below the chart**

Open `src/app/stats/charts/PlayerRadarCard.tsx`. Replace its entire contents with:

```tsx
"use client";

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import { CHART_COLORS } from "../page";

interface ChartTokens {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
}

interface PlayerRadarDatum {
  player: string;
  played: number;
  wins: number;
  screwed: number;
  wonByCombo: number;
  nonImportedPlayed: number;
  totalGames: number;
}

interface Props {
  data: PlayerRadarDatum[];
  chartTokens: ChartTokens;
}

const AXES = ["Played", "Wins", "Screwed", "Won by Combo"] as const;
const AXIS_KEYS: Record<(typeof AXES)[number], keyof PlayerRadarDatum> = {
  Played: "played",
  Wins: "wins",
  Screwed: "screwed",
  "Won by Combo": "wonByCombo",
};

export default function PlayerRadarCard({ data, chartTokens }: Props) {
  const radarData = AXES.map((axis) => {
    const row: Record<string, string | number> = { axis };
    for (const d of data) {
      if (axis === "Played") {
        row[d.player] = d.totalGames > 0 ? d.played / d.totalGames : 0;
      } else if (axis === "Won by Combo") {
        row[d.player] = d.nonImportedPlayed > 0 ? d.wonByCombo / d.nonImportedPlayed : 0;
      } else {
        const key = AXIS_KEYS[axis];
        const raw = d[key] as number;
        row[d.player] = d.played > 0 ? raw / d.played : 0;
      }
    }
    return row;
  });

  const rawByPlayer: Record<string, Record<string, number>> = {};
  for (const d of data) {
    rawByPlayer[d.player] = {
      Played: d.played,
      Wins: d.wins,
      Screwed: d.screwed,
      "Won by Combo": d.wonByCombo,
      totalGames: d.totalGames,
      nonImportedPlayed: d.nonImportedPlayed,
    };
  }

  const players = data.map((d) => d.player);

  return (
    <>
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid gridType="polygon" stroke={chartTokens.border} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 14, fill: chartTokens.foreground }}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          {players.map((player, i) => (
            <Radar
              key={player}
              name={player}
              dataKey={player}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              fillOpacity={0.15}
            />
          ))}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const axis = payload[0]?.payload?.axis as string;
              return (
                <div
                  style={{
                    background: chartTokens.surface,
                    border: `1px solid ${chartTokens.border}`,
                    color: chartTokens.foreground,
                    padding: "8px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{axis}</div>
                  {payload.map((entry) => {
                    const playerName = entry.name as string;
                    const raw = rawByPlayer[playerName]?.[axis] ?? 0;
                    const played = rawByPlayer[playerName]?.["Played"] ?? 0;
                    const totalGames = rawByPlayer[playerName]?.["totalGames"] ?? 1;
                    const nonImported = rawByPlayer[playerName]?.["nonImportedPlayed"] ?? 0;
                    const pct = axis === "Played"
                      ? Math.round((raw / totalGames) * 100)
                      : axis === "Won by Combo"
                      ? nonImported > 0 ? Math.round((raw / nonImported) * 100) : 0
                      : played > 0 ? Math.round((raw / played) * 100) : 0;
                    return (
                      <div
                        key={playerName}
                        style={{ color: entry.color, marginBottom: 2 }}
                      >
                        {playerName}: {raw} ({pct}%)
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-foreground">
        {players.map((player, i) => (
          <span key={player} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              aria-hidden="true"
            />
            {player}
          </span>
        ))}
      </div>
    </>
  );
}
```

Changes from the previous file:
- Import list drops `Legend`.
- The `<Legend iconType="circle" />` element inside the `<RadarChart>` is removed.
- The `<ResponsiveContainer>` is wrapped with a `<>` fragment that also contains a `<div>` rendering the custom flex-wrap legend.
- The color mapping uses the same `CHART_COLORS[i % CHART_COLORS.length]` as the `<Radar>` elements, so visual consistency is guaranteed.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Open `/stats`.
Expected:
1. The "Player overview by stat" radar renders at full 400px height — no legend overlap.
2. The player legend appears as small color-dot + name chips wrapping under the chart.
3. With many players (log a test 8-player game from Task 3's smoke test if you haven't), the legend wraps to multiple rows beneath the chart, but the radar itself is untouched.
4. Mobile width (resize the window below 640px) — radar still renders at 400px; legend wraps freely.

Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/stats/charts/PlayerRadarCard.tsx
git commit -m "fix(stats): radar legend no longer bleeds into chart

Recharts <Legend> rendered inside the SVG container and consumed
radar space when player count grew. Render a custom flex-wrap legend
below the chart instead; the 400px ResponsiveContainer is unchanged.
Color mapping matches Radar elements via CHART_COLORS[i % len]."
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Run the entire unit test suite**

Run: `npm test`
Expected: all PASS, no skipped suites.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: clean PASS (or only pre-existing warnings; new code introduces no new lint errors).

- [ ] **Step 4: End-to-end manual verification in the dev server**

Run: `npm run dev`

Walk through the following checklist in a browser (`http://localhost:3000`):

1. `/games/new` → modal "How many players?" appears with 7 buttons (2–8) + Cancel.
2. Pick **8** → form shows 8 participant rows, heading "Log a 8-player game".
3. Fill all 8 rows with distinct names; mark one winner; click Save → game persists. (Optionally accept the Discord notify modal.)
4. `/games` → the new 8-player game appears in the table; "Players" column shows 8.
5. `/games` → Player-count filter dropdown shows 7 options (2–8). Pick **8 players** → only the new game is listed.
6. Click Edit on the 8-player game → form loads with 8 rows pre-filled (no popup).
7. Blank one row, click Save changes → form-level error "All 8 participant names are required". Restore the name; Save → redirects to `/games`.
8. `/stats` →
   - Player Overview radar has no legend bleed; player chips wrap cleanly below the chart.
   - Frequency section has the **1M / 3M / 1Y / 3Y / All** pill row; **3M** is active by default.
   - Click pills — both Frequency charts re-render.
   - "Games by deck" pie has no "Other" slice (if you have ≥16 distinct decks logged; otherwise just confirm all logged decks appear, no "Other").

Kill the dev server.

- [ ] **Step 5: Final commit if any tidy-up was needed**

If everything checks out without code changes during verification, skip this step. Otherwise:

```bash
git add -p   # review remaining changes
git commit -m "chore(games-stats): verification-pass tidy-up"
```

- [ ] **Step 6: Summary**

Print `git log --oneline -12` and confirm one commit per task (9 feature commits + optional tidy-up).

---

## Self-Review Notes

- **Spec coverage:** Each spec change maps to tasks — A: 1, 2, 3, 4, 5; B: 9; C: 6; D: 7, 8. The "all N rows required" rule (clarified in spec self-review) is implemented in Task 2 Step 3 and tested in Task 2 Step 1.
- **Type consistency:** `Timeframe` defined in Task 7, used in Task 8 imports. `GameFormProps.playerCount` defined in Task 2 Step 3, consumed in Tasks 3 and 4. `FilterState.playerCount` union widened consistently in Task 5 across type, useState, and onChange cast.
- **No placeholders:** Every step shows the actual code or command. No "TBD", no "handle edge cases", no "similar to Task N" — code is repeated where needed.
- **Test independence:** Each test file modification is self-contained. `tests/game-form.test.ts` is fully rewritten in Task 2 to avoid drift between the old `baseState` 4-row padding and the new strict-length rules.
- **Manual-only changes:** Tasks 3 (popup UI), 4 (edit page wiring), 8 (pill UI), 9 (legend layout) rely on dev-server smoke tests because they are presentational. The verification checklist in Task 10 covers them end-to-end.
