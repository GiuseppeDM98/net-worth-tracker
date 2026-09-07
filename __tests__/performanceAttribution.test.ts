/**
 * performanceAttribution — the period's market gain, instrument by instrument, reconciled to the
 * page's own figure.
 *
 * The invariant every case pins: Σ rows + unattributed === gain, where gain is the TWR numerator
 * summed over the attributed months (ΔbaseNetWorth − external flow). The rest is the three special
 * cases the overview digest already has (pension fund, real estate, a row at quantity 0) and the
 * coverage — what could not be attributed is said, never spread.
 */
import { describe, it, expect } from 'vitest';
import { attributePeriodReturn, sumDividendsByAsset } from '@/lib/utils/performanceAttribution';
import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData } from '@/types/performance';
import type { PensionContribution } from '@/types/pension';

type Row = MonthlySnapshot['byAsset'][number];

const row = (assetId: string, quantity: number, totalValue: number, price = quantity ? totalValue / quantity : 0): Row => ({
  assetId,
  ticker: assetId.toUpperCase(),
  name: `Name of ${assetId}`,
  quantity,
  price,
  totalValue,
});

/** A base-projected snapshot: `totalNetWorth` is given explicitly, like the projection leaves it. */
function snapshot(year: number, month: number, totalNetWorth: number, byAsset: Row[] | null): MonthlySnapshot {
  return { userId: 'u', year, month, totalNetWorth, liquidNetWorth: 0, illiquidNetWorth: 0, byAssetClass: {}, byAsset: byAsset ?? [] } as MonthlySnapshot;
}

function cashFlow(year: number, month: number, netCashFlow: number, pensionFlow?: number): CashFlowData {
  return { date: new Date(year, month - 1, 1), income: Math.max(netCashFlow, 0), expenses: Math.max(-netCashFlow, 0), dividendIncome: 0, netCashFlow, ...(pensionFlow !== undefined ? { pensionFlow } : {}) };
}

const assets = [
  { id: 'etf', name: 'World ETF', type: 'etf' as const },
  { id: 'cash', name: 'Conto', type: 'cash' as const },
  { id: 'fund', name: 'Fondo', type: 'pensionFund' as const },
  { id: 'house', name: 'Casa', type: 'realestate' as const },
];
const noPension = { fundIds: ['fund'], entryMonth: null, contributions: [] as PensionContribution[] };

describe('attributePeriodReturn', () => {
  it('attributes the price effect per instrument and reconciles the residual to the page gain', () => {
    // Jan→Feb: ETF 100→110 on 10 units (+100 price), a buy of 2 units at 110 (+220 quantity), cash +500
    // deposited (matches the +500 net cash flow), plus 30 € of interest that no expense recorded.
    const snapshots = [
      snapshot(2026, 1, 3000, [row('etf', 10, 1000), row('cash', 2000, 2000)]),
      snapshot(2026, 2, 3850, [row('etf', 12, 1320), row('cash', 2530, 2530)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [cashFlow(2026, 2, 500)], excludedAssetIds: [], pension: noPension, assets });

    expect(result.gain).toBe(350); // 3850 − 3000 − 500
    expect(result.rows).toEqual([expect.objectContaining({ assetId: 'etf', name: 'World ETF', marketEffect: 100, dividends: 0, total: 100, isPensionFund: false, monthsAttributed: 1 })]);
    expect(result.attributed).toBe(100);
    expect(result.unattributed).toBe(250); // the 220 buy that no flow explains + the 30 of interest
    expect(result.attributed + result.unattributed).toBe(result.gain);
    expect(result.coverage).toEqual({ measuredMonths: 1, attributedMonths: 1, firstAttributed: { year: 2026, month: 2 }, lastAttributed: { year: 2026, month: 2 } });
  });

  it('sums the months, ranks by absolute figure and skips instruments out of the base', () => {
    const snapshots = [
      snapshot(2026, 1, 3000, [row('etf', 10, 1000), row('bond', 10, 2000)]),
      snapshot(2026, 2, 2950, [row('etf', 10, 1100), row('bond', 10, 1850)]),
      snapshot(2026, 3, 2900, [row('etf', 10, 1050), row('bond', 10, 1850), row('house', 1, 100000)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: ['house'], pension: noPension, assets });

    expect(result.rows.map((r) => [r.assetId, r.total, r.monthsAttributed])).toEqual([
      ['bond', -150, 2],
      ['etf', 50, 2],
    ]);
    expect(result.gain).toBe(-100);
    expect(result.unattributed).toBe(0);
  });

  it('subtracts the pension flow from the gain and reads the fund as Δvalue − contributions only after its entry', () => {
    const contributions: PensionContribution[] = [
      { id: 'c1', userId: 'u', assetId: 'fund', source: 'tfr', amount: 1200, date: new Date(2026, 5, 30), taxYear: 2026, deductible: false, createdAt: new Date(2026, 6, 28) },
      { id: 'c2', userId: 'u', assetId: 'fund', source: 'voluntary', amount: 10, date: new Date(2026, 5, 30), taxYear: 2026, deductible: true, createdAt: new Date(2026, 7, 18) },
    ];
    // June: fund out (base = ETF only). July: entry, base includes the fund (a 31800 flow).
    // August: the fund fell 189 with 10 paid in → market −199; the ETF flat.
    const snapshots = [
      snapshot(2026, 6, 1000, [row('etf', 10, 1000), row('fund', 30600, 30600)]),
      snapshot(2026, 7, 32800, [row('etf', 10, 1000), row('fund', 31800, 31800)]),
      snapshot(2026, 8, 32611, [row('etf', 10, 1000), row('fund', 31611, 31611)]),
    ];
    const cashFlows = [cashFlow(2026, 7, 0, 31800), cashFlow(2026, 8, 0, 10)];
    const result = attributePeriodReturn({
      snapshots,
      cashFlows,
      excludedAssetIds: [],
      pension: { fundIds: ['fund'], entryMonth: '2026-07', contributions },
      assets,
    });

    expect(result.gain).toBe(-199); // (32800 − 1000 − 31800) + (32611 − 32800 − 10)
    expect(result.rows).toEqual([expect.objectContaining({ assetId: 'fund', total: -199, isPensionFund: true, monthsAttributed: 1 })]);
    expect(result.unattributed).toBe(0);
  });

  it('gives the fund nothing before its entry, even when the breakdown has it', () => {
    const snapshots = [
      snapshot(2026, 4, 1000, [row('etf', 10, 1000), row('fund', 27000, 27000)]),
      snapshot(2026, 5, 1000, [row('etf', 10, 1000), row('fund', 29800, 29800)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: [], pension: { fundIds: ['fund'], entryMonth: '2026-07', contributions: [] }, assets });

    expect(result.rows).toEqual([]);
    expect(result.gain).toBe(0);
  });

  it('measures real estate gross of debt, so paying the mortgage down is not appreciation', () => {
    // Net value rises 300 (an instalment) while the gross property value is unchanged.
    const snapshots = [
      snapshot(2026, 1, 60000, [row('house', 1, 60000, 130000)]),
      snapshot(2026, 2, 60300, [row('house', 1, 60300, 130000)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: [], pension: noPension, assets });

    expect(result.rows).toEqual([]);
    expect(result.unattributed).toBe(300);
  });

  it('reads a sale to zero as a quantity move, never as a price collapse', () => {
    // The money-market fund is sold in full (the cron keeps its row at quantity 0) and the proceeds
    // land on a cash account opened the same month: no market effect anywhere but the ETF's +200.
    const snapshots = [
      snapshot(2026, 7, 16000, [row('etf', 10, 1170), row('mm', 99, 14830)]),
      snapshot(2026, 8, 16200, [row('etf', 10, 1370), row('mm', 0, 0), row('cash', 14830, 14830)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: [], pension: noPension, assets });

    expect(result.rows.map((r) => [r.assetId, r.total])).toEqual([['etf', 200]]);
    expect(result.gain).toBe(200);
    expect(result.unattributed).toBe(0);
  });

  it('adds the dividends it is given to the instrument, and keeps a name from the current asset over the snapshot', () => {
    const snapshots = [
      snapshot(2026, 1, 2000, [row('etf', 10, 1000), row('cash', 1000, 1000)]),
      snapshot(2026, 2, 2050, [row('etf', 10, 990), row('cash', 1060, 1060)]),
    ];
    const dividendsByAsset = new Map([['etf', 60]]);
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: [], pension: noPension, assets, dividendsByAsset });

    expect(result.rows).toEqual([expect.objectContaining({ assetId: 'etf', name: 'World ETF', marketEffect: -10, dividends: 60, total: 50 })]);
    expect(result.gain).toBe(50);
    expect(result.unattributed).toBe(0);
  });

  it('counts only the months with a breakdown on both sides and says how many', () => {
    const snapshots = [
      snapshot(2025, 10, 900, null),
      snapshot(2025, 11, 1000, [row('etf', 10, 1000)]),
      snapshot(2025, 12, 1100, [row('etf', 10, 1100)]),
    ];
    const result = attributePeriodReturn({ snapshots, cashFlows: [], excludedAssetIds: [], pension: noPension, assets });

    expect(result.coverage).toEqual({ measuredMonths: 2, attributedMonths: 1, firstAttributed: { year: 2025, month: 12 }, lastAttributed: { year: 2025, month: 12 } });
    expect(result.gain).toBe(100);
    expect(result.rows[0].total).toBe(100);
  });

  it('returns an empty attribution when no pair has a breakdown', () => {
    const result = attributePeriodReturn({ snapshots: [snapshot(2025, 1, 100, null), snapshot(2025, 2, 110, null)], cashFlows: [], excludedAssetIds: [], pension: noPension, assets });

    expect(result).toEqual({ rows: [], attributed: 0, gain: 0, unattributed: 0, coverage: { measuredMonths: 1, attributedMonths: 0, firstAttributed: null, lastAttributed: null } });
  });
});

describe('sumDividendsByAsset', () => {
  it('sums the net EUR amounts paid inside the window per instrument, native when there is no conversion', () => {
    const dividends = [
      { assetId: 'a', paymentDate: new Date(2026, 1, 10), netAmount: 100, netAmountEur: 92 },
      { assetId: 'a', paymentDate: new Date(2026, 4, 10), netAmount: 40 },
      { assetId: 'b', paymentDate: new Date(2026, 2, 1), netAmount: 15 },
      { assetId: 'a', paymentDate: new Date(2026, 8, 1), netAmount: 999 }, // after the window (announced)
      { assetId: 'b', paymentDate: new Date(2025, 11, 31), netAmount: 999 }, // before the window
    ];
    const byAsset = sumDividendsByAsset(dividends, new Date(2026, 0, 1), new Date(2026, 6, 31, 23, 59, 59));

    expect([...byAsset.entries()]).toEqual([
      ['a', 132],
      ['b', 15],
    ]);
  });
});
