import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDeckList } from '@/lib/parseDeck';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { normalizeCardName } from '@/lib/parseMoxfield';

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const { decklist } = await request.json();
    
    if (!decklist || typeof decklist !== 'string') {
      return NextResponse.json(
        { error: 'Decklist is required' },
        { status: 400 }
      );
    }

    const parsedCards = parseDeckList(decklist);
    // Collections store MDFCs Scryfall-style ("A // B"); Moxfield exports use
    // "A / B" — query both spellings so either paste format matches.
    const cardNames = Array.from(
      new Set(
        parsedCards.flatMap((card) => {
          const variants = [card.name];
          if (card.name.includes(' / ') && !card.name.includes(' // ')) {
            variants.push(card.name.replace(/ \/ /g, ' // '));
          }
          return variants;
        })
      )
    );

    // Find all matching cards
    const matches = await prisma.collectionCard.findMany({
      where: {
        cardName: {
          in: cardNames
        }
      },
      include: {
        user: true
      },
      orderBy: [
        { cardName: 'asc' },
        { setName: 'asc' },
        { user: { name: 'asc' } }
      ]
    });

    // Deck associations (issue #7): which of each OWNER's decks contain the card
    const ownerIds = Array.from(new Set(matches.map((m) => m.userId)));
    const deckCards = ownerIds.length
      ? await prisma.deckCard.findMany({
          where: { deck: { ownerUserId: { in: ownerIds } } },
          include: { deck: { select: { name: true, ownerUserId: true } } },
        })
      : [];
    const decksByOwnerCard = new Map<string, string[]>();
    for (const dc of deckCards) {
      if (!dc.deck.ownerUserId) continue;
      const key = `${dc.deck.ownerUserId}:${normalizeCardName(dc.cardName)}`;
      const list = decksByOwnerCard.get(key) ?? [];
      if (!list.includes(dc.deck.name)) list.push(dc.deck.name);
      decksByOwnerCard.set(key, list);
    }

    // Group by card name, then by printing
    const grouped: Record<string, any> = {};

    for (const match of matches) {
      if (!grouped[match.cardName]) {
        grouped[match.cardName] = {};
      }
      
      const printingKey = `${match.set}-${match.setName}`;
      if (!grouped[match.cardName][printingKey]) {
        grouped[match.cardName][printingKey] = {
          set: match.set,
          setName: match.setName,
          scryfallId: match.scryfallId,
          owners: []
        };
      }
      
      grouped[match.cardName][printingKey].owners.push({
        name: match.user.name,
        quantity: match.quantity,
        condition: match.condition,
        isFoil: match.isFoil,
        decks: decksByOwnerCard.get(`${match.userId}:${normalizeCardName(match.cardName)}`) ?? [],
      });
    }

    // Convert to array format
    const results = Object.entries(grouped).map(([cardName, printings]) => ({
      cardName,
      printings: Object.values(printings)
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Deck check error:', error);
    return NextResponse.json(
      { error: 'Failed to check deck' },
      { status: 500 }
    );
  }
}