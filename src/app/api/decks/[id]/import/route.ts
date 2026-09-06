import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { parseMoxfieldText, buildLibraryNameIndex, normalizeCardName, type ParsedMoxfieldCard } from '@/lib/parseMoxfield';
import { classifyMoxfieldCards, resolveMissingToLibrary, boardSchema } from '@/lib/deckImport';
import { enrichDeckCards } from '@/lib/deckEnrich';

const importSchema = z.object({
  text: z.string().min(1).max(100_000),
  dryRun: z.boolean().default(false),
  addMissingToLibrary: z.boolean().optional(),
  board: boardSchema.default('main'),
});

interface DeckCardDraft {
  cardName: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
  board: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'decks-id-import:post'), 10, 60000);
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
      return NextResponse.json({ error: 'Only the deck owner can import cards' }, { status: 403 });
    }

    const { text, dryRun, addMissingToLibrary, board } = importSchema.parse(await request.json());

    const { cards, errors } = parseMoxfieldText(text);
    const lib = await prisma.collectionCard.findMany({
      where: { userId: session.userId },
      select: { cardName: true },
    });
    const libIndex = buildLibraryNameIndex(lib.map((c) => c.cardName));
    const { present, missing, basics } = classifyMoxfieldCards(cards, libIndex);

    if (dryRun) {
      return NextResponse.json({
        cards: cards.map((c) => ({ line: c.line, quantity: c.quantity, name: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null, isFoil: c.isFoil })),
        missing: missing.map((c) => ({ line: c.line, cardName: c.name, set: c.set ?? null, collectorNumber: c.collectorNumber ?? null })),
        errors,
      });
    }

    if (missing.length > 0 && typeof addMissingToLibrary !== 'boolean') {
      return NextResponse.json(
        { error: 'addMissingToLibrary is required when cards are missing from your library' },
        { status: 400 }
      );
    }

    // Merge duplicate names (different printings) — quantities sum, first printing wins.
    const drafts = new Map<string, DeckCardDraft>();
    const addDraft = (cardName: string, c: ParsedMoxfieldCard) => {
      const key = `${normalizeCardName(cardName)}:${board}`;
      const existing = drafts.get(key);
      if (existing) existing.quantity += c.quantity;
      else drafts.set(key, { cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil, board });
    };
    for (const { card, canonical } of present) addDraft(canonical, card);
    for (const card of basics) addDraft(card.name, card);

    const libraryInserts: Array<Record<string, unknown>> = [];
    let excluded: string[] = [];
    if (missing.length > 0 && addMissingToLibrary) {
      const r = await resolveMissingToLibrary(missing, session.userId);
      if (!r.ok) {
        return NextResponse.json(
          r.cards.length ? { error: r.error, cards: r.cards } : { error: r.error },
          { status: r.status }
        );
      }
      libraryInserts.push(...r.libraryInserts);
      for (const { card, name } of r.resolved) addDraft(name, card);
    } else if (missing.length > 0) {
      excluded = missing.map((c) => c.name);
    }

    await prisma.$transaction(async (tx) => {
      if (libraryInserts.length > 0) {
        await tx.collectionCard.createMany({ data: libraryInserts as never });
      }
      for (const d of drafts.values()) {
        await tx.deckCard.upsert({
          where: { deckId_cardName_board: { deckId: id, cardName: d.cardName, board: d.board } },
          update: { quantity: { increment: d.quantity } },
          create: { deckId: id, cardName: d.cardName, quantity: d.quantity, set: d.set, collectorNumber: d.collectorNumber, isFoil: d.isFoil, board: d.board },
        });
      }
    });

    const updated = await prisma.deckCard.findMany({ where: { deckId: id }, orderBy: { cardName: 'asc' } });

    // Best-effort mana curve data — never fails the import.
    try {
      await enrichDeckCards(id);
    } catch (error) {
      console.error('Post-import enrich failed:', error);
    }

    return NextResponse.json({
      cards: updated.map((c) => ({ cardName: c.cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil, board: c.board })),
      addedToLibrary: libraryInserts.length,
      excluded,
      errors,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/[id]/import error:', error);
    return NextResponse.json({ error: 'Failed to import cards' }, { status: 500 });
  }
}
