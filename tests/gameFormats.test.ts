import {
  ALL_FORMATS,
  COMMANDER_FORMATS,
  BEST_OF_FORMATS,
  FORMAT_LABELS,
  isCommanderFormat,
  requiresBestOf,
  maxComboWinsFor,
  type GameFormat,
} from '@/lib/gameFormats';

describe('gameFormats — constants', () => {
  it('ALL_FORMATS lists the 10 variants in canonical order', () => {
    expect(ALL_FORMATS).toEqual([
      'COMMANDER', 'STAR', 'KING', 'BRAWL',
      'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
    ]);
  });

  it('COMMANDER_FORMATS contains exactly the four Commander-shape variants', () => {
    expect([...COMMANDER_FORMATS].sort()).toEqual(
      ['BRAWL', 'COMMANDER', 'KING', 'STAR'].sort()
    );
  });

  it('BEST_OF_FORMATS contains exactly the six best-of variants', () => {
    expect([...BEST_OF_FORMATS].sort()).toEqual(
      ['CUBE', 'DRAFT', 'PAUPER', 'PRERELEASE', 'SEALED', 'STANDARD'].sort()
    );
  });

  it('FORMAT_LABELS has an entry for every variant in ALL_FORMATS', () => {
    for (const v of ALL_FORMATS) {
      expect(typeof FORMAT_LABELS[v]).toBe('string');
      expect(FORMAT_LABELS[v].length).toBeGreaterThan(0);
    }
  });

  it('COMMANDER_FORMATS and BEST_OF_FORMATS are disjoint and partition ALL_FORMATS', () => {
    for (const v of ALL_FORMATS) {
      const inCommander = COMMANDER_FORMATS.has(v);
      const inBestOf = BEST_OF_FORMATS.has(v);
      expect(inCommander !== inBestOf).toBe(true);
    }
  });
});

describe('gameFormats — predicates', () => {
  it('isCommanderFormat is true for COMMANDER/STAR/KING/BRAWL', () => {
    for (const v of ['COMMANDER', 'STAR', 'KING', 'BRAWL']) {
      expect(isCommanderFormat(v)).toBe(true);
    }
  });

  it('isCommanderFormat is false for the six best-of formats', () => {
    for (const v of ['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE']) {
      expect(isCommanderFormat(v)).toBe(false);
    }
  });

  it('isCommanderFormat is false for unknown variants', () => {
    expect(isCommanderFormat('UNKNOWN')).toBe(false);
    expect(isCommanderFormat('')).toBe(false);
  });

  it('requiresBestOf is true for the six best-of formats and false otherwise', () => {
    for (const v of ['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE']) {
      expect(requiresBestOf(v)).toBe(true);
    }
    for (const v of ['COMMANDER', 'STAR', 'KING', 'BRAWL', 'UNKNOWN']) {
      expect(requiresBestOf(v)).toBe(false);
    }
  });
});

describe('gameFormats — maxComboWinsFor', () => {
  it('returns 1 for Bo1', () => {
    expect(maxComboWinsFor(1)).toBe(1);
  });
  it('returns 2 for Bo3', () => {
    expect(maxComboWinsFor(3)).toBe(2);
  });
  it('returns 3 for Bo5', () => {
    expect(maxComboWinsFor(5)).toBe(3);
  });
});

describe('gameFormats — type', () => {
  it('GameFormat is a typed union (compile-time check via assignment)', () => {
    const f: GameFormat = 'COMMANDER';
    expect(f).toBe('COMMANDER');
  });
});
