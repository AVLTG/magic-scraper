import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDiscordAlert } from '@/lib/discord';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

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
    const winner = game.participants.find((p) => p.isWinner);
    const winnerName = winner?.playerName ?? 'Someone';
    const deckDisplay = winner?.deckName ?? 'a deck they forgot to list';
    const comboText = game.wonByCombo ? 'via combo' : 'without any combos';
    const message = `New game added! ${winnerName} won using ${deckDisplay} ${comboText}. Check it out at magic-scraper.avltg.dev/games`;

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
