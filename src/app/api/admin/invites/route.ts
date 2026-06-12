import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import {
  generateInviteToken,
  inviteStatus,
  usernameFromName,
  DEFAULT_INVITE_EXPIRY_DAYS,
  MAX_INVITE_EXPIRY_DAYS,
} from '@/lib/invites'
import { usernameSchema } from '@/lib/authValidators'
import { checkRateLimit } from '@/lib/rateLimit'

const createInviteSchema = z.object({
  type: z.enum(['open', 'bound']),
  targetUserId: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  expiresInDays: z.number().int().min(1).max(MAX_INVITE_EXPIRY_DAYS).default(DEFAULT_INVITE_EXPIRY_DAYS),
})

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { targetUser: { select: { name: true } } },
    })
    return NextResponse.json(
      invites.map(({ tokenHash: _tokenHash, targetUser, ...invite }) => ({
        ...invite,
        status: inviteStatus(invite),
        targetUserName: targetUser?.name ?? null,
      }))
    )
  } catch (error) {
    console.error('Failed to list invites:', error)
    return NextResponse.json({ error: 'Failed to list invites' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Per-admin cap — a stolen admin session shouldn't mint unbounded credentials
  const rate = checkRateLimit(`invite-create:${session.userId}`, 20, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many invites created — try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    )
  }

  const parsed = createInviteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { type, targetUserId, role, expiresInDays } = parsed.data

  let boundTarget: { id: string; suggestedUsername: string } | null = null
  if (type === 'bound') {
    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId is required for bound invites' }, { status: 400 })
    }
    const target = await prisma.user.findUnique({ where: { id: targetUserId } })
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }
    if (target.username) {
      return NextResponse.json({ error: 'That user already has an account' }, { status: 409 })
    }
    const slug = usernameFromName(target.name)
    if (!usernameSchema.safeParse(slug).success) {
      return NextResponse.json(
        { error: `Cannot derive a valid username from "${target.name}"` },
        { status: 400 }
      )
    }
    boundTarget = { id: target.id, suggestedUsername: slug }
  }

  try {
    const { token, tokenHash } = generateInviteToken()
    const invite = await prisma.invite.create({
      data: {
        tokenHash,
        targetUserId: boundTarget?.id ?? null,
        suggestedUsername: boundTarget?.suggestedUsername ?? null,
        role,
        createdByUserId: session.isLegacyAdmin ? null : session.userId,
        expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
      },
    })
    const { tokenHash: _tokenHash, ...safeInvite } = invite
    // Prefer the configured canonical origin — request.nextUrl.origin derives
    // from inbound Host headers and can point at preview/non-canonical domains
    const origin = process.env.APP_URL?.replace(/\/$/, '') || request.nextUrl.origin
    return NextResponse.json(
      { url: `${origin}/invite/${token}`, invite: safeInvite },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to create invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
