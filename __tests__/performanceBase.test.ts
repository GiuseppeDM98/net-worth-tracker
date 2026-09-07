import { describe, it, expect } from 'vitest';
import {
  resolvePerformanceExclusions,
  toPerformanceBaseSnapshots,
} from '@/lib/utils/performanceBase';
import type { Asset, MonthlySnapshot } from '@/types/assets';

function makeSnapshot(
  overrides: Partial<MonthlySnapshot> & { totalNetWorth: number; illiquidNetWorth: number }
): MonthlySnapshot {
  return {
    userId: 'user-1',
    year: 2026,
    month: 1,
    liquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(2026, 0, 31),
    ...overrides,
  } as MonthlySnapshot;
}

describe('toPerformanceBaseSnapshots', () => {
  it('returns snapshots unchanged for the netWorth base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1'], 'netWorth');

    expect(result).toBe(snapshots);
  });

  it('subtracts the pension fund value from totalNetWorth and illiquidNetWorth on the portfolio base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 70, totalValue: 700 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(100);
  });

  it('clamps illiquidNetWorth at 0 rather than going negative', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 100,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(0);
  });

  it('passes a snapshot through untouched when no byAsset entry matches a pension id', () => {
    const snapshot = makeSnapshot({
      totalNetWorth: 1000,
      illiquidNetWorth: 400,
      byAsset: [{ assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 100, totalValue: 1000 }],
    });

    const [result] = toPerformanceBaseSnapshots([snapshot], ['pension-1']);

    expect(result).toBe(snapshot);
  });

  it('returns snapshots unchanged when pensionAssetIds is empty (no pension funds exist)', () => {
    const snapshots = [makeSnapshot({ totalNetWorth: 1000, illiquidNetWorth: 400 })];

    const result = toPerformanceBaseSnapshots(snapshots, []);

    expect(result).toBe(snapshots);
  });

  it('sums multiple pension funds in the same snapshot', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 600,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo A', quantity: 1, price: 200, totalValue: 200 },
          { assetId: 'pension-2', ticker: '', name: 'Fondo B', quantity: 1, price: 150, totalValue: 150 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 6.5, price: 100, totalValue: 650 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1', 'pension-2']);

    expect(result.totalNetWorth).toBe(650);
    expect(result.illiquidNetWorth).toBe(250);
  });
});

/**
 * Il backfill è la correzione del 2026-07-27: senza, il capitale escluso restava dentro il
 * patrimonio finché gli snapshot non avevano `byAsset` e ne usciva al primo mese che ce l'aveva,
 * producendo uno scalino letto come crollo di mercato (sui dati reali: −9,37% a novembre 2025).
 */
describe('toPerformanceBaseSnapshots — backfill sugli snapshot senza byAsset', () => {
  /** Rendimento mensile come lo calcolano heatmap e TWR: (V_fine − cashflow) / V_inizio − 1. */
  function monthlyReturn(startNetWorth: number, endNetWorth: number, cashFlow = 0): number {
    return (endNetWorth - cashFlow) / startNetWorth - 1;
  }

  const withBreakdown = (year: number, month: number, totalNetWorth: number, pensionValue: number) =>
    makeSnapshot({
      year,
      month,
      totalNetWorth,
      illiquidNetWorth: pensionValue,
      byAsset: [
        { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: pensionValue, totalValue: pensionValue },
        {
          assetId: 'etf-1',
          ticker: 'VWCE',
          name: 'ETF',
          quantity: 1,
          price: totalNetWorth - pensionValue,
          totalValue: totalNetWorth - pensionValue,
        },
      ],
    });

  const withoutBreakdown = (year: number, month: number, totalNetWorth: number) =>
    makeSnapshot({ year, month, totalNetWorth, illiquidNetWorth: 0, byAsset: [] });

  it('subtracts the earliest known excluded value from the months that predate byAsset', () => {
    const snapshots = [
      withoutBreakdown(2025, 9, 250_000),
      withoutBreakdown(2025, 10, 256_424),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result[0].totalNetWorth).toBe(250_000 - 23_597);
    expect(result[1].totalNetWorth).toBe(256_424 - 23_597);
    expect(result[2].totalNetWorth).toBe(256_801 - 23_597);
  });

  it('leaves no return artifact at the join between backfilled and real breakdown months', () => {
    // Scenario reale: ottobre → novembre 2025, patrimonio praticamente piatto (+377 €).
    const snapshots = [
      withoutBreakdown(2025, 10, 256_424),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const [october, november] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);
    const joinReturn = monthlyReturn(october.totalNetWorth, november.totalNetWorth, 819);

    // Prima del fix questo valeva −9,37%; ora è il movimento reale, sotto il mezzo punto.
    expect(Math.abs(joinReturn)).toBeLessThan(0.005);
  });

  it('keeps the returns inside the pre-breakdown block identical to the unadjusted ones', () => {
    // Una costante si semplifica al numeratore, quindi il rendimento cambia solo per il
    // denominatore: il segno e l'ordine di grandezza restano quelli veri, senza salti.
    const snapshots = [
      withoutBreakdown(2025, 8, 200_000),
      withoutBreakdown(2025, 9, 210_000),
      withBreakdown(2025, 10, 215_000, 20_000),
    ];

    const [august, september] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(september.totalNetWorth - august.totalNetWorth).toBe(10_000);
    expect(monthlyReturn(august.totalNetWorth, september.totalNetWorth)).toBeCloseTo(
      10_000 / 180_000,
      10
    );
  });

  it('subtracts nothing when a breakdown exists but the asset is absent from it', () => {
    // Evidenza genuina che l'asset non esisteva quel mese — qui NON si backfilla.
    const snapshots = [
      withBreakdown(2026, 1, 100_000, 10_000),
      makeSnapshot({
        year: 2026,
        month: 2,
        totalNetWorth: 105_000,
        illiquidNetWorth: 0,
        byAsset: [{ assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 1, price: 105_000, totalValue: 105_000 }],
      }),
    ];

    const [january, february] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(january.totalNetWorth).toBe(90_000);
    expect(february.totalNetWorth).toBe(105_000);
  });

  it('picks the chronologically earliest breakdown even when the input is unsorted', () => {
    const snapshots = [
      withBreakdown(2026, 3, 300_000, 30_000),
      withoutBreakdown(2025, 5, 200_000),
      withBreakdown(2025, 11, 256_801, 23_597),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    // L'ordine di input è preservato: l'elemento backfillato resta il secondo.
    expect(result[1].totalNetWorth).toBe(200_000 - 23_597);
  });

  it('subtracts nothing anywhere when no snapshot has a breakdown at all', () => {
    const snapshots = [withoutBreakdown(2024, 1, 100_000), withoutBreakdown(2024, 2, 110_000)];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result[0].totalNetWorth).toBe(100_000);
    expect(result[1].totalNetWorth).toBe(110_000);
  });

  it('backfills pension funds and non-allocated assets together', () => {
    const snapshots = [
      withoutBreakdown(2025, 10, 256_424),
      makeSnapshot({
        year: 2025,
        month: 11,
        totalNetWorth: 256_801,
        illiquidNetWorth: 82_815,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 23_597, totalValue: 23_597 },
          { assetId: 'house-1', ticker: '', name: 'Casa', quantity: 1, price: 59_218, totalValue: 59_218 },
        ],
      }),
    ];

    const [october, november] = toPerformanceBaseSnapshots(snapshots, ['pension-1', 'house-1']);

    expect(october.totalNetWorth).toBe(256_424 - 82_815);
    expect(november.totalNetWorth).toBe(256_801 - 82_815);
    expect(november.illiquidNetWorth).toBe(0);
  });
});

describe('resolvePerformanceExclusions', () => {
  const makeAsset = (overrides: Partial<Asset> & { id: string }): Asset =>
    ({ userId: 'user-1', name: 'Asset', type: 'etf', assetClass: 'equity', quantity: 1, ...overrides }) as Asset;

  it('excludes pension funds and non-allocated assets by default', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'frozen' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
      makeAsset({ id: 'etf-1' }),
    ];

    expect(resolvePerformanceExclusions(assets).sort()).toEqual(['house-1', 'pension-1']);
  });

  it('honours the legacy excludeFromAllocation flag via resolveAllocationRole', () => {
    const assets = [makeAsset({ id: 'house-1', type: 'realestate', excludeFromAllocation: true })];

    expect(resolvePerformanceExclusions(assets)).toEqual(['house-1']);
  });

  it('keeps pension funds in the base when the user opted them in', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    ];

    expect(resolvePerformanceExclusions(assets, { includePensionFunds: true })).toEqual(['house-1']);
  });

  it('returns nothing when both categories are opted in', () => {
    const assets = [
      makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'excluded' }),
      makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    ];

    expect(
      resolvePerformanceExclusions(assets, { includePensionFunds: true, includeExcludedAssets: true })
    ).toEqual([]);
  });

  it('lists an asset once when it matches both rules', () => {
    const assets = [makeAsset({ id: 'pension-1', type: 'pensionFund', allocationRole: 'excluded' })];

    expect(resolvePerformanceExclusions(assets)).toEqual(['pension-1']);
  });
});

// ─── The toggle wins over the role; the base resolved once ───────────────────

import { resolvePerformanceBase } from '@/lib/utils/performanceBase';
import type { PensionContribution } from '@/types/pension';

function makeAsset(overrides: Partial<Asset> & { id: string; type: Asset['type'] }): Asset {
  return { name: overrides.id, ticker: '', quantity: 1, currentPrice: 1, currency: 'EUR', ...overrides } as Asset;
}

function makeContribution(overrides: Partial<PensionContribution> & { amount: number; createdAt: Date }): PensionContribution {
  return {
    id: `c-${overrides.amount}`,
    userId: 'user-1',
    assetId: 'fund-1',
    source: 'tfr',
    date: overrides.createdAt,
    taxYear: overrides.createdAt.getFullYear(),
    deductible: false,
    ...overrides,
  } as PensionContribution;
}

/** A snapshot whose breakdown carries the fund at `fund` and one ETF at `etf` (plus a house when given). */
function monthSnapshot(year: number, month: number, parts: { fund?: number; etf: number; house?: number }): MonthlySnapshot {
  const byAsset = [
    { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: parts.etf / 10, totalValue: parts.etf },
    ...(parts.fund !== undefined ? [{ assetId: 'fund-1', ticker: '', name: 'Fondo', quantity: parts.fund, price: 1, totalValue: parts.fund }] : []),
    ...(parts.house !== undefined ? [{ assetId: 'house-1', ticker: '', name: 'Casa', quantity: 1, price: parts.house, totalValue: parts.house }] : []),
  ];
  const total = byAsset.reduce((sum, row) => sum + row.totalValue, 0);
  return makeSnapshot({ year, month, totalNetWorth: total, illiquidNetWorth: (parts.fund ?? 0) + (parts.house ?? 0), byAsset });
}

describe('resolvePerformanceExclusions — the pension toggle wins over the allocation role', () => {
  // On the real account every fund carried allocationRole 'excluded' (two through the legacy flag),
  // and the OR of the two exclusions made «Includi i fondi pensione» a no-op.
  const assets = [
    makeAsset({ id: 'fund-1', type: 'pensionFund', allocationRole: 'excluded' }),
    makeAsset({ id: 'fund-2', type: 'pensionFund', excludeFromAllocation: true }),
    makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    makeAsset({ id: 'etf-1', type: 'etf' }),
  ];

  it('lets an excluded-role fund in when the pension toggle is on, and keeps the house out', () => {
    expect(resolvePerformanceExclusions(assets, { includePensionFunds: true }).sort()).toEqual(['house-1']);
  });

  it('keeps the funds out when the toggle is off, even with the excluded assets included', () => {
    expect(resolvePerformanceExclusions(assets, { includeExcludedAssets: true }).sort()).toEqual(['fund-1', 'fund-2']);
  });

  it('keeps every exclusion by default and none with both toggles on', () => {
    expect(resolvePerformanceExclusions(assets).sort()).toEqual(['fund-1', 'fund-2', 'house-1']);
    expect(resolvePerformanceExclusions(assets, { includePensionFunds: true, includeExcludedAssets: true })).toEqual([]);
  });
});

describe('resolvePerformanceBase', () => {
  const assets = [
    makeAsset({ id: 'fund-1', type: 'pensionFund', allocationRole: 'excluded' }),
    makeAsset({ id: 'house-1', type: 'realestate', allocationRole: 'excluded' }),
    makeAsset({ id: 'etf-1', type: 'etf' }),
  ];
  // Five months with a breakdown; the fund grows by untracked money until June, then by tracked ones.
  const snapshots = [
    monthSnapshot(2026, 4, { fund: 27000, etf: 100000, house: 60000 }),
    monthSnapshot(2026, 5, { fund: 29800, etf: 101000, house: 60000 }),
    monthSnapshot(2026, 6, { fund: 30600, etf: 102000, house: 60000 }),
    monthSnapshot(2026, 7, { fund: 31800, etf: 103000, house: 60000 }),
    monthSnapshot(2026, 8, { fund: 31600, etf: 104000, house: 60000 }),
  ];
  const tfrJuly = makeContribution({ amount: 1200, createdAt: new Date(2026, 6, 28), date: new Date(2026, 5, 30) });
  const payrollAugust = makeContribution({ amount: 10, source: 'voluntary', createdAt: new Date(2026, 7, 18), date: new Date(2026, 5, 30) });
  const fromCashMay = makeContribution({ amount: 150, source: 'voluntary', linkedExpenseId: 'transfer-1', sourceCashAssetId: 'cash-1', createdAt: new Date(2026, 4, 10) });
  const fromCashAugust = makeContribution({ amount: 200, source: 'voluntary', linkedExpenseId: 'transfer-2', sourceCashAssetId: 'cash-1', createdAt: new Date(2026, 7, 20) });

  it('with the toggle off projects the funds out everywhere and only a cash-funded voluntary leaves the base', () => {
    const base = resolvePerformanceBase({ snapshots, assets, contributions: [tfrJuly, fromCashMay, payrollAugust], settings: { pensionReturnStartMonth: '2026-07' } as never });

    expect(base.pensionEntryMonth).toBeNull();
    expect(base.excludedAssetIds.sort()).toEqual(['fund-1', 'house-1']);
    expect(base.snapshots.map((s) => s.totalNetWorth)).toEqual([100000, 101000, 102000, 103000, 104000]);
    // TFR and payroll money never touched the measured portfolio; the May transfer did (cash → fund).
    expect(base.pensionFlows).toEqual([{ month: '2026-05', amount: -150, kind: 'withdrawal' }]);
  });

  it('with the toggle on enters the funds at the trusted start month, as a flow, and neutralises later contributions', () => {
    const base = resolvePerformanceBase({
      snapshots,
      assets,
      contributions: [tfrJuly, payrollAugust, fromCashAugust],
      settings: { performanceIncludesPensionFunds: true, pensionReturnStartMonth: '2026-07' } as never,
    });

    expect(base.pensionEntryMonth).toBe('2026-07');
    // The house stays out by its role; the fund is not listed as "out everywhere" any more.
    expect(base.excludedAssetIds).toEqual(['house-1']);
    // Before the entry the fund is out (its untracked growth is not return); from July it is in.
    expect(base.snapshots.map((s) => s.totalNetWorth)).toEqual([100000, 101000, 102000, 134800, 135600]);
    expect(base.pensionFlows).toEqual([
      { month: '2026-07', amount: 31800, kind: 'entry' },
      // August: TFR-like money from outside is a flow; the voluntary paid from a cash account inside the base is not.
      { month: '2026-08', amount: 10, kind: 'contribution' },
    ]);
  });

  it('skips a contribution that moved the value in the entry month itself: it is inside the entry value', () => {
    const base = resolvePerformanceBase({
      snapshots,
      assets,
      contributions: [tfrJuly],
      settings: { performanceIncludesPensionFunds: true, pensionReturnStartMonth: '2026-07' } as never,
    });

    expect(base.pensionFlows).toEqual([{ month: '2026-07', amount: 31800, kind: 'entry' }]);
  });

  it('with no trusted start (no setting, no contribution) keeps the funds out even with the toggle on', () => {
    const base = resolvePerformanceBase({ snapshots, assets, contributions: [], settings: { performanceIncludesPensionFunds: true } as never });

    expect(base.pensionEntryMonth).toBeNull();
    expect(base.excludedAssetIds.sort()).toEqual(['fund-1', 'house-1']);
    expect(base.pensionFlows).toEqual([]);
  });

  it('falls back to the first recorded contribution for the start, and enters at the first breakdown month with a fund at or after it', () => {
    // No setting: the window starts at the first contribution's accounting DATE (May), and the fund
    // enters at the May snapshot. A cash-funded voluntary in May is inside the entry value AND left the
    // cash: the withdrawal stays, the entry carries the fund.
    const base = resolvePerformanceBase({
      snapshots,
      assets,
      contributions: [makeContribution({ amount: 150, source: 'voluntary', linkedExpenseId: 't', createdAt: new Date(2026, 4, 10), date: new Date(2026, 4, 10) })],
      settings: { performanceIncludesPensionFunds: true } as never,
    });

    expect(base.pensionEntryMonth).toBe('2026-05');
    expect(base.pensionFlows).toEqual([
      { month: '2026-05', amount: 29800, kind: 'entry' },
      { month: '2026-05', amount: -150, kind: 'withdrawal' },
    ]);
  });

  it('with the toggle on and a start before the breakdown era enters at the first month that has the fund', () => {
    const legacy = makeSnapshot({ year: 2026, month: 3, totalNetWorth: 180000, illiquidNetWorth: 80000 });
    const base = resolvePerformanceBase({
      snapshots: [legacy, ...snapshots],
      assets,
      contributions: [],
      settings: { performanceIncludesPensionFunds: true, pensionReturnStartMonth: '2025-01' } as never,
    });

    expect(base.pensionEntryMonth).toBe('2026-04');
    // March precedes the entry, so it is projected WITHOUT the fund: no breakdown there, hence the E₀
    // backfill of both the house (60000) and the fund at its first breakdown month (27000). April,
    // the entry month, keeps the fund; the joint is neutralised by the 27000 entry flow.
    expect(base.snapshots[0].totalNetWorth).toBe(180000 - 60000 - 27000);
    expect(base.snapshots[1].totalNetWorth).toBe(127000);
    expect(base.pensionFlows).toEqual([{ month: '2026-04', amount: 27000, kind: 'entry' }]);
  });

  it('ignores a contribution to a fund the account no longer has, unless it left a cash account', () => {
    const base = resolvePerformanceBase({
      snapshots,
      assets,
      contributions: [
        makeContribution({ amount: 500, assetId: 'fund-gone', createdAt: new Date(2026, 7, 5) }),
        makeContribution({ amount: 70, assetId: 'fund-gone', source: 'voluntary', linkedExpenseId: 't', createdAt: new Date(2026, 7, 6) }),
      ],
      settings: { performanceIncludesPensionFunds: true, pensionReturnStartMonth: '2026-07' } as never,
    });

    expect(base.pensionFlows).toEqual([
      { month: '2026-07', amount: 31800, kind: 'entry' },
      { month: '2026-08', amount: -70, kind: 'withdrawal' },
    ]);
  });
});
