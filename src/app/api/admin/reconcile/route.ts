import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { computeUnlinkedDecks, computeUnlinkedPlayers } from '@/lib/reconcile'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  try {
    const [participants, decks, users] = await Promise.all([
      prisma.gameParticipant.findMany({
        select: { gameId: true, playerName: true, deckName: true, isRandom: true },
      }),
      prisma.deck.findMany({ select: { name: true } }),
      prisma.user.findMany({ select: { name: true } }),
    ])
    return NextResponse.json({
      unlinkedDecks: computeUnlinkedDecks(participants, decks.map((d) => d.name)),
      unlinkedPlayers: computeUnlinkedPlayers(participants, users.map((u) => u.name)),
    })
  } catch (error) {
    console.error('GET /api/admin/reconcile error:', error)
    return NextResponse.json({ error: 'Failed to load reconciliation data' }, { status: 500 })
  }
}
