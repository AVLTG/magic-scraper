-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "decks_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deck_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "set" TEXT,
    "collectorNumber" TEXT,
    "isFoil" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "deck_cards_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_collection_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "scryfallId" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "isFoil" BOOLEAN NOT NULL,
    "typeLine" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'moxfield',
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_collection_cards" ("cardName", "condition", "id", "isFoil", "lastUpdated", "quantity", "scryfallId", "set", "setName", "typeLine", "userId") SELECT "cardName", "condition", "id", "isFoil", "lastUpdated", "quantity", "scryfallId", "set", "setName", "typeLine", "userId" FROM "collection_cards";
DROP TABLE "collection_cards";
ALTER TABLE "new_collection_cards" RENAME TO "collection_cards";
CREATE INDEX "collection_cards_cardName_idx" ON "collection_cards"("cardName");
CREATE INDEX "collection_cards_userId_idx" ON "collection_cards"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "decks_ownerUserId_idx" ON "decks"("ownerUserId");

-- CreateIndex
CREATE INDEX "deck_cards_cardName_idx" ON "deck_cards"("cardName");

-- CreateIndex
CREATE UNIQUE INDEX "deck_cards_deckId_cardName_key" ON "deck_cards"("deckId", "cardName");
