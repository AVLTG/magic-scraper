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
    bestOf: null,
    comboWins: null,
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

describe('buildNotifyMessage — BRAWL', () => {
  it('produces a Commander-shape line labeled "Brawl" with combo text', () => {
    const g = mkGame({
      variant: 'BRAWL',
      wonByCombo: true,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob', deckName: 'Mono-Red' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Brawl game added! Alice won using Atraxa via combo. Check it out at http://localhost:3000/games'
    );
  });

  it('shows "without any combos" when wonByCombo is false', () => {
    const g = mkGame({
      variant: 'BRAWL',
      wonByCombo: false,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Atraxa' }),
        mkP({ playerName: 'Bob', deckName: 'Burn' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Brawl game added! Alice won using Atraxa without any combos. Check it out at http://localhost:3000/games'
    );
  });

  it('falls back to NO_DECK_FALLBACK when winner has no deck', () => {
    const g = mkGame({
      variant: 'BRAWL',
      wonByCombo: false,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true }),
        mkP({ playerName: 'Bob' }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      'New Brawl game added! Alice won using a deck they forgot to list without any combos. Check it out at http://localhost:3000/games'
    );
  });
});

describe.each([
  { variant: 'STANDARD', label: 'Standard' },
  { variant: 'PAUPER', label: 'Pauper' },
  { variant: 'DRAFT', label: 'Draft' },
  { variant: 'PRERELEASE', label: 'Prerelease' },
  { variant: 'SEALED', label: 'Sealed' },
  { variant: 'CUBE', label: 'Cube' },
] as const)('buildNotifyMessage — best-of variant %p', ({ variant, label }) => {
  it('Bo1 with comboWins 0 → "without any combos", no parenthetical', () => {
    const g = mkGame({
      variant,
      wonByCombo: false,
      bestOf: 1,
      comboWins: 0,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} game added! Alice won using Boros without any combos. Check it out at http://localhost:3000/games`
    );
  });

  it('Bo1 with comboWins 1 → "via combo", no parenthetical', () => {
    const g = mkGame({
      variant,
      wonByCombo: true,
      bestOf: 1,
      comboWins: 1,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} game added! Alice won using Boros via combo. Check it out at http://localhost:3000/games`
    );
  });

  it('Bo3 with comboWins 0 → "without combos", includes (Bo3)', () => {
    const g = mkGame({
      variant,
      wonByCombo: false,
      bestOf: 3,
      comboWins: 0,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros without combos. Check it out at http://localhost:3000/games`
    );
  });

  it('Bo3 with comboWins 1 → "winning 1 game with combos"', () => {
    const g = mkGame({
      variant,
      wonByCombo: true,
      bestOf: 3,
      comboWins: 1,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros winning 1 game with combos. Check it out at http://localhost:3000/games`
    );
  });

  it('Bo3 with comboWins 2 → "winning 2 games with combos"', () => {
    const g = mkGame({
      variant,
      wonByCombo: true,
      bestOf: 3,
      comboWins: 2,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} (Bo3) game added! Alice won using Boros winning 2 games with combos. Check it out at http://localhost:3000/games`
    );
  });

  it('Bo5 with comboWins 3 → "winning 3 games with combos"', () => {
    const g = mkGame({
      variant,
      wonByCombo: true,
      bestOf: 5,
      comboWins: 3,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true, deckName: 'Boros' }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} (Bo5) game added! Alice won using Boros winning 3 games with combos. Check it out at http://localhost:3000/games`
    );
  });

  it('falls back to NO_DECK_FALLBACK when winner has no deck (Bo3)', () => {
    const g = mkGame({
      variant,
      wonByCombo: false,
      bestOf: 3,
      comboWins: 0,
      participants: [
        mkP({ playerName: 'Alice', isWinner: true }),
        mkP({ playerName: 'Bob', isRandom: true }),
      ],
    });
    expect(buildNotifyMessage(g, ORIGIN)).toBe(
      `New ${label} (Bo3) game added! Alice won using a deck they forgot to list without combos. Check it out at http://localhost:3000/games`
    );
  });
});
