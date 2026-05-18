-- Phase 6.3: add GameParticipant.isRandom flag for random-player aggregation
-- Additive-only, per Phase 5 D-14 pattern. Existing rows backfill to 0 (false).
-- Spec: docs/superpowers/specs/2026-05-18-random-players-design.md

ALTER TABLE "game_participants" ADD COLUMN "isRandom" BOOLEAN NOT NULL DEFAULT false;
