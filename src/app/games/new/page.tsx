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
      throw new Error(
        data.error ? `Failed to save: ${JSON.stringify(data.error)}` : 'Failed to save game'
      );
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
