export interface DeckCard {
  quantity: number;
  name: string;
}

export function parseDeckList(decklistText: string): DeckCard[] {
  const lines = decklistText.trim().split('\n');
  const cards: DeckCard[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let quantity = 1;
    let name = trimmed;

    // Try to match "N cardname" / "Nx cardname" format (e.g. "4 Lightning Bolt")
    const match = trimmed.match(/^(\d+)x?\s+(.+)$/);
    if (match) {
      quantity = parseInt(match[1]);
      name = match[2].trim();
    }

    // Tolerate Moxfield-export lines ("1 Treasure Vault (AFR) 261 *F*"):
    // strip a trailing foil/etch marker, then a trailing "(SET) NUM" pair.
    // Real card names with parens (e.g. "Erase (Not the Urza's Legacy One)")
    // survive because the set group is capped at 2-6 alphanumerics followed
    // by a collector number.
    name = name
      .replace(/\s+\*[A-Za-z]+\*$/, '')
      .replace(/\s+\([A-Za-z0-9]{2,6}\)\s+\S+$/, '');

    // Skip basic lands (case insensitive)
    const lowerName = name.toLowerCase();
    if (lowerName === 'island' ||
        lowerName === 'mountain' ||
        lowerName === 'forest' ||
        lowerName === 'plains' ||
        lowerName === 'swamp' ||
        lowerName.startsWith('snow-covered ')) {
      continue;
    }

    cards.push({ quantity, name });
  }

  return cards;
}
