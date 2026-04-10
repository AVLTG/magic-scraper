---
phase: 06-game-tracking-core
plan: 06
type: execute
wave: 2
depends_on:
  - 02
  - 03
  - 04
files_modified:
  - src/app/games/game-form.tsx
  - src/app/games/new/page.tsx
  - src/app/games/[id]/edit/page.tsx
  - src/app/games/page.tsx
  - src/app/games/delete-confirm-modal.tsx
  - src/app/components/header.tsx
  - tests/game-form.test.ts
autonomous: false
requirements:
  - GAME-01
  - GAME-02
  - GAME-03
  - GAME-04
  - GAME-05
  - GAME-06
  - GAME-07
  - GAME-08
  - GAME-09
user_setup: []

must_haves:
  truths:
    - "User can navigate to /games/new from the header 'Games' nav link and log a new game with 1-4 participants, winner radio, per-row screwed checkbox, date, notes, and wonByCombo toggle"
    - "Empty participant rows are filtered out client-side before POST (D-01, RESEARCH.md Pitfall 4) — rows where playerName.trim() === '' are removed"
    - "Form refuses to submit with cross-field error banner if: no participants filled, or winner not selected among filled rows, or winner row has empty playerName"
    - "Player and deck autocomplete Comboboxes are seeded from GET /api/players and GET /api/decks fetched once on mount (D-09)"
    - "User can view /games history table sorted newest-first (ordered by date desc from GET /api/games), expand a row to see all participants, and click Edit or Delete"
    - "Delete opens the DeleteConfirmModal component; confirming issues DELETE /api/games/[id] and removes the row from client state optimistically (D-14, D-15)"
    - "Edit navigates to /games/[id]/edit which pre-populates the form via GET /api/games/[id] and PATCHes on save"
    - "Header nav contains a Link with href='/games' and label 'Games' (D-21)"
    - "All form input is sanitized at the API boundary via gameSchema.parse (D-29) — no client-side duplicate sanitization"
  artifacts:
    - path: "src/app/games/game-form.tsx"
      provides: "Shared GameForm component for both /games/new and /games/[id]/edit"
      exports: ["GameForm", "filterEmptyRows", "validateGameForm"]
      min_lines: 200
    - path: "src/app/games/new/page.tsx"
      provides: "/games/new page — renders GameForm with no initial data, POSTs on submit"
      min_lines: 15
    - path: "src/app/games/[id]/edit/page.tsx"
      provides: "/games/[id]/edit page — fetches game, renders GameForm with initial data, PATCHes on submit"
      min_lines: 30
    - path: "src/app/games/page.tsx"
      provides: "/games history table with expand + edit + delete wiring"
      min_lines: 100
    - path: "src/app/games/delete-confirm-modal.tsx"
      provides: "DeleteConfirmModal component used from history page"
      exports: ["DeleteConfirmModal"]
      min_lines: 30
    - path: "src/app/components/header.tsx"
      provides: "Nav gains Games link"
      contains: '{ href: "/games", label: "Games" }'
    - path: "tests/game-form.test.ts"
      provides: "Unit tests for filterEmptyRows + validateGameForm helpers"
      min_lines: 60
  key_links:
    - from: "src/app/games/game-form.tsx"
      to: "/api/players and /api/decks"
      via: "two useEffect fetches on mount (D-09)"
      pattern: "fetch\\(['\"]/api/(players|decks)['\"]"
    - from: "src/app/games/new/page.tsx"
      to: "/api/games POST"
      via: "form onSubmit fetch"
      pattern: "fetch\\(['\"]/api/games['\"].*method:\\s*['\"]POST['\"]"
    - from: "src/app/games/[id]/edit/page.tsx"
      to: "/api/games/[id] GET + PATCH"
      via: "fetch on mount + fetch on submit"
      pattern: "method:\\s*['\"]PATCH['\"]"
    - from: "src/app/games/page.tsx"
      to: "/api/games GET + DELETE"
      via: "list fetch + delete fetch"
      pattern: "method:\\s*['\"]DELETE['\"]"
    - from: "src/app/games/game-form.tsx"
      to: "src/app/components/combobox.tsx"
      via: "import { Combobox }"
      pattern: "from\\s+['\"]@/app/components/combobox['\"]"
    - from: "src/app/components/header.tsx"
      to: "Link href='/games'"
      via: "navLinks array entry"
      pattern: '"/games"'
---

<objective>
Build the full Phase 6 UI layer: the shared `GameForm` component, the three game pages (`/games`, `/games/new`, `/games/[id]/edit`), the `DeleteConfirmModal` component, and the header nav link. This plan is Wave 2 — it depends on the Combobox (06-02), autocomplete routes (06-03), and games CRUD routes (06-04). It's the final plan for Phase 6 and the one that makes the feature end-user-visible.

Purpose: Satisfies GAME-01 through GAME-09 at the UI layer. The pages are the consumers of everything Waves 0 and 1 produced. Nothing downstream needs this plan — its output IS the shipped feature.

Output: 6 component/page files + 1 header edit + 1 unit test file. The test file covers the pure helper functions (`filterEmptyRows`, `validateGameForm`) extracted from the GameForm so the form's business logic is unit-testable without React Testing Library.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/06-game-tracking-core/06-CONTEXT.md
@.planning/phases/06-game-tracking-core/06-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/STRUCTURE.md
@src/app/checkDeck/page.tsx
@src/app/components/header.tsx
@src/lib/validators.ts
@prisma/schema.prisma

<prior_plans>
- 06-02 created `src/app/components/combobox.tsx` with `Combobox` component + props `{ items, value, onChange, placeholder, addLabel }`
- 06-03 created `GET /api/players → { players: string[] }` and `GET /api/decks → { decks: string[] }`
- 06-04 created `POST /api/games`, `GET /api/games`, `GET /api/games/[id]`, `PATCH /api/games/[id]`, `DELETE /api/games/[id]` with shapes:
  - POST body / PATCH body: `{ date: string (ISO), wonByCombo: boolean, notes?: string, participants: { playerName: string, isWinner: boolean, isScrewed: boolean, deckName?: string }[] }`
  - GET list response: `{ games: (Game & { participants: GameParticipant[] })[] }`
  - GET by id response: `{ game: Game & { participants: GameParticipant[] } }`
  - DELETE response: `{ ok: true }`
</prior_plans>

<interfaces>
<!-- Data shapes consumed by pages -->

From @prisma/client (already generated):
```typescript
type Game = {
  id: string;
  date: Date;          // ISO string after JSON serialization
  wonByCombo: boolean;
  notes: string | null;
  createdAt: Date;
};
type GameParticipant = {
  id: string;
  gameId: string;
  playerName: string;
  isWinner: boolean;
  isScrewed: boolean;
  deckName: string | null;
};
type GameWithParticipants = Game & { participants: GameParticipant[] };
```

<!-- Internal form state type -->
```typescript
interface ParticipantRow {
  playerName: string;
  deckName: string;      // empty string in form state, becomes undefined in payload if empty
  isWinner: boolean;     // derived from single `winnerIndex` state
  isScrewed: boolean;
}
interface GameFormState {
  date: string;          // yyyy-mm-dd from <input type="date">
  notes: string;
  wonByCombo: boolean;
  rows: ParticipantRow[];   // always length 4
  winnerIndex: number;      // 0..3 or -1 (no winner)
}
```

<!-- Header navLinks after edit -->
```typescript
const navLinks = [
  { href: "/checkDeck", label: "Friend Collections" },
  { href: "/games", label: "Games" },
  { href: "/SearchLGS", label: "LGS Search" },
];
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create GameForm component, DeleteConfirmModal, and helper unit tests</name>
  <files>
    - src/app/games/game-form.tsx
    - src/app/games/delete-confirm-modal.tsx
    - tests/game-form.test.ts
  </files>
  <read_first>
    - src/app/checkDeck/page.tsx (canonical client component pattern — useState + handleSubmit + fetch + try/catch/finally)
    - src/app/components/combobox.tsx (created by 06-02 — prop shape for `items`, `value`, `onChange`, `placeholder`, `addLabel`)
    - src/lib/validators.ts (gameSchema shape — what the POST body must look like; the form constructs this shape client-side and sends it)
    - prisma/schema.prisma (Game + GameParticipant model field names — match exactly)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-01 through D-06 (form layout) + D-14 (delete modal)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md Pattern 5 + Pitfall 4 (empty-row winner filtering)
  </read_first>
  <behavior>
    Pure helper functions (exported for unit testing):
    - `filterEmptyRows(rows: ParticipantRow[])` → returns only rows where `playerName.trim() !== ''`
    - `validateGameForm(state: GameFormState)` → returns `{ ok: true, payload: <POST body> } | { ok: false, errors: { date?: string, form?: string, rows?: Record<number, string> } }`
      - Error: no date → `errors.date = 'Date is required'`
      - Error: 0 non-empty rows → `errors.form = 'At least one participant required'`
      - Error: winnerIndex === -1 OR the row at winnerIndex has empty playerName → `errors.form = 'Exactly one winner required'`
      - Error: any row with playerName.length > 100 → `errors.rows[i] = 'Player name too long'`
      - Error: any row with deckName.length > 100 → `errors.rows[i] = 'Deck name too long'`
      - Valid: returns `{ ok: true, payload: { date: ISO, wonByCombo, notes: string | undefined, participants: filteredRows.map(...) } }`
    - Participant mapping: `{ playerName: row.playerName.trim(), isWinner: index_in_filtered === winnerIndexInFiltered, isScrewed: row.isScrewed, deckName: row.deckName.trim() || undefined }`

    Component behavior (tested manually / via checkpoint — not in unit tests):
    - GameForm fetches `/api/players` and `/api/decks` on mount; stores results in state; passes to Comboboxes as `items`
    - 4 participant rows always rendered; empty rows visually hidden from the filtered-payload but still typeable
    - Submit calls `validateGameForm`; if errors, shows banner + inline errors; if valid, calls `props.onSubmit(payload)` (parent handles POST vs PATCH)
    - `initial` prop pre-populates form state in edit mode

    DeleteConfirmModal behavior:
    - Accepts `{ isOpen, gameDate, onCancel, onConfirm }` props
    - Renders a backdrop + centered panel when isOpen
    - Escape key triggers onCancel; clicking backdrop triggers onCancel
    - Title: "Delete game from {formatted date}?" — body "This cannot be undone."
    - Buttons: Cancel (secondary) and Delete (destructive red)
  </behavior>
  <action>
    **Step 1 — RED: Create `tests/game-form.test.ts`** covering the pure helpers (no React). The helpers are exported from `src/app/games/game-form.tsx`.

    ```typescript
    import {
      filterEmptyRows,
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

    function baseState(rows: ParticipantRow[], winnerIndex: number, overrides: Partial<{ date: string; notes: string; wonByCombo: boolean }> = {}) {
      return {
        date: '2026-04-10',
        notes: '',
        wonByCombo: false,
        rows: [...rows, ...Array(4 - rows.length).fill(row(''))].slice(0, 4),
        winnerIndex,
        ...overrides,
      };
    }

    describe('filterEmptyRows', () => {
      it('removes rows with empty playerName', () => {
        const rows = [row('Alice'), row(''), row('Bob'), row('  ')];
        expect(filterEmptyRows(rows)).toHaveLength(2);
      });
      it('preserves order', () => {
        const rows = [row(''), row('Alice'), row(''), row('Bob')];
        const filtered = filterEmptyRows(rows);
        expect(filtered[0].playerName).toBe('Alice');
        expect(filtered[1].playerName).toBe('Bob');
      });
      it('trims before checking', () => {
        expect(filterEmptyRows([row('   ')])).toHaveLength(0);
        expect(filterEmptyRows([row(' X ')])).toHaveLength(1);
      });
    });

    describe('validateGameForm', () => {
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

      it('rejects when date missing', () => {
        const state = baseState([row('Alice')], 0, { date: '' });
        const result = validateGameForm(state);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.date).toBeDefined();
        }
      });

      it('rejects when no non-empty rows', () => {
        const state = baseState([], -1);
        const result = validateGameForm(state);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.form).toMatch(/participant/i);
        }
      });

      it('rejects when winnerIndex is -1 (no winner)', () => {
        const state = baseState([row('Alice'), row('Bob')], -1);
        const result = validateGameForm(state);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.form).toMatch(/winner/i);
        }
      });

      it('rejects when winner is on an empty row (Pitfall 4)', () => {
        const state = baseState([row('Alice'), row('')], 1);
        const result = validateGameForm(state);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.form).toMatch(/winner/i);
        }
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
        if (result.ok) {
          expect(result.payload.participants[0].deckName).toBeUndefined();
        }
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

      it('remaps winner index correctly after filtering empty rows', () => {
        // Row 0 empty, row 1 Alice with winner=true, row 2 Bob
        // After filter: [Alice (index 0, winner), Bob (index 1)]
        const state = {
          date: '2026-04-10',
          notes: '',
          wonByCombo: false,
          rows: [
            row(''),
            row('Alice', { isWinner: true }),
            row('Bob'),
            row(''),
          ],
          winnerIndex: 1,
        };
        const result = validateGameForm(state);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.payload.participants[0].isWinner).toBe(true);
          expect(result.payload.participants[1].isWinner).toBe(false);
        }
      });
    });
    ```

    Run `npx jest tests/game-form.test.ts` — MUST fail (file not created yet).

    **Step 2 — GREEN: Create `src/app/games/game-form.tsx`:**

    ```typescript
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
      date: string;           // yyyy-mm-dd
      notes: string;
      wonByCombo: boolean;
      rows: ParticipantRow[]; // always length 4
      winnerIndex: number;    // 0..3 or -1
    }

    export interface GameFormPayload {
      date: string;           // ISO string
      wonByCombo: boolean;
      notes?: string;
      participants: {
        playerName: string;
        isWinner: boolean;
        isScrewed: boolean;
        deckName?: string;
      }[];
    }

    export type ValidationResult =
      | { ok: true; payload: GameFormPayload }
      | { ok: false; errors: { date?: string; form?: string; rows?: Record<number, string> } };

    export function filterEmptyRows(rows: ParticipantRow[]): ParticipantRow[] {
      return rows.filter((r) => r.playerName.trim() !== '');
    }

    export function validateGameForm(state: GameFormState): ValidationResult {
      const errors: { date?: string; form?: string; rows?: Record<number, string> } = {};
      if (!state.date || state.date.trim() === '') {
        errors.date = 'Date is required';
      }
      const filled = state.rows.map((r, i) => ({ ...r, _originalIndex: i })).filter((r) => r.playerName.trim() !== '');
      if (filled.length === 0) {
        errors.form = 'At least one participant required';
      }
      // Winner must be one of the filled rows
      const winnerFilledIndex = filled.findIndex((r) => r._originalIndex === state.winnerIndex);
      if (winnerFilledIndex === -1) {
        errors.form = 'Exactly one winner required';
      }
      // Length caps (zod will re-check server side, but UX feedback is inline)
      const rowErrors: Record<number, string> = {};
      state.rows.forEach((r, i) => {
        if (r.playerName.length > 100) rowErrors[i] = 'Player name too long (max 100)';
        else if (r.deckName.length > 100) rowErrors[i] = 'Deck name too long (max 100)';
      });
      if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;

      if (errors.date || errors.form || errors.rows) {
        return { ok: false, errors };
      }

      // Build payload
      const participants = filled.map((r) => ({
        playerName: r.playerName.trim(),
        isWinner: r._originalIndex === state.winnerIndex,
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

    export interface GameFormProps {
      initial?: GameFormState;
      submitLabel?: string;
      onSubmit: (payload: GameFormPayload) => Promise<void> | void;
    }

    export function GameForm({ initial, submitLabel = 'Save game', onSubmit }: GameFormProps) {
      const [state, setState] = useState<GameFormState>(
        initial ?? {
          date: new Date().toISOString().slice(0, 10),
          notes: '',
          wonByCombo: false,
          rows: [emptyRow(), emptyRow(), emptyRow(), emptyRow()],
          winnerIndex: -1,
        }
      );
      const [playerItems, setPlayerItems] = useState<string[]>([]);
      const [deckItems, setDeckItems] = useState<string[]>([]);
      const [errors, setErrors] = useState<ValidationResult extends { ok: false } ? ValidationResult['errors'] : Record<string, never>>({} as any);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [submitError, setSubmitError] = useState<string>('');

      // Seed autocomplete once on mount (D-09 — no debounce, no refresh)
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
          setErrors(result.errors as any);
          return;
        }
        setErrors({} as any);
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
          {(errors as any).form && (
            <div className="rounded-md border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {(errors as any).form}
            </div>
          )}
          {submitError && (
            <div className="rounded-md border border-red-500 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {submitError}
            </div>
          )}

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-foreground mb-1">Date</label>
              <input
                type="date"
                value={state.date}
                onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
                className="w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground"
              />
              {(errors as any).date && <p className="text-xs text-red-600 mt-1">{(errors as any).date}</p>}
            </div>
            <label className="flex items-center gap-2 pb-2">
              <input
                type="checkbox"
                checked={state.wonByCombo}
                onChange={(e) => setState((s) => ({ ...s, wonByCombo: e.target.checked }))}
              />
              <span className="text-sm text-foreground">Won by combo</span>
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
                {(errors as any).rows?.[i] && (
                  <p className="col-span-4 text-xs text-red-600">{(errors as any).rows[i]}</p>
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

    // Helper: build a GameFormState from an API game response (for edit mode pre-population)
    export function buildInitialState(game: {
      date: string | Date;
      wonByCombo: boolean;
      notes: string | null;
      participants: { playerName: string; isWinner: boolean; isScrewed: boolean; deckName: string | null }[];
    }): GameFormState {
      const rows: ParticipantRow[] = [emptyRow(), emptyRow(), emptyRow(), emptyRow()];
      let winnerIndex = -1;
      game.participants.slice(0, 4).forEach((p, i) => {
        rows[i] = {
          playerName: p.playerName,
          deckName: p.deckName ?? '',
          isWinner: p.isWinner,
          isScrewed: p.isScrewed,
        };
        if (p.isWinner) winnerIndex = i;
      });
      const dateStr = typeof game.date === 'string'
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
    ```

    **Step 3 — GREEN: Create `src/app/games/delete-confirm-modal.tsx`:**

    ```typescript
    "use client";
    import { useEffect } from 'react';

    export interface DeleteConfirmModalProps {
      isOpen: boolean;
      gameDate: string; // display-friendly string
      onCancel: () => void;
      onConfirm: () => void;
    }

    export function DeleteConfirmModal({ isOpen, gameDate, onCancel, onConfirm }: DeleteConfirmModalProps) {
      useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') onCancel();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [isOpen, onCancel]);

      if (!isOpen) return null;
      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onCancel}
            aria-hidden="true"
          />
          <div className="relative z-10 rounded-lg border border-border bg-surface p-6 shadow-xl max-w-sm w-full mx-4">
            <h2 id="delete-modal-title" className="text-lg font-bold text-foreground mb-2">
              Delete game from {gameDate}?
            </h2>
            <p className="text-sm text-muted mb-4">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="px-4 py-2 rounded-md bg-red-600 text-white font-medium hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      );
    }
    ```

    **Step 4 — Run tests:**

    Run `npx jest tests/game-form.test.ts` — MUST pass (10 tests).

    Run `npx jest` — full suite MUST remain green.

    **Do NOT:**
    - Do NOT duplicate zod validation in the form — gameSchema runs server-side; the form does lightweight client-side checks for UX only (D-29)
    - Do NOT add a toast notification library — D-15 explicitly rejects undo-toast infrastructure
    - Do NOT add SWR/React Query — plain fetch in useEffect matches existing pattern (CONVENTIONS.md)
    - Do NOT dynamically add/remove participant rows — always 4 fixed rows (D-06)
    - Do NOT use `dangerouslySetInnerHTML` anywhere — T-06-03 XSS mitigation
    - Do NOT use `window.confirm()` for delete — D-14 mandates custom modal
  </action>
  <verify>
    <automated>npx jest tests/game-form.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/games/game-form.tsx` exists
    - Contains literal `"use client"` directive
    - Exports `GameForm`, `filterEmptyRows`, `validateGameForm`, `buildInitialState`
    - Imports `Combobox` from `@/app/components/combobox`
    - Contains literal string `fetch('/api/players')` and `fetch('/api/decks')`
    - Contains `type="date"` input, `name="winner"` radio, and `isScrewed` checkbox
    - Does NOT contain `dangerouslySetInnerHTML`
    - Does NOT contain `window.confirm`
    - Does NOT contain `import.*from ['"]swr` or `react-query`
    - `src/app/games/delete-confirm-modal.tsx` exists, exports `DeleteConfirmModal`, has `role="dialog"` and `aria-modal="true"`
    - `tests/game-form.test.ts` has 10+ `it(` blocks
    - `npx jest tests/game-form.test.ts` exits 0
    - Full jest suite green
  </acceptance_criteria>
  <done>
    GameForm component and DeleteConfirmModal exist with full business-logic unit coverage; form seeds autocomplete and validates per D-01..D-06.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /games pages (list, new, edit) + header nav link</name>
  <files>
    - src/app/games/page.tsx
    - src/app/games/new/page.tsx
    - src/app/games/[id]/edit/page.tsx
    - src/app/components/header.tsx
  </files>
  <read_first>
    - src/app/games/game-form.tsx (just created — confirms `GameForm` prop shape, `buildInitialState` helper)
    - src/app/games/delete-confirm-modal.tsx (just created — confirms modal prop shape)
    - src/app/checkDeck/page.tsx (canonical client page pattern with useState + fetch + error handling)
    - src/app/components/header.tsx (existing navLinks array — will add one entry)
    - .planning/phases/06-game-tracking-core/06-CONTEXT.md D-11 through D-15 (history table + delete modal) and D-19 through D-21 (page layout + header link)
    - .planning/phases/06-game-tracking-core/06-RESEARCH.md "Pattern 3" (async params) and "Pattern 8" (GET /api/games response shape)
  </read_first>
  <action>
    **Step 1 — Create `src/app/games/new/page.tsx`** (small client wrapper):

    ```typescript
    "use client";
    import { useRouter } from 'next/navigation';
    import { GameForm, type GameFormPayload } from '@/app/games/game-form';

    export default function NewGamePage() {
      const router = useRouter();

      const handleSubmit = async (payload: GameFormPayload) => {
        const res = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to save game');
        }
        router.push('/games');
        router.refresh();
      };

      return (
        <main className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Log a game</h1>
          <GameForm onSubmit={handleSubmit} submitLabel="Save game" />
        </main>
      );
    }
    ```

    **Step 2 — Create `src/app/games/[id]/edit/page.tsx`** (uses Next.js 16 async params):

    ```typescript
    "use client";
    import { use, useEffect, useState } from 'react';
    import { useRouter } from 'next/navigation';
    import { GameForm, buildInitialState, type GameFormPayload, type GameFormState } from '@/app/games/game-form';

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
              setLoadError(res.status === 404 ? 'Game not found' : 'Failed to load game');
              return;
            }
            const data = await res.json();
            if (cancelled) return;
            setInitial(buildInitialState(data.game));
          } catch (err) {
            if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load game');
          }
        })();
        return () => {
          cancelled = true;
        };
      }, [id]);

      const handleSubmit = async (payload: GameFormPayload) => {
        const res = await fetch(`/api/games/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to update game');
        }
        router.push('/games');
        router.refresh();
      };

      return (
        <main className="container mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Edit game</h1>
          {loadError && <p className="text-red-600">{loadError}</p>}
          {!loadError && !initial && <p className="text-muted">Loading...</p>}
          {initial && <GameForm initial={initial} onSubmit={handleSubmit} submitLabel="Save changes" />}
        </main>
      );
    }
    ```

    Note on `use(params)`: Next.js 16 / React 19 provides `use()` to unwrap promises in client components. If this causes a runtime or type issue, fall back to:
    ```typescript
    const [id, setId] = useState<string>('');
    useEffect(() => { params.then((p) => setId(p.id)); }, [params]);
    ```

    **Step 3 — Create `src/app/games/page.tsx`** (history table + expand + delete modal):

    ```typescript
    "use client";
    import { useEffect, useState } from 'react';
    import Link from 'next/link';
    import { DeleteConfirmModal } from '@/app/games/delete-confirm-modal';

    interface Participant {
      id: string;
      gameId: string;
      playerName: string;
      isWinner: boolean;
      isScrewed: boolean;
      deckName: string | null;
    }
    interface Game {
      id: string;
      date: string;
      wonByCombo: boolean;
      notes: string | null;
      createdAt: string;
      participants: Participant[];
    }

    function formatDate(iso: string): string {
      try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return iso;
      }
    }

    export default function GamesPage() {
      const [games, setGames] = useState<Game[]>([]);
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState<string>('');
      const [expanded, setExpanded] = useState<Set<string>>(new Set());
      const [pendingDelete, setPendingDelete] = useState<Game | null>(null);

      useEffect(() => {
        let cancelled = false;
        (async () => {
          try {
            const res = await fetch('/api/games');
            if (!res.ok) throw new Error('Failed to load games');
            const data = await res.json();
            if (cancelled) return;
            setGames(Array.isArray(data.games) ? data.games : []);
          } catch (err) {
            if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load games');
          } finally {
            if (!cancelled) setIsLoading(false);
          }
        })();
        return () => {
          cancelled = true;
        };
      }, []);

      const toggleExpanded = (id: string) => {
        setExpanded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      };

      const handleConfirmDelete = async () => {
        if (!pendingDelete) return;
        const id = pendingDelete.id;
        // Optimistic delete (D-14, D-15)
        setGames((prev) => prev.filter((g) => g.id !== id));
        setPendingDelete(null);
        try {
          const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            setError('Failed to delete game');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete game');
        }
      };

      return (
        <main className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-foreground">Games</h1>
            <Link
              href="/games/new"
              className="px-4 py-2 rounded-md bg-accent text-background font-medium hover:bg-accent/90"
            >
              Log game
            </Link>
          </div>

          {error && <p className="text-red-600 mb-4">{error}</p>}
          {isLoading && <p className="text-muted">Loading...</p>}
          {!isLoading && games.length === 0 && (
            <p className="text-muted">No games logged yet. <Link href="/games/new" className="text-accent underline">Log your first game</Link>.</p>
          )}

          {games.length > 0 && (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-sm text-muted">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Winner</th>
                  <th className="py-2 pr-4">Players</th>
                  <th className="py-2 pr-4">Notes</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {games.map((g) => {
                  const winner = g.participants.find((p) => p.isWinner);
                  return (
                    <>
                      <tr
                        key={g.id}
                        className="border-b border-border hover:bg-surface-hover cursor-pointer"
                        onClick={() => toggleExpanded(g.id)}
                      >
                        <td className="py-2 pr-4 text-sm text-foreground">{formatDate(g.date)}</td>
                        <td className="py-2 pr-4 text-sm text-foreground">
                          {winner ? `${winner.playerName}${winner.deckName ? ` (${winner.deckName})` : ''}` : '—'}
                        </td>
                        <td className="py-2 pr-4 text-sm text-foreground">{g.participants.length}</td>
                        <td className="py-2 pr-4 text-sm text-muted truncate max-w-xs">{g.notes ?? ''}</td>
                        <td className="py-2 pr-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/games/${g.id}/edit`}
                            className="text-accent hover:underline mr-2"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(g)}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                      {expanded.has(g.id) && (
                        <tr key={`${g.id}-expanded`} className="bg-surface">
                          <td colSpan={5} className="py-3 px-4">
                            <ul className="space-y-1 text-sm">
                              {g.participants.map((p) => (
                                <li key={p.id} className="flex items-center gap-3">
                                  <span className="font-medium text-foreground">{p.playerName}</span>
                                  {p.deckName && <span className="text-muted">({p.deckName})</span>}
                                  {p.isWinner && <span className="text-green-600 text-xs">WINNER</span>}
                                  {p.isScrewed && <span className="text-red-600 text-xs">SCREWED</span>}
                                </li>
                              ))}
                              {g.wonByCombo && <li className="text-xs text-muted italic">Won by combo</li>}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}

          <DeleteConfirmModal
            isOpen={pendingDelete !== null}
            gameDate={pendingDelete ? formatDate(pendingDelete.date) : ''}
            onCancel={() => setPendingDelete(null)}
            onConfirm={handleConfirmDelete}
          />
        </main>
      );
    }
    ```

    Note: the `<>` fragment wrapper inside `map` needs a `key` on the fragment. If TypeScript/ESLint complains, wrap with `<Fragment key={g.id}>`. Adjust as needed to match React 19 semantics.

    **Step 4 — Edit `src/app/components/header.tsx`** to add the Games nav link:

    Locate the existing `navLinks` array (currently 2 entries):
    ```typescript
    const navLinks = [
      { href: "/checkDeck", label: "Friend Collections" },
      { href: "/SearchLGS", label: "LGS Search" },
    ]
    ```

    Replace with (insert Games in the middle — alphabetical per RESEARCH.md reference):
    ```typescript
    const navLinks = [
      { href: "/checkDeck", label: "Friend Collections" },
      { href: "/games", label: "Games" },
      { href: "/SearchLGS", label: "LGS Search" },
    ]
    ```

    Do NOT modify any other part of the header — the Link rendering loop already iterates over `navLinks` for both desktop and mobile nav.

    **Step 5 — Run full test suite:**

    Run `npx jest` — all tests MUST remain green. (No new tests added in this task — the Task 1 unit tests cover the form logic; the pages are thin wrappers verified in Task 3.)

    **Do NOT:**
    - Do NOT add a server component version of these pages — client components with fetch match the project pattern per CONVENTIONS.md
    - Do NOT add SSR `fetch` calls or `generateMetadata` — not needed for authenticated internal pages
    - Do NOT reimplement the delete button as a native `confirm()` — D-14 mandates the custom modal
    - Do NOT add pagination UI — D-12 says load all
    - Do NOT change the header's desktop-vs-mobile rendering logic — only add one entry to `navLinks`
  </action>
  <verify>
    <automated>npx jest</automated>
  </verify>
  <acceptance_criteria>
    - `src/app/games/new/page.tsx` exists with `"use client"`, default export, and `fetch('/api/games'` with `method: 'POST'`
    - `src/app/games/[id]/edit/page.tsx` exists with `params: Promise<{ id: string }>` in the component signature
    - `src/app/games/[id]/edit/page.tsx` contains `method: 'PATCH'` fetch
    - `src/app/games/page.tsx` exists with `fetch('/api/games')` and `method: 'DELETE'`
    - `src/app/games/page.tsx` imports `DeleteConfirmModal`
    - `src/app/components/header.tsx` contains literal string `{ href: "/games", label: "Games" }`
    - `src/app/components/header.tsx` still contains both original entries: `"/checkDeck"` with label `"Friend Collections"` and `"/SearchLGS"` with label `"LGS Search"`
    - Header's `navLinks` array now has exactly 3 entries
    - `npx jest` full suite exits 0 (no regressions)
    - `npx tsc --noEmit` exits 0 (TypeScript compiles)
  </acceptance_criteria>
  <done>
    All three pages exist, header gains Games nav link, TypeScript compiles, existing tests still pass.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Human verification of end-to-end game tracking flow</name>
  <files>N/A — this task verifies behavior delivered by Tasks 1 and 2; no files are modified</files>
  <action>Execute the 16-step manual verification procedure described in how-to-verify below. This is a human-driven checkpoint — Claude should present the steps to the user and wait for the resume signal.</action>
  <verify>
    <automated>MISSING — checkpoint:human-verify tasks require manual execution of how-to-verify steps; the automated guard is npm run lint + npx jest from Task 2</automated>
  </verify>
  <done>User types "approved" after all 16 verification steps pass; any failure blocks phase completion and triggers a gap-closure plan.</done>
  <what-built>
    Full Phase 6 feature: rate-limited API routes (games + players + decks + scraper routes), headless Combobox component, GameForm with autocomplete + validation, game history page with expand/edit/delete, delete confirmation modal, and header nav link to /games.
  </what-built>
  <how-to-verify>
    1. Start dev server: `npm run dev` (runs on http://localhost:3000)
    2. Log in with the shared password at `/login`
    3. **Verify header nav:** Confirm a "Games" link appears between "Friend Collections" and "LGS Search" in the header (desktop and mobile hamburger menu)
    4. **Click Games → /games:** Confirm the empty-state message appears ("No games logged yet. Log your first game →") since no games exist yet
    5. **Click "Log game" → /games/new:** Confirm the form loads with date pre-filled to today, 4 empty participant rows, Won by combo checkbox, and notes textarea
    6. **Test player autocomplete:** Click in Player 1, confirm the dropdown seeds from existing users (should show names from the Moxfield users table). Type "zzz" and confirm the "+ Add 'zzz' as new player" row appears. Press Escape to close without selecting.
    7. **Test deck autocomplete:** Click in Deck (first row), confirm dropdown is empty (no games yet). Type "Atraxa" and confirm "+ Add 'Atraxa' as new deck" row appears.
    8. **Fill and submit form:**
       - Row 1: Player = "Alice", Deck = "Atraxa", Winner radio checked
       - Row 2: Player = "Bob", Deck = "Edric", Screwed checkbox checked
       - Notes: "Test game from checkpoint"
       - Click "Save game" → should navigate to /games with the new game visible in the table
    9. **Verify list render:** Confirm the row shows today's date, "Alice (Atraxa)" in Winner column, "2" players, notes snippet, Edit and Delete links
    10. **Test row expand:** Click the row (not the action buttons). Confirm the expanded panel shows both Alice (WINNER tag) and Bob (SCREWED tag) with deck names.
    11. **Test Edit:** Click Edit → navigates to /games/[id]/edit → form pre-populates with the Alice/Bob data, date, notes. Change notes to "edited" and click "Save changes" → navigates back to /games with updated notes visible.
    12. **Test Delete:** Click Delete → DeleteConfirmModal appears with "Delete game from {date}? This cannot be undone." Press Escape → modal closes without deleting. Click Delete again → this time click the red "Delete" button → row disappears optimistically and the empty state returns.
    13. **Test autocomplete re-seed:** Create another game. This time in Player 1, confirm "Alice" and "Bob" now appear as suggestions (from the previously-entered participant). In Deck, confirm "Atraxa" and "Edric" now appear.
    14. **Test validation:** Create a game with no winner selected → click Save → banner "Exactly one winner required". Select winner → clear the winner's player name → click Save → banner still shows (winner row is empty). Fix and save.
    15. **Test rate limit on scraper (manual burst):** In a terminal, run `for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/checkDeck -H "Content-Type: application/json" -d '{"decklist":"1 Lightning Bolt"}' -H "Cookie: session=<copy-from-browser-devtools>"; done`. Expect the first 10 to return 200 and requests 11-12 to return 429. (Note: the in-memory rate limiter resets on dev server restart.)
    16. **Verify no console errors:** Open browser devtools Console tab. No red errors should appear during any of the above flows.
  </how-to-verify>
  <resume-signal>
    Type "approved" if all 16 steps pass. If any fail, describe which step and what went wrong.
  </resume-signal>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| User input (form fields) → client state | Untrusted; rendered via React JSX auto-escape |
| Client state → POST/PATCH /api/games body | Server-side gameSchema.parse enforces sanitization |
| API response → rendered in table | Data originated from our own DB (gameSchema-validated on insert); still rendered via JSX auto-escape |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-06-01 | Spoofing | Unauthenticated access to /games/** | mitigate (inherited) | proxy.ts HMAC cookie middleware via blocklist matcher covers all /games paths automatically |
| T-06-03 | Tampering / XSS | Rendering playerName, deckName, notes, and "Add xyz" combobox row | mitigate | 100% JSX rendering, zero `dangerouslySetInnerHTML` (verified by acceptance grep). React auto-escapes text nodes. Notes with `<script>` tags render as literal text. |
| T-06-05 | Tampering / Mass Assignment | Client sends crafted payload with extra fields | mitigate | Server-side gameSchema.parse strips unknown fields (enforced by 06-04). Client form only builds the known shape via `validateGameForm`. |
| T-06-09 | Info Disclosure | Error bodies from API surfaced to user | mitigate | Error message in form is `err.message` (client-side); API errors return sanitized `{ error: 'Failed to ...' }` strings without stack traces |
| T-06-CSRF | CSRF on POST/PATCH/DELETE | Cross-site form submission | mitigate (inherited) | Session cookie SameSite policy in existing auth system (proxy.ts). No new CSRF surface. |
| T-06-optimistic | Data Integrity | Optimistic delete desyncs on server error | accept (D-15) | On server error, the row is already removed from client state; user sees an error message and can refresh. Acceptable UX tradeoff per D-15. |

</threat_model>

<verification>
- `npx jest` full suite green (includes game-form unit tests)
- `npx tsc --noEmit` compiles without error
- Header has 3 nav links including Games
- /games, /games/new, /games/[id]/edit pages render without runtime errors
- Delete modal opens, cancels on Escape, deletes on confirm
- Autocomplete seeds from /api/players and /api/decks on mount
- End-to-end checkpoint verification passes (Task 3)
</verification>

<success_criteria>
- User can log a new game, view it in history, expand participants, edit, and delete
- Empty state shown when no games exist
- Rate limiting on scraper + game routes verified by manual curl burst
- No new dependencies added
- All 29 CONTEXT.md decisions implemented at full fidelity (not "v1 static" reductions)
</success_criteria>

<output>
After completion, create `.planning/phases/06-game-tracking-core/06-06-SUMMARY.md` documenting: all files created/modified, the end-to-end flow, any deviations from the plan, and confirmation that GAME-01..09 are fully satisfied at the UI layer.
</output>
