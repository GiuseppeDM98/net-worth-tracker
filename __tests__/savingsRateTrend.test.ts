/**
 * `buildSavingsRateTrendPoints` (lib/utils/analisiSummary.ts): the points of Analisi's «Andamento
 * risparmio» line. A month that is not a rate — no income, or a deficit beyond the floor (owner,
 * 2026-11-12) — is a gap (`null`), never a point that rescales the axis. `overspent` tells the
 * chart's description which of the two the gap is: «spese oltre le entrate», never «nessuna entrata».
 */

import { describe, expect, it } from 'vitest';
import { buildSavingsRateTrendPoints } from '@/lib/utils/analisiSummary';

describe('buildSavingsRateTrendPoints', () => {
  it('should keep a true rate and leave a gap below the floor and without income (L1)', () => {
    const points = buildSavingsRateTrendPoints([
      { label: 'Gen 26', month: 1, year: 2026, income: 2000, expenses: 2600 },
      { label: 'Feb 26', month: 2, year: 2026, income: 3, expenses: 500 },
      { label: 'Mar 26', month: 3, year: 2026, income: 0, expenses: 300 },
      { label: 'Apr 26', month: 4, year: 2026, income: 1000, expenses: 800 },
    ]);
    expect(points).toEqual([
      { label: 'Gen 26', month: 1, year: 2026, rate: -30, overspent: false },
      { label: 'Feb 26', month: 2, year: 2026, rate: null, overspent: true },
      { label: 'Mar 26', month: 3, year: 2026, rate: null, overspent: false },
      { label: 'Apr 26', month: 4, year: 2026, rate: 20, overspent: false },
    ]);
  });
});
