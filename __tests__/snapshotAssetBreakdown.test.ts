/**
 * Unit tests for snapshotAssetBreakdown.ts — pure helpers behind the Storico
 * "Valore per strumento" section.
 *
 * All functions only read MonthlySnapshot.byAsset (values already frozen at snapshot time),
 * so fixtures construct minimal snapshots with just the fields these helpers touch.
 */

import { describe, it, expect } from 'vitest';
import {
  getAvailableSnapshotMonths,
  sortAssetsByValue,
  sumSelectedValues,
  buildSelectedAssetTrend,
  attributeSelectedChange,
  type SnapshotAsset,
} from '@/lib/utils/snapshotAssetBreakdown';
import type { MonthlySnapshot } from '@/types/assets';

function makeAsset(overrides: Partial<SnapshotAsset> & { assetId: string; totalValue: number }): SnapshotAsset {
  return {
    ticker: overrides.assetId.toUpperCase(),
    name: overrides.assetId,
    quantity: 1,
    price: overrides.totalValue,
    ...overrides,
  };
}

function makeSnapshot(
  year: number,
  month: number,
  byAsset: SnapshotAsset[] | undefined
): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth: (byAsset ?? []).reduce((s, a) => s + a.totalValue, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: byAsset as MonthlySnapshot['byAsset'],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 1),
  };
}

describe('getAvailableSnapshotMonths', () => {
  it('excludes snapshots without a per-asset breakdown and sorts newest first', () => {
    // Arrange
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2025, 12, [makeAsset({ assetId: 'a', totalValue: 100 })]),
      makeSnapshot(2026, 1, undefined), // pre-byAsset snapshot
      makeSnapshot(2026, 2, []), // empty breakdown
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'a', totalValue: 120 })]),
    ];

    // Act
    const months = getAvailableSnapshotMonths(snapshots);

    // Assert
    expect(months.map((m) => m.key)).toEqual(['2026-3', '2025-12']);
    expect(months[0].label).toBe('Marzo 2026');
  });
});

describe('sortAssetsByValue', () => {
  it('orders assets by total value descending without mutating the input', () => {
    // Arrange
    const byAsset = [
      makeAsset({ assetId: 'small', totalValue: 50 }),
      makeAsset({ assetId: 'big', totalValue: 500 }),
      makeAsset({ assetId: 'mid', totalValue: 200 }),
    ];

    // Act
    const sorted = sortAssetsByValue(byAsset);

    // Assert
    expect(sorted.map((a) => a.assetId)).toEqual(['big', 'mid', 'small']);
    expect(byAsset.map((a) => a.assetId)).toEqual(['small', 'big', 'mid']);
  });
});

describe('sumSelectedValues', () => {
  it('sums only the selected assets and returns 0 for an empty selection', () => {
    // Arrange
    const byAsset = [
      makeAsset({ assetId: 'a', totalValue: 100 }),
      makeAsset({ assetId: 'b', totalValue: 250 }),
      makeAsset({ assetId: 'c', totalValue: 75 }),
    ];

    // Act + Assert
    expect(sumSelectedValues(byAsset, new Set(['a', 'c']))).toBe(175);
    expect(sumSelectedValues(byAsset, new Set())).toBe(0);
  });
});

describe('buildSelectedAssetTrend', () => {
  it('produces one chronological point per month, treating an absent asset as 0', () => {
    // Arrange — asset "b" only exists from 2026-02 (bought later)
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 2, [
        makeAsset({ assetId: 'a', totalValue: 120 }),
        makeAsset({ assetId: 'b', totalValue: 80 }),
      ]),
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'a', totalValue: 100 })]),
    ];

    // Act
    const trend = buildSelectedAssetTrend(snapshots, new Set(['a', 'b']));

    // Assert — chronological, January has no "b" so only "a" counts
    expect(trend.map((p) => p.key)).toEqual(['2026-1', '2026-2']);
    expect(trend.map((p) => p.total)).toEqual([100, 200]);
  });

  it('returns an empty array when nothing is selected', () => {
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'a', totalValue: 100 })]),
    ];
    expect(buildSelectedAssetTrend(snapshots, new Set())).toEqual([]);
  });

  it('leaves the first point without attribution and attributes later points', () => {
    // Arrange — asset "a" only changes price (qty constant), so the whole Δ is the market.
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'a', quantity: 10, totalValue: 1000 })]),
      makeSnapshot(2026, 2, [makeAsset({ assetId: 'a', quantity: 10, totalValue: 1200 })]),
    ];

    // Act
    const trend = buildSelectedAssetTrend(snapshots, new Set(['a']));

    // Assert — first point has no prior month
    expect(trend[0].delta).toBeNull();
    expect(trend[0].priceEffect).toBeNull();
    expect(trend[0].previousLabel).toBeNull();
    // Second point: +200 entirely from price
    expect(trend[1].delta).toBe(200);
    expect(trend[1].priceEffect).toBe(200);
    expect(trend[1].quantityEffect).toBe(0);
    expect(trend[1].previousLabel).toBe('Gennaio 2026');
  });
});

describe('attributeSelectedChange', () => {
  it('attributes a pure price move to the price effect (quantity unchanged)', () => {
    const prev = [makeAsset({ assetId: 'a', quantity: 10, totalValue: 1000 })];
    const curr = [makeAsset({ assetId: 'a', quantity: 10, totalValue: 1200 })];

    expect(attributeSelectedChange(prev, curr, new Set(['a']))).toEqual({
      priceEffect: 200,
      quantityEffect: 0,
    });
  });

  it('attributes a sale at unchanged price to the quantity effect (the XEON case)', () => {
    // Unit value stays 100 €; quantity drops 10 → 6, so the drop is all "quantity".
    const prev = [makeAsset({ assetId: 'xeon', quantity: 10, totalValue: 1000 })];
    const curr = [makeAsset({ assetId: 'xeon', quantity: 6, totalValue: 600 })];

    expect(attributeSelectedChange(prev, curr, new Set(['xeon']))).toEqual({
      priceEffect: 0,
      quantityEffect: -400,
    });
  });

  it('splits a mixed change so the effects sum to the total change', () => {
    // q 10→12 and unit value 100→110 €: price 10*(110-100)=100, qty (12-10)*110=220.
    const prev = [makeAsset({ assetId: 'a', quantity: 10, totalValue: 1000 })];
    const curr = [makeAsset({ assetId: 'a', quantity: 12, totalValue: 1320 })];

    const result = attributeSelectedChange(prev, curr, new Set(['a']));
    expect(result).toEqual({ priceEffect: 100, quantityEffect: 220 });
    expect(result.priceEffect + result.quantityEffect).toBe(320); // = 1320 - 1000
  });

  it('treats a freshly bought asset (absent before) as a pure quantity effect', () => {
    const curr = [makeAsset({ assetId: 'new', quantity: 5, totalValue: 500 })];

    expect(attributeSelectedChange([], curr, new Set(['new']))).toEqual({
      priceEffect: 0,
      quantityEffect: 500,
    });
  });

  it('treats a fully sold asset (absent after) as a pure negative quantity effect', () => {
    const prev = [makeAsset({ assetId: 'gone', quantity: 5, totalValue: 500 })];

    expect(attributeSelectedChange(prev, [], new Set(['gone']))).toEqual({
      priceEffect: 0,
      quantityEffect: -500,
    });
  });

  it('ignores assets that are not selected', () => {
    const prev = [
      makeAsset({ assetId: 'a', quantity: 10, totalValue: 1000 }),
      makeAsset({ assetId: 'b', quantity: 1, totalValue: 9999 }),
    ];
    const curr = [
      makeAsset({ assetId: 'a', quantity: 10, totalValue: 1200 }),
      makeAsset({ assetId: 'b', quantity: 1, totalValue: 1 }),
    ];

    expect(attributeSelectedChange(prev, curr, new Set(['a']))).toEqual({
      priceEffect: 200,
      quantityEffect: 0,
    });
  });
});
