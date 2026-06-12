import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

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
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const decks = await prisma.deck.findMany({
      include: { owner: { select: { name: true } }, _count: { select: { cards: true } } },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({
      decks: decks.map((d) => ({
        id: d.id,
        name: d.name,
        ownerUserId: d.ownerUserId,
        ownerName: d.owner?.name ?? null,
        cardCount: d._count.cards,
      })),
    });
  } catch (error) {
    console.error('GET /api/admin/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}
