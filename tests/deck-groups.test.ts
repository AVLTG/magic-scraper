import { primaryTypeGroup, groupDeckByType, computeDeckStats, manaCurve, colorBreakdown } from '@/lib/deckGroups';

describe('primaryTypeGroup', () => {
  it.each([
    ['Legendary Creature — Dragon', 'Creatures'],
    ['Artifact Creature — Golem', 'Creatures'],
    ['Instant', 'Instants'],
    ['Sorcery', 'Sorceries'],
    ['Artifact', 'Artifacts'],
    ['Legendary Artifact — Equipment', 'Artifacts'],
    ['Enchantment — Aura', 'Enchantments'],
    ['Planeswalker', 'Planeswalkers'],
    ['Battle — Siege', 'Battles'],
    ['Basic Land — Forest', 'Lands'],
    ['Land', 'Lands'],
  ])('classifies %s as %s', (typeLine, expected) => {
    expect(primaryTypeGroup(typeLine)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['Token']])('falls back to Other for %p', (typeLine) => {
    expect(primaryTypeGroup(typeLine)).toBe('Other');
  });
});

describe('groupDeckByType', () => {
  it('groups by type in Moxfield order with summed counts', () => {
    const groups = groupDeckByType([
      { cardName: 'Forest', quantity: 10, typeLine: 'Basic Land — Forest' },
      { cardName: 'Sol Ring', quantity: 1, typeLine: 'Artifact' },
      { cardName: 'Lightning Bolt', quantity: 4, typeLine: 'Instant' },
      { cardName: 'Shivan Dragon', quantity: 2, typeLine: 'Creature — Dragon' },
      { cardName: 'Mystery', quantity: 1, typeLine: null },
    ]);
    expect(groups.map((g) => g.group)).toEqual([
      'Creatures',
      'Instants',
      'Artifacts',
      'Lands',
      'Other',
    ]);
    expect(groups.map((g) => g.count)).toEqual([2, 4, 1, 10, 1]);
  });

  it('returns no groups for an empty deck', () => {
    expect(groupDeckByType([])).toEqual([]);
  });
});

describe('computeDeckStats', () => {
  it('totals quantities, foils, and library coverage', () => {
    const stats = computeDeckStats([
      { cardName: 'Bolt', quantity: 4, typeLine: 'Instant', isFoil: false, inLibrary: true, cmc: 1 },
      { cardName: 'Ring', quantity: 1, typeLine: 'Artifact', isFoil: true, inLibrary: false, cmc: null },
    ]);
    expect(stats).toEqual({
      total: 5,
      unique: 2,
      foilCount: 1,
      inLibraryCount: 4,
      missingDataCount: 1,
      byGroup: [
        { group: 'Instants', count: 4 },
        { group: 'Artifacts', count: 1 },
      ],
    });
  });
});

describe('manaCurve', () => {
  it('buckets 0-6 then 7+, skipping cards without data', () => {
    const curve = manaCurve([
      { cardName: 'A', quantity: 4, cmc: 0 },
      { cardName: 'B', quantity: 4, cmc: 1 },
      { cardName: 'C', quantity: 2, cmc: 2.5 },
      { cardName: 'D', quantity: 1, cmc: 9 },
      { cardName: 'E', quantity: 3, cmc: null },
    ]);
    expect(curve.map((b) => b.count)).toEqual([4, 4, 2, 0, 0, 0, 0, 1]);
    expect(curve.map((b) => b.label)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7+']);
  });
});

describe('colorBreakdown', () => {
  it('counts multicolor cards under each color, colorless as C', () => {
    expect(
      colorBreakdown([
        { cardName: 'A', quantity: 2, colors: 'WU' },
        { cardName: 'B', quantity: 1, colors: '' },
        { cardName: 'C', quantity: 3, colors: null },
        { cardName: 'D', quantity: 1, colors: 'R' },
      ])
    ).toEqual([
      { color: 'W', count: 2 },
      { color: 'U', count: 2 },
      { color: 'B', count: 0 },
      { color: 'R', count: 1 },
      { color: 'G', count: 0 },
      { color: 'C', count: 4 },
    ]);
  });
});
