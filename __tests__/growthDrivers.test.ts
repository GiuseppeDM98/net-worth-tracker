/**
 * Tests for lib/utils/growthDrivers.ts — Storico's growth split into savings, measured market, sale
 * taxes, mortgage repaid, pension contributions and the rest.
 *
 * The main fixture is a settembre 2026 in miniature, the month that motivated the module: a
 * position sold at a gain (the broker withholds the tax, no cashflow row), another bought
 * mid-month, a mortgage instalment, a pension contribution, and a row still in calendar after
 * today. Every figure below is worked out by hand in the comments, so the test is a second path to
 * the same numbers, not the code read back.
 */

import { describe, expect, it } from 'vitest';

import { buildMonthlyGrowthDrivers, buildYearlyGrowthDrivers, sumGrowthDrivers, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';
import type { PensionContribution } from '@/types/pension';

type Row = MonthlySnapshot['byAsset'][number];

const row = (assetId: string, quantity: number, price: number, totalValue: number): Row => ({ assetId, ticker: assetId, name: assetId, quantity, price, totalValue });

function snap(year: number, month: number, byAsset: Row[], totalNetWorth = byAsset.reduce((sum, r) => sum + r.totalValue, 0)): MonthlySnapshot {
  return { userId: 'u', year, month, totalNetWorth, liquidNetWorth: totalNetWorth, illiquidNetWorth: 0, byAssetClass: {}, byAsset, assetAllocation: {}, createdAt: new Date(year, month - 1, 28, 12) } as MonthlySnapshot;
}

let seq = 0;
function flow(type: Expense['type'], amount: number, year: number, month: number, day = 5): Expense {
  seq += 1;
  return { id: `e${seq}`, userId: 'u', type, categoryId: 'c', categoryName: 'c', amount, currency: 'EUR', date: new Date(year, month - 1, day, 12), createdAt: new Date(), updatedAt: new Date() } as Expense;
}

function trade(assetId: string, type: AssetTransactionType, date: Date, quantity: number, priceEur: number): AssetTransaction {
  seq += 1;
  return { id: `t${seq}`, userId: 'u', assetId, type, date, quantity, pricePerUnit: priceEur, priceEur, createdAt: date, updatedAt: date } as AssetTransaction;
}

function contribution(assetId: string, amount: number, createdAt: Date): PensionContribution {
  seq += 1;
  return { id: `p${seq}`, userId: 'u', assetId, source: 'tfr', amount, date: createdAt, taxYear: createdAt.getFullYear(), deductible: false, createdAt } as PensionContribution;
}

const ASSETS = [
  { id: 'vwce', name: 'VWCE', type: 'etf', taxRate: 26 },
  { id: 'copper', name: 'Copper', type: 'etf', taxRate: 26 },
  { id: 'cash', name: 'Conto', type: 'cash' },
  { id: 'house', name: 'Casa', type: 'realestate' },
  { id: 'fund', name: 'Fondo', type: 'pensionFund' },
] as unknown as Asset[];

// August: 10 VWCE at 100 €, 500 € of cash, a 100.000 € house with 60.000 € of debt, a 2000 € fund.
const AUGUST = snap(2026, 8, [row('vwce', 10, 100, 1000), row('cash', 500, 1, 500), row('house', 1, 100000, 40000), row('fund', 2000, 1, 2000)]);
// September: VWCE sold (10 at 120 € → +1200 € cash, −182 € tax withheld), 5 Copper bought at 100 €
// (now 104 €), +300 € saved, +25 € the balance says and no row does, 500 € of principal repaid,
// 100 € of TFR paid into the fund, which is worth 2150 €.
// Cash: 500 + 1200 − 182 − 500 + 300 + 25 = 1343.
const SEPTEMBER = snap(2026, 9, [row('vwce', 0, 120, 0), row('copper', 5, 104, 520), row('cash', 1343, 1, 1343), row('house', 1, 100000, 40500), row('fund', 2150, 1, 2150)]);

const LEDGER = [
  trade('vwce', 'buy', new Date(2026, 0, 10, 12), 10, 50),
  trade('vwce', 'sell', new Date(2026, 8, 2, 12), 10, 120),
  trade('copper', 'buy', new Date(2026, 8, 3, 12), 5, 100),
];

function context(overrides: Partial<GrowthDriverContext> = {}): GrowthDriverContext {
  return {
    expenses: [flow('income', 1000, 2026, 9, 5), flow('fixed', -700, 2026, 9, 6), flow('fixed', -400, 2026, 9, 25)],
    transactions: LEDGER,
    assets: ASSETS,
    pension: { contributions: [contribution('fund', 100, new Date(2026, 8, 10, 12))], startMonth: '2026-01' },
    today: new Date(2026, 8, 19, 12),
    ...overrides,
  };
}

describe('buildMonthlyGrowthDrivers — a month measured instrument by instrument', () => {
  it('should split the month into savings, market, tax, mortgage, contributions and the rest, adding up to the growth', () => {
    const [september] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context());
    // Δ = 44.513 − 43.500 = 1013.
    // Market: VWCE sold 10 × (120 − 100) = 200; Copper bought 5 × (104 − 100) = 20; the fund
    // 2150 − 2000 − 100 paid in = 50; cash and the house (gross) move no price → 270.
    // Tax: (120 − 50) × 10 × 26% = 182. Other: 1013 − 300 − 270 + 182 − 500 − 100 = 25.
    expect(september).toMatchObject({ year: 2026, month: 9, isMarketMeasured: true });
    expect(september.netWorthGrowth).toBeCloseTo(1013, 6);
    expect(september.netSavings).toBeCloseTo(300, 6);
    expect(september.market).toBeCloseTo(270, 6);
    expect(september.taxes).toBeCloseTo(182, 6);
    expect(september.debtRepaid).toBeCloseTo(500, 6);
    expect(september.pensionContributions).toBeCloseTo(100, 6);
    expect(september.other).toBeCloseTo(25, 6);
    const { netWorthGrowth, netSavings, market, taxes, debtRepaid, pensionContributions, other } = september;
    expect(netSavings + market - taxes + debtRepaid + pensionContributions + other).toBeCloseTo(netWorthGrowth, 6);
  });

  it('should never charge the market with the tax withheld on the sale', () => {
    const withoutSale = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context({ transactions: LEDGER.filter((t) => t.type !== 'sell') }))[0];
    const withSale = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context())[0];
    // The old reading, Δ − savings, would say 1013 − 300 = 713 of «market», tax and all.
    expect(withSale.taxes).toBeGreaterThan(0);
    expect(withoutSale.taxes).toBe(0);
    expect(withSale.market).not.toBeCloseTo(withSale.netWorthGrowth - withSale.netSavings, 0);
  });

  it('should count as savings only the rows already happened, never the ones in calendar after today', () => {
    const [september] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context());
    // 1000 − 700; the −400 € on the 25th is after the 19th.
    expect(september.netSavings).toBeCloseTo(300, 6);
    const [afterTheRow] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context({ today: new Date(2026, 8, 25, 12) }));
    expect(afterTheRow.netSavings).toBeCloseTo(-100, 6);
  });

  it('should leave a fund to «altre variazioni», contributions included, before the contributions are complete', () => {
    const [september] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context({ pension: { contributions: context().pension.contributions, startMonth: '2026-09' } }));
    // The fund's 150 € of growth is not attributable: market 220, no contributions named, other 25 + 150.
    expect(september.pensionContributions).toBe(0);
    expect(september.market).toBeCloseTo(220, 6);
    expect(september.other).toBeCloseTo(175, 6);
  });

  it('should read a rise of the typed debt as a negative repayment', () => {
    const corrected = snap(2026, 9, SEPTEMBER.byAsset.map((r) => (r.assetId === 'house' ? { ...r, totalValue: 39959.28 } : r)));
    const [september] = buildMonthlyGrowthDrivers([AUGUST, corrected], context());
    expect(september.debtRepaid).toBeCloseTo(-40.72, 6);
  });

  it('should fall back to the residual net of what is named when a snapshot has no per-instrument breakdown', () => {
    const legacyAugust = snap(2026, 8, [], 43500);
    const [september] = buildMonthlyGrowthDrivers([legacyAugust, SEPTEMBER], context());
    // 1013 − 300 + 182 − 100: the tax and the contributions are known without `byAsset`.
    expect(september).toMatchObject({ isMarketMeasured: false, debtRepaid: 0, other: 0 });
    expect(september.market).toBeCloseTo(795, 6);
  });

  it('should skip a month whose previous calendar month has no snapshot', () => {
    expect(buildMonthlyGrowthDrivers([snap(2026, 7, [], 1000), SEPTEMBER], context())).toEqual([]);
  });
});

describe('buildYearlyGrowthDrivers — the savings window is the growth window', () => {
  const plain = (year: number, month: number, total: number) => snap(year, month, [], total);
  const bare = (expenses: Expense[]): GrowthDriverContext => ({ expenses, transactions: [], assets: [], pension: { contributions: [], startMonth: null }, today: new Date(2030, 0, 1, 12) });

  it('should count a closed year on the full calendar year and give the growth in percent of the baseline', () => {
    const rows = buildYearlyGrowthDrivers(
      [plain(2024, 12, 100000), plain(2025, 6, 120000), plain(2025, 12, 144966)],
      bare([flow('income', 30000, 2025, 1), flow('fixed', -6322, 2025, 12), flow('transfer', 5000, 2025, 3)]),
    );
    expect(rows).toEqual([
      { year: '2025', netSavings: 23678, market: 21288, taxes: 0, debtRepaid: 0, pensionContributions: 0, other: 0, isMarketMeasured: false, netWorthGrowth: 44966, growthPct: 44.966, baseline: { year: 2024, month: 12 }, latest: { year: 2025, month: 12 } },
    ]);
  });

  it('should stop a running year at its last snapshot: rows already in the calendar after it do not count', () => {
    const rows = buildYearlyGrowthDrivers(
      [plain(2025, 12, 200000), plain(2026, 8, 234436)],
      { ...bare([flow('income', 3000, 2026, 3), flow('fixed', -800, 2026, 8), flow('fixed', -800, 2026, 8, 30), flow('fixed', -800, 2026, 11)]), today: new Date(2026, 7, 20, 12) },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ year: '2026', netSavings: 2200, market: 32236, netWorthGrowth: 34436, latest: { year: 2026, month: 8 } });
  });

  it('should open a first year the month after its baseline: rows before it explain no growth', () => {
    const rows = buildYearlyGrowthDrivers([plain(2026, 3, 100000), plain(2026, 8, 110000)], bare([flow('income', 5000, 2026, 1), flow('income', 5000, 2026, 3), flow('income', 4000, 2026, 4)]));
    expect(rows[0]).toMatchObject({ year: '2026', netSavings: 4000, market: 6000, baseline: { year: 2026, month: 3 } });
  });

  it('should skip a year with no cashflow row in its window instead of reading it as all market', () => {
    const rows = buildYearlyGrowthDrivers([plain(2024, 12, 100000), plain(2025, 12, 110000), plain(2026, 6, 115000)], bare([flow('income', 1000, 2026, 2)]));
    expect(rows.map((r) => r.year)).toEqual(['2026']);
  });

  it('should be the sum of its months, so a year and its bars never disagree', () => {
    const july = snap(2026, 7, AUGUST.byAsset.map((r) => (r.assetId === 'vwce' ? { ...r, price: 95, totalValue: 950 } : r)));
    const snapshots = [july, AUGUST, SEPTEMBER];
    const ctx = context({ expenses: [...context().expenses, flow('income', 50, 2026, 8)] });
    const [year] = buildYearlyGrowthDrivers(snapshots, ctx);
    const months = sumGrowthDrivers(buildMonthlyGrowthDrivers(snapshots, ctx))!;
    for (const key of ['netWorthGrowth', 'netSavings', 'market', 'taxes', 'debtRepaid', 'pensionContributions', 'other'] as const) {
      expect(year[key]).toBeCloseTo(months[key], 6);
    }
    // August's market: 10 × (100 − 95) = 50.
    expect(year.market).toBeCloseTo(320, 6);
  });
});
