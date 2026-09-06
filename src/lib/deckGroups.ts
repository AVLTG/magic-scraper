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
  missingDataCount: number;
  byGroup: { group: DeckGroupName; count: number }[];
}

export function computeDeckStats(
  cards: Array<GroupableCard & { isFoil?: boolean; inLibrary?: boolean; cmc?: number | null }>
): DeckStats {
  const groups = groupDeckByType(cards);
  return {
    total: cards.reduce((n, c) => n + c.quantity, 0),
    unique: cards.length,
    foilCount: cards.filter((c) => c.isFoil).reduce((n, c) => n + c.quantity, 0),
    inLibraryCount: cards.filter((c) => c.inLibrary).reduce((n, c) => n + c.quantity, 0),
    missingDataCount: cards.filter((c) => c.cmc === null || c.cmc === undefined).reduce((n, c) => n + c.quantity, 0),
    byGroup: groups.map((g) => ({ group: g.group, count: g.count })),
  };
}

export interface CurveBucket {
  label: string;
  count: number;
}

/** Mana curve over main-deck cards with known cmc: buckets 0–6 then 7+. */
export function manaCurve(
  cards: Array<GroupableCard & { cmc?: number | null }>
): CurveBucket[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const c of cards) {
    if (c.cmc === null || c.cmc === undefined) continue;
    const idx = Math.min(7, Math.max(0, Math.floor(c.cmc)));
    buckets[idx] += c.quantity;
  }
  return buckets.map((count, i) => ({ label: i === 7 ? "7+" : String(i), count }));
}

export interface ColorSlice {
  color: "W" | "U" | "B" | "R" | "G" | "C";
  count: number;
}

/** Color breakdown by color_identity (C = colorless, incl. lands). */
export function colorBreakdown(
  cards: Array<GroupableCard & { colors?: string | null; cmc?: number | null }>
): ColorSlice[] {
  const counts: Record<ColorSlice["color"], number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of cards) {
    const colors = (c.colors ?? "").toUpperCase();
    if (!colors) {
      counts.C += c.quantity;
      continue;
    }
    let matched = false;
    for (const col of ["W", "U", "B", "R", "G"] as const) {
      if (colors.includes(col)) {
        counts[col] += c.quantity;
        matched = true;
      }
    }
    if (!matched) counts.C += c.quantity;
  }
  return (Object.keys(counts) as ColorSlice["color"][]).map((color) => ({ color, count: counts[color] }));
}
