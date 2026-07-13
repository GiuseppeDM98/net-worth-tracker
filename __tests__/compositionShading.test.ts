/**
 * Tests for lib/utils/compositionShading.ts.
 */

import { describe, it, expect } from 'vitest';
import { computeShadeOpacities } from '@/lib/utils/compositionShading';

describe('computeShadeOpacities', () => {
  it('returns an empty array for 0 items', () => {
    expect(computeShadeOpacities(0)).toEqual([]);
  });

  it('returns full opacity for a single item', () => {
    expect(computeShadeOpacities(1)).toEqual([1]);
  });

  it('returns two opacities spanning 1.0 to 0.4', () => {
    expect(computeShadeOpacities(2)).toEqual([1, 0.4]);
  });

  it('distributes N opacities linearly from 1.0 to 0.4', () => {
    const opacities = computeShadeOpacities(4);
    [1, 0.8, 0.6, 0.4].forEach((expected, i) => {
      expect(opacities[i]).toBeCloseTo(expected);
    });
  });

  it('never goes below 0.4 regardless of count', () => {
    const opacities = computeShadeOpacities(10);
    expect(Math.min(...opacities)).toBeCloseTo(0.4);
    expect(Math.max(...opacities)).toBe(1);
  });

  it('is monotonically decreasing', () => {
    const opacities = computeShadeOpacities(6);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThan(opacities[i - 1]);
    }
  });
});
