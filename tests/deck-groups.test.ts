import { primaryTypeGroup, groupDeckByType, computeDeckStats } from '@/lib/deckGroups';

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
      { cardName: 'Bolt', quantity: 4, typeLine: 'Instant', isFoil: false, inLibrary: true },
      { cardName: 'Ring', quantity: 1, typeLine: 'Artifact', isFoil: true, inLibrary: false },
    ]);
    expect(stats).toEqual({
      total: 5,
      unique: 2,
      foilCount: 1,
      inLibraryCount: 4,
      byGroup: [
        { group: 'Instants', count: 4 },
        { group: 'Artifacts', count: 1 },
      ],
    });
  });
});
