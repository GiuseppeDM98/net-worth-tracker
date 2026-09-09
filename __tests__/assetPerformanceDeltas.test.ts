/**
 * Tests for lib/utils/assetPerformanceDeltas.ts — the Δ Mese / Δ YTD / Δ Inizio columns behind
 * Patrimonio's "Andamento" toggle, plus the per-instrument unit-price series of the mobile rows.
 *
 * The rule under test: a Δ is a PRICE variation, measured on the canonical EUR unit price
 * (`totalValue / quantity` of the snapshot row, gross of debt for real estate) — never on the
 * position's total value, which moves with every purchase. Before 2026-08-22 any hand-priced
 * asset was measured on total value, so a crypto ETP with auto-update off that the user kept
 * buying read "+573% Δ Mese" (see git log).
 */

import { describe, expect, it, vi } from 'vitest';
import type { Asset, MonthlySnapshot } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { computeAssetPerformanceDeltas, computeAssetUnitPriceSeries } from '@/lib/utils/assetPerformanceDeltas';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'WBIT',
    name: 'WisdomTree Physical Bitcoin',
    type: 'crypto',
    assetClass: 'crypto',
    currency: 'EUR',
    quantity: 842,
    currentPrice: 15.77,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

type Row = MonthlySnapshot['byAsset'][number];

function makeSnapshot(year: number, month: number, rows: Partial<Row>[]): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth: 0,
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: rows.map((r) => ({ assetId: 'a1', ticker: 'WBIT', name: 'WBIT', quantity: 1, price: 1, totalValue: 1, ...r })),
    assetAllocation: {},
    createdAt: new Date(0),
  };
}

const TODAY = { year: 2026, month: 8 };

describe('computeAssetPerformanceDeltas — a Δ is a unit-price variation', () => {
  it('should ignore purchases: a hand-priced ETP bought six times over is not +573%', () => {
    // Auto-update off, so the old engine measured total value: 1.980 € → 13.278 € read "+571%".
    const asset = makeAsset({ autoUpdatePrice: false, quantity: 842, currentPrice: 15.77 });
    const snapshots = [makeSnapshot(2026, 7, [{ quantity: 125, price: 15.84, totalValue: 1980 }])];

    const { a1 } = computeAssetPerformanceDeltas([asset], snapshots, TODAY);

    // Unit price 15,84 → 15,77: −0,44 %.
    expect(a1.lastSnapshotDelta).toBeCloseTo(-0.442, 2);
  });

  it('should measure a market-priced asset on the same EUR unit, so the currency conversion is part of the return', () => {
    const asset = makeAsset({ type: 'stock', assetClass: 'equity', currency: 'USD', quantity: 40, currentPrice: 228.4, currentPriceEur: 200 });
    // Last month the 40 shares were worth 7.600 € (190 € each in EUR terms).
    const snapshots = [makeSnapshot(2026, 7, [{ quantity: 40, price: 220, totalValue: 7600 }])];

    const { a1 } = computeAssetPerformanceDeltas([asset], snapshots, TODAY);

    expect(a1.lastSnapshotDelta).toBeCloseTo((200 / 190 - 1) * 100, 6);
  });

  it('should refuse to measure an asset whose quantity IS the value (pension fund, cash)', () => {
    const fund = makeAsset({ id: 'fund', type: 'pensionFund', assetClass: 'bonds', quantity: 38250, currentPrice: 1 });
    const cash = makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 9850, currentPrice: 1 });
    const snapshots = [
      makeSnapshot(2025, 12, [{ assetId: 'fund', quantity: 30000, totalValue: 30000 }, { assetId: 'cash', quantity: 5000, totalValue: 5000 }]),
      makeSnapshot(2026, 7, [{ assetId: 'fund', quantity: 36000, totalValue: 36000 }, { assetId: 'cash', quantity: 7000, totalValue: 7000 }]),
    ];

    const deltas = computeAssetPerformanceDeltas([fund, cash], snapshots, TODAY);

    // Contributions and deposits are not a return: the columns stay empty, never "+27,5%".
    expect(deltas.fund).toEqual({ lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null });
    expect(deltas.cash).toEqual({ lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null });
  });

  it('should measure real estate gross of debt, so a mortgage instalment is not appreciation', () => {
    const home = makeAsset({ id: 'home', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 180000, outstandingDebt: 139600 });
    // Last month: same appraisal, 1.000 € more debt. Net value 39.400 → 40.400 is NOT +2,5 %.
    const snapshots = [makeSnapshot(2026, 7, [{ assetId: 'home', quantity: 1, price: 180000, totalValue: 39400 }])];

    const { home: delta } = computeAssetPerformanceDeltas([home], snapshots, TODAY);

    expect(delta.lastSnapshotDelta).toBeCloseTo(0, 6);
  });

  it('should measure a REIT ETF in the real-estate class on its EUR unit like any fund', () => {
    // A USD REIT ETF sits in the realestate CLASS but is a quoted fund (type etf): the gross-of-debt
    // path, which reads the snapshot's native `price`, must not apply — the unit stays EUR.
    const reit = makeAsset({ id: 'reit', type: 'etf', assetClass: 'realestate', currency: 'USD', quantity: 10, currentPrice: 100, currentPriceEur: 92 });
    const snapshots = [makeSnapshot(2026, 7, [{ assetId: 'reit', quantity: 10, price: 100, totalValue: 920 }])];
    expect(computeAssetPerformanceDeltas([reit], snapshots, TODAY).reit.lastSnapshotDelta).toBeCloseTo(0, 6);
  });

  it('should read a real-estate appraisal change as the price variation it is', () => {
    const home = makeAsset({ id: 'home', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 189000, outstandingDebt: 100000 });
    const snapshots = [makeSnapshot(2026, 7, [{ assetId: 'home', quantity: 1, price: 180000, totalValue: 80000 }])];

    const { home: delta } = computeAssetPerformanceDeltas([home], snapshots, TODAY);

    expect(delta.lastSnapshotDelta).toBeCloseTo(5, 6);
  });
});

describe('computeAssetPerformanceDeltas — the three windows', () => {
  const asset = makeAsset({ type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 110 });
  const snapshots = [
    makeSnapshot(2025, 3, [{ quantity: 10, totalValue: 800 }]), // first ever: 80 €
    makeSnapshot(2025, 12, [{ quantity: 10, totalValue: 1000 }]), // last of previous year: 100 €
    makeSnapshot(2026, 7, [{ quantity: 10, totalValue: 1050 }]), // last completed month: 105 €
    makeSnapshot(2026, 8, [{ quantity: 10, totalValue: 1100 }]), // current month, already snapshotted
  ];

  it('should compare against the last COMPLETED month, the end of last year and the first record', () => {
    const { a1 } = computeAssetPerformanceDeltas([asset], snapshots, TODAY);
    expect(a1.lastSnapshotDelta).toBeCloseTo((110 / 105 - 1) * 100, 6);
    expect(a1.ytdDelta).toBeCloseTo(10, 6);
    expect(a1.allTimeDelta).toBeCloseTo(37.5, 6);
  });

  it('should fall back to the first snapshot of the year for Δ YTD when last year has none', () => {
    const thisYearOnly = snapshots.filter((s) => s.year === 2026);
    const { a1 } = computeAssetPerformanceDeltas([asset], thisYearOnly, TODAY);
    expect(a1.ytdDelta).toBeCloseTo((110 / 105 - 1) * 100, 6);
  });

  it('should leave every window empty for an asset with no snapshot history, a sold-out one, or none at all', () => {
    const sold = makeAsset({ id: 'sold', quantity: 0 });
    const fresh = makeAsset({ id: 'fresh' });
    const deltas = computeAssetPerformanceDeltas([sold, fresh], snapshots, TODAY);
    expect(deltas.sold).toEqual({ lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null });
    expect(deltas.fresh).toEqual({ lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null });
    expect(computeAssetPerformanceDeltas([asset], [], TODAY)).toEqual({});
  });

  it('should leave Δ YTD and Δ Inizio empty too when the only snapshot is this month', () => {
    // A position opened this month: yesterday's cron is not a year-to-date or since-inception base.
    const onlyThisMonth = [makeSnapshot(2026, 8, [{ quantity: 10, totalValue: 1050 }])];
    expect(computeAssetPerformanceDeltas([asset], onlyThisMonth, TODAY).a1).toEqual({ lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null });
  });

  it('should skip snapshot rows with no quantity rather than divide by zero', () => {
    const rows = [makeSnapshot(2026, 7, [{ quantity: 0, totalValue: 0 }])];
    const { a1 } = computeAssetPerformanceDeltas([asset], rows, TODAY);
    expect(a1.lastSnapshotDelta).toBeNull();
  });
});

describe('computeAssetUnitPriceSeries', () => {
  it('should return the last twelve EUR unit prices in chronological order, or nothing below two points', () => {
    const asset = makeAsset({ type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 110 });
    const snapshots = Array.from({ length: 14 }, (_, i) =>
      makeSnapshot(2025 + Math.floor((i + 6) / 12), ((i + 6) % 12) + 1, [{ quantity: 10, totalValue: 1000 + i * 10 }]),
    ).reverse(); // deliberately unsorted on input

    const series = computeAssetUnitPriceSeries([asset], snapshots);

    expect(series.a1).toHaveLength(12);
    expect(series.a1[0].value).toBeCloseTo(102, 6);
    expect(series.a1[11].value).toBeCloseTo(113, 6);
    expect(computeAssetUnitPriceSeries([asset], snapshots.slice(0, 1)).a1).toBeUndefined();
  });

  it('should give no series to a pension fund or a cash account', () => {
    const fund = makeAsset({ id: 'fund', type: 'pensionFund' });
    const snapshots = [makeSnapshot(2026, 6, [{ assetId: 'fund' }]), makeSnapshot(2026, 7, [{ assetId: 'fund' }])];
    expect(computeAssetUnitPriceSeries([fund], snapshots).fund).toBeUndefined();
  });
});
