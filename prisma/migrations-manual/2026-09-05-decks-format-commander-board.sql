-- Decks: format/commander columns + per-card board (main/side/maybe).
-- Apply to production Turso manually; local dev uses `prisma db push`.
--   turso db shell <your-db-name> < prisma/migrations-manual/2026-09-05-decks-format-commander-board.sql
--
-- Safe to re-run with one caveat: the three ALTER TABLE ... ADD COLUMN
-- statements have no IF NOT EXISTS guard (SQLite doesn't support one for
-- columns), so a retry prints benign "duplicate column name" errors and the
-- DROP/CREATE INDEX lines are IF-guarded and no-op.

-- 1. Deck.format / Deck.commander (nullable; SQLite has no IF NOT EXISTS for
-- columns, so run once and ignore "duplicate column name" on retry).
ALTER TABLE decks ADD COLUMN format TEXT;
ALTER TABLE decks ADD COLUMN commander TEXT;

-- 2. DeckCard.board with backfill to 'main' for existing rows.
ALTER TABLE deck_cards ADD COLUMN board TEXT NOT NULL DEFAULT 'main';

-- 3. Widen the uniqueness key so the same card can live in multiple boards
-- of one deck. SQLite cannot ALTER a unique constraint: recreate the table.
-- Run ONLY if the old deckId+cardName unique index still exists.
DROP INDEX IF EXISTS "deck_cards_deckId_cardName_key";
CREATE UNIQUE INDEX IF NOT EXISTS "deck_cards_deckId_cardName_board_key"
  ON "deck_cards"("deckId", "cardName", "board");
