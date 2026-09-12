import { describe, expect, it } from 'vitest';
import { isSamePeriod, resolveScrubView } from '@/lib/utils/storicoScrub';
import type { EvolutionPoint } from '@/lib/utils/storicoSummary';

const point = (year: number, month: number, totalNetWorth: number, delta: number | null): EvolutionPoint => ({
  year,
  month,
  date: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
  totalNetWorth,
  delta,
});

const points = [point(2026, 1, 100000, null), point(2026, 2, 101500, 1500), point(2026, 3, 99800, -1700)];
const breakdownMonths = [
  { key: '2026-3', year: 2026, month: 3, label: 'Marzo 2026' },
  { key: '2026-2', year: 2026, month: 2, label: 'Febbraio 2026' },
];
const driverMonths = [
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
];

describe('isSamePeriod', () => {
  it('should compare year and month, and never match a null side', () => {
    expect(isSamePeriod({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toBe(true);
    expect(isSamePeriod({ year: 2026, month: 3 }, { year: 2025, month: 3 })).toBe(false);
    expect(isSamePeriod(null, { year: 2026, month: 3 })).toBe(false);
  });
});

describe('resolveScrubView', () => {
  it('should give nothing without a period or for a month off the series', () => {
    expect(resolveScrubView({ period: null, points, breakdownMonths, driverMonths })).toBeNull();
    expect(resolveScrubView({ period: { year: 2020, month: 1 }, points, breakdownMonths, driverMonths })).toBeNull();
  });

  it('should carry the point, the breakdown key and the driver slot of a month every tile can honour', () => {
    const view = resolveScrubView({ period: { year: 2026, month: 3 }, points, breakdownMonths, driverMonths })!;
    expect(view.period).toEqual({ year: 2026, month: 3 });
    expect(view.point.totalNetWorth).toBe(99800);
    expect(view.point.delta).toBe(-1700);
    expect(view.breakdownMonthKey).toBe('2026-3');
    expect(view.driverIndex).toBe(1);
  });

  it('should degrade the tiles that cannot honour the month instead of inventing a key or a slot', () => {
    // January has no per-asset breakdown and sits before the driver window.
    const view = resolveScrubView({ period: { year: 2026, month: 1 }, points, breakdownMonths, driverMonths })!;
    expect(view.point.delta).toBeNull();
    expect(view.breakdownMonthKey).toBeNull();
    expect(view.driverIndex).toBeNull();
  });
});
