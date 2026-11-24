/**
 * Tests for lib/utils/dailySnapshot.ts — the daily archive's row, its windows and its finality rule.
 *
 * Each test was seen red once with the mutation named in its comment (2026-11-24).
 */

import { describe, expect, it } from 'vitest';

import {
  buildDailySnapshotDay,
  dailyUnitPrice,
  flattenDailyMonths,
  isDailyMonthFinal,
  isoDaysBefore,
  monthKeysBetween,
  type DailySnapshotDay,
  type DailySnapshotInput,
} from '@/lib/utils/dailySnapshot';

function assetRow(assetId: string, quantity: number, price: number, totalValue: number): DailySnapshotInput['byAsset'][number] {
  return { assetId, ticker: assetId.toUpperCase(), name: assetId, quantity, price, totalValue };
}

function input(overrides: Partial<DailySnapshotInput> = {}): DailySnapshotInput {
  return {
    totalNetWorth: 10000,
    liquidNetWorth: 2500,
    byAssetClass: { equity: 7500, cash: 2500 },
    byAsset: [],
    at: new Date('2026-04-23T16:00:00Z'),
    ...overrides,
  };
}

function day(netWorth: number): DailySnapshotDay {
  return { netWorth, liquid: 0, byClass: {}, assets: {}, at: '2026-01-01T12:00:00.000Z' };
}

describe('buildDailySnapshotDay', () => {
  // Mutation: delete the `continue` → the zero row appears in `assets`.
  it('should skip a sold-out instrument and keep a loan with its negative value', () => {
    const row = buildDailySnapshotDay(input({
      byAsset: [
        assetRow('asset-a', 0, 50, 0),
        assetRow('loan-a', 50000, 1, -50000),
        assetRow('asset-b', 10, 250, 2500),
      ],
    }));

    expect(row.assets).toEqual({
      'loan-a': { q: 50000, v: -50000 },
      'asset-b': { q: 10, v: 2500 },
    });
    expect(row.assets['asset-a']).toBeUndefined();
  });

  // Mutation: drop roundToCents on `v` → 1000.005 stays unrounded.
  it('should round the euro figures to cents and keep the quantity as it is', () => {
    const row = buildDailySnapshotDay(input({
      totalNetWorth: 1000.005,
      byAssetClass: { equity: 1000.005 },
      byAsset: [assetRow('asset-a', 3.333333, 300.0015, 1000.005)],
    }));

    expect(row.netWorth).toBe(1000.01);
    expect(row.byClass.equity).toBe(1000.01);
    expect(row.assets['asset-a']).toEqual({ q: 3.333333, v: 1000.01 });
    expect(row.at).toBe('2026-04-23T16:00:00.000Z');
  });
});

describe('monthKeysBetween', () => {
  // Mutation: `month > 12` → `month > 11` → December is skipped.
  it('should walk across a year end, both ends included', () => {
    expect(monthKeysBetween('2026-11-20', '2027-02-03')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('should answer the one month of a window inside it', () => {
    expect(monthKeysBetween('2026-11-01', '2026-11-30')).toEqual(['2026-11']);
  });
});

describe('flattenDailyMonths', () => {
  // Mutation: remove the window test → the day before the window is returned.
  it('should sort across two months and drop a day outside the window', () => {
    const points = flattenDailyMonths(
      [
        { userId: 'u', month: '2026-03', days: { '02': day(300), '01': day(200) } },
        { userId: 'u', month: '2026-02', days: { '28': day(100), '27': day(50) } },
      ],
      '2026-02-28',
      '2026-03-02',
    );

    expect(points.map((point) => point.iso)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
    expect(points.map((point) => point.netWorth)).toEqual([100, 200, 300]);
  });
});

describe('dailyUnitPrice and isoDaysBefore', () => {
  // Mutations: `row.q <= 0` → `row.q < 0` (the zero quantity divides); drop `|| row.v < 0` (the loan answers −1).
  it('should answer a price only where both quantity and value are a price', () => {
    expect(dailyUnitPrice({ q: 0, v: 0 })).toBeNull();
    expect(dailyUnitPrice({ q: 50000, v: -50000 })).toBeNull();
    expect(dailyUnitPrice(undefined)).toBeNull();
    expect(dailyUnitPrice({ q: 4, v: 100 })).toBe(25);
  });

  it('should count calendar days back across a month end', () => {
    expect(isoDaysBefore('2026-03-01', 1)).toBe('2026-02-28');
    expect(isoDaysBefore('2026-03-02', 0)).toBe('2026-03-02');
  });
});

describe('isDailyMonthFinal', () => {
  // Mutation: `>` → `>=` → a copy fetched on the month's last day reads as final.
  it('should call final only a copy fetched after the month closed', () => {
    expect(isDailyMonthFinal('2026-10', '2026-11-01')).toBe(true);
    expect(isDailyMonthFinal('2026-10', '2026-10-31')).toBe(false);
    expect(isDailyMonthFinal('2026-10', '1970-01-01')).toBe(false);
  });
});
