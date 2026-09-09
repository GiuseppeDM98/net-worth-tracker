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
  buildMonthAssetBreakdown,
  deriveHoldingStartDates,
  summarizeSelection,
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

  it('treats a row held at quantity 0 as a closed position, never as a price collapsed to zero', () => {
    // The snapshot cron writes EVERY asset, sold ones included (quantity 0, totalValue 0). Read as
    // "present", the unit value 0 turned a 14.830 € sale into a −14.830 € PRICE effect on the real
    // account (Xtrackers Overnight, 2026-08). A sale to zero is all quantity, like a full close.
    const prev = [makeAsset({ assetId: 'xeon', quantity: 99, totalValue: 14830 })];
    const soldOut = [makeAsset({ assetId: 'xeon', quantity: 0, totalValue: 0 })];
    const rebought = [makeAsset({ assetId: 'xeon', quantity: 93, totalValue: 13960 })];

    expect(attributeSelectedChange(prev, soldOut, new Set(['xeon']))).toEqual({ priceEffect: 0, quantityEffect: -14830 });
    // The rebuy the month after starts from a 0-quantity row: a pure open, not a price move from 0.
    expect(attributeSelectedChange(soldOut, rebought, new Set(['xeon']))).toEqual({ priceEffect: 0, quantityEffect: 13960 });
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

describe('deriveHoldingStartDates', () => {
  // Every month carries a "cash" asset so byAsset is never empty (an empty breakdown is skipped
  // by the readers) — this lets a month where the tracked instrument is 0/absent still count.
  const cash = () => makeAsset({ assetId: 'cash', quantity: 1, totalValue: 1000 });

  it('flags the rebuy month when quantity drops to 0 then returns (same doc)', () => {
    // Snapshots intentionally out of order to also exercise the chronological sort.
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'eni', quantity: 5, totalValue: 60 }), cash()]),
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'eni', quantity: 10, totalValue: 100 }), cash()]),
      makeSnapshot(2026, 2, [makeAsset({ assetId: 'eni', quantity: 0, totalValue: 0 }), cash()]),
    ];

    const starts = deriveHoldingStartDates(snapshots);

    expect(starts.get('eni')).toEqual(new Date(2026, 2, 1)); // first day of March (rebuy month)
    expect(starts.has('cash')).toBe(false); // never sold → no restriction
  });

  it('flags the rebuy month when the asset is absent for a month then re-added', () => {
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'eni', quantity: 10, totalValue: 100 }), cash()]),
      makeSnapshot(2026, 2, [cash()]), // eni absent (sold by removal)
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'eni', quantity: 5, totalValue: 60 }), cash()]),
    ];

    expect(deriveHoldingStartDates(snapshots).get('eni')).toEqual(new Date(2026, 2, 1));
  });

  it('gives no start date to a continuously-held asset (held since before the history)', () => {
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'eni', quantity: 10, totalValue: 100 }), cash()]),
      makeSnapshot(2026, 2, [makeAsset({ assetId: 'eni', quantity: 10, totalValue: 110 }), cash()]),
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'eni', quantity: 12, totalValue: 130 }), cash()]),
    ];

    expect(deriveHoldingStartDates(snapshots).has('eni')).toBe(false);
  });

  it('gives no start date when the asset only appears after being absent at the start (first purchase)', () => {
    // Absence BEFORE the first appearance is not a gap — must not be mistaken for a sell→rebuy.
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [cash()]),
      makeSnapshot(2026, 2, [cash()]),
      makeSnapshot(2026, 3, [makeAsset({ assetId: 'eni', quantity: 5, totalValue: 60 }), cash()]),
    ];

    expect(deriveHoldingStartDates(snapshots).has('eni')).toBe(false);
  });

  it('gives no start date to an asset that was sold and never rebought', () => {
    const snapshots: MonthlySnapshot[] = [
      makeSnapshot(2026, 1, [makeAsset({ assetId: 'eni', quantity: 10, totalValue: 100 }), cash()]),
      makeSnapshot(2026, 2, [makeAsset({ assetId: 'eni', quantity: 0, totalValue: 0 }), cash()]),
      makeSnapshot(2026, 3, [cash()]),
    ];

    expect(deriveHoldingStartDates(snapshots).has('eni')).toBe(false);
  });
});

describe('buildMonthAssetBreakdown', () => {
  const june = makeSnapshot(2026, 6, [
    makeAsset({ assetId: 'vwce', name: 'Vanguard FTSE All-World', quantity: 400, totalValue: 48000 }),
    makeAsset({ assetId: 'cash', name: 'Conto corrente', quantity: 11300, totalValue: 11300 }),
    makeAsset({ assetId: 'sold', name: 'Venduto', quantity: 10, totalValue: 1000 }),
  ]);
  const july = makeSnapshot(2026, 7, [
    makeAsset({ assetId: 'cash', name: 'Conto corrente', quantity: 10200, totalValue: 10200 }),
    makeAsset({ assetId: 'vwce', name: 'Vanguard FTSE All-World', quantity: 412, totalValue: 52300 }),
    makeAsset({ assetId: 'new', name: 'Nuovo', quantity: 5, totalValue: 500 }),
  ]);
  const legacy = makeSnapshot(2026, 5, undefined);

  it("should rank the month's instruments by value with their share of the snapshot total", () => {
    const b = buildMonthAssetBreakdown([legacy, june, july], '2026-7')!;
    expect(b.month).toMatchObject({ year: 2026, month: 7, label: 'Luglio 2026' });
    expect(b.total).toBe(63000);
    expect(b.instrumentCount).toBe(3);
    expect(b.rows.map((r) => r.assetId)).toEqual(['vwce', 'cash', 'new']);
    expect(b.rows[0].sharePct).toBeCloseTo((52300 / 63000) * 100, 5);
  });

  it("should attribute each instrument's change against the previous month WITH a breakdown, price and quantity apart", () => {
    const b = buildMonthAssetBreakdown([legacy, june, july], '2026-7')!;
    expect(b.previous).toMatchObject({ year: 2026, month: 6 });
    const vwce = b.rows.find((r) => r.assetId === 'vwce')!;
    // u_prev = 120, u_curr = 126.94: price on 400 units + 12 new units at today's price.
    expect(vwce.delta).toBeCloseTo(4300, 5);
    expect(vwce.priceEffect).toBeCloseTo(400 * (52300 / 412 - 120), 5);
    expect(vwce.quantityEffect).toBeCloseTo(12 * (52300 / 412), 5);
    expect(vwce.priceEffect! + vwce.quantityEffect!).toBeCloseTo(4300, 5);
    const cash = b.rows.find((r) => r.assetId === 'cash')!;
    expect(cash.priceEffect).toBe(0);
    expect(cash.quantityEffect).toBe(-1100);
    const fresh = b.rows.find((r) => r.assetId === 'new')!;
    expect(fresh).toMatchObject({ delta: 500, priceEffect: 0, quantityEffect: 500 });
  });

  it("should include an instrument sold in full in the month's total change, even without a row", () => {
    const b = buildMonthAssetBreakdown([june, july], '2026-7')!;
    // 63000 − 60300 = +2700 = vwce +4300, cash −1100, new +500, sold −1000
    expect(b.change).toBeDefined();
    expect(b.change!.delta).toBeCloseTo(2700, 5);
    expect(b.change!.priceEffect).toBeCloseTo(400 * (52300 / 412 - 120), 5);
    expect(b.change!.quantityEffect).toBeCloseTo(2700 - 400 * (52300 / 412 - 120), 5);
    expect(b.rows.some((r) => r.assetId === 'sold')).toBe(false);
  });

  it('should skip a month without a breakdown when looking for the previous one', () => {
    const april = makeSnapshot(2026, 4, [makeAsset({ assetId: 'vwce', quantity: 400, totalValue: 46000 })]);
    const b = buildMonthAssetBreakdown([april, legacy, july], '2026-7')!;
    expect(b.previous).toMatchObject({ year: 2026, month: 4 });
  });

  it('should leave the change null on the first month with a breakdown, and return null for an unknown month', () => {
    const b = buildMonthAssetBreakdown([legacy, june], '2026-6')!;
    expect(b.previous).toBeNull();
    expect(b.change).toBeNull();
    expect(b.rows.every((r) => r.delta === null && r.priceEffect === null && r.quantityEffect === null)).toBe(true);
    expect(buildMonthAssetBreakdown([june], '2026-7')).toBeNull();
    expect(buildMonthAssetBreakdown([legacy], '2026-5')).toBeNull();
  });
});

describe('summarizeSelection', () => {
  const june = makeSnapshot(2026, 6, [
    makeAsset({ assetId: 'a', quantity: 10, totalValue: 1000 }),
    makeAsset({ assetId: 'b', quantity: 10, totalValue: 2000 }),
  ]);
  const july = makeSnapshot(2026, 7, [
    makeAsset({ assetId: 'a', quantity: 10, totalValue: 1100 }),
    makeAsset({ assetId: 'b', quantity: 12, totalValue: 2400 }),
    makeAsset({ assetId: 'c', quantity: 1, totalValue: 500 }),
  ]);

  it('should sum the ticked rows of the month: value, share and the attributed change', () => {
    const b = buildMonthAssetBreakdown([june, july], '2026-7')!;
    const s = summarizeSelection(b, new Set(['a', 'b', 'zzz']));
    expect(s.count).toBe(2);
    expect(s.value).toBe(3500);
    expect(s.sharePct).toBeCloseTo((3500 / 4000) * 100, 5);
    expect(s.delta).toBeCloseTo(500, 5);
    // a: pure price +100; b: price 10 × (200 − 200) = 0, quantity 2 × 200 = 400.
    expect(s.priceEffect).toBeCloseTo(100, 5);
    expect(s.quantityEffect).toBeCloseTo(400, 5);
  });

  it('should count a ticked instrument sold in full as a quantity loss, like the trend line does', () => {
    const before = makeSnapshot(2026, 6, [makeAsset({ assetId: 'x', quantity: 10, totalValue: 1000 }), makeAsset({ assetId: 'sold', quantity: 10, totalValue: 2000 })]);
    const after = makeSnapshot(2026, 7, [makeAsset({ assetId: 'x', quantity: 10, totalValue: 1100 })]);
    const b = buildMonthAssetBreakdown([before, after], '2026-7')!;
    expect(b.departed).toEqual([{ assetId: 'sold', previousValue: 2000 }]);
    const s = summarizeSelection(b, new Set(['x', 'sold']));
    expect(s).toMatchObject({ count: 1, value: 1100, delta: -1900, priceEffect: 100, quantityEffect: -2000 });
    const trend = buildSelectedAssetTrend([before, after], new Set(['x', 'sold']));
    expect(trend[1].delta).toBeCloseTo(s.delta!, 5);
    expect(trend[1].quantityEffect).toBeCloseTo(s.quantityEffect!, 5);
  });

  it('should leave the change null on the first month and read zero for an empty selection', () => {
    const first = summarizeSelection(buildMonthAssetBreakdown([june], '2026-6')!, new Set(['a']));
    expect(first).toMatchObject({ count: 1, value: 1000, delta: null, priceEffect: null, quantityEffect: null });
    const none = summarizeSelection(buildMonthAssetBreakdown([june, july], '2026-7')!, new Set());
    expect(none).toMatchObject({ count: 0, value: 0, sharePct: 0, delta: 0 });
  });
});
