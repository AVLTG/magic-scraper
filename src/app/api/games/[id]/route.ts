import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  gameUpdateSchema,
  applyVariantInvariants,
  GAME_VARIANTS,
  type GameVariant,
} from '@/lib/validators';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { ensureDecksForParticipants } from '@/lib/deckAutoCreate';

// Prisma "Record not found" error code for update/delete on missing row
const PRISMA_NOT_FOUND = 'P2025';

function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === PRISMA_NOT_FOUND
  );
}

function isGameVariant(value: unknown): value is GameVariant {
  return typeof value === 'string' && (GAME_VARIANTS as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'games-id:get'), 30, 60000);
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
    const { id } = await params;
    const game = await prisma.game.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!game) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ game });
  } catch (error) {
    console.error('GET /api/games/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'games-id:patch'), 30, 60000);
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
    const { id } = await params;
    const body = await request.json();
    const parsed = gameUpdateSchema.parse(body);

    const existing = await prisma.game.findUnique({
      where: { id },
      select: { variant: true, bestOf: true, comboWins: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const variant = existing.variant;
    if (!isGameVariant(variant)) {
      console.error('PATCH /api/games/[id]: invalid stored variant', { id, variant });
      return NextResponse.json(
        { error: 'Invalid stored variant' },
        { status: 500 }
      );
    }
    const invariantResult = applyVariantInvariants(
      {
        participants: parsed.participants,
        bestOf: existing.bestOf,
        comboWins: existing.comboWins,
      },
      variant
    );
    if (!invariantResult.ok) {
      return NextResponse.json(
        { error: [{ message: invariantResult.message, path: ['participants'] }] },
        { status: 400 }
      );
    }

    const { date, wonByCombo, notes, participants } = parsed;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.gameParticipant.deleteMany({ where: { gameId: id } });
      const g = await tx.game.update({
        where: { id },
        data: { date, wonByCombo, notes },
      });
      await tx.gameParticipant.createMany({
        data: participants.map((p) => ({
          gameId: g.id,
          playerName: p.playerName,
          isWinner: p.isWinner,
          isScrewed: p.isScrewed,
          isRandom: p.isRandom,
          deckName: p.deckName,
          role: p.role,
        })),
      });
      return g;
    });
    await ensureDecksForParticipants(
      participants.map((p) => ({ playerName: p.playerName, deckName: p.deckName, isRandom: p.isRandom ?? false }))
    );
    return NextResponse.json({ game: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('PATCH /api/games/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update game' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'games-id:delete'), 30, 60000);
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
    const { id } = await params;
    // GameParticipant rows cascade automatically (onDelete: Cascade in schema)
    await prisma.game.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('DELETE /api/games/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete game' },
      { status: 500 }
    );
  }
}
