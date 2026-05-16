import {
  excludeItemsForRow,
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
  return {
    date: '2026-04-10',
    notes: '',
    wonByCombo: false,
    rows,
    winnerIndex,
    ...overrides,
  };
}

describe('validateGameForm — strict variable-length rules', () => {
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

  it('accepts a valid 6-player game', () => {
    const state = baseState(
      [
        row('A', { isWinner: true }),
        row('B'),
        row('C'),
        row('D'),
        row('E'),
        row('F'),
      ],
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.participants).toHaveLength(6);
  });

  it('accepts a valid 8-player game', () => {
    const state = baseState(
      Array.from({ length: 8 }, (_, i) =>
        row(`P${i}`, i === 0 ? { isWinner: true } : {})
      ),
      0
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.participants).toHaveLength(8);
  });

  it('rejects when date missing', () => {
    const state = baseState([row('Alice', { isWinner: true })], 0, { date: '' });
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.date).toBeDefined();
  });

  it('rejects when any row is blank (strict rule)', () => {
    const state = baseState([row('Alice', { isWinner: true }), row('')], 0);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/all 2 participant names are required/i);
  });

  it('rejects when every row is blank', () => {
    const state = baseState([row(''), row(''), row(''), row('')], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/all 4 participant names are required/i);
  });

  it('rejects when winnerIndex is -1 (no winner)', () => {
    const state = baseState([row('Alice'), row('Bob')], -1);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/winner/i);
  });

  it('rejects when winnerIndex is out of range', () => {
    const state = baseState([row('Alice'), row('Bob')], 5);
    const result = validateGameForm(state);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toMatch(/winner/i);
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
    if (result.ok) expect(result.payload.participants[0].deckName).toBeUndefined();
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

  it('preserves row order in payload (no filtering/remapping)', () => {
    const state = baseState(
      [row('Alice'), row('Bob', { isWinner: true }), row('Carol')],
      1
    );
    const result = validateGameForm(state);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.participants.map((p) => p.playerName)).toEqual(['Alice', 'Bob', 'Carol']);
      expect(result.payload.participants[1].isWinner).toBe(true);
      expect(result.payload.participants[0].isWinner).toBe(false);
      expect(result.payload.participants[2].isWinner).toBe(false);
    }
  });
});

describe('excludeItemsForRow (D-10, D-11)', () => {
  const sampleState = (rows: ParticipantRow[]) => ({ rows });

  it('returns all other filled rows for row 0', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob', 'Carol']);
  });

  it('returns the other filled row for row 1', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(1, state)).toEqual(['Alice', 'Carol']);
  });

  it('returns both filled rows for an empty row 2', () => {
    const state = sampleState([row('Alice'), row('Bob'), row('')]);
    expect(excludeItemsForRow(2, state)).toEqual(['Alice', 'Bob']);
  });

  it('returns empty array when all rows are empty', () => {
    const state = sampleState([row(''), row(''), row('')]);
    expect(excludeItemsForRow(0, state)).toEqual([]);
  });

  it('treats whitespace-only rows as empty', () => {
    const state = sampleState([row('Alice'), row('   '), row('Bob')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob']);
  });

  it('trims leading/trailing whitespace from included names', () => {
    const state = sampleState([row('Alice'), row('  Bob  '), row('Carol')]);
    expect(excludeItemsForRow(0, state)).toEqual(['Bob', 'Carol']);
  });

  it("does NOT include the caller row's own name (D-11 — row sees its own value)", () => {
    const state = sampleState([row('Alice'), row('Bob'), row('Carol')]);
    expect(excludeItemsForRow(0, state)).not.toContain('Alice');
  });

  it('handles 8-row full state for row 7', () => {
    const state = sampleState(
      Array.from({ length: 8 }, (_, i) => row(`P${i}`))
    );
    expect(excludeItemsForRow(7, state)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });
});
