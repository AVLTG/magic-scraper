import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { checkRateLimit, getIpKey } from '@/lib/rateLimit';

const assignSchema = z.object({ ownerUserId: z.string().min(1).nullable() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(getIpKey(request), 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    );
  }
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const { ownerUserId } = assignSchema.parse(await request.json());

    const deck = await prisma.deck.findUnique({ where: { id } });
    if (!deck) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ownerUserId !== null) {
      const user = await prisma.user.findUnique({ where: { id: ownerUserId } });
      if (!user) return NextResponse.json({ error: 'Target user not found' }, { status: 400 });
    }

    const updated = await prisma.deck.update({ where: { id }, data: { ownerUserId } });
    return NextResponse.json({ deck: { id: updated.id, ownerUserId: updated.ownerUserId } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    console.error('PATCH /api/admin/decks/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update deck owner' }, { status: 500 });
  }
}
