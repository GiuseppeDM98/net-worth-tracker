import { describe, expect, it } from 'vitest';
import { incomeRingSegments } from '@/lib/utils/categoryRing';
import { RING_CATEGORY_COLORS, RING_REST_COLOR, RING_REST_KEY } from '@/lib/utils/ringChart';

describe('incomeRingSegments (The Ring Rule, 2026-11-12)', () => {
  const row = (key: string, amount: number, total: number) => ({ category: key, categoryKey: key, amount, percentage: (amount / total) * 100 });

  it('T1: takes the five rows by rank and what the cut left as the sixth part; one category is no ring', () => {
    const total = 10000;
    const ranking = {
      rows: [row('Stipendio', 5000, total), row('Affitto', 2000, total), row('Dividendi', 1000, total), row('Cedole', 800, total), row('Rimborsi', 700, total)],
      total,
      remainder: { amount: 500, percentage: 5 },
    };
    const ring = incomeRingSegments(ranking);
    expect(ring).not.toBeNull();
    expect(ring).toHaveLength(6);
    expect(ring!.slice(0, 5).map((segment) => segment.color)).toEqual(RING_CATEGORY_COLORS.slice(0, 5));
    expect(ring![5]).toEqual({ key: RING_REST_KEY, label: 'Altre categorie', value: 500, color: RING_REST_COLOR });

    expect(incomeRingSegments({ rows: [row('Stipendio', 3000, 3000)], total: 3000, remainder: null })).toBeNull();
  });
});
