import { z } from 'zod';
import {
  ALL_FORMATS,
  BEST_OF_FORMATS,
  maxComboWinsFor,
  type GameFormat,
} from '@/lib/gameFormats';

// -----------------------------------------------------------------------------
// Variant + role enums — variants now sourced from gameFormats.ts (D-31, D-32)
// -----------------------------------------------------------------------------
export const GAME_VARIANTS = ALL_FORMATS;
export type GameVariant = GameFormat;

export const PARTICIPANT_ROLES = ['KING', 'SQUIRE', 'ASSASSIN'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

// -----------------------------------------------------------------------------
// GameParticipant validator (unchanged)
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
// Base game schema — now carries optional bestOf + comboWins
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
  bestOf: z
    .number()
    .int()
    .nullish()
    .transform((v) => (v == null ? null : v)),
  comboWins: z
    .number()
    .int()
    .nullish()
    .transform((v) => (v == null ? null : v)),
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
// Variant invariants — branches for COMMANDER, STAR, KING, BRAWL, and a shared
// best-of branch covering STANDARD/PAUPER/DRAFT/PRERELEASE/SEALED/CUBE.
// -----------------------------------------------------------------------------
type ParticipantForInvariants = {
  isWinner: boolean;
  role?: ParticipantRole | null;
};

type InvariantInput = {
  participants: ParticipantForInvariants[];
  bestOf?: number | null;
  comboWins?: number | null;
};

export type InvariantResult =
  | { ok: true }
  | { ok: false; message: string };

function rejectBestOfFields(data: InvariantInput, variant: string): InvariantResult | null {
  if (data.bestOf != null) {
    return { ok: false, message: `${variant} game must not set bestOf` };
  }
  if (data.comboWins != null) {
    return { ok: false, message: `${variant} game must not set comboWins` };
  }
  return null;
}

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
    const r = rejectBestOfFields(data, 'COMMANDER');
    if (r) return r;
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
    const r = rejectBestOfFields(data, 'STAR');
    if (r) return r;
    return { ok: true };
  }

  if (variant === 'KING') {
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
    const r = rejectBestOfFields(data, 'KING');
    if (r) return r;
    return { ok: true };
  }

  if (variant === 'BRAWL') {
    if (ps.length !== 2) {
      return { ok: false, message: 'BRAWL game must have exactly 2 participants' };
    }
    if (winnerCount !== 1) {
      return { ok: false, message: 'BRAWL game must have exactly one winner' };
    }
    if (withRole.length > 0) {
      return { ok: false, message: 'BRAWL game participants must not have roles' };
    }
    const r = rejectBestOfFields(data, 'BRAWL');
    if (r) return r;
    return { ok: true };
  }

  // Shared best-of branch: STANDARD / PAUPER / DRAFT / PRERELEASE / SEALED / CUBE
  if (BEST_OF_FORMATS.has(variant)) {
    if (ps.length !== 2) {
      return { ok: false, message: `${variant} game must have exactly 2 participants` };
    }
    if (winnerCount !== 1) {
      return { ok: false, message: `${variant} game must have exactly one winner` };
    }
    if (withRole.length > 0) {
      return { ok: false, message: `${variant} game participants must not have roles` };
    }
    if (data.bestOf !== 1 && data.bestOf !== 3 && data.bestOf !== 5) {
      return { ok: false, message: `${variant} game requires bestOf 1, 3, or 5` };
    }
    const maxCombo = maxComboWinsFor(data.bestOf);
    if (
      typeof data.comboWins !== 'number' ||
      data.comboWins < 0 ||
      data.comboWins > maxCombo
    ) {
      return {
        ok: false,
        message: `${variant} Bo${data.bestOf} game requires comboWins in 0-${maxCombo}`,
      };
    }
    return { ok: true };
  }

  // Defensive — unreachable thanks to z.enum on the schema.
  return { ok: false, message: `Unknown variant: ${variant}` };
}

// -----------------------------------------------------------------------------
// Create schema — sets variant (default COMMANDER) and enforces invariants
// -----------------------------------------------------------------------------
export const gameCreateSchema = baseGameSchema
  .extend({ variant: z.enum(GAME_VARIANTS).default('COMMANDER') })
  .superRefine((data, ctx) => {
    const result = applyVariantInvariants(
      {
        participants: data.participants,
        bestOf: data.bestOf,
        comboWins: data.comboWins,
      },
      data.variant
    );
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
// Update schema — no variant/bestOf/comboWins (creation-time only per D-45);
// PATCH route fetches stored values and runs applyVariantInvariants.
// -----------------------------------------------------------------------------
export const gameUpdateSchema = baseGameSchema.omit({
  bestOf: true,
  comboWins: true,
});
export type GameUpdateInput = z.infer<typeof gameUpdateSchema>;

// -----------------------------------------------------------------------------
// Back-compat alias
// -----------------------------------------------------------------------------
export const gameSchema = gameCreateSchema;
export type GameInput = GameCreateInput;
