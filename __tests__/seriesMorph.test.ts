import { describe, expect, it } from 'vitest';
import { blendSeries, easeOutQuart, resampleSeries, sameSeries } from '@/lib/utils/seriesMorph';

describe('resampleSeries', () => {
  it('should keep a series of the same length untouched', () => {
    expect(resampleSeries([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('should stretch a series by linear interpolation over the normalised axis', () => {
    // Two points → five: the straight line from 0 to 100 sampled at 0, 25, 50, 75, 100.
    expect(resampleSeries([0, 100], 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it('should squeeze a series keeping its first and last points', () => {
    const out = resampleSeries([10, 20, 30, 40, 50], 3);
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(30);
    expect(out[2]).toBe(50);
  });

  it('should fill a gap from its nearest neighbour before interpolating, never across it', () => {
    expect(resampleSeries([5, null, 9], 3)).toEqual([5, 5, 9]);
  });

  it('should give nothing to start from with an empty source, and a flat line from a single point', () => {
    expect(resampleSeries([], 3)).toEqual([null, null, null]);
    expect(resampleSeries([7], 3)).toEqual([7, 7, 7]);
    expect(resampleSeries([1, 2], 0)).toEqual([]);
  });
});

describe('blendSeries', () => {
  it('should sit on the start at t=0 and on the target at t=1', () => {
    expect(blendSeries([0, 10], [100, 20], 0)).toEqual([0, 10]);
    expect(blendSeries([0, 10], [100, 20], 1)).toEqual([100, 20]);
  });

  it('should ease out: past the midpoint of time it is well past the midpoint of the way', () => {
    const [mid] = blendSeries([0], [100], 0.5);
    expect(mid).toBeCloseTo(100 * easeOutQuart(0.5), 6);
    expect(mid).toBeGreaterThan(90);
  });

  it('should keep a target gap a gap and jump to the target where the start is missing', () => {
    expect(blendSeries([1, null], [null, 8], 0.3)).toEqual([null, 8]);
  });
});

describe('sameSeries', () => {
  it('should compare length and every value, nulls included', () => {
    expect(sameSeries([1, null], [1, null])).toBe(true);
    expect(sameSeries([1, null], [1, 2])).toBe(false);
    expect(sameSeries([1], [1, 1])).toBe(false);
  });
});
