import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { normalizeCardName } from '@/lib/parseMoxfield';

export async function GET(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
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
      include: { cards: { select: { cardName: true } } },
    });

    const decksByCard = new Map<string, { id: string; name: string }[]>();
    for (const d of decks) {
      for (const dc of d.cards) {
        const key = normalizeCardName(dc.cardName);
        const list = decksByCard.get(key) ?? [];
        list.push({ id: d.id, name: d.name });
        decksByCard.set(key, list);
      }
    }

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
        decks: decksByCard.get(normalizeCardName(c.cardName)) ?? [],
      })),
      isLegacyAdmin: false,
    });
  } catch (error) {
    console.error('GET /api/library error:', error);
    return NextResponse.json({ error: 'Failed to fetch library' }, { status: 500 });
  }
}
