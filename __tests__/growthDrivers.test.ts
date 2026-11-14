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
  { id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash' },
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

  it('should measure the mortgage from a LOAN row (minus its principal) and keep it out of the market (2026-10-10)', () => {
    // The same September, on the new model: the house at its gross value and the loan beside it,
    // 60.000 € in August and 59.500 € in September — the same 500 € of principal repaid.
    const assets = [...ASSETS, { id: 'loan', name: 'Mutuo Casa', type: 'loan', financedAssetId: 'house' }] as unknown as Asset[];
    const august = snap(2026, 8, [row('vwce', 10, 100, 1000), row('cash', 500, 1, 500), row('house', 1, 100000, 100000), row('loan', 60000, 1, -60000), row('fund', 2000, 1, 2000)]);
    const september = snap(2026, 9, [row('vwce', 0, 120, 0), row('copper', 5, 104, 520), row('cash', 1343, 1, 1343), row('house', 1, 100000, 100000), row('loan', 59500, 1, -59500), row('fund', 2150, 1, 2150)]);
    const [drivers] = buildMonthlyGrowthDrivers([august, september], context({ assets }));
    const [legacy] = buildMonthlyGrowthDrivers([AUGUST, SEPTEMBER], context());
    expect(drivers.debtRepaid).toBeCloseTo(500, 6);
    expect(drivers.market).toBeCloseTo(legacy.market, 6);
    expect(drivers.other).toBeCloseTo(legacy.other, 6);
  });

  it('should cross the migration month without a jump: the legacy debt falls to zero, the loan opens by the same figure', () => {
    // August on the old model (house net of 60.000 €), September on the new one (house gross, loan −59.500 €).
    const assets = [...ASSETS, { id: 'loan', name: 'Mutuo Casa', type: 'loan', financedAssetId: 'house' }] as unknown as Asset[];
    const september = snap(2026, 9, [row('vwce', 0, 120, 0), row('copper', 5, 104, 520), row('cash', 1343, 1, 1343), row('house', 1, 100000, 100000), row('loan', 59500, 1, -59500), row('fund', 2150, 1, 2150)]);
    const [drivers] = buildMonthlyGrowthDrivers([AUGUST, september], context({ assets }));
    expect(drivers.debtRepaid).toBeCloseTo(500, 6);
    expect(drivers.netWorthGrowth).toBeCloseTo(SEPTEMBER.totalNetWorth - AUGUST.totalNetWorth, 6);
  });

  it('should read a loan opened in the month as debt that went up, and one deleted after its payoff as repaid', () => {
    const assets = [...ASSETS, { id: 'loan', name: 'Prestito auto', type: 'loan' }] as unknown as Asset[];
    const before = snap(2026, 8, [row('cash', 500, 1, 500)]);
    const opened = snap(2026, 9, [row('cash', 10500, 1, 10500), row('loan', 10000, 1, -10000)]);
    const [opening] = buildMonthlyGrowthDrivers([before, opened], context({ assets, expenses: [] }));
    expect(opening.debtRepaid).toBeCloseTo(-10000, 6);
    const closed = snap(2026, 10, [row('cash', 500, 1, 500)]);
    const [closing] = buildMonthlyGrowthDrivers([opened, closed], context({ assets, expenses: [] }));
    expect(closing.debtRepaid).toBeCloseTo(10000, 6);
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
      { year: '2025', netSavings: 23678, market: 21288, taxes: 0, debtRepaid: 0, pensionContributions: 0, other: 0, otherPension: 0, otherHoldings: 0, otherAccounts: 0, isMarketMeasured: false, netWorthGrowth: 44966, growthPct: 44.966, baseline: { year: 2024, month: 12 }, latest: { year: 2025, month: 12 } },
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
    for (const key of ['netWorthGrowth', 'netSavings', 'market', 'taxes', 'debtRepaid', 'pensionContributions', 'other', 'otherPension', 'otherHoldings', 'otherAccounts'] as const) {
      expect(year[key]).toBeCloseTo(months[key], 6);
    }
    // August's market: 10 × (100 − 95) = 50.
    expect(year.market).toBeCloseTo(320, 6);
  });
});

/**
 * «altre» in three parts (2026-11-12): the fund's change that is neither market nor a recorded
 * contribution, the instruments' change that neither price nor recorded trades explain, and the
 * rest — which makes the three add up to `other` by construction. Figures are invented and round.
 */
describe('the three parts of «altre»', () => {
  const ACCOUNT = { id: 'cash', name: 'Conto', type: 'cash', assetClass: 'cash' };
  const parts = (d: { otherPension: number; otherHoldings: number; otherAccounts: number }) => d.otherPension + d.otherHoldings + d.otherAccounts;
  const bare = (assets: unknown[], overrides: Partial<GrowthDriverContext> = {}): GrowthDriverContext => ({
    expenses: [],
    transactions: [],
    assets: assets as Asset[],
    pension: { contributions: [], startMonth: null },
    today: new Date(2026, 11, 20, 12),
    ...overrides,
  });

  // G1
  it('should add up to «altre» on every pair of a six-month history, and be zero on an unmeasured pair', () => {
    const assets = [ACCOUNT, { id: 'etf', name: 'ETF', type: 'etf' }, { id: 'fund', name: 'Fondo', type: 'pensionFund' }];
    const history = [
      snap(2026, 1, [row('cash', 1000, 1, 1000), row('etf', 10, 100, 1000), row('fund', 5000, 1, 5000)]),
      snap(2026, 2, [row('cash', 1300, 1, 1300), row('etf', 12, 100, 1200), row('fund', 5200, 1, 5200)]),
      snap(2026, 3, [row('cash', 900, 1, 900), row('etf', 12, 110, 1320), row('fund', 5300, 1, 5300)]),
      snap(2026, 4, [row('cash', 900, 1, 900), row('etf', 9, 110, 990), row('fund', 5300, 1, 5300)]),
      snap(2026, 5, [row('cash', 1400, 1, 1400), row('etf', 9, 120, 1080), row('fund', 5450, 1, 5450)]),
      snap(2026, 6, [], 8000),
    ];
    const rows = buildMonthlyGrowthDrivers(history, bare(assets, {
      expenses: [flow('income', 1000, 2026, 2), flow('fixed', -400, 2026, 3), flow('fixed', -250, 2026, 5)],
      transactions: [trade('etf', 'sell', new Date(2026, 3, 10, 12), 3, 110)],
      pension: { contributions: [contribution('fund', 100, new Date(2026, 4, 10, 12))], startMonth: '2026-04' },
    }));
    expect(rows).toHaveLength(5);
    for (const month of rows) expect(parts(month)).toBeCloseTo(month.other, 6);
    // The last pair has no `byAsset` on its far side: unmeasured, so the three parts are 0.
    const unmeasured = buildMonthlyGrowthDrivers(history.slice(-2), bare(assets));
    expect(unmeasured[0]).toMatchObject({ isMarketMeasured: false, otherPension: 0, otherHoldings: 0, otherAccounts: 0 });
  });

  // G2
  it('should put a fund\'s growth before the contributions are complete in «fondo non tracciato»', () => {
    const july = snap(2026, 7, [row('fund', 10000, 1, 10000)]);
    const august = snap(2026, 8, [row('fund', 10500, 1, 10500)]);
    const [drivers] = buildMonthlyGrowthDrivers([july, august], bare([{ id: 'fund', name: 'Fondo', type: 'pensionFund' }], { pension: { contributions: [], startMonth: '2026-09' } }));
    expect(drivers.market).toBeCloseTo(0, 6);
    expect(drivers.otherPension).toBeCloseTo(500, 6);
    expect(drivers.other).toBeCloseTo(500, 6);
    expect(drivers.otherAccounts).toBeCloseTo(0, 6);
  });

  // G3
  it('should put units that appeared with no trade in «quantità fuori dal registro», and none once the buy is recorded', () => {
    const assets = [ACCOUNT, { id: 'etf', name: 'ETF', type: 'etf' }];
    const july = snap(2026, 7, [row('cash', 500, 1, 500), row('etf', 10, 100, 1000)]);
    const august = snap(2026, 8, [row('cash', 500, 1, 500), row('etf', 12, 100, 1200)]);
    const [edited] = buildMonthlyGrowthDrivers([july, august], bare(assets));
    expect(edited.market).toBeCloseTo(0, 6);
    expect(edited.otherHoldings).toBeCloseTo(200, 6);
    expect(edited.otherAccounts).toBeCloseTo(0, 6);
    // The same two units bought through the ledger, paid from the account: explained, nothing left.
    const paid = snap(2026, 8, [row('cash', 300, 1, 300), row('etf', 12, 100, 1200)], 1500);
    const [bought] = buildMonthlyGrowthDrivers([july, paid], bare(assets, { transactions: [trade('etf', 'buy', new Date(2026, 7, 5, 12), 2, 100)] }));
    expect(bought.otherHoldings).toBeCloseTo(0, 6);
    expect(bought.other).toBeCloseTo(0, 6);
  });

  // G4
  it('should read a card as «saldi dei conti»: +400 the month of the rows, −400 the month of the debit', () => {
    const assets = [ACCOUNT];
    const july = snap(2026, 7, [row('cash', 1000, 1, 1000)]);
    const august = snap(2026, 8, [row('cash', 1000, 1, 1000)]);
    const september = snap(2026, 9, [row('cash', 600, 1, 600)]);
    const [first, second] = buildMonthlyGrowthDrivers([july, august, september], bare(assets, { expenses: [flow('fixed', -400, 2026, 8)] }));
    expect(first.otherAccounts).toBeCloseTo(400, 6);
    expect(first.otherHoldings).toBeCloseTo(0, 6);
    expect(second.otherAccounts).toBeCloseTo(-400, 6);
  });

  // G6
  it('should keep a hand-valued stake\'s revaluation in «quantità fuori dal registro», never in the market', () => {
    // A `Private Equity` instrument lives in `quantity` at price 1 (doc/guide/patrimonio.md).
    const stake = { id: 'pe', name: 'Private Equity', type: 'etf' };
    const july = snap(2026, 7, [row('pe', 1000, 1, 1000)]);
    const august = snap(2026, 8, [row('pe', 1100, 1, 1100)]);
    const [drivers] = buildMonthlyGrowthDrivers([july, august], bare([stake]));
    expect(drivers.market).toBeCloseTo(0, 6);
    expect(drivers.otherHoldings).toBeCloseTo(100, 6);
  });

  it('should leave a property and a deleted asset in «saldi dei conti», never in the holdings', () => {
    const july = snap(2026, 7, [row('house', 1, 100000, 100000), row('gone', 5, 20, 100)]);
    const august = snap(2026, 8, [row('house', 1, 101000, 101000)]);
    const [drivers] = buildMonthlyGrowthDrivers([july, august], bare([{ id: 'house', name: 'Casa', type: 'realestate' }]));
    expect(drivers.otherHoldings).toBeCloseTo(0, 6);
    expect(drivers.otherAccounts).toBeCloseTo(drivers.other, 6);
  });

  // G5
  it('should sum each part over months and over a year', () => {
    const assets = [ACCOUNT, { id: 'etf', name: 'ETF', type: 'etf' }];
    const history = [
      snap(2026, 6, [row('cash', 500, 1, 500), row('etf', 10, 100, 1000)]),
      snap(2026, 7, [row('cash', 500, 1, 500), row('etf', 12, 100, 1200)]),
      snap(2026, 8, [row('cash', 500, 1, 500), row('etf', 12, 100, 1200)]),
      snap(2026, 9, [row('cash', 100, 1, 100), row('etf', 15, 100, 1500)]),
    ];
    const ctx = bare(assets, { expenses: [flow('income', 50, 2026, 8)] });
    const months = buildMonthlyGrowthDrivers(history, ctx);
    const total = sumGrowthDrivers(months)!;
    expect(total.otherHoldings).toBeCloseTo(months.reduce((sum, m) => sum + m.otherHoldings, 0), 6);
    expect(total.otherAccounts).toBeCloseTo(months.reduce((sum, m) => sum + m.otherAccounts, 0), 6);
    expect(total.otherPension).toBeCloseTo(0, 6);
    expect(total.otherHoldings).toBeCloseTo(500, 6);
    const [year] = buildYearlyGrowthDrivers(history, ctx);
    for (const key of ['otherPension', 'otherHoldings', 'otherAccounts'] as const) expect(year[key]).toBeCloseTo(total[key], 6);
  });
});
