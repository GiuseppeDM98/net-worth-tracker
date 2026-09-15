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
 * - dividendiNarrative.ts (`LARGEST_TYPE_PREFIX`, the article the reading uses)
 * TypeScript will surface a missing-key error on the Record types below. The form's select and
 * the two detail dialogs read THIS map (they kept private copies until 2026-09-14).
 */

import type { DividendType } from '@/types/dividend';

export const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  // «Acconto» and «Saldo», not «Interim» and «Finale»: the same words the readings use
  // (`LARGEST_TYPE_PREFIX` in dividendiNarrative.ts — «l'acconto», «il saldo»), so the select,
  // the table and the sentence above it name one thing one way (2026-09-14).
  interim: 'Acconto',
  final: 'Saldo',
  coupon: 'Cedola',
  finalPremium: 'Premio finale',
};
