/**
 * `buildSavingsRateTrendPoints` (lib/utils/analisiSummary.ts): the points of Analisi's «Andamento
 * risparmio» line. A month that is not a rate — no income, or a deficit beyond the floor (owner,
 * 2026-11-12) — is a gap (`null`), never a point that rescales the axis. `overspent` tells the
 * chart's description which of the two the gap is: «spese oltre le entrate», never «nessuna entrata».
 */

import { describe, expect, it } from 'vitest';
import { buildSavingsRateBridges, buildSavingsRateTrendPoints } from '@/lib/utils/analisiSummary';

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

// The gap read as a broken line (owner, 2026-11-23, the mirror tour): a dashed bridge joins the two
// months around it. Seen red with a leading gap bridged from nothing, and with the gap never closed
// (a bridge after every month past the first one).
describe('buildSavingsRateBridges', () => {
  const point = (label: string, rate: number | null) => ({ label, rate });

  it('should join the months on either side of a gap, however long the gap is', () => {
    expect(
      buildSavingsRateBridges([point('Gen', 48), point('Feb', null), point('Mar', 20), point('Apr', null), point('Mag', null), point('Giu', 36), point('Lug', 30)]),
    ).toEqual([
      { from: { label: 'Gen', rate: 48 }, to: { label: 'Mar', rate: 20 } },
      { from: { label: 'Mar', rate: 20 }, to: { label: 'Giu', rate: 36 } },
    ]);
  });

  it('should bridge nothing at the edges of the window, nor on a line without gaps', () => {
    expect(buildSavingsRateBridges([point('Gen', null), point('Feb', 10), point('Mar', 20), point('Apr', null)])).toEqual([]);
    expect(buildSavingsRateBridges([point('Gen', 10), point('Feb', 20)])).toEqual([]);
    expect(buildSavingsRateBridges([])).toEqual([]);
  });
});
