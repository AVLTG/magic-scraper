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
  it('exports the expected variant values', () => {
    expect(GAME_VARIANTS).toEqual(['STANDARD', 'STAR', 'KING']);
  });
  it('exports the expected role values', () => {
    expect(PARTICIPANT_ROLES).toEqual(['KING', 'SQUIRE', 'ASSASSIN']);
  });
});

describe('gameCreateSchema — STANDARD', () => {
  it('accepts a 4-player STANDARD game with exactly one winner', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B'), p('C'), p('D')],
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.variant).toBe('STANDARD');
  });

  it('rejects STANDARD with two winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A', { isWinner: true }), p('B', { isWinner: true })],
    });
    expect(res.success).toBe(false);
  });

  it('rejects STANDARD with zero winners', () => {
    const res = gameCreateSchema.safeParse({
      date: baseDate,
      participants: [p('A'), p('B')],
    });
    expect(res.success).toBe(false);
  });

  it('rejects STANDARD when any participant has a role set', () => {
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
  it('accepts a STANDARD body against a STANDARD variant', () => {
    const result = applyVariantInvariants(
      { participants: [p('A', { isWinner: true }), p('B')] },
      'STANDARD'
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a STANDARD body against a KING variant (wrong roles)', () => {
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

  it('does NOT enforce STANDARD invariants (variant check happens in route, not schema)', () => {
    const res = gameUpdateSchema.safeParse({
      date: baseDate,
      participants: [p('A'), p('B')], // zero winners — would fail STANDARD invariant in create
    });
    expect(res.success).toBe(true);
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
