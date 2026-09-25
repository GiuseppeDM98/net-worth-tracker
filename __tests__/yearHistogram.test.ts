/**
 * Tests for lib/utils/yearHistogram.ts — the one binning of calendar years shared by the FIRE
 * Distribuzione and the Monte Carlo's Esaurimento: the width follows the span, the counts add
 * up, the reference year marks exactly one bin, the ceiling caps the last bin.
 */

import { describe, expect, it } from 'vitest';
import { binYears, resolveBinWidth } from '@/lib/utils/yearHistogram';

describe('resolveBinWidth', () => {
  it('takes the smallest width that keeps the span under the bin cap', () => {
    expect(resolveBinWidth(5, 12)).toBe(1);
    expect(resolveBinWidth(12, 12)).toBe(1);
    expect(resolveBinWidth(13, 12)).toBe(2);
    expect(resolveBinWidth(25, 12)).toBe(3);
    expect(resolveBinWidth(41, 12)).toBe(5);
    expect(resolveBinWidth(100, 12)).toBe(10);
  });

  it('falls back to ten years when even that exceeds the cap', () => {
    expect(resolveBinWidth(200, 12)).toBe(10);
  });
});

describe('binYears', () => {
  it('bins year by year over a short span, counts adding up, the reference bin marked once', () => {
    const { bins, binWidthYears } = binYears([2031, 2031, 2032, 2035], { referenceYear: 2032, total: 8 });
    expect(binWidthYears).toBe(1);
    expect(bins.map((bin) => bin.fromYear)).toEqual([2031, 2032, 2033, 2034, 2035]);
    expect(bins.map((bin) => bin.count)).toEqual([2, 1, 0, 0, 1]);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(4);
    expect(bins.map((bin) => bin.isReference)).toEqual([false, true, false, false, false]);
    // Shares are of the caller's denominator, not of the years given.
    expect(bins[0].sharePct).toBe(25);
  });

  it('widens the bins over a long span and caps the last one at the ceiling year', () => {
    const years = [2028, 2030, 2041, 2055, 2066];
    const { bins, binWidthYears } = binYears(years, { ceilingYear: 2066 });
    expect(binWidthYears).toBe(5);
    expect(bins[0]).toMatchObject({ fromYear: 2028, toYear: 2032, count: 2 });
    const last = bins[bins.length - 1];
    expect(last.fromYear).toBe(2063);
    // 2063 + 4 = 2067 would run past the horizon: the last bin closes on it.
    expect(last.toYear).toBe(2066);
    expect(last.count).toBe(1);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(years.length);
  });

  it('marks no bin when there is no reference year', () => {
    expect(binYears([2030, 2031], {}).bins.every((bin) => !bin.isReference)).toBe(true);
    expect(binYears([2030, 2031], { referenceYear: null }).bins.every((bin) => !bin.isReference)).toBe(true);
    // A reference outside the span marks nothing either: the chart never outlines an absent bar.
    expect(binYears([2030, 2031], { referenceYear: 2040 }).bins.every((bin) => !bin.isReference)).toBe(true);
  });

  it('is empty with no years', () => {
    expect(binYears([], { referenceYear: 2030 })).toEqual({ bins: [], binWidthYears: 1 });
  });
});
