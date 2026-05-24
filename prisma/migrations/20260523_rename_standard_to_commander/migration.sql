-- Phase 06.4: rename game variant value 'STANDARD' -> 'COMMANDER'.
-- Frees 'STANDARD' for a future MTG-Standard 2-player format.
-- Spec: docs/superpowers/specs/2026-05-23-game-mode-badge-and-discord-design.md

UPDATE "games" SET "variant" = 'COMMANDER' WHERE "variant" = 'STANDARD';
