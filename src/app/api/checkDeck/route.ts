import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDeckList } from '@/lib/parseDeck';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { normalizeCardName } from '@/lib/parseMoxfield';

export async function POST(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'checkdeck:post'), 10, 60000);
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
    // Scope to the matched card names so the query grows with the decklist, not
    // the owners' entire deck libraries. Deck cards and collection cards share
    // canonical names (imports/edits store the canonical library name), so this
    // exact filter is complete for the rows we badge below.
    const wantedNames = Array.from(new Set(matches.map((m) => m.cardName)));
    const deckCards = ownerIds.length && wantedNames.length
      ? await prisma.deckCard.findMany({
          where: { cardName: { in: wantedNames }, deck: { ownerUserId: { in: ownerIds } } },
          include: { deck: { select: { name: true, ownerUserId: true } } },
        })
      : [];
    // Each deck card badges the most specific collection rows it can:
    // (name+set+foil) when the owner has that exact printing/finish, else
    // (name+foil), else every row of the name. This keeps "only the foil copy
    // is in the deck" accurate while degrading gracefully when the deck's
    // recorded printing isn't one the owner actually has.
    const keyExact = (userId: string, name: string, set: string, isFoil: boolean) =>
      `${userId}:${normalizeCardName(name)}:${set.toLowerCase()}:${isFoil}`;
    const keyFoil = (userId: string, name: string, isFoil: boolean) =>
      `${userId}:${normalizeCardName(name)}:${isFoil}`;
    const keyName = (userId: string, name: string) => `${userId}:${normalizeCardName(name)}`;

    const ownedExact = new Set(matches.map((m) => keyExact(m.userId, m.cardName, m.set, m.isFoil)));
    const ownedFoil = new Set(matches.map((m) => keyFoil(m.userId, m.cardName, m.isFoil)));

    const decksByOwnerCard = new Map<string, string[]>();
    const addBadge = (key: string, deckName: string) => {
      const list = decksByOwnerCard.get(key) ?? [];
      if (!list.includes(deckName)) list.push(deckName);
      decksByOwnerCard.set(key, list);
    };
    for (const dc of deckCards) {
      if (!dc.deck.ownerUserId) continue;
      const owner = dc.deck.ownerUserId;
      const exact = dc.set ? keyExact(owner, dc.cardName, dc.set, dc.isFoil) : null;
      const foil = keyFoil(owner, dc.cardName, dc.isFoil);
      if (exact && ownedExact.has(exact)) addBadge(exact, dc.deck.name);
      else if (ownedFoil.has(foil)) addBadge(foil, dc.deck.name);
      else addBadge(keyName(owner, dc.cardName), dc.deck.name);
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
      
      const decks = Array.from(
        new Set([
          ...(decksByOwnerCard.get(keyExact(match.userId, match.cardName, match.set, match.isFoil)) ?? []),
          ...(decksByOwnerCard.get(keyFoil(match.userId, match.cardName, match.isFoil)) ?? []),
          ...(decksByOwnerCard.get(keyName(match.userId, match.cardName)) ?? []),
        ])
      );
      grouped[match.cardName][printingKey].owners.push({
        name: match.user.name,
        quantity: match.quantity,
        condition: match.condition,
        isFoil: match.isFoil,
        decks,
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