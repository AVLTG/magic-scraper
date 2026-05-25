export const ALL_FORMATS = [
  'COMMANDER', 'STAR', 'KING', 'BRAWL',
  'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
] as const;
export type GameFormat = (typeof ALL_FORMATS)[number];

export const COMMANDER_FORMATS = new Set<GameFormat>([
  'COMMANDER', 'STAR', 'KING', 'BRAWL',
]);

export const BEST_OF_FORMATS = new Set<GameFormat>([
  'STANDARD', 'PAUPER', 'DRAFT', 'PRERELEASE', 'SEALED', 'CUBE',
]);

export const FORMAT_LABELS: Record<GameFormat, string> = {
  COMMANDER: 'Commander',
  STAR: 'Star Commander',
  KING: 'King Commander',
  BRAWL: 'Brawl',
  STANDARD: 'Standard',
  PAUPER: 'Pauper',
  DRAFT: 'Draft',
  PRERELEASE: 'Prerelease',
  SEALED: 'Sealed',
  CUBE: 'Cube',
};

export function isCommanderFormat(variant: string): boolean {
  return COMMANDER_FORMATS.has(variant as GameFormat);
}

export function requiresBestOf(variant: string): boolean {
  return BEST_OF_FORMATS.has(variant as GameFormat);
}

// True for variants that pick a single winner via a one-of-N radio:
// COMMANDER and the heads-up formats (BRAWL + all best-of). STAR and KING
// use multi-winner shapes and are excluded here.
export function isSingleWinnerVariant(variant: string): boolean {
  return (
    variant === 'COMMANDER' ||
    variant === 'BRAWL' ||
    BEST_OF_FORMATS.has(variant as GameFormat)
  );
}

export function maxComboWinsFor(bestOf: number): number {
  return Math.ceil(bestOf / 2);
}
