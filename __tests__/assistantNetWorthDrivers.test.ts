/**
 * Tests for lib/utils/assistantNetWorthDrivers.ts — the change of an analysed period split as
 * Storico's Driver splits it, handed to the Assistente so it reads the market instead of guessing
 * it (owner, 2026-11-16: «Il sistema non scompone la variazione … non posso quantificarla»).
 *
 * The fixture is an ottobre 2026 in miniature, figures invented: an ETF that loses 50 € of price, an
 * account that receives the month's savings, a pension fund whose September contributions are
 * recorded on 13 October. Δ = +900 savings − 50 market + 1000 contributions = +1850.
 */
import { describe, expect, it } from 'vitest';

import { buildAssistantNetWorthDrivers, pensionPaidInByClass } from '@/lib/utils/assistantNetWorthDrivers';
import type { GrowthDriverContext } from '@/lib/utils/growthDrivers';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { PensionContribution } from '@/types/pension';

type Row = MonthlySnapshot['byAsset'][number];
const row = (assetId: string, quantity: number, price: number, totalValue: number): Row => ({ assetId, ticker: assetId, name: assetId, quantity, price, totalValue });

function snap(year: number, month: number, byAsset: Row[]): MonthlySnapshot {
  const total = byAsset.reduce((sum, r) => sum + r.totalValue, 0);
  return { userId: 'u', year, month, totalNetWorth: total, liquidNetWorth: total, illiquidNetWorth: 0, byAssetClass: {}, byAsset, assetAllocation: {}, createdAt: new Date(year, month - 1, 28, 12) } as MonthlySnapshot;
}

const ASSETS = [
  { id: 'etf', name: 'ETF Esempio', type: 'etf', taxRate: 26 },
  { id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash' },
  { id: 'fund', name: 'Fondo', type: 'pensionFund' },
] as unknown as Asset[];

const SEPTEMBER = snap(2026, 9, [row('etf', 10, 100, 1000), row('cash', 1000, 1, 1000), row('fund', 20000, 1, 20000)]);
const OCTOBER = snap(2026, 10, [row('etf', 10, 95, 950), row('cash', 1900, 1, 1900), row('fund', 21000, 1, 21000)]);

const SALARY = { id: 'e1', userId: 'u', type: 'income', categoryId: 'c', categoryName: 'Stipendio', amount: 900, currency: 'EUR', date: new Date(2026, 9, 5, 12), createdAt: new Date(), updatedAt: new Date() } as Expense;
const RECORDED_IN_OCTOBER = { id: 'p1', userId: 'u', assetId: 'fund', source: 'tfr', amount: 1000, date: new Date(2026, 8, 30, 12), taxYear: 2026, deductible: false, createdAt: new Date(2026, 9, 13, 12) } as PensionContribution;

const CONTEXT: GrowthDriverContext = {
  expenses: [SALARY],
  transactions: [],
  assets: ASSETS,
  pension: { contributions: [RECORDED_IN_OCTOBER], startMonth: '2026-01' },
  today: new Date(2026, 10, 16, 12),
};

describe('buildAssistantNetWorthDrivers', () => {
  it('should split the month into savings, market and the contributions recorded in it, adding up to the change', () => {
    const drivers = buildAssistantNetWorthDrivers({ snapshots: [SEPTEMBER, OCTOBER], from: SEPTEMBER, to: OCTOBER, context: CONTEXT });
    expect(drivers).toMatchObject({
      from: { year: 2026, month: 9 },
      to: { year: 2026, month: 10 },
      total: 1850,
      savings: 900,
      market: -50,
      taxes: 0,
      debtRepaid: 0,
      pensionContributions: 1000,
      isMarketMeasured: true,
    });
    const d = drivers!;
    expect(d.savings + d.market - d.taxes + d.debtRepaid + d.pensionContributions + d.other).toBeCloseTo(d.total, 6);
  });

  it('should sum every month of a longer window, and only the window', () => {
    const august = snap(2026, 8, [row('etf', 10, 100, 1000), row('cash', 1000, 1, 1000), row('fund', 20000, 1, 20000)]);
    const drivers = buildAssistantNetWorthDrivers({ snapshots: [august, SEPTEMBER, OCTOBER], from: SEPTEMBER, to: OCTOBER, context: CONTEXT });
    expect(drivers?.total).toBe(1850);
    const both = buildAssistantNetWorthDrivers({ snapshots: [OCTOBER, august, SEPTEMBER], from: august, to: OCTOBER, context: CONTEXT });
    expect(both).toMatchObject({ from: { year: 2026, month: 8 }, total: 1850, savings: 900 });
  });

  it('should say nothing without both ends, or across a month with no snapshot', () => {
    expect(buildAssistantNetWorthDrivers({ snapshots: [OCTOBER], from: null, to: OCTOBER, context: CONTEXT })).toBeNull();
    const july = snap(2026, 7, [row('cash', 1000, 1, 1000)]);
    // August is missing: the window cannot add up to the euro, so it is not split at all.
    expect(buildAssistantNetWorthDrivers({ snapshots: [july, SEPTEMBER, OCTOBER], from: july, to: OCTOBER, context: CONTEXT })).toBeNull();
  });
});

// The contributions of the period by asset class, through each fund's composition (owner,
// 2026-11-16: «la divisione in classi dei fondi pensione è conosciuta nell'app»).
describe('pensionPaidInByClass', () => {
  const MIXED = { id: 'mixed', name: 'Fondo Bilanciato', type: 'pensionFund', assetClass: 'equity', composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }] } as unknown as Asset;
  const PLAIN = { id: 'plain', name: 'Fondo Garantito', type: 'pensionFund', assetClass: 'bonds' } as unknown as Asset;
  const paid = (assetId: string, amount: number, recorded: Date) =>
    ({ id: `${assetId}-${amount}`, userId: 'u', assetId, source: 'tfr', amount, date: new Date(2026, 8, 30, 12), taxYear: 2026, deductible: false, createdAt: recorded }) as PensionContribution;

  it('should split each contribution recorded in the period by its fund composition', () => {
    const byClass = pensionPaidInByClass(
      [paid('mixed', 1000, new Date(2026, 9, 13, 12)), paid('plain', 300, new Date(2026, 9, 13, 12)), paid('mixed', 500, new Date(2026, 10, 2, 12))],
      [MIXED, PLAIN],
      '2026-09',
      '2026-10'
    );
    expect(byClass).toEqual({ equity: 600, bonds: 700 });
  });

  it('should say nothing for a period with no contribution', () => {
    expect(pensionPaidInByClass([paid('mixed', 1000, new Date(2026, 9, 13, 12))], [MIXED], '2026-07', '2026-08')).toEqual({});
  });
});
