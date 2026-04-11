import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { gameSchema } from '@/lib/validators';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

export async function POST(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }
  try {
    const body = await request.json();
    const { date, wonByCombo, notes, participants } = gameSchema.parse(body);
    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: { date, wonByCombo, notes },
      });
      await tx.gameParticipant.createMany({
        data: participants.map((p) => ({
          gameId: created.id,
          playerName: p.playerName,
          isWinner: p.isWinner,
          isScrewed: p.isScrewed,
          deckName: p.deckName,
        })),
      });
      return created;
    });
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('POST /api/games error:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const rl = checkRateLimit(getIpKey(request), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }
  try {
    const games = await prisma.game.findMany({
      include: { participants: true },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json({ games });
  } catch (error) {
    console.error('GET /api/games error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
