import { prisma } from './prisma';
import { scrapeMoxfield } from './scrapeMoxfield/scrapeMoxfield';

export async function updateAllCollections(source: 'cron' | 'manual' = 'cron'): Promise<{
  succeeded: string[];
  failed: Array<{ name: string; error: string }>;
}> {
  const users = await prisma.user.findMany();

  console.log(`Starting update for ${users.length} users...`);
  console.log('Users:', users.map(u => ({ name: u.name, id: u.moxfieldCollectionId })));

  const failed: Array<{ name: string; error: string }> = [];
  const succeeded: string[] = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    console.log(`\n=== Updating collection for ${user.name} (${i + 1}/${users.length}) ===`);
    console.log('Collection ID:', user.moxfieldCollectionId);

    // Delay between users to avoid Moxfield rate-limiting
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2000));
    }

    try {
      const cards = await scrapeMoxfield({
        collectionId: user.moxfieldCollectionId
      });

      console.log(`Scraped ${cards.length} cards for ${user.name}`);

      if (cards.length === 0) {
        console.log('No cards scraped - skipping database update');
        const zeroCardsMsg = 'No cards scraped';
        failed.push({ name: user.name, error: zeroCardsMsg });
        try {
          await prisma.syncLog.create({
            data: { userId: user.id, status: 'failure', errorMessage: zeroCardsMsg, source },
          });
        } catch (logError) {
          console.error(`Failed to write SyncLog for ${user.name}:`, logError);
        }
        continue;
      }

      // Show first card as example
      console.log('Example card:', cards[0]);

      // Atomic: all three operations commit together or none do
      await prisma.$transaction(async (tx) => {
        const deleteResult = await tx.collectionCard.deleteMany({
          where: { userId: user.id }
        });
        console.log(`Deleted ${deleteResult.count} old cards`);

        const createResult = await tx.collectionCard.createMany({
          data: cards.map(card => ({
            userId: user.id,
            cardName: card.name,
            scryfallId: card.scryfall_id,
            set: card.set,
            setName: card.set_name,
            quantity: card.quantity,
            condition: card.condition,
            isFoil: card.isFoil,
            typeLine: card.type_line,
          }))
        });
        console.log(`Inserted ${createResult.count} new cards`);

        await tx.user.update({
          where: { id: user.id },
          data: { lastUpdated: new Date() }
        });
      });

      // Write SyncLog entry for successful sync
      try {
        await prisma.syncLog.create({
          data: { userId: user.id, status: 'success', source },
        });
      } catch (logError) {
        console.error(`Failed to write SyncLog for ${user.name}:`, logError);
      }

      succeeded.push(user.name);
      console.log(`Successfully updated ${cards.length} cards for ${user.name}`);
    } catch (error) {
      // Log but continue — don't let one user's failure stop the rest
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Failed to update ${user.name}: ${msg}`);
      failed.push({ name: user.name, error: msg });

      // Write SyncLog entry for failed sync
      try {
        await prisma.syncLog.create({
          data: { userId: user.id, status: 'failure', errorMessage: msg.slice(0, 500), source },
        });
      } catch (logError) {
        console.error(`Failed to write SyncLog for ${user.name}:`, logError);
      }
    }
  }

  if (failed.length > 0) {
    console.error(`\nFailed users: ${failed.map(f => f.name).join(', ')}`);
  }

  // Final check
  const totalCards = await prisma.collectionCard.count();
  console.log(`\n=== Update Complete ===`);
  console.log(`Total cards in database: ${totalCards}`);

  return { succeeded, failed };
}
