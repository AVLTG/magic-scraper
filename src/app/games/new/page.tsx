"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameForm, type GameFormPayload } from '@/app/games/game-form';

type NotifyStatus = 'idle' | 'sending' | 'sent' | 'error';

export default function NewGamePage() {
  const router = useRouter();
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

  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">Log a game</h1>
      <GameForm onSubmit={handleSubmit} submitLabel="Save game" />
    </main>
  );
}
