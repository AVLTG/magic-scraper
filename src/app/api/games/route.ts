import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { gameCreateSchema } from '@/lib/validators';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { ensureDecksForParticipants } from '@/lib/deckAutoCreate';

export async function POST(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'games:post'), 30, 60000);
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
    const { date, wonByCombo, notes, variant, bestOf, comboWins, participants } =
      gameCreateSchema.parse(body);
    const game = await prisma.$transaction(async (tx) => {
      const created = await tx.game.create({
        data: { date, wonByCombo, notes, variant, bestOf, comboWins },
      });
      await tx.gameParticipant.createMany({
        data: participants.map((p) => ({
          gameId: created.id,
          playerName: p.playerName,
          isWinner: p.isWinner,
          isScrewed: p.isScrewed,
          isRandom: p.isRandom,
          deckName: p.deckName,
          role: p.role,
        })),
      });
      return created;
    });
    await ensureDecksForParticipants(participants);
    return NextResponse.json({ game }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('POST /api/games error:', error);
    return NextResponse.json(
      { error: 'Failed to create game' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'games:get'), 30, 60000);
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
