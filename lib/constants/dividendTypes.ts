/**
 * Shared display constants for dividend types.
 *
 * Single source of truth — previously duplicated across DividendTable,
 * DividendDetailsDialog, and DividendTrackingTab. Centralising here ensures
 * dark-mode badge variants stay in sync across all three surfaces.
 *
 * WARNING: If you add a DividendType, also update:
 * - types/dividend.ts (DividendType union)
 * - DividendDialog.tsx (form select options)
 * TypeScript will surface a missing-key error on the Record types below.
 */

import type { DividendType } from '@/types/dividend';

export const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
  coupon: 'Cedola',
  finalPremium: 'Premio Finale',
};

// Tailwind badge classes per dividend type.
// Low-opacity dark backgrounds keep badges legible on both card and dialog surfaces.
export const dividendTypeBadgeColor: Record<DividendType, string> = {
  ordinary:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
  extraordinary:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800',
  interim:
    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800',
  final:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800',
  coupon:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
  finalPremium:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
};
