import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';

export async function GET(request: Request) {
  const rl = checkRateLimit(routeKey(request, 'players:get'), 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const [participants, users] = await Promise.all([
      prisma.gameParticipant.findMany({
        where: { isRandom: false },
        select: { playerName: true },
        distinct: ['playerName'],
      }),
      prisma.user.findMany({
        select: { name: true },
        distinct: ['name'],
      }),
    ]);
    const players = Array.from(
      new Set([
        ...participants.map((p) => p.playerName),
        ...users.map((u) => u.name),
      ])
    ).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ players });
  } catch (error) {
    console.error('GET /api/players error:', error);
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}
