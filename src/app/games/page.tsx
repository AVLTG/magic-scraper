"use client";
import { Fragment, useEffect, useMemo, useState } from 'react';
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

// Phase 6.1 filter toolbar (D-16 through D-23)

// Export the existing interfaces so tests and (potentially) sibling modules can import them.
export type { Participant, Game };

export interface FilterState {
  winner: string | null;
  playerCount: 2 | 3 | 4 | null;
  players: string[];
}

/**
 * Phase 6.1 D-17: AND across filter types, OR within the multi-select.
 * Returns true when ALL active (non-null, non-empty) filter types pass for the game.
 * An empty filter state (no active filters) returns true — empty = show everything.
 */
export function matchesAllFilters(game: Game, filters: FilterState): boolean {
  if (filters.winner !== null) {
    const winner = game.participants.find((p) => p.isWinner);
    if (!winner || winner.playerName !== filters.winner) return false;
  }
  if (filters.playerCount !== null) {
    if (game.participants.length !== filters.playerCount) return false;
  }
  if (filters.players.length > 0) {
    const names = new Set(game.participants.map((p) => p.playerName));
    const anyMatch = filters.players.some((p) => names.has(p));
    if (!anyMatch) return false;
  }
  return true;
}

/**
 * Phase 6.1 D-19: distinct winner names from currently-loaded games, alphabetized case-insensitive.
 */
export function deriveWinnerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      if (p.isWinner) set.add(p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * Phase 6.1 D-20: distinct participant names (winners + non-winners) from currently-loaded games, alphabetized.
 */
export function derivePlayerOptions(games: Game[]): string[] {
  const set = new Set<string>();
  for (const g of games) {
    for (const p of g.participants) {
      set.add(p.playerName);
    }
  }
  return Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function formatDate(iso: string): string {
  try {
    // Game dates are stored as UTC midnight of the chosen calendar day
    // (see game-form.tsx: new Date(state.date).toISOString()). Render in
    // UTC so the list display matches the stored calendar date rather
    // than converting to the viewer's local timezone, which would shift
    // the display by one day for any viewer west of UTC.
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
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

  // Phase 6.1 D-21: ephemeral client-side filter state (no URL state, no search params)
  const [winnerFilter, setWinnerFilter] = useState<string | null>(null);
  const [countFilter, setCountFilter] = useState<2 | 3 | 4 | null>(null);
  const [playerFilters, setPlayerFilters] = useState<string[]>([]);

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

  // Phase 6.1 D-19, D-20: dynamic option sources from currently-loaded games
  const winnerOptions = useMemo(() => deriveWinnerOptions(games), [games]);
  const playerOptions = useMemo(() => derivePlayerOptions(games), [games]);

  // Phase 6.1 D-22: derived filtered list — no refetch, no loading state
  const filteredGames = useMemo(
    () =>
      games.filter((g) =>
        matchesAllFilters(g, { winner: winnerFilter, playerCount: countFilter, players: playerFilters })
      ),
    [games, winnerFilter, countFilter, playerFilters]
  );

  // Phase 6.1 D-23: any filter active?
  const anyFilterActive = winnerFilter !== null || countFilter !== null || playerFilters.length > 0;

  const clearFilters = () => {
    setWinnerFilter(null);
    setCountFilter(null);
    setPlayerFilters([]);
  };

  const togglePlayerFilter = (name: string) => {
    setPlayerFilters((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
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

      {games.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-muted mb-1">Winner</label>
            <select
              value={winnerFilter ?? ''}
              onChange={(e) => setWinnerFilter(e.target.value === '' ? null : e.target.value)}
              className="px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm"
              disabled={winnerOptions.length === 0}
            >
              <option value="">Any winner</option>
              {winnerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Player count</label>
            <select
              value={countFilter ?? ''}
              onChange={(e) =>
                setCountFilter(e.target.value === '' ? null : (Number(e.target.value) as 2 | 3 | 4))
              }
              className="px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm"
            >
              <option value="">Any count</option>
              <option value="2">2 players</option>
              <option value="3">3 players</option>
              <option value="4">4 players</option>
            </select>
          </div>

          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-muted mb-1">
              Players {playerFilters.length > 0 && `(${playerFilters.length} selected)`}
            </label>
            <details className="relative">
              <summary className="px-3 py-2 rounded-md border border-border bg-surface text-foreground text-sm cursor-pointer list-none">
                {playerFilters.length === 0 ? 'Any players' : playerFilters.join(', ')}
              </summary>
              <div className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-md border border-border bg-surface shadow-lg p-2">
                {playerOptions.length === 0 && (
                  <p className="text-xs text-muted italic px-1 py-1">No players yet</p>
                )}
                {playerOptions.map((name) => (
                  <label
                    key={name}
                    className="flex items-center gap-2 px-1 py-1 text-sm text-foreground hover:bg-surface-hover rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={playerFilters.includes(name)}
                      onChange={() => togglePlayerFilter(name)}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>

          {anyFilterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-md border border-border bg-surface text-accent text-sm hover:bg-surface-hover"
              aria-label="Clear filters"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {error && <p className="text-red-600 mb-4">{error}</p>}
      {isLoading && <p className="text-muted">Loading...</p>}
      {!isLoading && games.length === 0 && (
        <p className="text-muted">
          No games logged yet.{' '}
          <Link href="/games/new" className="text-accent underline">
            Log your first game
          </Link>
          .
        </p>
      )}
      {!isLoading && games.length > 0 && filteredGames.length === 0 && (
        <p className="text-muted">
          No games match your filters.{' '}
          <button
            type="button"
            onClick={clearFilters}
            className="text-accent underline"
          >
            Clear filters
          </button>
        </p>
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
            {filteredGames.map((g) => {
              const winner = g.participants.find((p) => p.isWinner);
              return (
                <Fragment key={g.id}>
                  <tr
                    className="border-b border-border hover:bg-surface-hover cursor-pointer"
                    onClick={() => toggleExpanded(g.id)}
                  >
                    <td className="py-2 pr-4 text-sm text-foreground">{formatDate(g.date)}</td>
                    <td className="py-2 pr-4 text-sm text-foreground">
                      {winner
                        ? `${winner.playerName}${winner.deckName ? ` (${winner.deckName})` : ''}`
                        : '—'}
                    </td>
                    <td className="py-2 pr-4 text-sm text-foreground">{g.participants.length}</td>
                    <td className="py-2 pr-4 text-sm text-muted truncate max-w-xs">
                      {g.notes ?? ''}
                    </td>
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
                    <tr className="bg-surface">
                      <td colSpan={5} className="py-3 px-4">
                        <ul className="space-y-1 text-sm">
                          {g.participants.map((p) => (
                            <li key={p.id} className="flex items-center gap-3">
                              <span className="font-medium text-foreground">{p.playerName}</span>
                              {p.deckName && <span className="text-muted">({p.deckName})</span>}
                              {p.isWinner && (
                                <span className="text-green-600 text-xs">WINNER</span>
                              )}
                              {p.isScrewed && (
                                <span className="text-red-600 text-xs">SCREWED</span>
                              )}
                            </li>
                          ))}
                          {g.wonByCombo && (
                            <li className="text-xs text-muted italic">Won by combo</li>
                          )}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
