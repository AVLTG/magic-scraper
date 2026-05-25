-- Phase 06.5: add best-of + combo-wins tracking for best-of formats (Standard/Pauper/Draft/Prerelease/Sealed/Cube).
-- Spec: docs/superpowers/specs/2026-05-24-multi-format-games-and-best-of-design.md
ALTER TABLE "games" ADD COLUMN "bestOf" INTEGER;
ALTER TABLE "games" ADD COLUMN "comboWins" INTEGER;
