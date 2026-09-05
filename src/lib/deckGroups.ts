// Groups deck cards the way Moxfield does: Creatures, Instants, Sorceries,
// Artifacts, Enchantments, Planeswalkers, Battles, Lands, then anything else.
// Multi-type cards (e.g. Artifact Creature) go to the first matching group in
// that priority order, so creatures stay together.

export const DECK_GROUP_ORDER = [
  'Creatures',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Planeswalkers',
  'Battles',
  'Lands',
  'Other',
] as const;

export type DeckGroupName = (typeof DECK_GROUP_ORDER)[number];

export function primaryTypeGroup(typeLine: string | null | undefined): DeckGroupName {
  const t = (typeLine ?? '').toLowerCase();
  if (t.includes('creature')) return 'Creatures';
  if (t.includes('instant')) return 'Instants';
  if (t.includes('sorcery')) return 'Sorceries';
  if (t.includes('artifact')) return 'Artifacts';
  if (t.includes('enchantment')) return 'Enchantments';
  if (t.includes('planeswalker')) return 'Planeswalkers';
  if (t.includes('battle')) return 'Battles';
  if (t.includes('land')) return 'Lands';
  return 'Other';
}

export interface GroupableCard {
  cardName: string;
  quantity: number;
  typeLine?: string | null;
}

export interface DeckGroup<T extends GroupableCard> {
  group: DeckGroupName;
  cards: T[];
  /** Summed quantities, not distinct rows. */
  count: number;
}

export function groupDeckByType<T extends GroupableCard>(cards: T[]): DeckGroup<T>[] {
  const buckets = new Map<DeckGroupName, T[]>();
  for (const card of cards) {
    const group = primaryTypeGroup(card.typeLine);
    const list = buckets.get(group) ?? [];
    list.push(card);
    buckets.set(group, list);
  }
  return DECK_GROUP_ORDER.filter((g) => buckets.has(g)).map((group) => {
    const groupCards = buckets.get(group)!;
    return {
      group,
      cards: groupCards,
      count: groupCards.reduce((n, c) => n + c.quantity, 0),
    };
  });
}

export interface DeckStats {
  total: number;
  unique: number;
  foilCount: number;
  inLibraryCount: number;
  byGroup: { group: DeckGroupName; count: number }[];
}

export function computeDeckStats(
  cards: Array<GroupableCard & { isFoil?: boolean; inLibrary?: boolean }>
): DeckStats {
  const groups = groupDeckByType(cards);
  return {
    total: cards.reduce((n, c) => n + c.quantity, 0),
    unique: cards.length,
    foilCount: cards.filter((c) => c.isFoil).reduce((n, c) => n + c.quantity, 0),
    inLibraryCount: cards.filter((c) => c.inLibrary).reduce((n, c) => n + c.quantity, 0),
    byGroup: groups.map((g) => ({ group: g.group, count: g.count })),
  };
}
