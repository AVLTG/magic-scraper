import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { parseMoxfieldText, isBasicLand, type ParsedMoxfieldCard } from '@/lib/parseMoxfield';
import { resolveCards, scryfallKey } from '@/lib/scryfall';

const bodySchema = z.object({ text: z.string().min(1).max(50_000) });

export async function POST(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'library-cards:post'), 10, 60000);
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
        { error: 'Create your account via an invite to use the library' },
        { status: 403 }
      );
    }

    const { text } = bodySchema.parse(await request.json());
    const parsed = parseMoxfieldText(text);
    const errors: Array<{ line: number; raw: string; reason: string }> = [...parsed.errors];

    const resolvable: ParsedMoxfieldCard[] = [];
    for (const c of parsed.cards) {
      if (isBasicLand(c.name)) {
        errors.push({
          line: c.line,
          raw: `${c.quantity} ${c.name}`,
          reason: 'Basic lands are not tracked in collections — skipped',
        });
        continue;
      }
      if (!c.set || !c.collectorNumber) {
        errors.push({
          line: c.line,
          raw: `${c.quantity} ${c.name}`,
          reason: 'Set and collector number are required to add to library',
        });
      } else {
        resolvable.push(c);
      }
    }

    // Merge duplicate lines within this request that share (set, collectorNumber, isFoil).
    // Keep the first line number; sum quantities capped at 999.
    const mergedMap = new Map<string, ParsedMoxfieldCard & { quantity: number }>();
    for (const c of resolvable) {
      const key = `${(c.set as string).toLowerCase()}:${c.collectorNumber}:${c.isFoil}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity = Math.min(999, existing.quantity + c.quantity);
      } else {
        mergedMap.set(key, { ...c, quantity: c.quantity });
      }
    }
    const mergedResolvable = Array.from(mergedMap.values());

    const added: Array<{ cardName: string; quantity: number }> = [];
    if (mergedResolvable.length > 0) {
      // Dedupe identifiers by (set, collectorNumber) so no duplicate identifiers hit Scryfall.
      const seenIdentifiers = new Set<string>();
      const uniqueIdentifiers: Array<{ set: string; collectorNumber: string }> = [];
      for (const c of mergedResolvable) {
        const idKey = `${(c.set as string).toLowerCase()}:${c.collectorNumber}`;
        if (!seenIdentifiers.has(idKey)) {
          seenIdentifiers.add(idKey);
          uniqueIdentifiers.push({ set: c.set as string, collectorNumber: c.collectorNumber as string });
        }
      }

      let resolved;
      try {
        resolved = await resolveCards(uniqueIdentifiers);
      } catch (error) {
        console.error('Scryfall lookup failed:', error);
        return NextResponse.json({ error: 'Scryfall lookup failed — try again' }, { status: 502 });
      }

      const data: Array<Record<string, unknown>> = [];
      for (const c of mergedResolvable) {
        const hit = resolved.found.get(scryfallKey(c.set as string, c.collectorNumber as string));
        if (!hit) {
          errors.push({ line: c.line, raw: `${c.quantity} ${c.name} (${c.set}) ${c.collectorNumber}`, reason: 'Card not found on Scryfall' });
          continue;
        }
        data.push({
          userId: session.userId,
          cardName: hit.name,
          scryfallId: hit.scryfallId,
          set: hit.set,
          setName: hit.setName,
          quantity: c.quantity,
          condition: 'NearMint',
          isFoil: c.isFoil,
          typeLine: hit.typeLine,
          source: 'manual',
        });
        added.push({ cardName: hit.name, quantity: c.quantity });
      }
      if (data.length > 0) {
        await prisma.collectionCard.createMany({ data: data as never });
      }
    }

    errors.sort((a, b) => a.line - b.line);
    return NextResponse.json({ added, errors });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/library/cards error:', error);
    return NextResponse.json({ error: 'Failed to add cards' }, { status: 500 });
  }
}
