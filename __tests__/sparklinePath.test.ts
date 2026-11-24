/**
 * Tests for lib/utils/sparklinePath.ts (2026-11-23): the sparkline's monotone cubic. A flat-jump-flat
 * series is the shape a Catmull-Rom spline overshoots on; the controls here must stay in their band.
 */

import { describe, it, expect } from 'vitest';
import { monotonePath, monotoneSegments, type SparkPoint } from '@/lib/utils/sparklinePath';

const FLAT_JUMP_FLAT: SparkPoint[] = [
  [0, 100],
  [10, 100],
  [20, 100],
  [30, 10],
  [40, 10],
  [50, 10],
];

describe('monotoneSegments', () => {
  // The flat-jump-flat series alone cannot tell the harmonic mean from the arithmetic one (every interior
  // slope there has a zero neighbour); the steepening ramp does: its arithmetic tangent shoots below the first end.
  it.each([
    ['flat-jump-flat', FLAT_JUMP_FLAT],
    ['steepening ramp', [[0, 0], [10, 1], [20, 100]] as SparkPoint[]],
  ])('keeps every control point between the y of its segment ends on %s (U1)', (_name, pts) => {
    monotoneSegments(pts).forEach((segment, i) => {
      const lo = Math.min(pts[i][1], pts[i + 1][1]);
      const hi = Math.max(pts[i][1], pts[i + 1][1]);
      for (const control of [segment.c1, segment.c2]) {
        expect(control[1]).toBeGreaterThanOrEqual(lo);
        expect(control[1]).toBeLessThanOrEqual(hi);
      }
    });
  });

  it('ends every segment on the next point and draws a flat series on its line (U2)', () => {
    const segments = monotoneSegments(FLAT_JUMP_FLAT);
    segments.forEach((segment, i) => expect(segment.to).toEqual(FLAT_JUMP_FLAT[i + 1]));
    expect(monotonePath(FLAT_JUMP_FLAT).startsWith('M 0,100')).toBe(true);
    for (const segment of monotoneSegments([[0, 7], [10, 7], [20, 7]])) {
      expect(segment.c1[1]).toBe(7);
      expect(segment.c2[1]).toBe(7);
    }
  });

  it('gives one segment for two points, its controls on the straight line (U3)', () => {
    const segments = monotoneSegments([[0, 0], [30, 60]]);
    expect(segments).toHaveLength(1);
    expect(segments[0].c1).toEqual([10, 20]);
    expect(segments[0].c2).toEqual([20, 40]);
  });
});

describe('monotonePath', () => {
  it('is empty under two points and one C for two (U3)', () => {
    expect(monotonePath([[0, 0]])).toBe('');
    const path = monotonePath([[0, 0], [30, 60]]);
    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/C/g)).toHaveLength(1);
  });
});
