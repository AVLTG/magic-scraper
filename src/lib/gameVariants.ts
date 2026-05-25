export type GameVariantKey =
  | 'COMMANDER' | 'STAR' | 'KING' | 'BRAWL'
  | 'STANDARD' | 'PAUPER' | 'DRAFT' | 'PRERELEASE' | 'SEALED' | 'CUBE';

export interface VariantBadge {
  label: string;
  classes: string;
}

const VARIANT_BADGES: Record<GameVariantKey, VariantBadge> = {
  COMMANDER:  { label: 'Commander',  classes: 'bg-surface text-muted border border-border' },
  STAR:       { label: 'Star',       classes: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200' },
  KING:       { label: 'King',       classes: 'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200' },
  BRAWL:      { label: 'Brawl',      classes: 'bg-teal-100 text-teal-900 dark:bg-teal-900/30 dark:text-teal-200' },
  STANDARD:   { label: 'Standard',   classes: 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200' },
  PAUPER:     { label: 'Pauper',     classes: 'bg-slate-200 text-slate-900 dark:bg-slate-700/40 dark:text-slate-200' },
  DRAFT:      { label: 'Draft',      classes: 'bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200' },
  PRERELEASE: { label: 'Prerelease', classes: 'bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200' },
  SEALED:     { label: 'Sealed',     classes: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200' },
  CUBE:       { label: 'Cube',       classes: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' },
};

export function getVariantBadge(variant: string): VariantBadge {
  return VARIANT_BADGES[variant as GameVariantKey] ?? VARIANT_BADGES.COMMANDER;
}
