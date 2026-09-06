import { prisma } from "./prisma";
import { resolveCardsByName } from "./scryfall";
import { normalizeCardName } from "./parseMoxfield";

// Backfills cmc/manaCost/colors on a deck's cards via batched Scryfall
// name lookups (75 per request). Only touches rows with cmc null, so it is
// safe to run after imports and from the manual refresh action.
export async function enrichDeckCards(
  deckId: string,
  fetcher: typeof fetch = fetch
): Promise<{ enriched: number; unresolved: string[] }> {
  const rows = await prisma.deckCard.findMany({
    where: { deckId, cmc: null },
    select: { cardName: true },
  });
  const names = Array.from(new Set(rows.map((r) => r.cardName)));
  if (names.length === 0) return { enriched: 0, unresolved: [] };

  const found = await resolveCardsByName(names, fetcher);
  let enriched = 0;
  const unresolved: string[] = [];
  for (const name of names) {
    // Stored names may differ in case/separators from Scryfall canonical —
    // try the raw and normalized forms before giving up.
    const hit =
      found.get(name.trim().toLowerCase()) ?? found.get(normalizeCardName(name));
    if (!hit) {
      unresolved.push(name);
      continue;
    }
    const updated = await prisma.deckCard.updateMany({
      where: { deckId, cardName: name, cmc: null },
      data: { cmc: hit.cmc, manaCost: hit.manaCost, colors: hit.colors },
    });
    enriched += updated.count;
  }
  return { enriched, unresolved };
}
