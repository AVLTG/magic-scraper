import {
  excludeItemsForRow,
  filterEmptyRows,
  validateGameForm,
} from '../src/app/games/game-form';

type ParticipantRow = {
  playerName: string;
  deckName: string;
  isWinner: boolean;
  isScrewed: boolean;
};

function row(playerName: string, extra: Partial<ParticipantRow> = {}): ParticipantRow {
  return { playerName, deckName: '', isWinner: false, isScrewed: false, ...extra };
}

function baseState(
  rows: ParticipantRow[],
  winnerIndex: number,
  overrides: Partial<{ date: string; notes: string; wonByCombo: boolean }> = {}
) {
  const padded = [...rows];
  while (padded.length < 4) padded.push(row(''));
  return {
    date: '2026-04-10',
    notes: '',
    wonByCombo: false,
    rows: padded.slice(0, 4),
    winnerIndex,
    ...overrides,
  };
}

describe('filterEmptyRows', () => {
  it('removes rows with empty playerName', () => {
    const rows = [row('Alice'), row(''), row('Bob'), row('  ')];
    expect(filterEmptyRows(rows)).toHaveLength(2);
  });

  it('preserves order', () => {
    const rows = [row(''), row('Alice'), row(''), row('Bob')];
    const filtered = filterEmptyRows(rows);
    expect(filtered[0].playerName).toBe('Alice');
    expect(filtered[1].playerName).toBe('Bob');
  });

  it('trims before checking', () => {
    expect(filterEmptyRows([row('   ')])).toHaveLength(0);
    expect(filterEmptyRows([row(' X ')])).toHaveLength(1);
  });
});

describe('validateGameForm', () => {
  it('accepts a valid 2-player game', () => {
    const state = baseState(
      [row('Alice', { isWinner: true }), row('Bob', { isScrewed: true })],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants).toHaveLength(2);
      expect(result.payload.participants[0]).toMatchObject({ playerName: 'Alice', isWinner: true });
      expect(result.payload.participants[1]).toMatchObject({ playerName: 'Bob', isScrewed: true });
    }
  });

  it('rejects when date missing', () => {
    const state = baseState([row('Alice')], 0, { date: '' });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.date).toBeDefined();
    }
  });

  it('rejects when no non-empty rows', () => {
    const state = baseState([], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toMatch(/participant/i);
    }
  });

  it('rejects when winnerIndex is -1 (no winner)', () => {
    const state = baseState([row('Alice'), row('Bob')], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toMatch(/winner/i);
    }
  });

  it('rejects when winner is on an empty row (Pitfall 4)', () => {
    const state = baseState([row('Alice'), row('')], 1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.form).toMatch(/winner/i);
    }
  });

  it('allows winner AND screwed on same player (D-02)', () => {
    const state = baseState(
      [row('Alice', { isWinner: true, isScrewed: true })],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
  });

  it('rejects playerName over 100 chars', () => {
    const longName = 'A'.repeat(101);
    const state = baseState([row(longName, { isWinner: true })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
  });

  it('converts empty deckName string to undefined in payload', () => {
    const state = baseState([row('Alice', { isWinner: true, deckName: '' })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants[0].deckName).toBeUndefined();
    }
  });

  it('trims playerName and deckName in payload', () => {
    const state = baseState([row('  Alice  ', { isWinner: true, deckName: '  Atraxa  ' })], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants[0].playerName).toBe('Alice');
      expect(result.payload.participants[0].deckName).toBe('Atraxa');
    }
  });

  it('remaps winner index correctly after filtering empty rows', () => {
    // Row 0 empty, row 1 Alice with winner flag, row 2 Bob.
    // After filter: [Alice (index 0, winner), Bob (index 1)]
    const state = {
      date: '2026-04-10',
      notes: '',
      wonByCombo: false,
      rows: [
        row(''),
        row('Alice', { isWinner: true }),
        row('Bob'),
        row(''),
      ],
      winnerIndex: 1,
    };
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants[0].isWinner).toBe(true);
      expect(result.payload.participants[1].isWinner).toBe(false);
    }
  });
});

describe('excludeItemsForRow (D-10, D-11)', () => {
  function stateOf(names: string[]): {
    date: string;
    notes: string;
    wonByCombo: boolean;
    rows: ParticipantRow[];
    winnerIndex: number;
  } {
    const rows: ParticipantRow[] = [0, 1, 2, 3].map((i) => ({
      playerName: names[i] ?? '',
      deckName: '',
      isWinner: false,
      isScrewed: false,
    }));
    return { date: '2026-04-10', notes: '', wonByCombo: false, rows, winnerIndex: -1 };
  }

  it('returns all other filled rows for row 0', () => {
    expect(excludeItemsForRow(0, stateOf(['A', 'B', '', '']))).toEqual(['B']);
  });

  it('returns the other filled row for row 1', () => {
    expect(excludeItemsForRow(1, stateOf(['A', 'B', '', '']))).toEqual(['A']);
  });

  it('returns both filled rows for an empty row 2', () => {
    expect(excludeItemsForRow(2, stateOf(['A', 'B', '', '']))).toEqual(['A', 'B']);
  });

  it('returns empty array when all rows are empty', () => {
    expect(excludeItemsForRow(0, stateOf([]))).toEqual([]);
  });

  it('treats whitespace-only rows as empty', () => {
    expect(excludeItemsForRow(0, stateOf(['', '   ', 'Carol', '']))).toEqual(['Carol']);
  });

  it('trims leading/trailing whitespace from included names', () => {
    expect(excludeItemsForRow(0, stateOf(['', '  Bob  ', '', '']))).toEqual(['Bob']);
  });

  it("does NOT include the caller row's own name (D-11 — row sees its own value)", () => {
    // Row 0 is 'A'; excludeItemsForRow(0, ...) must NOT include 'A' — only the OTHER rows' names.
    expect(excludeItemsForRow(0, stateOf(['A', 'B', 'C', '']))).toEqual(['B', 'C']);
  });

  it('handles 4-row full state for row 3', () => {
    expect(excludeItemsForRow(3, stateOf(['A', 'B', 'C', 'D']))).toEqual(['A', 'B', 'C']);
  });
});
