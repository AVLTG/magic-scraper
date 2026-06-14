-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "targetUserId" TEXT,
    "suggestedUsername" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdByUserId" TEXT,
    "usedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invites_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "invites_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "wonByCombo" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isImported" BOOLEAN NOT NULL DEFAULT false,
    "discordNotified" BOOLEAN NOT NULL DEFAULT false,
    "variant" TEXT NOT NULL DEFAULT 'COMMANDER',
    "bestOf" INTEGER,
    "comboWins" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_games" ("bestOf", "comboWins", "createdAt", "date", "id", "notes", "variant", "wonByCombo") SELECT "bestOf", "comboWins", "createdAt", "date", "id", "notes", "variant", "wonByCombo" FROM "games";
DROP TABLE "games";
ALTER TABLE "new_games" RENAME TO "games";
CREATE INDEX "games_date_idx" ON "games"("date");
CREATE TABLE "new_sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sync_logs" ("createdAt", "errorMessage", "id", "status", "userId") SELECT "createdAt", "errorMessage", "id", "status", "userId" FROM "sync_logs";
DROP TABLE "sync_logs";
ALTER TABLE "new_sync_logs" RENAME TO "sync_logs";
CREATE INDEX "sync_logs_userId_createdAt_idx" ON "sync_logs"("userId", "createdAt");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "moxfieldCollectionId" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("id", "lastUpdated", "moxfieldCollectionId", "name") SELECT "id", "lastUpdated", "moxfieldCollectionId", "name" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_moxfieldCollectionId_key" ON "users"("moxfieldCollectionId");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "invites_tokenHash_key" ON "invites"("tokenHash");

-- CreateIndex
CREATE INDEX "invites_targetUserId_idx" ON "invites"("targetUserId");

-- CreateIndex
CREATE INDEX "invites_createdAt_idx" ON "invites"("createdAt");
