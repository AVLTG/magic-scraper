-- Phase 6.1 production migration: add isImported flag + backfill ported-from-spreadsheet rows
-- Matches prisma/schema.prisma Game model (D-01)
-- Apply via: turso db shell <PROD-DB-NAME> < 06.1-01-PROD-MIGRATION.sql
-- Or interactively paste section by section into: turso db shell <PROD-DB-NAME>
--
-- Phase 5 D-14 pattern: additive only, no DROP, no ALTER of existing columns.
-- SQLite stores booleans as INTEGER; Prisma's Boolean maps to INTEGER 0/1.

-- Step 1: Add the column (additive, default 0 = false)
ALTER TABLE games ADD COLUMN isImported INTEGER NOT NULL DEFAULT 0;

-- Step 2: Verify the column exists and all rows defaulted to 0
SELECT name, type, "notnull", dflt_value FROM pragma_table_info('games') WHERE name = 'isImported';
-- Expected: isImported | INTEGER | 1 | 0

SELECT COUNT(*) AS total_games, SUM(CASE WHEN isImported = 0 THEN 1 ELSE 0 END) AS default_false FROM games;
-- Expected: default_false == total_games (every row defaulted to 0)

-- Step 3: Backfill the ~20 spreadsheet-imported rows (D-03)
-- Case-sensitive LIKE against the literal "Ported from Spreadsheet" substring that the
-- import script wrote into the notes column. Do NOT strip or modify the notes value (D-04).
UPDATE games SET isImported = 1 WHERE notes LIKE '%Ported from Spreadsheet%';

-- Step 4: Verify the backfill flagged the expected ~20 rows
SELECT COUNT(*) AS imported_rows FROM games WHERE isImported = 1;
-- Expected: approximately 20 (D-03 — plan author: record the actual number here after running)

-- Step 5: Spot-check — the notes field was NOT cleaned up (D-04)
SELECT id, date, isImported, substr(notes, 1, 60) AS notes_preview
  FROM games WHERE isImported = 1 LIMIT 3;
-- Expected: every row's notes_preview still contains "Ported from Spreadsheet"
