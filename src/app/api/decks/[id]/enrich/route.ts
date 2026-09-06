import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { enrichDeckCards } from '@/lib/deckEnrich';

// Backfills mana curve data (cmc/manaCost/colors) for deck cards missing it.
// Runs automatically after imports; this endpoint is the manual refresh for
// older decks and cards Scryfall didn't know at import time.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'decks-id-enrich:post'), 5, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the deck owner can refresh card data' }, { status: 403 });
    }

    try {
      const result = await enrichDeckCards(id);
      return NextResponse.json(result);
    } catch (error) {
      console.error('POST /api/decks/[id]/enrich error:', error);
      return NextResponse.json({ error: 'Scryfall lookup failed — try again' }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/[id]/enrich error:', error);
    return NextResponse.json({ error: 'Failed to refresh card data' }, { status: 500 });
  }
}
