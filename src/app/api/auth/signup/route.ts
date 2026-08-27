import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSessionToken, COOKIE_OPTIONS, COOKIE_NAMES } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { validatePassword, usernameSchema } from '@/lib/authValidators'
import { hashInviteToken, inviteStatus } from '@/lib/invites'
import { checkRateLimit, routeKey } from '@/lib/rateLimit'

const signupSchema = z.object({
  token: z.string().min(1).max(128),
  username: z.string().max(64).optional(),
  password: z.string().min(1).max(128),
})

export async function POST(request: Request) {
  const rate = checkRateLimit(routeKey(request, 'signup'), 5, 60_000)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many attempts — try again shortly' }, { status: 429 })
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const { token, password } = parsed.data

  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashInviteToken(token) } })
  if (!invite || inviteStatus(invite) !== 'pending') {
    return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
  }

  // Bound invites lock the username; open invites take it from the form.
  let username: string
  if (invite.targetUserId) {
    // Defense in depth: don't trust the stored value blindly — the creation
    // route validates, but a bad row must not become an unreachable login
    const locked = usernameSchema.safeParse(invite.suggestedUsername ?? '')
    if (!locked.success) {
      return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
    }
    username = locked.data
  } else {
    const result = usernameSchema.safeParse(parsed.data.username ?? '')
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
    }
    username = result.data
  }

  const policy = validatePassword(password, username)
  if (!policy.ok) {
    return NextResponse.json({ error: policy.message }, { status: 400 })
  }

  // Username collision (excluding the invite's own target row)
  const existing = await prisma.user.findFirst({
    where: { username, ...(invite.targetUserId ? { NOT: { id: invite.targetUserId } } : {}) },
  })
  if (existing) {
    return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
  }

  const passwordHash = await hashPassword(password)
  const role = invite.role === 'ADMIN' ? 'ADMIN' : 'MEMBER'

  try {
    const user = await prisma.$transaction(async (tx) => {
      // Atomic single-use claim: only one redeemer can flip usedAt from null
      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      if (claimed.count !== 1) throw new Error('INVITE_ALREADY_USED')

      if (invite.targetUserId) {
        const target = await tx.user.findUnique({ where: { id: invite.targetUserId } })
        if (!target || target.username) throw new Error('INVITE_TARGET_INVALID')
        return tx.user.update({
          where: { id: invite.targetUserId },
          data: { username, passwordHash, role },
        })
      }
      return tx.user.create({
        data: { name: username, username, passwordHash, role },
      })
    })

    const sessionToken = await createSessionToken(user.id, role)
    const cookieStore = await cookies() // MUST await in Next.js 16
    cookieStore.set(COOKIE_NAMES.session, sessionToken, COOKIE_OPTIONS)
    return NextResponse.json({ success: true, redirect: role === 'ADMIN' ? '/admin' : '/' })
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_ALREADY_USED') {
      return NextResponse.json({ error: 'This invite was already used' }, { status: 409 })
    }
    if (error instanceof Error && error.message === 'INVITE_TARGET_INVALID') {
      return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 400 })
    }
    // Unique-constraint race: two concurrent redemptions picked the same
    // username — the findFirst precheck can't see across instances
    if (typeof error === 'object' && error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
    }
    console.error('Signup failed:', error)
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 })
  }
}
