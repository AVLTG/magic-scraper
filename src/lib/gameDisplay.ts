import type { Game, Participant } from '@/app/games/page';

export function getDisplayWinner(
  game: Game
): { primary: Participant; othersCount: number } | null {
  const winners = game.participants.filter((p) => p.isWinner);
  if (winners.length === 0) return null;
  if (winners.length === 1) return { primary: winners[0], othersCount: 0 };

  if (game.variant === 'KING') {
    const king = winners.find((w) => w.role === 'KING');
    if (king) return { primary: king, othersCount: winners.length - 1 };
  }

  const sorted = [...winners].sort((a, b) =>
    a.playerName.toLowerCase().localeCompare(b.playerName.toLowerCase())
  );
  return { primary: sorted[0], othersCount: sorted.length - 1 };
}
