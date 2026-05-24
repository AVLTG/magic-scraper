export type GameVariantKey = 'COMMANDER' | 'STAR' | 'KING';

export interface VariantBadge {
  label: string;
  classes: string;
}

const VARIANT_BADGES: Record<GameVariantKey, VariantBadge> = {
  COMMANDER: {
    label: 'Commander',
    classes: 'bg-surface text-muted border border-border',
  },
  STAR: {
    label: 'Star',
    classes:
      'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200',
  },
  KING: {
    label: 'King',
    classes:
      'bg-purple-100 text-purple-900 dark:bg-purple-900/30 dark:text-purple-200',
  },
};

export function getVariantBadge(variant: string): VariantBadge {
  return VARIANT_BADGES[variant as GameVariantKey] ?? VARIANT_BADGES.COMMANDER;
}
