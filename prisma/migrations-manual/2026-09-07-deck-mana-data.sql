-- Deck mana curve data: cmc/manaCost/colors on deck_cards, backfilled from
-- Scryfall by import and the deck refresh action (never required).
-- Apply to production Turso manually; local dev uses `prisma db push`.
--   turso db shell <your-db-name> < prisma/migrations-manual/2026-09-07-deck-mana-data.sql
--
-- ALTER TABLE ... ADD COLUMN has no IF NOT EXISTS in SQLite: a retry prints
-- benign "duplicate column name" errors and changes nothing.

ALTER TABLE deck_cards ADD COLUMN cmc FLOAT;
ALTER TABLE deck_cards ADD COLUMN manaCost TEXT;
ALTER TABLE deck_cards ADD COLUMN colors TEXT DEFAULT '';
