import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';

export async function GET(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'admin-decks:get'), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const decks = await prisma.deck.findMany({
      include: { owner: { select: { name: true } }, cards: { select: { quantity: true } } },
      orderBy: { name: 'asc' },
    });
    const participants = await prisma.gameParticipant.findMany({
      where: { deckName: { not: null } },
      select: { gameId: true, deckName: true },
    });
    const gamesByDeck = new Map<string, Set<string>>();
    for (const p of participants) {
      if (!p.deckName) continue;
      const key = p.deckName.trim().toLowerCase();
      if (!gamesByDeck.has(key)) gamesByDeck.set(key, new Set());
      gamesByDeck.get(key)!.add(p.gameId);
    }
    return NextResponse.json({
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        ownerUserId: d.ownerUserId,
        ownerName: d.owner?.name ?? null,
        // Total card count (summed quantities), consistent with the deck pages.
        cardCount: d.cards.reduce((n, c) => n + c.quantity, 0),
        gameCount: gamesByDeck.get(d.name.trim().toLowerCase())?.size ?? 0,
      })),
    });
  } catch (error) {
    console.error('GET /api/admin/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}
