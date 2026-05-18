import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
    const rows = await prisma.gameParticipant.findMany({
      select: { deckName: true },
      distinct: ['deckName'],
      where: { deckName: { not: null }, isRandom: false },
    });
    const decks = Array.from(
      new Set(
        rows
          .map((r) => r.deckName)
          .filter((d): d is string => d !== null)
      )
    ).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ decks });
  } catch (error) {
    console.error('GET /api/decks error:', error);
    return NextResponse.json({ error: 'Failed to fetch decks' }, { status: 500 });
  }
}
