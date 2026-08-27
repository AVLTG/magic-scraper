import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashInviteToken, inviteStatus } from '@/lib/invites'
import { checkRateLimit, routeKey } from '@/lib/rateLimit'

// Public preflight for the redeem page: never reveals more than validity + locked username.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // Unauthenticated + one DB hit per call — throttle junk-token spraying
  const rate = checkRateLimit(routeKey(request, 'invite-preflight'), 30, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts — try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    )
  }

  const { token } = await params
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  if (!invite || inviteStatus(invite) !== 'pending') {
    return NextResponse.json({ valid: false })
  }
  return NextResponse.json({
    valid: true,
    username: invite.suggestedUsername ?? null,
    locked: invite.targetUserId !== null,
  })
}
