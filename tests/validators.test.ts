import {
  gameCreateSchema,
  gameUpdateSchema,
  applyVariantInvariants,
  GAME_VARIANTS,
  PARTICIPANT_ROLES,
  type ParticipantRole,
} from '../src/lib/validators';

const baseDate = new Date('2026-05-01T00:00:00.000Z').toISOString();

function p(
  name: string,
  opts: Partial<{
    isWinner: boolean;
    isScrewed: boolean;
    deckName?: string;
    role?: ParticipantRole;
  }> = {}
) {
  return {
    playerName: name,
    isWinner: opts.isWinner ?? false,
    isScrewed: opts.isScrewed ?? false,
    deckName: opts.deckName,
    role: opts.role,
  };
}

describe('GAME_VARIANTS / PARTICIPANT_ROLES constants', () => {
  it('exports the expected role values', () => {
    expect(PARTICIPANT_ROLES).toEqual(['KING', 'SQUIRE', 'ASSASSIN']);
  });
});

describe('gameCreateSchema — COMMANDER', () => {
  it('accepts a 4-player COMMANDER game with exactly one winner', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B'), p('C'), p('D')],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.variant).toBe('COMMANDER');
  });

  it('rejects COMMANDER with two winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B', { isWinner: true })],
    });
    expect(res.success).toBe(false);
  });

  it('rejects COMMANDER with zero winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A'), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects COMMANDER when any participant has a role set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
    });
    expect(res.success).toBe(false);
  });
});

describe('gameCreateSchema — STAR', () => {
  function star(participants: ReturnType<typeof p>[]) {
    return { date: baseDate, variant: 'STAR' as const, participants };
  }

  it('accepts a 5-player STAR with one winner', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B'), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(true);
  });

  it('accepts a 5-player STAR with two winners', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B', { isWinner: true }), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(true);
  });

  it('rejects STAR with three winners', () => {
    const res = gameCreateSchema.safeParse(
      star([
        p('A', { isWinner: true }),
        p('B', { isWinner: true }),
        p('C', { isWinner: true }),
        p('D'),
        p('E'),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR with zero winners', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A'), p('B'), p('C'), p('D'), p('E')])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR with a participant count other than 5', () => {
    const res = gameCreateSchema.safeParse(
      star([p('A', { isWinner: true }), p('B'), p('C'), p('D')])
    );
    expect(res.success).toBe(false);
  });

  it('rejects STAR when any participant has a role set', () => {
    const res = gameCreateSchema.safeParse(
      star([
        p('A', { isWinner: true, role: 'SQUIRE' }),
        p('B'),
        p('C'),
        p('D'),
        p('E'),
      ])
    );
    expect(res.success).toBe(false);
  });
});

describe('gameCreateSchema — KING', () => {
  function king(participants: ReturnType<typeof p>[]) {
    return { date: baseDate, variant: 'KING' as const, participants };
  }

  it('accepts a 6-player KING where Royalty won', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(true);
  });

  it('accepts a 7-player KING where Assassins won', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { role: 'KING' }),
        p('S1', { role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { isWinner: true, role: 'ASSASSIN' }),
        p('A2', { isWinner: true, role: 'ASSASSIN' }),
        p('A3', { isWinner: true, role: 'ASSASSIN' }),
        p('A4', { isWinner: true, role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(true);
  });

  it('accepts an 8-player KING where Royalty won', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { isWinner: true, role: 'SQUIRE' }),
        p('S3', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
        p('A4', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(true);
  });

  it('rejects KING with a participant count outside 6-8', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with two KING participants', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K1', { isWinner: true, role: 'KING' }),
        p('K2', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with a participant having no role', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
        p('X'),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING when Royalty winners exclude a squire', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING when winners mix Royalty and Assassins', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { isWinner: true, role: 'KING' }),
        p('S1', { isWinner: true, role: 'SQUIRE' }),
        p('S2', { isWinner: true, role: 'SQUIRE' }),
        p('A1', { isWinner: true, role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });

  it('rejects KING with no winners at all', () => {
    const res = gameCreateSchema.safeParse(
      king([
        p('K', { role: 'KING' }),
        p('S1', { role: 'SQUIRE' }),
        p('S2', { role: 'SQUIRE' }),
        p('A1', { role: 'ASSASSIN' }),
        p('A2', { role: 'ASSASSIN' }),
        p('A3', { role: 'ASSASSIN' }),
      ])
    );
    expect(res.success).toBe(false);
  });
});

describe('applyVariantInvariants — used by PATCH route', () => {
  it('accepts a COMMANDER body against a COMMANDER variant', () => {
    const result = applyVariantInvariants(
      { participants: [p('A', { isWinner: true }), p('B')] },
      'COMMANDER'
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a COMMANDER body against a KING variant (wrong roles)', () => {
    const result = applyVariantInvariants(
      { participants: [p('A', { isWinner: true }), p('B')] },
      'KING'
    );
    expect(result.ok).toBe(false);
  });

  it('accepts a valid KING body against a KING variant', () => {
    const result = applyVariantInvariants(
      {
        participants: [
          p('K', { isWinner: true, role: 'KING' }),
          p('S1', { isWinner: true, role: 'SQUIRE' }),
          p('S2', { isWinner: true, role: 'SQUIRE' }),
          p('A1', { role: 'ASSASSIN' }),
          p('A2', { role: 'ASSASSIN' }),
          p('A3', { role: 'ASSASSIN' }),
        ],
      },
      'KING'
    );
    expect(result.ok).toBe(true);
  });
});

describe('gameUpdateSchema — body has no variant; invariants deferred to route', () => {
  it('accepts a body without a variant key', () => {
    const res = gameUpdateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(true);
  });

  it('does NOT enforce COMMANDER invariants (variant check happens in route, not schema)', () => {
    const res = gameUpdateSchema.safeParse({
      date: baseDate,
      participants: [p('A'), p('B')], // zero winners — would fail COMMANDER invariant in create
    });
    expect(res.success).toBe(true);
  });

  // D-45: bestOf / comboWins are creation-time only — gameUpdateSchema must strip them
  // silently rather than accept them. Zod's default for omitted keys is strip.
  it('strips bestOf and comboWins keys when present in the update body', () => {
    const res = gameUpdateSchema.safeParse({
      date: baseDate,
      bestOf: 3,
      comboWins: 2,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect('bestOf' in res.data).toBe(false);
      expect('comboWins' in res.data).toBe(false);
    }
  });
});

describe('gameCreateSchema — isRandom field', () => {
  it('accepts participants with isRandom: true', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        p('Alice', { isWinner: true }),
        { ...p('Bob'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('defaults isRandom to false when omitted', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        p('Alice', { isWinner: true }),
        p('Bob'),
      ],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.participants.every((pp) => pp.isRandom === false)).toBe(true);
    }
  });

  it('rejects two regular rows with the same name', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        p('Alice', { isWinner: true }),
        p('alice'),
      ],
    });
    expect(res.success).toBe(false);
  });

  it('accepts two random rows with the same name', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        { ...p('Conny', { isWinner: true }), isRandom: true },
        { ...p('Conny'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('accepts a regular row sharing a name with a random row', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        p('Conny', { isWinner: true }),
        { ...p('Conny'), isRandom: true },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty playerName even when isRandom is true', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [
        p('Alice', { isWinner: true }),
        { ...p(''), isRandom: true },
      ],
    });
    expect(res.success).toBe(false);
  });
});

// ===========================================================================
// New variants: BRAWL + best-of formats
// ===========================================================================

describe('GAME_VARIANTS — expanded to 10 entries', () => {
  it('lists every variant in the canonical order from gameFormats.ts', () => {
    expect(GAME_VARIANTS).toEqual([
      'COMMANDER', 'STAR', 'KING', 'BRAWL',
      'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
    ]);
  });
});

describe('gameCreateSchema — BRAWL', () => {
  it('accepts a 2-player BRAWL game with one winner and no bestOf/comboWins', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(true);
  });

  it('rejects BRAWL with 3 participants', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true }), p('B'), p('C')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with zero winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A'), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with bestOf set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      bestOf: 3,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL with comboWins set', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      comboWins: 1,
      participants: [p('A', { isWinner: true }), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects BRAWL participants with roles', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      variant: 'BRAWL',
      participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
    });
    expect(res.success).toBe(false);
  });
});

describe.each(['STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE'] as const)(
  'gameCreateSchema — best-of variant %s',
  (variant) => {
    it('accepts Bo1 with comboWins 0', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 1,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(true);
    });

    it('accepts Bo1 with comboWins 1', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 1,
        comboWins: 1,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(true);
    });

    it('accepts Bo3 with comboWins 0, 1, and 2', () => {
      for (const comboWins of [0, 1, 2]) {
        const res = gameCreateSchema.safeParse({
          date: baseDate,
          variant,
          bestOf: 3,
          comboWins,
          participants: [p('A', { isWinner: true }), p('B')],
        });
        expect(res.success).toBe(true);
      }
    });

    it('accepts Bo5 with comboWins 0, 1, 2, and 3', () => {
      for (const comboWins of [0, 1, 2, 3]) {
        const res = gameCreateSchema.safeParse({
          date: baseDate,
          variant,
          bestOf: 5,
          comboWins,
          participants: [p('A', { isWinner: true }), p('B')],
        });
        expect(res.success).toBe(true);
      }
    });

    it('rejects bestOf 2', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 2,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects bestOf 4', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 4,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects missing bestOf', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects missing comboWins', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects Bo3 with comboWins 3', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 3,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects Bo5 with comboWins 4', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 5,
        comboWins: 4,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects negative comboWins', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: -1,
        participants: [p('A', { isWinner: true }), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects 1 participant', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true })],
      });
      expect(res.success).toBe(false);
    });

    it('rejects 3 participants', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B'), p('C')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects zero winners', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A'), p('B')],
      });
      expect(res.success).toBe(false);
    });

    it('rejects two winners', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true }), p('B', { isWinner: true })],
      });
      expect(res.success).toBe(false);
    });

    it('rejects role on participants', () => {
      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        comboWins: 0,
        participants: [p('A', { isWinner: true, role: 'KING' }), p('B')],
      });
      expect(res.success).toBe(false);
    });
  }
);

describe('gameCreateSchema — non-best-of variants reject bestOf/comboWins', () => {
  it.each(['COMMANDER', 'STAR', 'KING'] as const)(
    '%s rejects bestOf when set',
    (variant) => {
      const participants =
        variant === 'STAR'
          ? [p('A', { isWinner: true }), p('B'), p('C'), p('D'), p('E')]
          : variant === 'KING'
          ? [
              p('A', { isWinner: true, role: 'KING' }),
              p('B', { isWinner: true, role: 'SQUIRE' }),
              p('C', { isWinner: true, role: 'SQUIRE' }),
              p('D', { role: 'ASSASSIN' }),
              p('E', { role: 'ASSASSIN' }),
              p('F', { role: 'ASSASSIN' }),
            ]
          : [p('A', { isWinner: true }), p('B'), p('C'), p('D')];

      const res = gameCreateSchema.safeParse({
        date: baseDate,
        variant,
        bestOf: 3,
        participants,
      });
      expect(res.success).toBe(false);
    }
  );
});
