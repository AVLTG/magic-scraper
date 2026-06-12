import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName } from '@/lib/parseMoxfield';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: { owner: { select: { name: true } }, cards: { orderBy: { cardName: 'asc' } } },
    });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // inLibrary reflects the OWNER's library (ownerless decks have no library)
    let libIndex = buildLibraryNameIndex([]);
    if (deck.ownerUserId) {
      const lib = await prisma.collectionCard.findMany({
        where: { userId: deck.ownerUserId },
        select: { cardName: true },
      });
      libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
    }

    return NextResponse.json({
      deck: {
        id: deck.id,
        name: deck.name,
        ownerUserId: deck.ownerUserId,
        ownerName: deck.owner?.name ?? null,
        isOwner: deck.ownerUserId !== null && deck.ownerUserId === session.userId,
        cards: deck.cards.map((c) => ({
          cardName: c.cardName,
          quantity: c.quantity,
          set: c.set,
          collectorNumber: c.collectorNumber,
          isFoil: c.isFoil,
          inLibrary: findLibraryName(libIndex, c.cardName) !== undefined,
        })),
      },
    });
  } catch (error) {
    console.error('GET /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch deck' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwner = deck.ownerUserId !== null && deck.ownerUserId === session.userId;
    const adminOnOwnerless = deck.ownerUserId === null && session.role === 'ADMIN';
    if (!isOwner && !adminOnOwnerless) {
      return NextResponse.json({ error: 'Only the deck owner can delete it' }, { status: 403 });
    }

    await prisma.deck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete deck' }, { status: 500 });
  }
}
