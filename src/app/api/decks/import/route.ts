import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import {
  parseMoxfieldText,
  buildLibraryNameIndex,
  normalizeCardName,
  type ParsedMoxfieldCard,
} from '@/lib/parseMoxfield';
import { classifyMoxfieldCards, resolveMissingToLibrary } from '@/lib/deckImport';

const importSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(100, 'name too long'),
  text: z.string().min(1).max(100_000),
  dryRun: z.boolean().default(false),
  addMissingToLibrary: z.boolean().optional(),
  format: z.string().trim().max(50).optional(),
  commander: z.string().trim().max(200).optional(),
});

interface DeckCardDraft {
  cardName: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
  isFoil: boolean;
}

export async function POST(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'decks-import:post'), 10, 60000);
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
        { error: 'Create your account via an invite to import decks' },
        { status: 403 }
      );
    }

    const { name, text, dryRun, addMissingToLibrary, format, commander } = importSchema.parse(await request.json());

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

    // ---- commit ----
    if (missing.length > 0 && typeof addMissingToLibrary !== 'boolean') {
      return NextResponse.json(
        { error: 'addMissingToLibrary is required when cards are missing from your library' },
        { status: 400 }
      );
    }

    const mine = await prisma.deck.findMany({
      where: { ownerUserId: session.userId },
      select: { name: true },
    });
    if (mine.some((d) => d.name.trim().toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'You already have a deck with that name' }, { status: 409 });
    }

    // Merge duplicate names (different printings) — quantities sum, first printing wins.
    const deckCardMap = new Map<string, DeckCardDraft>();

    const addDraft = (cardName: string, c: ParsedMoxfieldCard) => {
      const key = normalizeCardName(cardName);
      const existing = deckCardMap.get(key);
      if (existing) existing.quantity += c.quantity;
      else deckCardMap.set(key, { cardName, quantity: c.quantity, set: c.set, collectorNumber: c.collectorNumber, isFoil: c.isFoil });
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

    const deck = await prisma.$transaction(async (tx) => {
      if (libraryInserts.length > 0) {
        await tx.collectionCard.createMany({ data: libraryInserts as never });
      }
      return tx.deck.create({
        data: {
          name,
          ownerUserId: session.userId,
          format: format ?? null,
          commander: commander ?? null,
          cards: { create: Array.from(deckCardMap.values()) },
        },
      });
    });

    // Total card count (summed quantities), consistent with GET /api/decks and
    // the deck detail page — not the number of distinct rows.
    const cardCount = Array.from(deckCardMap.values()).reduce((n, c) => n + c.quantity, 0);

    return NextResponse.json(
      {
        deck: { id: deck.id, name: deck.name, cardCount },
        addedToLibrary: libraryInserts.length,
        excluded,
        errors,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/decks/import error:', error);
    return NextResponse.json({ error: 'Failed to import deck' }, { status: 500 });
  }
}
