import { z } from "zod";

// -----------------------------------------------------------------------------
// GameParticipant validator (D-02, GAME-09 sanitization)
// -----------------------------------------------------------------------------
// playerName: free-text per D-02 (no Player table); trimmed + non-empty per GAME-09
// deckName: optional per D-02 (winner's deck matters most; others are bonus)
// isWinner / isScrewed: boolean flags per D-03 (no winner FK on Game)
export const gameParticipantSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, "playerName is required")
    .max(100, "playerName too long"),
  isWinner: z.boolean(),
  isScrewed: z.boolean(),
  deckName: z
    .string()
    .trim()
    .max(100, "deckName too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type GameParticipantInput = z.infer<typeof gameParticipantSchema>;

// -----------------------------------------------------------------------------
// Game validator (D-01, GAME-01 "1-4 players", GAME-09 sanitization)
// -----------------------------------------------------------------------------
// date: coerced from ISO string or Date (API bodies arrive as JSON strings)
// wonByCombo: defaults to false per D-01 — Phase 6 form toggle
// notes: optional per D-01; trimmed and length-clamped per GAME-09
// participants: 1-4 entries per GAME-01; winner count NOT enforced here
//   (Phase 6 may want to allow unresolved-winner drafts — defer to route)
export const gameSchema = z.object({
  date: z.coerce.date(),
  wonByCombo: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(1000, "notes too long")
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  // Phase 6.1 D-14: defense-in-depth against duplicate player names within a single
  // game. Client-side Combobox + excludeItems prevents the UX from producing duplicates
  // (game-form.tsx), but the API must reject any direct POST/PATCH bypassing the form.
  // Case-insensitive comparison — gameParticipantSchema.playerName already .trim()s, so
  // leading/trailing whitespace collisions are normalized before this refine runs.
  participants: z
    .array(gameParticipantSchema)
    .min(1, "at least one participant required")
    .max(4, "at most four participants per game")
    .refine(
      (arr) => new Set(arr.map((p) => p.playerName.toLowerCase())).size === arr.length,
      { message: "duplicate player names not allowed" }
    ),
});

export type GameInput = z.infer<typeof gameSchema>;

// -----------------------------------------------------------------------------
// SyncLog validator (D-06, D-07)
// -----------------------------------------------------------------------------
// Granularity: one row per user per sync (D-06)
// status: "success" | "failure" stored as string (D-07 — SQLite enum support awkward)
// errorMessage: nullable, holds truncated error text on failure (D-07)
// Phase 8 Discord alert will read rows WHERE status = "failure"
export const syncLogSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  status: z.enum(["success", "failure"]),
  errorMessage: z
    .string()
    .max(2000, "errorMessage too long")
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : v ?? null)),
});

export type SyncLogInput = z.infer<typeof syncLogSchema>;
