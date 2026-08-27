import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { normalizeCardName } from '@/lib/parseMoxfield';

export async function GET(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'library:get'), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.isLegacyAdmin) {
      return NextResponse.json({ cards: [], isLegacyAdmin: true });
    }

    const cards = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      orderBy: { cardName: 'asc' },
    });
    const decks = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      include: { cards: { select: { cardName: true, set: true, isFoil: true } } },
    });

    // Badge each collection row only with the decks that reference that exact
    // printing/finish. Mirrors the graded matching in /api/checkDeck: a deck
    // card claims (name+set+foil) when the user owns that exact printing, else
    // (name+foil), else every row of the name — so "only the foil copy is in
    // the deck" stays accurate while degrading gracefully when the deck's
    // recorded printing isn't one the user actually owns.
    const keyExact = (name: string, set: string, isFoil: boolean) =>
      `${normalizeCardName(name)}:${set.toLowerCase()}:${isFoil}`;
    const keyFoil = (name: string, isFoil: boolean) => `${normalizeCardName(name)}:${isFoil}`;
    const keyName = (name: string) => normalizeCardName(name);

    const ownedExact = new Set(cards.map((c) => keyExact(c.cardName, c.set, c.isFoil)));
    const ownedFoil = new Set(cards.map((c) => keyFoil(c.cardName, c.isFoil)));

    const decksByKey = new Map<string, { id: string; name: string }[]>();
    const addBadge = (key: string, deck: { id: string; name: string }) => {
      const list = decksByKey.get(key) ?? [];
      if (!list.some((d) => d.id === deck.id)) list.push(deck);
      decksByKey.set(key, list);
    };
    for (const d of decks) {
      const deck = { id: d.id, name: d.name };
      for (const dc of d.cards) {
        const exact = dc.set ? keyExact(dc.cardName, dc.set, dc.isFoil) : null;
        const foil = keyFoil(dc.cardName, dc.isFoil);
        if (exact && ownedExact.has(exact)) addBadge(exact, deck);
        else if (ownedFoil.has(foil)) addBadge(foil, deck);
        else addBadge(keyName(dc.cardName), deck);
      }
    }

    const decksForCard = (c: { cardName: string; set: string; isFoil: boolean }) =>
      Array.from(
        new Map(
          [
            ...(decksByKey.get(keyExact(c.cardName, c.set, c.isFoil)) ?? []),
            ...(decksByKey.get(keyFoil(c.cardName, c.isFoil)) ?? []),
            ...(decksByKey.get(keyName(c.cardName)) ?? []),
          ].map((d) => [d.id, d])
        ).values()
      );

    return NextResponse.json({
      cards: cards.map((c) => ({
        id: c.id,
        cardName: c.cardName,
        set: c.set,
        setName: c.setName,
        quantity: c.quantity,
        condition: c.condition,
        isFoil: c.isFoil,
        typeLine: c.typeLine,
        source: c.source,
        decks: decksForCard(c),
      })),
      isLegacyAdmin: false,
    });
  } catch (error) {
    console.error('GET /api/library error:', error);
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 });
  }
}
