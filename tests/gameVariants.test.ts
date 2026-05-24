import { getVariantBadge } from '../src/lib/gameVariants';

describe('getVariantBadge', () => {
  it('returns Commander label for COMMANDER', () => {
    const badge = getVariantBadge('COMMANDER');
    expect(badge.label).toBe('Commander');
    expect(badge.classes).toMatch(/bg-/);
    expect(badge.classes).toMatch(/text-/);
  });

  it('returns Star label for STAR', () => {
    const badge = getVariantBadge('STAR');
    expect(badge.label).toBe('Star');
    expect(badge.classes).toMatch(/yellow/);
  });

  it('returns King label for KING', () => {
    const badge = getVariantBadge('KING');
    expect(badge.label).toBe('King');
    expect(badge.classes).toMatch(/purple/);
  });

  it('falls back to COMMANDER for unknown variant', () => {
    const badge = getVariantBadge('SOMETHING_NEW');
    expect(badge.label).toBe('Commander');
  });

  it('accepts unknown values without throwing', () => {
    expect(() => getVariantBadge('')).not.toThrow();
    expect(() => getVariantBadge('definitely-unknown')).not.toThrow();
  });
});
