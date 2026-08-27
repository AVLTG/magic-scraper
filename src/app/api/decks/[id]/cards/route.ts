import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { buildLibraryNameIndex, findLibraryName, normalizeCardName, isBasicLand } from '@/lib/parseMoxfield';

const addSchema = z.object({
  cardName: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(999).default(1),
  set: z.string().trim().max(6).optional(),
  collectorNumber: z.string().trim().max(20).optional(),
  isFoil: z.boolean().default(false),
});

const bodySchema = z.object({
  add: z.array(addSchema).max(500).optional(),
  remove: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
  setQuantity: z
    .array(z.object({ cardName: z.string().trim().min(1).max(200), quantity: z.number().int().min(0).max(999) }))
    .max(500)
    .optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'decks-id-cards:put'), 20, 60000);
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
    // Ownerless decks aren't editable by anyone — admin assigns an owner first.
    if (deck.ownerUserId === null || deck.ownerUserId !== session.userId) {
      return NextResponse.json({ error: 'Only the deck owner can edit its cards' }, { status: 403 });
    }

    const body = bodySchema.parse(await request.json());

    // Adds must come from the owner's library; store the canonical library name.
    let canonicalAdds: Array<z.infer<typeof addSchema> & { canonicalName: string }> = [];
    if (body.add && body.add.length > 0) {
      const lib = await prisma.collectionCard.findMany({
        where: { userId: deck.ownerUserId },
        select: { cardName: true },
      });
      const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
      const unknown: string[] = [];
      canonicalAdds = body.add.map((a) => {
        // Basic lands bypass the library check — collections never track them.
        if (isBasicLand(a.cardName)) {
          return { ...a, canonicalName: a.cardName };
        }
        const canonicalName = findLibraryName(libIndex, a.cardName);
        if (!canonicalName) unknown.push(a.cardName);
        return { ...a, canonicalName: canonicalName ?? a.cardName };
      });
      if (unknown.length > 0) {
        return NextResponse.json({ error: 'Cards not in your library', cards: unknown }, { status: 400 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // Map normalized -> stored deck card name for remove/setQuantity matching
      const stored = await tx.deckCard.findMany({ where: { deckId: id }, select: { cardName: true } });
      const storedByNorm = new Map(stored.map((c) => [normalizeCardName(c.cardName), c.cardName]));

      for (const a of canonicalAdds) {
        await tx.deckCard.upsert({
          where: { deckId_cardName: { deckId: id, cardName: a.canonicalName } },
          update: { quantity: { increment: a.quantity } },
          create: {
            deckId: id,
            cardName: a.canonicalName,
            quantity: a.quantity,
            set: a.set,
            collectorNumber: a.collectorNumber,
            isFoil: a.isFoil,
          },
        });
      }

      if (body.remove && body.remove.length > 0) {
        const names = body.remove
          .map((n) => storedByNorm.get(normalizeCardName(n)))
          .filter((n): n is string => n !== undefined);
        if (names.length > 0) {
          await tx.deckCard.deleteMany({ where: { deckId: id, cardName: { in: names } } });
        }
      }

      if (body.setQuantity && body.setQuantity.length > 0) {
        const toDelete: string[] = [];
        for (const sq of body.setQuantity) {
          const name = storedByNorm.get(normalizeCardName(sq.cardName));
          if (!name) continue;
          if (sq.quantity <= 0) toDelete.push(name);
          else await tx.deckCard.updateMany({ where: { deckId: id, cardName: name }, data: { quantity: sq.quantity } });
        }
        if (toDelete.length > 0) {
          await tx.deckCard.deleteMany({ where: { deckId: id, cardName: { in: toDelete } } });
        }
      }
    });

    const cards = await prisma.deckCard.findMany({
      where: { deckId: id },
      orderBy: { cardName: 'asc' },
    });
    return NextResponse.json({
      cards: cards.map((c) => ({
        cardName: c.cardName,
        quantity: c.quantity,
        set: c.set,
        collectorNumber: c.collectorNumber,
        isFoil: c.isFoil,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PUT /api/decks/[id]/cards error:', error);
    return NextResponse.json({ error: 'Failed to update deck cards' }, { status: 500 });
  }
}
