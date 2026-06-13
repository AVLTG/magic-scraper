import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

const deckCreateSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name too long'),
});

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

    const decks = await prisma.deck.findMany({
      include: { owner: { select: { name: true } }, cards: { select: { quantity: true } } },
      orderBy: { name: 'asc' },
    });
    // cardCount is the TOTAL card count (summed quantities), matching the deck
    // detail page — not the number of distinct rows (a 12-of basic is 12, not 1).
    const cardCount = (d: { cards: { quantity: number }[] }) =>
      d.cards.reduce((n, c) => n + c.quantity, 0);
    const userDecks = decks
      .filter((d) => d.ownerUserId === session.userId)
      .map((d) => ({ id: d.id, name: d.name, cardCount: cardCount(d) }));
    const otherDecks = decks
      .filter((d) => d.ownerUserId !== session.userId)
      .map((d) => ({ id: d.id, name: d.name, cardCount: cardCount(d), ownerName: d.owner?.name ?? null }));
    return NextResponse.json({ userDecks, otherDecks, isLegacyAdmin: session.isLegacyAdmin });
  } catch (error) {
    console.error('GET /api/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
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
      return NextResponse.json(
        { error: 'Create your account via an invite to own decks' },
        { status: 403 }
      );
    }

    const { name } = deckCreateSchema.parse(await request.json());

    const mine = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      select: { name: true },
    });
    if (mine.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    const deck = await prisma.deck.create({ data: { name, ownerUserId: session.userId } });
    return NextResponse.json({ deck: { id: deck.id, name: deck.name } }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks error:', error);
    return NextResponse.json({ error: 'Failed to create deck' }, { status: 500 });
  }
}
