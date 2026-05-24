import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDiscordAlert } from '@/lib/discord';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';
import { buildNotifyMessage } from '@/lib/notifyMessage';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 10, 60000);
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
    if (game.discordNotified) {
      return NextResponse.json(
        { error: 'Notification already sent' },
        { status: 409 }
      );
    }
    const origin = new URL(request.url).origin;
    const message = buildNotifyMessage(
      {
        variant: game.variant,
        wonByCombo: game.wonByCombo,
        participants: game.participants.map((p) => ({
          playerName: p.playerName,
          isWinner: p.isWinner,
          isRandom: p.isRandom,
          deckName: p.deckName,
          role: p.role,
        })),
      },
      origin
    );

    await sendDiscordAlert({ content: message });
    await prisma.game.update({
      where: { id },
      data: { discordNotified: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/games/[id]/notify error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
