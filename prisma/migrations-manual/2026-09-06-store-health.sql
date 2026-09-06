-- Scraper health persistence: replaces the process-local Map that reset on
-- every serverless cold start (admin dashboard showed phantom grey).
-- Apply to production Turso manually; local dev uses `prisma db push`.
--   turso db shell <your-db-name> < prisma/migrations-manual/2026-09-06-store-health.sql
--
-- CREATE TABLE IF NOT EXISTS is fully idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS "store_health" (
    "store" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "errorMessage" TEXT,
    "lastRun" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
