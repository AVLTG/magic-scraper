import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedDecks, normalizeName } from '@/lib/reconcile'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'link') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const targetDeckId = typeof body.targetDeckId === 'string' ? body.targetDeckId : ''
      if (!name || !targetDeckId) {
        return NextResponse.json({ error: 'name and targetDeckId are required' }, { status: 400 })
      }
      const target = await prisma.deck.findUnique({ where: { id: targetDeckId }, select: { name: true } })
      if (!target) return NextResponse.json({ error: 'Target deck not found' }, { status: 404 })
      const key = normalizeName(name)
      const parts = await prisma.gameParticipant.findMany({
        where: { deckName: { not: null } },
        select: { id: true, deckName: true },
      })
      const ids = parts.filter((p) => p.deckName && normalizeName(p.deckName) === key).map((p) => p.id)
      if (ids.length) {
        await prisma.gameParticipant.updateMany({ where: { id: { in: ids } }, data: { deckName: target.name } })
      }
      return NextResponse.json({ renamed: ids.length })
    }

    if (action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
      const ownerUserId = typeof body.ownerUserId === 'string' && body.ownerUserId ? body.ownerUserId : null
      if (ownerUserId) {
        const user = await prisma.user.findUnique({ where: { id: ownerUserId } })
        if (!user) return NextResponse.json({ error: 'Owner user not found' }, { status: 400 })
      }
      const deck = await prisma.deck.create({ data: { name, ownerUserId } })
      return NextResponse.json(
        { deck: { id: deck.id, name: deck.name, ownerUserId: deck.ownerUserId } },
        { status: 201 }
      )
    }

    if (action === 'createAll') {
      const [participants, decks] = await Promise.all([
        prisma.gameParticipant.findMany({
          select: { gameId: true, playerName: true, deckName: true, isRandom: true },
        }),
        prisma.deck.findMany({ select: { name: true } }),
      ])
      const unlinked = computeUnlinkedDecks(participants, decks.map((d) => d.name))
      if (unlinked.length) {
        await prisma.deck.createMany({ data: unlinked.map((u) => ({ name: u.name })) })
      }
      return NextResponse.json({ created: unlinked.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    console.error('POST /api/admin/reconcile/decks error:', error)
    return NextResponse.json({ error: 'Failed to reconcile deck' }, { status: 500 })
  }
}
