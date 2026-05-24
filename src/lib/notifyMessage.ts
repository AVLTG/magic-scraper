export interface NotifyParticipant {
  playerName: string;
  isWinner: boolean;
  isRandom: boolean;
  deckName: string | null;
  role: string | null;
}

export interface GameForNotify {
  variant: string;
  wonByCombo: boolean;
  participants: NotifyParticipant[];
}

const NO_DECK_FALLBACK = 'a deck they forgot to list';

function displayName(p: NotifyParticipant): string {
  return p.isRandom ? 'Random' : p.playerName;
}

function comboClause(wonByCombo: boolean): string {
  return wonByCombo ? 'via combo' : 'without any combos';
}

function alphabetical<T extends { playerName: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) =>
    a.playerName.toLowerCase().localeCompare(b.playerName.toLowerCase())
  );
}

function formatNameWithDeck(p: NotifyParticipant): string {
  const name = displayName(p);
  if (p.deckName && p.deckName.trim() !== '') {
    return `${name} (${p.deckName})`;
  }
  return name;
}

function formatRoyaltyWinner(p: NotifyParticipant): string {
  const name = displayName(p);
  const roleLabel = p.role === 'KING' ? 'King' : 'Squire';
  if (p.deckName && p.deckName.trim() !== '') {
    return `${name} (${roleLabel}, ${p.deckName})`;
  }
  return `${name} (${roleLabel})`;
}

export function buildNotifyMessage(game: GameForNotify, origin: string): string {
  const winners = game.participants.filter((p) => p.isWinner);
  const combo = comboClause(game.wonByCombo);
  const tail = `Check it out at ${origin}/games`;

  if (game.variant === 'STAR') {
    if (winners.length === 1) {
      const w = winners[0];
      const deck = w.deckName && w.deckName.trim() !== '' ? w.deckName : NO_DECK_FALLBACK;
      return `New Star Commander game added! ${displayName(w)} won using ${deck} ${combo}. ${tail}`;
    }
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    const joined =
      parts.length === 2 ? `${parts[0]} and ${parts[1]}` : parts.join(', ');
    return `New Star Commander game added! ${joined} won together ${combo}. ${tail}`;
  }

  if (game.variant === 'KING') {
    const isRoyalty = winners.some((w) => w.role === 'KING');
    if (isRoyalty) {
      const king = winners.find((w) => w.role === 'KING')!;
      const squires = alphabetical(winners.filter((w) => w.role !== 'KING'));
      const parts = [formatRoyaltyWinner(king), ...squires.map(formatRoyaltyWinner)];
      return `New King Commander game added! Royalty won — ${parts.join(', ')} — ${combo}. ${tail}`;
    }
    const sorted = alphabetical(winners);
    const parts = sorted.map(formatNameWithDeck);
    return `New King Commander game added! Assassins won — ${parts.join(', ')} — ${combo}. ${tail}`;
  }

  // COMMANDER (default)
  const w = winners[0];
  const deck = w?.deckName && w.deckName.trim() !== '' ? w.deckName : NO_DECK_FALLBACK;
  const name = w ? displayName(w) : 'Someone';
  return `New Commander game added! ${name} won using ${deck} ${combo}. ${tail}`;
}
