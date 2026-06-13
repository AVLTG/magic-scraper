// One-time legacy deck backfill (issue #7). Idempotent — re-running is a no-op.
// Run directly with `node` — Node >=22.18 strips TS types natively, which is why
// the relative imports below carry explicit `.ts` extensions. (`npx tsx ...` also
// works.) src/scripts is excluded from tsconfig so this doesn't affect the build.
// Run (local):  DATABASE_URL="file:./prisma/dev.db" node src/scripts/backfillDecks.ts
// Run (Turso dev, only with explicit human approval):
//   DATABASE_URL="libsql://tabletally-dev-....turso.io" DATABASE_AUTH_TOKEN="..." node src/scripts/backfillDecks.ts
// NEVER run against production.
import { prisma } from '../lib/prisma.ts'
import { planDeckBackfill } from '../lib/deckBackfill.ts'

async function main() {
  const participants = await prisma.gameParticipant.findMany({
    where: { deckName: { not: null }, isRandom: false },
    include: { game: { select: { date: true } } },
  })
  const rows = participants
    .filter((p) => p.deckName && p.deckName.trim())
    .map((p) => ({ deckName: p.deckName as string, playerName: p.playerName, gameDate: p.game.date }))

  const users = await prisma.user.findMany({ select: { id: true, name: true } })
  const existing = await prisma.deck.findMany({ select: { name: true, ownerUserId: true } })

  const plan = planDeckBackfill(rows, users, existing)
  if (plan.length === 0) {
    console.log('Nothing to backfill — all legacy decks already exist.')
    return
  }

  console.log(`Creating ${plan.length} decks:\n`)
  for (const entry of plan) {
    await prisma.deck.create({ data: { name: entry.deckName, ownerUserId: entry.ownerUserId } })
    console.log(`  ${entry.deckName.padEnd(42)} -> ${entry.ownerName ?? 'OWNERLESS'}`)
  }
  console.log(`\nDone. ${plan.length} decks created.`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
