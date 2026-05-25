import { getDisplayWinner } from '../src/lib/gameDisplay';
import type { Game, Participant } from '../src/app/games/page';

function mkP(over: Partial<Participant>): Participant {
  return {
    id: 'p-' + (over.playerName ?? 'x'),
    gameId: 'g1',
    playerName: 'X',
    isWinner: false,
    isScrewed: false,
    isRandom: false,
    deckName: null,
    role: null,
    ...over,
  };
}

function mkGame(over: Partial<Game>): Game {
  return {
    id: 'g1',
    date: '2026-05-23T00:00:00.000Z',
    wonByCombo: false,
    variant: 'COMMANDER',
    bestOf: null,
    comboWins: null,
    isImported: false,
    notes: null,
    createdAt: '2026-05-23T00:00:00.000Z',
    participants: [],
    ...over,
  };
}

describe('getDisplayWinner', () => {
  it('returns null for zero winners (defensive fallback)', () => {
    const g = mkGame({
      participants: [mkP({ playerName: 'A' }), mkP({ playerName: 'B' })],
    });
    expect(getDisplayWinner(g)).toBeNull();
  });

  it('returns the single winner with othersCount=0', () => {
    const g = mkGame({
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
    expect(out?.othersCount).toBe(0);
  });

  it('returns alphabetical-first for STAR multi-winner', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Charlie', isWinner: true, deckName: 'Kaalia' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
        mkP({ playerName: 'Dan' }),
        mkP({ playerName: 'Eve' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
    expect(out?.othersCount).toBe(1);
  });

  it('returns the KING participant for KING-Royalty win', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, role: 'SQUIRE', deckName: 'Atraxa' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Edric' }),
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: 'Voja' }),
        mkP({ playerName: 'Dan', isWinner: false, role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', isWinner: false, role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', isWinner: false, role: 'ASSASSIN' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Zelda');
    expect(out?.primary.role).toBe('KING');
    expect(out?.othersCount).toBe(2);
  });

  it('returns alphabetical-first for KING-Assassins win (no KING in winners)', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Alice', isWinner: false, role: 'KING' }),
        mkP({ playerName: 'Bob', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'ASSASSIN', deckName: 'Atraxa' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'ASSASSIN', deckName: 'Edric' }),
        mkP({ playerName: 'Dan', isWinner: true, role: 'ASSASSIN', deckName: 'Voja' }),
        mkP({ playerName: 'Eve', isWinner: false, role: 'SQUIRE' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Carol');
    expect(out?.othersCount).toBe(2);
  });

  it('is case-insensitive on alphabetical sort', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'bob', isWinner: true, deckName: 'X' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Y' }),
        mkP({ playerName: 'C' }),
        mkP({ playerName: 'D' }),
        mkP({ playerName: 'E' }),
      ],
    });
    const out = getDisplayWinner(g);
    expect(out?.primary.playerName).toBe('Alice');
  });
});
