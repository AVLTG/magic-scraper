"use client";
import { Fragment, useEffect, useState } from 'react';
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
        <p className="text-muted">
          No games logged yet.{' '}
          <Link href="/games/new" className="text-accent underline">
            Log your first game
          </Link>
          .
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
            {games.map((g) => {
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
