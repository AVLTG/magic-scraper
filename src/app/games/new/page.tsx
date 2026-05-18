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
    if (q === null) return null;
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
