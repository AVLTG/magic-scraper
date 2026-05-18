"use client";
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GameForm,
  buildInitialState,
  type GameFormPayload,
  type GameFormState,
} from '@/app/games/game-form';

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
          if (!cancelled) {
            setLoadError(res.status === 404 ? 'Game not found' : 'Failed to load game');
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setInitial(buildInitialState(data.game));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load game');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSubmit = async (payload: GameFormPayload) => {
    // PATCH: strip variant defensively — the API ignores it anyway, but
    // omitting it from the wire payload matches the design intent.
    const { variant: _omit, ...patchBody } = payload;
    const res = await fetch(`/api/games/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to update game'
      );
    }
    router.push('/games');
    router.refresh();
  };

  return (
    <main className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground mb-4">Edit game</h1>
      {loadError && <p className="text-red-600">{loadError}</p>}
      {!loadError && !initial && <p className="text-muted">Loading...</p>}
      {initial && (
        <GameForm
          playerCount={initial.rows.length}
          variant={initial.variant}
          initial={initial}
          onSubmit={handleSubmit}
          submitLabel="Save changes"
        />
      )}
    </main>
  );
}
