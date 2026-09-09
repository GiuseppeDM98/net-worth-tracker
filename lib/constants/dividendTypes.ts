/**
 * Shared display constants for dividend types.
 *
 * Single source of truth for the LABEL — previously duplicated across DividendTable,
 * DividendDetailsDialog and DividendTrackingTab.
 *
 * The per-type badge COLOURS were removed with the 2026-08-23 redesign: a chip painted from a
 * literal Tailwind palette (blue/purple/yellow/green/amber/emerald) stays that hue on every
 * theme, and six of them on one row made the type the loudest thing in a list whose subject is
 * the money. Type is now plain text on a neutral outline badge; only the warning tokens colour
 * anything there (an announced or provisional payment).
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
