-- Phase 6.2: add Game.variant (Star/King commander) + GameParticipant.role
-- Additive-only, per Phase 5 D-14 pattern (no DROP, no ALTER of existing columns).
-- Spec: docs/superpowers/specs/2026-05-18-commander-variants-design.md

ALTER TABLE "games" ADD COLUMN "variant" TEXT NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "game_participants" ADD COLUMN "role" TEXT;
