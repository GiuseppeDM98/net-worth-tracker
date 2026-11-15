/**
 * `compositionRing` (lib/utils/compositionRing.ts, The Ring Rule, 2026-11-12): the asset classes as
 * ring parts, folded past six; a class below zero makes no ring, a class at 0 € no part. Figures
 * invented and round. Seen red on 2026-11-15 with the `isRingWhole` guard skipped.
 */

import { describe, expect, it } from 'vitest';
import { compositionRing } from '@/lib/utils/compositionRing';
import { RING_REST_COLOR, RING_REST_KEY } from '@/lib/utils/ringChart';
import type { PieChartData } from '@/types/assets';

describe('compositionRing (The Ring Rule, 2026-11-12)', () => {
  const cls = (assetClass: string, name: string, value: number): PieChartData => ({
    assetClass,
    name,
    value,
    percentage: value / 10_000,
    color: `var(--class-${assetClass})`,
  });
  const SEVEN: PieChartData[] = [
    cls('equity', 'Azioni', 520_000),
    cls('bonds', 'Obbligazioni', 180_000),
    cls('realestate', 'Immobili', 140_000),
    cls('crypto', 'Criptovalute', 60_000),
    cls('cash', 'Liquidità', 40_000),
    cls('commodity', 'Materie Prime', 30_000),
    cls('trendFollowing', 'Trend Following', 30_000),
  ];

  it('O1: folds seven classes into five and «Altre 2 classi», the two folded named in order', () => {
    const ring = compositionRing(SEVEN);
    expect(ring).not.toBeNull();
    expect(ring!.segments).toHaveLength(6);
    expect(ring!.segments[5]).toMatchObject({ key: RING_REST_KEY, label: 'Altre 2 classi', value: 60_000, color: RING_REST_COLOR });
    expect(ring!.segments[0].color).toBe('var(--class-equity)');
    expect(ring!.total).toBe(1_000_000);
    expect(ring!.folded.map((d) => d.name)).toEqual(['Materie Prime', 'Trend Following']);
  });

  it('O2: is no ring with a class below zero, and leaves a class at 0 € out of every part', () => {
    expect(compositionRing([cls('equity', 'Azioni', 50_000), cls('cash', 'Liquidità', -2_000)])).toBeNull();
    const ring = compositionRing([cls('equity', 'Azioni', 50_000), cls('bonds', 'Obbligazioni', 0), cls('cash', 'Liquidità', 10_000)]);
    expect(ring!.segments.map((segment) => segment.key)).toEqual(['equity', 'cash']);
    expect(ring!.total).toBe(60_000);
    expect(ring!.folded).toEqual([]);
  });
});
