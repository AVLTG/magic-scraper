import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedPlayers, normalizeName } from '@/lib/reconcile'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'link') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : ''
      if (!name || !targetUserId) {
        return NextResponse.json({ error: 'name and targetUserId are required' }, { status: 400 })
      }
      const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { name: true } })
      if (!target) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
      const key = normalizeName(name)
      const parts = await prisma.gameParticipant.findMany({
        select: { id: true, playerName: true, isRandom: true },
      })
      const ids = parts.filter((p) => !p.isRandom && normalizeName(p.playerName) === key).map((p) => p.id)
      if (ids.length) {
        await prisma.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { playerName: target.name } })
      }
      return NextResponse.json({ renamed: ids.length })
    }

    if (action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
      const key = normalizeName(name)
      const users = await prisma.user.findMany({ select: { name: true } })
      if (users.some((u) => normalizeName(u.name) === key)) {
        return NextResponse.json({ error: 'A user with this name already exists' }, { status: 409 })
      }
      const user = await prisma.user.create({ data: { name } })
      return NextResponse.json({ user: { id: user.id, name: user.name } }, { status: 201 })
    }

    if (action === 'createAll') {
      const [participants, users] = await Promise.all([
        prisma.gameParticipant.findMany({
          select: { gameId: true, playerName: true, deckName: true, isRandom: true },
        }),
        prisma.user.findMany({ select: { name: true } }),
      ])
      const unlinked = computeUnlinkedPlayers(participants, users.map((u) => u.name))
      if (unlinked.length) {
        await prisma.user.createMany({ data: unlinked.map((u) => ({ name: u.name })) })
      }
      return NextResponse.json({ created: unlinked.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    console.error('POST /api/admin/reconcile/players error:', error)
    return NextResponse.json({ error: 'Failed to reconcile player' }, { status: 500 })
  }
}
