"use client";
import { useState, useEffect, useMemo, FormEvent } from 'react';
import { Combobox } from '@/app/components/combobox';
import { tieredDeckItems } from '@/lib/deckTiers';
import type { GameVariant, ParticipantRole } from '@/lib/validators';
import { BEST_OF_FORMATS, maxComboWinsFor, isSingleWinnerVariant } from '@/lib/gameFormats';

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
  winnerIndex: number;                    // COMMANDER only
  winnerIndices: number[];                // STAR only (0-2 entries)
  roles: (ParticipantRole | null)[];      // KING only — index-aligned with rows
  winningTeam: WinningTeam | null;        // KING only
  variant: GameVariant;
  bestOf: number | null;
  comboWins: number | null;
}

export interface GameFormPayload {
  date: string;
  wonByCombo: boolean;
  notes?: string;
  variant?: GameVariant;
  bestOf?: number | null;
  comboWins?: number | null;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    isRandom: boolean;
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

/**
 * Phase 6.1 D-10, D-11: derive the list of already-filled player names from all rows
 * EXCEPT the caller's own row. Used to populate the `excludeItems` prop on each row's
 * player-name Combobox so the dropdown hides names already in use by other participants.
 */
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

export function deckGroupsForRow(
  playerName: string,
  decksByOwner: { ownerName: string; deckNames: string[] }[],
  allDeckNames: string[],
  input: string
) {
  const key = playerName.trim().toLowerCase();
  const owned = decksByOwner.find((o) => o.ownerName.trim().toLowerCase() === key)?.deckNames ?? [];
  const ownedSet = new Set(owned.map((d) => d.toLowerCase()));
  const others = allDeckNames.filter((d) => !ownedSet.has(d.toLowerCase()));
  return tieredDeckItems(owned, others, input);
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

  const rowErrors: Record<number, string> = {};
  state.rows.forEach((r, i) => {
    if (r.playerName.length > 100) rowErrors[i] = 'Player name too long (max 100)';
    else if (r.deckName.length > 100) rowErrors[i] = 'Deck name too long (max 100)';
  });
  if (Object.keys(rowErrors).length > 0) errors.rows = rowErrors;

  const isBestOf = BEST_OF_FORMATS.has(state.variant);

  if (!errors.form) {
    if (state.variant === 'COMMANDER') {
      if (state.winnerIndex < 0 || state.winnerIndex >= state.rows.length) {
        errors.form = 'Exactly one winner required';
      }
    } else if (state.variant === 'STAR') {
      if (state.winnerIndices.length < 1 || state.winnerIndices.length > 2) {
        errors.form = 'Star Commander games need 1 or 2 winners';
      }
    } else if (state.variant === 'KING') {
      const kingCount = state.roles.filter((r) => r === 'KING').length;
      const unassigned = state.roles.some((r) => r == null);
      if (unassigned) {
        errors.form = 'Every player needs a role (King, Squire, or Assassin)';
      } else if (kingCount !== 1) {
        errors.form = 'King Commander games need exactly one King';
      } else if (state.winningTeam == null) {
        errors.form = 'Pick the winning team (Royalty or Assassins)';
      }
    } else if (state.variant === 'BRAWL' || isBestOf) {
      // Both BRAWL and best-of variants are heads-up: exactly one winner among 2 rows.
      if (state.winnerIndex < 0 || state.winnerIndex >= state.rows.length) {
        errors.form = 'Exactly one winner required';
      }
    }
  }

  // Best-of-specific bestOf/comboWins constraints
  if (!errors.form) {
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
  }

  if (errors.date || errors.form || errors.rows) {
    return { ok: false, errors };
  }

  const participants = state.rows.map((r, i) => {
    let isWinner = false;
    let role: ParticipantRole | undefined;

    if (isSingleWinnerVariant(state.variant)) {
      isWinner = i === state.winnerIndex;
    } else if (state.variant === 'STAR') {
      isWinner = state.winnerIndices.includes(i);
    } else {
      // KING
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
      isRandom: r.isRandom,
      deckName: r.deckName.trim() === '' ? undefined : r.deckName.trim(),
      role,
    };
  });

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
}

function emptyRow(): ParticipantRow {
  return { playerName: '', deckName: '', isWinner: false, isScrewed: false, isRandom: false };
}

/**
 * Phase 6.2 D-38: For 2-player non-COMMANDER variants (BRAWL + best-of formats),
 * the second player is typically a Random opponent (Arena / shop matchup), so
 * auto-check `isRandom` on row 2. COMMANDER 2-player and any 3-player+ game
 * leaves all rows un-checked.
 */
export function initialRows(playerCount: number, variant: GameVariant): ParticipantRow[] {
  const rows = Array.from({ length: playerCount }, emptyRow);
  if (playerCount === 2 && variant !== 'COMMANDER') {
    rows[1] = { ...rows[1], isRandom: true };
  }
  return rows;
}

/** Build a GameFormState from an API game response (for edit-mode pre-population). */
export function buildInitialState(game: {
  date: string | Date;
  wonByCombo: boolean;
  notes: string | null;
  variant?: GameVariant;
  bestOf?: number | null;
  comboWins?: number | null;
  participants: {
    playerName: string;
    isWinner: boolean;
    isScrewed: boolean;
    isRandom?: boolean;
    deckName: string | null;
    role?: ParticipantRole | null;
  }[];
}): GameFormState {
  const variant: GameVariant = game.variant ?? 'COMMANDER';
  const rows: ParticipantRow[] = game.participants.map((p) => ({
    playerName: p.playerName,
    deckName: p.deckName ?? '',
    isWinner: p.isWinner,
    isScrewed: p.isScrewed,
    isRandom: p.isRandom ?? false,
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
    bestOf: game.bestOf ?? null,
    comboWins: game.comboWins ?? null,
  };
}

export interface GameFormProps {
  playerCount: number;
  variant?: GameVariant;
  bestOf?: number | null;
  initial?: GameFormState;
  submitLabel?: string;
  onSubmit: (payload: GameFormPayload) => Promise<void> | void;
}

export function GameForm({
  playerCount,
  variant = 'COMMANDER',
  bestOf,
  initial,
  submitLabel = 'Save game',
  onSubmit,
}: GameFormProps) {
  const [state, setState] = useState<GameFormState>(
    initial ?? {
      // en-CA locale formats dates as YYYY-MM-DD and respects the viewer's
      // local timezone. Using .toISOString() here would default to UTC day,
      // which flips to "tomorrow" late in the evening for viewers west of
      // UTC and silently pre-populates the wrong calendar day.
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
  const [playerItems, setPlayerItems] = useState<string[]>([]);
  const [userDeckNames, setUserDeckNames] = useState<string[]>([]);
  const [otherDeckNames, setOtherDeckNames] = useState<string[]>([]);
  const [decksByOwner, setDecksByOwner] = useState<{ ownerName: string; deckNames: string[] }[]>([]);
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
          setUserDeckNames(
            Array.isArray(data.userDecks) ? data.userDecks.map((d: { name: string }) => d.name) : []
          );
          setOtherDeckNames(
            Array.isArray(data.otherDecks) ? data.otherDecks.map((d: { name: string }) => d.name) : []
          );
          setDecksByOwner(Array.isArray(data.decksByOwner) ? data.decksByOwner : []);
        }
      } catch (err) {
        console.error('Failed to seed autocomplete:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allDeckNames = useMemo(
    () => [...userDeckNames, ...otherDeckNames],
    [userDeckNames, otherDeckNames]
  );

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

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Participants</legend>
        {state.rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center rounded-md border border-border p-2 sm:border-0 sm:p-0"
          >
            <div className="col-span-2 sm:col-span-1">
              <Combobox
                items={playerItems}
                value={r.playerName}
                onChange={(v) => updateRow(i, { playerName: v })}
                placeholder={`Player ${i + 1}`}
                addLabel="player"
                excludeItems={excludeItemsForRow(i, state)}
                excludeLabel="Player already in game"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Combobox
                groups={deckGroupsForRow(r.playerName, decksByOwner, allDeckNames, r.deckName)}
                value={r.deckName}
                onChange={(v) => updateRow(i, { deckName: v })}
                placeholder="Deck (optional)"
                addLabel="deck"
              />
            </div>
            {isSingleWinnerVariant(state.variant) && (
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
            {state.variant === 'KING' && (
              <div
                role="radiogroup"
                aria-label={`Role for player ${i + 1}`}
                className="flex items-center gap-1 text-xs text-muted"
              >
                {(['KING', 'SQUIRE', 'ASSASSIN'] as const).map((role) => (
                  <label key={role} className="flex items-center gap-0.5">
                    <input
                      type="radio"
                      name={`role-${i}`}
                      aria-label={role.charAt(0) + role.slice(1).toLowerCase()}
                      checked={state.roles[i] === role}
                      onChange={() =>
                        setState((s) => ({
                          ...s,
                          roles: s.roles.map((existing, idx) =>
                            idx === i
                              ? role
                              : // Enforce single-KING: if this row becomes KING, clear any other KING.
                              role === 'KING' && existing === 'KING'
                              ? null
                              : existing
                          ),
                        }))
                      }
                    />
                    {role[0]}
                  </label>
                ))}
              </div>
            )}
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
            {errors.rows?.[i] && (
              <p className="col-span-2 sm:col-span-4 text-xs text-red-600">{errors.rows[i]}</p>
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
