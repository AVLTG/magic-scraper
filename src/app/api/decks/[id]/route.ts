import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName, isBasicLand } from '@/lib/parseMoxfield';
import { matchDeckParticipants, normalizeName } from '@/lib/reconcile';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'decks-id:get'), 30, 60000);
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

    // inLibrary reflects the OWNER's library (ownerless decks have no library).
    // typeLine/scryfallId are joined from the owner's library too, so the
    // detail page can group by type and show hover images Moxfield-style
    // without storing card metadata on DeckCard.
    const { normalizeCardName } = await import('@/lib/parseMoxfield');
    let libIndex = buildLibraryNameIndex([]);
    const libMeta = new Map<string, { typeLine: string | null; scryfallId: string | null }>();
    if (deck.ownerUserId) {
      const lib = await prisma.collectionCard.findMany({
        where: { userId: deck.ownerUserId },
        select: { cardName: true, typeLine: true, scryfallId: true, set: true, isFoil: true },
      });
      libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
      for (const c of lib) {
        const setPart = (c.set ?? '').toLowerCase();
        const foilPart = c.isFoil ?? false;
        const exact = `${normalizeCardName(c.cardName)}:${setPart}:${foilPart}`;
        if (!libMeta.has(exact)) {
          libMeta.set(exact, { typeLine: c.typeLine, scryfallId: c.scryfallId });
        }
        const byName = normalizeCardName(c.cardName);
        if (!libMeta.has(byName)) {
          libMeta.set(byName, { typeLine: c.typeLine, scryfallId: c.scryfallId });
        }
      }
    }

    return NextResponse.json({
      deck: {
        id: deck.id,
        name: deck.name,
        format: deck.format,
        commander: deck.commander,
        ownerUserId: deck.ownerUserId,
        ownerName: deck.owner?.name ?? null,
        isOwner: deck.ownerUserId !== null && deck.ownerUserId === session.userId,
        cards: deck.cards.map((c) => {
          const exact = c.set
            ? libMeta.get(`${normalizeCardName(c.cardName)}:${c.set.toLowerCase()}:${c.isFoil}`)
            : undefined;
          const fallback = libMeta.get(normalizeCardName(c.cardName));
          const meta = exact ?? fallback;
          return {
            cardName: c.cardName,
            quantity: c.quantity,
            set: c.set,
            collectorNumber: c.collectorNumber,
            isFoil: c.isFoil,
            board: c.board,
            typeLine: meta?.typeLine ?? (isBasicLand(c.cardName) ? 'Basic Land' : null),
            scryfallId: meta?.scryfallId ?? null,
            inLibrary: isBasicLand(c.cardName) || findLibraryName(libIndex, c.cardName) !== undefined,
          };
        }),
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
  const rl = checkRateLimit(routeKey(request, 'decks-id:delete'), 10, 60000);
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

const renameSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  format: z.string().trim().max(50).nullable().optional(),
  commander: z.string().trim().max(200).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'decks-id:patch'), 20, 60000);
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
      include: { owner: { select: { name: true } } },
    });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId || !deck.owner) {
      return NextResponse.json({ error: 'Only the deck owner can edit it' }, { status: 403 });
    }

    const { name, format, commander } = renameSchema.parse(await request.json());
    const oldName = deck.name;
    const renaming = typeof name === 'string' && normalizeName(name) !== normalizeName(oldName);

    // Block renaming onto another of the user's decks. Compared case-insensitively
    // to match the create check (POST /api/decks) — a case-only variant would
    // break every name-normalized join (deckAutoCreate, admin gamesByDeck).
    if (renaming) {
      const mine = await prisma.deck.findMany({
        where: { ownerUserId: session.userId },
        select: { id: true, name: true },
      });
      if (mine.some((d) => d.id !== id && normalizeName(d.name) === normalizeName(name))) {
        return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
      }
    }

    // Only rewrite history rows attributed to the owner: deck names are unique
    // per owner, not globally, so an unscoped name match would also rewrite
    // other players' games that happen to use the same deck name.
    const ownerKey = normalizeName(deck.owner.name);
    const { updated, gameCount } = await prisma.$transaction(async (tx) => {
      let gameCount = 0;
      if (renaming) {
        const allParts = await tx.gameParticipant.findMany({
          where: { deckName: { not: null } },
          select: { id: true, gameId: true, deckName: true, playerName: true },
        });
        const parts = allParts.filter((p) => normalizeName(p.playerName) === ownerKey);
        const match = matchDeckParticipants(parts, oldName);
        gameCount = match.gameCount;
        if (match.ids.length > 0) {
          await tx.gameParticipant.updateMany({ where: { id: { in: match.ids } }, data: { deckName: name! } });
        }
      }

      const d = await tx.deck.update({
        where: { id },
        data: {
          ...(renaming ? { name: name! } : {}),
          ...(format !== undefined ? { format: format?.trim() ? format.trim() : null } : {}),
          ...(commander !== undefined ? { commander: commander?.trim() ? commander.trim() : null } : {}),
        },
      });
      return { updated: d, gameCount };
    });

    return NextResponse.json({
      deck: { id: updated.id, name: updated.name, format: updated.format, commander: updated.commander },
      renamedGames: gameCount,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PATCH /api/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update deck' }, { status: 500 });
  }
}
