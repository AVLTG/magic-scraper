import { buildNotifyMessage, type GameForNotify } from '../src/lib/notifyMessage';

const ORIGIN = 'http://localhost:3000';

function mkP(over: Partial<GameForNotify['participants'][number]>): GameForNotify['participants'][number] {
  return {
    playerName: 'X',
    isWinner: false,
    isRandom: false,
    deckName: null,
    role: null,
    ...over,
  };
}

function mkGame(over: Partial<GameForNotify>): GameForNotify {
  return {
    variant: 'COMMANDER',
    wonByCombo: false,
    participants: [],
    ...over,
  };
}

describe('buildNotifyMessage — COMMANDER', () => {
  it('emits 1-winner message with deck and combo', () => {
    const g = mkGame({
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Alice won using Atraxa via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('falls back to "a deck they forgot to list" when winner has no deck', () => {
    const g = mkGame({
      participants: [mkP({ playerName: 'Alice', isWinner: true, deckName: null })],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Alice won using a deck they forgot to list without any combos. Check it out at http://localhost:3000/games'
    );
  });

  it('uses Random as display name for random winner but keeps real deck', () => {
    const g = mkGame({
      participants: [
        mkP({ playerName: 'Whoever', isWinner: true, isRandom: true, deckName: 'Edric' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Commander game added! Random won using Edric without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — STAR', () => {
  it('emits 1-winner message identical shape to COMMANDER but with Star prefix', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        ...Array(4).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice won using Atraxa without any combos. Check it out at http://localhost:3000/games'
    );
  });

  it('emits 2-winner "won together" message with both decks, alphabetical', () => {
    const g = mkGame({
      variant: 'STAR',
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, deckName: 'Edric' }),
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        ...Array(3).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice (Atraxa) and Bob (Edric) won together via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('omits deck parenthetical for STAR-2 winners with no deck', () => {
    const g = mkGame({
      variant: 'STAR',
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: null }),
        mkP({ playerName: 'Bob', isWinner: true, deckName: 'Edric' }),
        ...Array(3).fill(0).map((_, i) => mkP({ playerName: `P${i}` })),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Star Commander game added! Alice and Bob (Edric) won together without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — KING Royalty', () => {
  it('lists KING first then squires alphabetical with role labels', () => {
    const g = mkGame({
      variant: 'KING',
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: 'Edric' }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Atraxa' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'SQUIRE', deckName: 'Kaalia' }),
        mkP({ playerName: 'Dan', role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', role: 'ASSASSIN' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire, Edric), Carol (Squire, Kaalia) — via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('omits deck part when a royal winner has no deck', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Bob', isWinner: true, role: 'SQUIRE', deckName: null }),
        mkP({ playerName: 'Zelda', isWinner: true, role: 'KING', deckName: 'Atraxa' }),
        mkP({ playerName: 'Dan', role: 'ASSASSIN' }),
        mkP({ playerName: 'Eve', role: 'ASSASSIN' }),
        mkP({ playerName: 'Fred', role: 'ASSASSIN' }),
        mkP({ playerName: 'Gus', role: 'ASSASSIN' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Royalty won — Zelda (King, Atraxa), Bob (Squire) — without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe('buildNotifyMessage — KING Assassins', () => {
  it('lists assassins alphabetical with decks', () => {
    const g = mkGame({
      variant: 'KING',
      participants: [
        mkP({ playerName: 'Zelda', isWinner: false, role: 'KING' }),
        mkP({ playerName: 'Alex', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Beth', isWinner: false, role: 'SQUIRE' }),
        mkP({ playerName: 'Dan', isWinner: true, role: 'ASSASSIN', deckName: 'Voja' }),
        mkP({ playerName: 'Carol', isWinner: true, role: 'ASSASSIN', deckName: 'Kaalia' }),
        mkP({ playerName: 'Eve', isWinner: true, role: 'ASSASSIN', deckName: 'Atraxa' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New King Commander game added! Assassins won — Carol (Kaalia), Dan (Voja), Eve (Atraxa) — without any combos. Check it out at http://localhost:3000/games'
    );
  });
});
