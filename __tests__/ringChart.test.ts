/**
 * `lib/utils/ringChart.ts` (DESIGN.md → The Ring Rule, 2026-11-12): the arcs of one positive whole,
 * the fold past six parts, the figure the hole holds, and the guard that refuses a signed whole.
 * Figures invented and round.
 */

import { describe, expect, it } from 'vitest';
import {
  RING_CATEGORY_COLORS,
  RING_REST_COLOR,
  RING_REST_KEY,
  buildRingArcs,
  describeRingSegments,
  foldRingSegments,
  formatRingCenter,
  isRingWhole,
  ringCenterMaxChars,
  ringSwatchAt,
  type RingSegment,
} from '@/lib/utils/ringChart';

const NBSP = ' ';

function part(key: string, value: number, color = 'var(--chart-2)'): RingSegment {
  return { key, label: key, value, color };
}

const SEVEN: RingSegment[] = [
  part('a', 700), part('b', 600), part('c', 500), part('d', 400), part('e', 300), part('f', 200), part('g', 100),
];

describe('buildRingArcs', () => {
  it('R1: draws each part as its share less the gap, starting where the previous share ended', () => {
    const arcs = buildRingArcs([part('stipendio', 7200), part('dividendi', 1400), part('affitto', 900), part('altro', 500)]);
    expect(arcs.map((arc) => arc.length)).toEqual([71, 13, 8, 4]);
    expect(arcs.map((arc) => arc.offset)).toEqual([0, 72, 86, 95]);
  });

  it('R2: closes one part on itself, and keeps a 0,4% part visible at half its share', () => {
    expect(buildRingArcs([part('solo', 1000)])).toEqual([{ key: 'solo', color: 'var(--chart-2)', length: 100, offset: 0 }]);
    const tiny = buildRingArcs([part('grande', 996), part('piccola', 4)]);
    expect(tiny[1].length).toBe(0.2);
  });

  it('R3: draws nothing for a part at zero or below zero', () => {
    const arcs = buildRingArcs([part('a', 500), part('zero', 0), part('negativa', -100), part('b', 500)]);
    expect(arcs.map((arc) => arc.key)).toEqual(['a', 'b']);
    expect(buildRingArcs([part('zero', 0)])).toEqual([]);
  });

  it('R4: folds seven parts into six, the last one the rest, and gives the sixth row on the fold colour', () => {
    const folded = foldRingSegments(SEVEN, (n) => `Altre ${n}`);
    expect(folded).toHaveLength(6);
    expect(folded[5]).toEqual({ key: RING_REST_KEY, label: 'Altre 2', value: 300, color: RING_REST_COLOR });
    const arcs = buildRingArcs(SEVEN);
    expect(arcs).toHaveLength(6);
    expect(arcs[5].key).toBe(RING_REST_KEY);
    expect(ringSwatchAt(SEVEN, 5)).toBe(RING_REST_COLOR);
    expect(ringSwatchAt(SEVEN, 4)).toBe(SEVEN[4].color);
  });
});

describe('formatRingCenter', () => {
  it('R5: prints the first form that fits the hole, or nothing', () => {
    const cases: Array<[number, number, string]> = [
      [31900, 8, `31.900${NBSP}€`],
      [31900, 7, `31,9k${NBSP}€`],
      [32000, 7, `32k${NBSP}€`],
      [125400, 7, `125k${NBSP}€`],
      [1234500, 9, `1,2${NBSP}Mln${NBSP}€`],
      [1234500, 7, `1${NBSP}Mln${NBSP}€`],
      [999960, 7, `1${NBSP}Mln${NBSP}€`],
      [999600, 7, `1${NBSP}Mln${NBSP}€`],
      [4200, 7, `4200${NBSP}€`],
      [821, 4, ''],
    ];
    for (const [amount, maxChars, expected] of cases) {
      expect(formatRingCenter(amount, maxChars), `${amount} in ${maxChars}`).toBe(expected);
    }
  });
});

describe('ringCenterMaxChars', () => {
  it('R6: counts the characters on the chord at the figure’s far edge', () => {
    expect(ringCenterMaxChars(120)).toBe(7);
    expect(ringCenterMaxChars(96)).toBe(7);
    expect(ringCenterMaxChars(72)).toBe(4);
  });
});

describe('isRingWhole', () => {
  it('R7: refuses one part and any part that prints below zero, accepts a part that prints as zero', () => {
    expect(isRingWhole([part('solo', 1000)])).toBe(false);
    expect(isRingWhole([part('a', 1000), part('b', 500), part('debito', -1)])).toBe(false);
    expect(isRingWhole([part('a', 1000), part('b', 500), part('debito', -0.5)])).toBe(false);
    expect(isRingWhole([part('a', 1000), part('b', 500), part('quasi', -0.4)])).toBe(true);
  });
});

describe('describeRingSegments', () => {
  it('names each part as drawn, the fold included', () => {
    expect(describeRingSegments([part('Stipendio', 7200), part('Dividendi', 2800)])).toBe('Stipendio 72%, Dividendi 28%');
    expect(describeRingSegments(SEVEN).endsWith('Altre 2 11%')).toBe(true);
  });

  it('keeps six rank colours, income’s slot first, never spending’s nor the coral', () => {
    expect(RING_CATEGORY_COLORS).toHaveLength(6);
    expect(RING_CATEGORY_COLORS[0]).toBe('var(--chart-2)');
    expect(RING_CATEGORY_COLORS).not.toContain('var(--chart-1)');
    expect(RING_CATEGORY_COLORS).not.toContain('var(--chart-5)');
  });
});
