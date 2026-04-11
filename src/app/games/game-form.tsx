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
  rows: ParticipantRow[]; // always length 4
  winnerIndex: number; // 0..3 or -1
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

/** Pure helper: strip rows whose playerName is empty/whitespace. */
export function filterEmptyRows(rows: ParticipantRow[]): ParticipantRow[] {
  return rows.filter((r) => r.playerName.trim() !== '');
}

/** Pure helper: validate form state and return either an error map or a ready-to-POST payload. */
export function validateGameForm(state: GameFormState): ValidationResult {
  const errors: GameFormErrors = {};

  if (!state.date || state.date.trim() === '') {
    errors.date = 'Date is required';
  }

  // Track original indices so we can map winnerIndex after filtering
  const filled = state.rows
    .map((r, i) => ({ ...r, _originalIndex: i }))
    .filter((r) => r.playerName.trim() !== '');

  if (filled.length === 0) {
    errors.form = 'At least one participant required';
  }

  // Winner must be one of the filled rows (Pitfall 4)
  const winnerFilledIndex = filled.findIndex((r) => r._originalIndex === state.winnerIndex);
  if (winnerFilledIndex === -1 && !errors.form) {
    errors.form = 'Exactly one winner required';
  } else if (winnerFilledIndex === -1 && filled.length === 0) {
    // Already reported as "at least one participant"; still mark winner missing
    errors.form = errors.form ?? 'Exactly one winner required';
  }

  // Length caps (server-side zod re-validates; this is for UX feedback)
  const rowErrors: Record<number, string> = {};
  state.rows.forEach((r, i) => {
    if (r.playerName.length > 100) rowErrors[i] = 'Player name too long (max 100)';
    else if (r.deckName.length > 100) rowErrors[i] = 'Deck name too long (max 100)';
  });
  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;

  if (errors.date || errors.form || errors.rows) {
    return { ok: false, errors };
  }

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

/** Build a GameFormState from an API game response (for edit-mode pre-population). */
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
  const [errors, setErrors] = useState<GameFormErrors>({});
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

      <div className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-foreground mb-1">Date</label>
          <input
            type="date"
            value={state.date}
            onChange={(e) => setState((s) => ({ ...s, date: e.target.value }))}
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-foreground"
          />
          {errors.date && <p className="text-xs text-red-600 mt-1">{errors.date}</p>}
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
