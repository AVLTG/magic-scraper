import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName, isBasicLand } from '@/lib/parseMoxfield';
import { matchDeckParticipants } from '@/lib/reconcile';

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
          inLibrary: isBasicLand(c.cardName) || findLibraryName(libIndex, c.cardName) !== undefined,
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

const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 20, 60000);
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
      return NextResponse.json({ error: 'Only the deck owner can rename it' }, { status: 403 });
    }

    const { name } = renameSchema.parse(await request.json());
    const oldName = deck.name;

    // Block renaming onto another of the user's decks (a same-name self-rename,
    // i.e. only case/spacing changed, is allowed and rewrites history spelling).
    const clash = await prisma.deck.findFirst({
      where: { ownerUserId: session.userId, id: { not: id }, name },
    });
    if (clash) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    const { updated, gameCount } = await prisma.$transaction(async (tx) => {
      const parts = await tx.gameParticipant.findMany({
        where: { deckName: { not: null } },
        select: { id: true, gameId: true, deckName: true },
      });
      const { ids, gameCount } = matchDeckParticipants(parts, oldName);

      const d = await tx.deck.update({ where: { id }, data: { name } });
      if (ids.length > 0) {
        await tx.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { deckName: name } });
      }
      return { updated: d, gameCount };
    });

    return NextResponse.json({ deck: { id: updated.id, name: updated.name }, renamedGames: gameCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PATCH /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to rename deck' }, { status: 500 });
  }
}
