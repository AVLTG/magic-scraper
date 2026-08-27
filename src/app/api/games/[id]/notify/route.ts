import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDiscordAlert } from '@/lib/discord';
import { checkRateLimit, routeKey } from '@/lib/rateLimit';
import { buildNotifyMessage } from '@/lib/notifyMessage';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(routeKey(request, 'games-notify:post'), 10, 60000);
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
        bestOf: game.bestOf,
        comboWins: game.comboWins,
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

    // Claim the notify flag atomically (compare-and-set) so two concurrent
    // clicks can't both pass the read check above and double-send.
    const claim = await prisma.game.updateMany({
      where: { id, discordNotified: false },
      data: { discordNotified: true },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: 'Notification already sent' },
        { status: 409 }
      );
    }

    const sent = await sendDiscordAlert({ content: message });
    if (!sent) {
      // Delivery failed — release the claim so the user can actually retry
      // instead of hitting a permanent 409 with nothing ever posted.
      await prisma.game.update({
        where: { id },
        data: { discordNotified: false },
      });
      return NextResponse.json(
        { error: 'Failed to send Discord notification' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/games/[id]/notify error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
