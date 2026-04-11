import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parseDeckList } from '@/lib/parseDeck';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

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
    const cardNames = parsedCards.map(card => card.name);

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
        isFoil: match.isFoil
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