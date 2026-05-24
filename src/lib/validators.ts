import { z } from 'zod';

// -----------------------------------------------------------------------------
// Variant + role enums (D-20, D-23 — see 2026-05-18-commander-variants-design.md)
// -----------------------------------------------------------------------------
export const GAME_VARIANTS = ['COMMANDER', 'STAR', 'KING'] as const;
export type GameVariant = (typeof GAME_VARIANTS)[number];

export const PARTICIPANT_ROLES = ['KING', 'SQUIRE', 'ASSASSIN'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

// -----------------------------------------------------------------------------
// GameParticipant validator
// -----------------------------------------------------------------------------
export const gameParticipantSchema = z.object({
  playerName: z
    .string()
    .trim()
    .min(1, 'playerName is required')
    .max(100, 'playerName too long'),
  isWinner: z.boolean(),
  isScrewed: z.boolean(),
  isRandom: z.boolean().default(false),
  deckName: z
    .string()
    .trim()
    .max(100, 'deckName too long')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  role: z
    .enum(PARTICIPANT_ROLES)
    .nullish()
    .transform((v) => v ?? undefined),
});

export type GameParticipantInput = z.infer<typeof gameParticipantSchema>;

// -----------------------------------------------------------------------------
// Base game schema (no variant; shared by create + update)
// -----------------------------------------------------------------------------
const baseGameSchema = z.object({
  date: z.coerce.date(),
  wonByCombo: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(1000, 'notes too long')
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  participants: z
    .array(gameParticipantSchema)
    .min(1, 'at least one participant required')
    .max(8, 'at most eight participants per game')
    .refine(
      (arr) => {
        const regulars = arr.filter((p) => !p.isRandom);
        const names = new Set(regulars.map((p) => p.playerName.toLowerCase()));
        return names.size === regulars.length;
      },
      { message: 'duplicate player names not allowed (non-random rows)' }
    ),
});

// -----------------------------------------------------------------------------
// Variant invariants — shared by gameCreateSchema.superRefine and the PATCH route
// -----------------------------------------------------------------------------
type ParticipantForInvariants = {
  isWinner: boolean;
  role?: ParticipantRole | null;
};

type InvariantInput = { participants: ParticipantForInvariants[] };

export type InvariantResult =
  | { ok: true }
  | { ok: false; message: string };

export function applyVariantInvariants(
  data: InvariantInput,
  variant: GameVariant
): InvariantResult {
  const ps = data.participants;
  const winnerCount = ps.filter((p) => p.isWinner).length;
  const withRole = ps.filter((p) => p.role != null);

  if (variant === 'COMMANDER') {
    if (winnerCount !== 1) {
      return { ok: false, message: 'COMMANDER game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'COMMANDER game participants must not have roles' };
    }
    return { ok: true };
  }

  if (variant === 'STAR') {
    if (ps.length !== 5) {
      return { ok: false, message: 'STAR game must have exactly 5 participants' };
    }
    if (winnerCount < 1 || winnerCount > 2) {
      return { ok: false, message: 'STAR game must have 1 or 2 winners' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'STAR game participants must not have roles' };
    }
    return { ok: true };
  }

  // KING
  if (ps.length < 6 || ps.length > 8) {
    return { ok: false, message: 'KING game must have 6-8 participants' };
  }
  if (withRole.length !== ps.length) {
    return { ok: false, message: 'KING game requires a role for every participant' };
  }
  const kings = ps.filter((p) => p.role === 'KING');
  if (kings.length !== 1) {
    return { ok: false, message: 'KING game must have exactly one KING' };
  }
  const others = ps.filter((p) => p.role !== 'KING');
  const allSquireOrAssassin = others.every(
    (p) => p.role === 'SQUIRE' || p.role === 'ASSASSIN'
  );
  if (!allSquireOrAssassin) {
    return {
      ok: false,
      message: 'KING game non-king participants must be SQUIRE or ASSASSIN',
    };
  }

  const winners = ps.filter((p) => p.isWinner);
  const royaltyMembers = ps.filter(
    (p) => p.role === 'KING' || p.role === 'SQUIRE'
  );
  const assassins = ps.filter((p) => p.role === 'ASSASSIN');

  const isRoyaltyWin =
    winners.length === royaltyMembers.length &&
    winners.every((w) => w.role === 'KING' || w.role === 'SQUIRE');
  const isAssassinWin =
    winners.length === assassins.length &&
    winners.length > 0 &&
    winners.every((w) => w.role === 'ASSASSIN');

  if (!isRoyaltyWin && !isAssassinWin) {
    return {
      ok: false,
      message:
        'KING game winners must be either {king + all squires} or {all assassins}',
    };
  }

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Create schema — sets variant (default COMMANDER) and enforces invariants
// -----------------------------------------------------------------------------
export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('COMMANDER') })
  .superRefine((data, ctx) => {
    const result = applyVariantInvariants(data, data.variant);
    if (!result.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: result.message,
        path: ['participants'],
      });
    }
  });

export type GameCreateInput = z.infer<typeof gameCreateSchema>;

// -----------------------------------------------------------------------------
// Update schema — no variant; PATCH route fetches the stored variant and runs
// applyVariantInvariants separately after parsing.
// -----------------------------------------------------------------------------
export const gameUpdateSchema = baseGameSchema;
export type GameUpdateInput = z.infer<typeof gameUpdateSchema>;

// -----------------------------------------------------------------------------
// Back-compat alias — keeps existing imports of `gameSchema` working until they
// migrate to the explicit name in Task 3.
// -----------------------------------------------------------------------------
export const gameSchema = gameCreateSchema;
export type GameInput = GameCreateInput;
