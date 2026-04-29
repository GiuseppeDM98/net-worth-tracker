import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

// Hoisted Resend mock — must use a proper function constructor to allow `new Resend()`
const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));
vi.mock('resend', () => {
  class ResendMock {
    emails = { send: resendSendMock };
    constructor(_apiKey?: string) {}
  }
  return { Resend: ResendMock };
});

// Per-collection query chains — filled per-test
const collectionMocks: Record<string, any> = {};

// Build a reusable chainable query builder for the adminDb mock.
// The real service uses: .where().where().where().limit().get() (3 conditions)
// and:                   .where().where().get() (2 conditions for expenses/dividends).
function buildQueryMock(name: string) {
  const terminal = () => ({
    get: vi.fn().mockImplementation(() =>
      Promise.resolve(collectionMocks[name] ?? { empty: true, docs: [] })
    ),
  });
  function chainNode(): any {
    return {
      where: () => chainNode(),
      limit: () => terminal(),
      get: vi.fn().mockImplementation(() =>
        Promise.resolve(collectionMocks[name] ?? { empty: true, docs: [] })
      ),
    };
  }
  return chainNode();
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: () => ({ get: vi.fn() }),
      where: () => buildQueryMock(name),
    }),
  },
  adminAuth: { verifyIdToken: vi.fn() },
}));

vi.mock('@/lib/utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/dateHelpers')>(
    '@/lib/utils/dateHelpers'
  );
  return { ...actual };
});

import {
  isLastDayOfMonthItaly,
  isLastDayOfQuarterItaly,
  isLastDayOfYearItaly,
  monthToQuarter,
  getQuarterStartMonth,
  getPreviousQuarterEnd,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedYearEnd,
  computeAssetClassPerformers,
  buildMonthlyEmailData,
  buildPeriodEmailData,
  generateEmailHtml,
  sendMonthlyEmail,
  type MonthlyEmailData,
} from '@/lib/server/monthlyEmailService';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeMonthlyData(overrides: Partial<MonthlyEmailData> = {}): MonthlyEmailData {
  return {
    periodType: 'monthly',
    year: 2025,
    month: 3,
    currentNetWorth: 150000,
    previousNetWorth: 145000,
    netWorthDelta: 5000,
    netWorthDeltaPct: 3.45,
    liquidNetWorth: 30000,
    byAssetClass: { equity: 90000, bonds: 40000, cash: 20000 },
    previousByAssetClass: { equity: 85000, bonds: 42000, cash: 18000 },
    assetClassPerformers: { bestPct: null, worstPct: null, bestAbs: null, worstAbs: null },
    totalIncome: 3500,
    totalExpenses: 2000,
    topExpenseCategories: [
      { name: 'Alimentari', amount: 800 },
      { name: 'Trasporti', amount: 600 },
    ],
    allIncomeCategories: [],
    topIndividualExpenses: [],
    dividendTotal: 450,
    dividendCount: 3,
    ...overrides,
  };
}

// ─── isLastDayOfMonthItaly ────────────────────────────────────────────────────

describe('isLastDayOfMonthItaly', () => {
  it('returns true on January 31', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-01-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on January 30', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-01-30T10:00:00Z'))).toBe(false);
  });

  it('returns true on December 31', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-12-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on December 30', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-12-30T10:00:00Z'))).toBe(false);
  });

  it('returns true on April 30 (30-day month)', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-04-30T10:00:00Z'))).toBe(true);
  });

  it('returns false on April 29', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-04-29T10:00:00Z'))).toBe(false);
  });

  it('returns true on Feb 28 in non-leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-02-28T10:00:00Z'))).toBe(true);
  });

  it('returns true on Feb 29 in leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2024-02-29T10:00:00Z'))).toBe(true);
  });

  it('returns false on Feb 28 in leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2024-02-28T10:00:00Z'))).toBe(false);
  });
});

// ─── isLastDayOfQuarterItaly ──────────────────────────────────────────────────

describe('isLastDayOfQuarterItaly', () => {
  it('returns true on March 31 (end of Q1)', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-03-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on March 30', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-03-30T10:00:00Z'))).toBe(false);
  });

  it('returns true on June 30 (end of Q2)', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-06-30T10:00:00Z'))).toBe(true);
  });

  it('returns true on September 30 (end of Q3)', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-09-30T10:00:00Z'))).toBe(true);
  });

  it('returns true on December 31 (end of Q4)', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-12-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on January 31 (last day of month but not quarter)', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-01-31T10:00:00Z'))).toBe(false);
  });

  it('returns false on February 28', () => {
    expect(isLastDayOfQuarterItaly(new Date('2026-02-28T10:00:00Z'))).toBe(false);
  });
});

// ─── isLastDayOfYearItaly ─────────────────────────────────────────────────────

describe('isLastDayOfYearItaly', () => {
  it('returns true on December 31', () => {
    expect(isLastDayOfYearItaly(new Date('2025-12-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on December 30', () => {
    expect(isLastDayOfYearItaly(new Date('2025-12-30T10:00:00Z'))).toBe(false);
  });

  it('returns false on November 30', () => {
    expect(isLastDayOfYearItaly(new Date('2025-11-30T10:00:00Z'))).toBe(false);
  });

  it('returns false on January 1', () => {
    expect(isLastDayOfYearItaly(new Date('2025-01-01T10:00:00Z'))).toBe(false);
  });
});

// ─── monthToQuarter ───────────────────────────────────────────────────────────

describe('monthToQuarter', () => {
  it.each([
    [1, 1], [2, 1], [3, 1],
    [4, 2], [5, 2], [6, 2],
    [7, 3], [8, 3], [9, 3],
    [10, 4], [11, 4], [12, 4],
  ])('month %i → Q%i', (month, expectedQuarter) => {
    expect(monthToQuarter(month)).toBe(expectedQuarter);
  });
});

// ─── getQuarterStartMonth ─────────────────────────────────────────────────────

describe('getQuarterStartMonth', () => {
  it.each([
    [3, 1], [6, 4], [9, 7], [12, 10],
  ])('end month %i → start month %i', (end, start) => {
    expect(getQuarterStartMonth(end)).toBe(start);
  });
});

// ─── getPreviousQuarterEnd ────────────────────────────────────────────────────

describe('getPreviousQuarterEnd', () => {
  it('Q2 (month 6) → Q1 same year (month 3)', () => {
    expect(getPreviousQuarterEnd(2026, 6)).toEqual({ year: 2026, month: 3 });
  });

  it('Q1 (month 3) → Q4 previous year (month 12)', () => {
    expect(getPreviousQuarterEnd(2026, 3)).toEqual({ year: 2025, month: 12 });
  });

  it('Q4 (month 12) → Q3 same year (month 9)', () => {
    expect(getPreviousQuarterEnd(2026, 12)).toEqual({ year: 2026, month: 9 });
  });
});

// ─── getMostRecentCompletedQuarterEnd ─────────────────────────────────────────

describe('getMostRecentCompletedQuarterEnd', () => {
  it('April 19 2026 → March 2026 (Q1 completed)', () => {
    const result = getMostRecentCompletedQuarterEnd(new Date('2026-04-19T10:00:00Z'));
    expect(result).toEqual({ year: 2026, month: 3 });
  });

  it('January 5 2026 → December 2025 (Q4 previous year)', () => {
    const result = getMostRecentCompletedQuarterEnd(new Date('2026-01-05T10:00:00Z'));
    expect(result).toEqual({ year: 2025, month: 12 });
  });

  it('July 1 2026 → June 2026 (Q2 completed)', () => {
    const result = getMostRecentCompletedQuarterEnd(new Date('2026-07-01T10:00:00Z'));
    expect(result).toEqual({ year: 2026, month: 6 });
  });

  it('October 15 2026 → September 2026 (Q3 completed)', () => {
    const result = getMostRecentCompletedQuarterEnd(new Date('2026-10-15T10:00:00Z'));
    expect(result).toEqual({ year: 2026, month: 9 });
  });
});

// ─── getMostRecentCompletedYearEnd ───────────────────────────────────────────

describe('getMostRecentCompletedYearEnd', () => {
  it('April 19 2026 → December 2025', () => {
    const result = getMostRecentCompletedYearEnd(new Date('2026-04-19T10:00:00Z'));
    expect(result).toEqual({ year: 2025, month: 12 });
  });

  it('January 1 2026 → December 2025', () => {
    const result = getMostRecentCompletedYearEnd(new Date('2026-01-01T10:00:00Z'));
    expect(result).toEqual({ year: 2025, month: 12 });
  });
});

// ─── computeAssetClassPerformers ──────────────────────────────────────────────

describe('computeAssetClassPerformers', () => {
  it('identifies best and worst by Δ% and absolute', () => {
    const current = { equity: 110000, bonds: 38000, cash: 20000 };
    const previous = { equity: 100000, bonds: 40000, cash: 20000 };
    // equity: +10% (+€10000), bonds: -5% (-€2000), cash: 0%
    const result = computeAssetClassPerformers(current, previous);
    expect(result.bestPct?.name).toBe('Azioni');
    expect(result.bestPct?.deltaPct).toBeCloseTo(10);
    expect(result.bestPct?.deltaAbs).toBe(10000);
    expect(result.worstPct?.name).toBe('Obbligazioni');
    expect(result.worstPct?.deltaPct).toBeCloseTo(-5);
    expect(result.worstPct?.deltaAbs).toBe(-2000);
    // absolute: equity gained most (+10000), bonds lost most (-2000)
    expect(result.bestAbs?.name).toBe('Azioni');
    expect(result.worstAbs?.name).toBe('Obbligazioni');
  });

  it('returns nulls when previous is empty', () => {
    const result = computeAssetClassPerformers({ equity: 100 }, {});
    expect(result.bestPct).toBeNull();
    expect(result.worstPct).toBeNull();
    expect(result.bestAbs).toBeNull();
    expect(result.worstAbs).toBeNull();
  });

  it('returns only best (no worst) when a single class has a previous value', () => {
    const result = computeAssetClassPerformers({ equity: 110 }, { equity: 100 });
    expect(result.bestPct?.deltaPct).toBeCloseTo(10);
    expect(result.worstPct).toBeNull();
    expect(result.bestAbs?.deltaAbs).toBe(10);
    expect(result.worstAbs).toBeNull();
  });

  it('excludes classes with zero previous value', () => {
    const current = { equity: 110, bonds: 50 };
    const previous = { equity: 100, bonds: 0 }; // bonds has no base
    const result = computeAssetClassPerformers(current, previous);
    expect(result.bestPct?.name).toBe('Azioni');
    expect(result.worstPct).toBeNull();
  });
});

// ─── generateEmailHtml ────────────────────────────────────────────────────────

describe('generateEmailHtml', () => {
  it('contains Italian month name for monthly', () => {
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('Marzo 2025');
  });

  it('contains positive delta arrow ▲', () => {
    expect(generateEmailHtml(makeMonthlyData())).toContain('▲');
  });

  it('contains negative delta arrow ▼ for loss', () => {
    const html = generateEmailHtml(makeMonthlyData({ netWorthDelta: -3000, netWorthDeltaPct: -2 }));
    expect(html).toContain('▼');
  });

  it('shows top expense categories', () => {
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('Alimentari');
    expect(html).toContain('Trasporti');
  });

  it('shows dividend section when dividendCount > 0', () => {
    expect(generateEmailHtml(makeMonthlyData())).toContain('Dividendi');
  });

  it('omits dividend section when dividendCount === 0', () => {
    const html = generateEmailHtml(makeMonthlyData({ dividendCount: 0, dividendTotal: 0 }));
    expect(html).not.toContain('Dividendi');
  });

  it('handles zero expenses (no expense categories section)', () => {
    const html = generateEmailHtml(
      makeMonthlyData({ totalExpenses: 0, topExpenseCategories: [] })
    );
    expect(html).not.toContain('Spese per Categoria');
  });

  it('shows expense category % of total', () => {
    // Alimentari 800/2000 = 40%, Trasporti 600/2000 = 30%
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('40.0%');
    expect(html).toContain('30.0%');
  });

  it('shows income categories section when allIncomeCategories is populated', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        allIncomeCategories: [
          { name: 'Stipendio', amount: 3000 },
          { name: 'Freelance', amount: 500 },
        ],
      })
    );
    expect(html).toContain('Entrate per Categoria');
    expect(html).toContain('Stipendio');
    expect(html).toContain('Freelance');
    // 3000/3500 ≈ 85.7%
    expect(html).toContain('85.7%');
  });

  it('omits income categories section when allIncomeCategories is empty', () => {
    const html = generateEmailHtml(makeMonthlyData({ allIncomeCategories: [] }));
    expect(html).not.toContain('Entrate per Categoria');
  });

  it('shows % allocation column', () => {
    // equity = 90000 / 150000 * 100 = 60%
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('60.0%');
  });

  it('shows performers section when best and worst differ', () => {
    const entry = { name: 'Azioni', deltaPct: 10, deltaAbs: 10000 };
    const entryWorst = { name: 'Obbligazioni', deltaPct: -5, deltaAbs: -2000 };
    const html = generateEmailHtml(
      makeMonthlyData({
        assetClassPerformers: {
          bestPct: entry,
          worstPct: entryWorst,
          bestAbs: entry,
          worstAbs: entryWorst,
        },
      })
    );
    expect(html).toContain('Migliore');
    expect(html).toContain('Peggiore');
    expect(html).toContain('Azioni');
    expect(html).toContain('Obbligazioni');
  });

  it('omits performers section when both are null', () => {
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).not.toContain('Performance Asset Class');
  });

  it('shows savings rate in cashflow', () => {
    // saved = 3500 - 2000 = 1500; rate = 1500/3500 * 100 ≈ 42.9%
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('42.9%');
  });

  it('shows top 5 individual expenses when present', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        topIndividualExpenses: [
          { description: 'Affitto', categoryName: 'Casa', amount: 1200 },
          { description: 'Spesa settimanale', categoryName: 'Alimentari', amount: 250 },
        ],
      })
    );
    expect(html).toContain('Top 5 Spese del Mese');
    expect(html).toContain('Affitto');
    expect(html).toContain('Spesa settimanale');
  });

  it('uses quarterly label for quarterly period type', () => {
    const html = generateEmailHtml(
      makeMonthlyData({ periodType: 'quarterly', quarter: 1, month: 3, year: 2026 })
    );
    expect(html).toContain('Q1 2026');
    expect(html).toContain('Cashflow del Trimestre');
  });

  it('uses yearly label for yearly period type', () => {
    const html = generateEmailHtml(
      makeMonthlyData({ periodType: 'yearly', month: 12, year: 2025 })
    );
    expect(html).toContain('Anno 2025');
    expect(html).toContain("Cashflow dell'Anno");
  });
});

// ─── buildMonthlyEmailData ────────────────────────────────────────────────────

describe('buildMonthlyEmailData', () => {
  beforeEach(() => {
    Object.keys(collectionMocks).forEach((k) => delete collectionMocks[k]);
  });

  it('returns null when no current snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = { empty: true, docs: [] };
    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result).toBeNull();
  });

  it('returns aggregated data when snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [
        {
          data: () => ({
            totalNetWorth: 150000,
            liquidNetWorth: 30000,
            byAssetClass: { equity: 120000, cash: 30000 },
          }),
        },
      ],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result).not.toBeNull();
    expect(result!.currentNetWorth).toBe(150000);
    expect(result!.liquidNetWorth).toBe(30000);
    expect(result!.periodType).toBe('monthly');
  });

  it('sums income and expense amounts correctly', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = {
      docs: [
        { data: () => ({ amount: 3000, categoryName: 'Stipendio', categoryId: 'cat1' }) },
        { data: () => ({ amount: -500, categoryName: 'Alimentari', categoryId: 'cat2' }) },
        { data: () => ({ amount: -300, categoryName: 'Trasporti', categoryId: 'cat3' }) },
      ],
    };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.totalIncome).toBe(3000);
    expect(result!.totalExpenses).toBe(800);
    expect(result!.topExpenseCategories).toHaveLength(2);
    expect(result!.topExpenseCategories[0].name).toBe('Alimentari');
    expect(result!.allIncomeCategories).toHaveLength(1);
    expect(result!.allIncomeCategories[0].name).toBe('Stipendio');
  });

  it('collects top individual expense transactions', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = {
      docs: [
        { data: () => ({ amount: -1200, categoryName: 'Casa', notes: 'Affitto' }) },
        { data: () => ({ amount: -250, categoryName: 'Alimentari', notes: '' }) },
        { data: () => ({ amount: -80, categoryName: 'Trasporti', notes: 'Benzina' }) },
      ],
    };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.topIndividualExpenses).toHaveLength(3);
    // Sorted by amount descending
    expect(result!.topIndividualExpenses[0].amount).toBe(1200);
    expect(result!.topIndividualExpenses[0].description).toBe('Affitto');
  });

  it('sums dividend grossAmountEur', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = {
      docs: [
        { data: () => ({ grossAmountEur: 200 }) },
        { data: () => ({ grossAmountEur: 150 }) },
      ],
    };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.dividendTotal).toBeCloseTo(350);
    expect(result!.dividendCount).toBe(2);
  });

  it('uses grossAmount when grossAmountEur is absent', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = {
      docs: [{ data: () => ({ grossAmount: 100 }) }],
    };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.dividendTotal).toBe(100);
  });
});

// ─── buildPeriodEmailData — quarterly ────────────────────────────────────────

describe('buildPeriodEmailData (quarterly)', () => {
  beforeEach(() => {
    Object.keys(collectionMocks).forEach((k) => delete collectionMocks[k]);
  });

  it('returns null when no end-of-quarter snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = { empty: true, docs: [] };
    const result = await buildPeriodEmailData('user-1', 2026, 3, 'quarterly');
    expect(result).toBeNull();
  });

  it('returns quarterly data with correct periodType and quarter', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [
        {
          data: () => ({
            totalNetWorth: 200000,
            liquidNetWorth: 50000,
            byAssetClass: { equity: 150000, cash: 50000 },
          }),
        },
      ],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildPeriodEmailData('user-1', 2026, 3, 'quarterly');
    expect(result).not.toBeNull();
    expect(result!.periodType).toBe('quarterly');
    expect(result!.quarter).toBe(1);
  });

  it('aggregates dividends across the full quarter', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = {
      docs: [
        { data: () => ({ grossAmountEur: 300 }) },
        { data: () => ({ grossAmountEur: 200 }) },
      ],
    };

    const result = await buildPeriodEmailData('user-1', 2026, 3, 'quarterly');
    expect(result!.dividendTotal).toBe(500);
    expect(result!.dividendCount).toBe(2);
  });
});

// ─── buildPeriodEmailData — yearly ───────────────────────────────────────────

describe('buildPeriodEmailData (yearly)', () => {
  beforeEach(() => {
    Object.keys(collectionMocks).forEach((k) => delete collectionMocks[k]);
  });

  it('returns null when no December snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = { empty: true, docs: [] };
    const result = await buildPeriodEmailData('user-1', 2025, 12, 'yearly');
    expect(result).toBeNull();
  });

  it('returns yearly data with correct periodType', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [
        {
          data: () => ({
            totalNetWorth: 300000,
            liquidNetWorth: 80000,
            byAssetClass: { equity: 220000, cash: 80000 },
          }),
        },
      ],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildPeriodEmailData('user-1', 2025, 12, 'yearly');
    expect(result).not.toBeNull();
    expect(result!.periodType).toBe('yearly');
    expect(result!.month).toBe(12);
    expect(result!.quarter).toBeUndefined();
  });
});

// ─── sendMonthlyEmail ─────────────────────────────────────────────────────────

describe('sendMonthlyEmail', () => {
  beforeEach(() => {
    resendSendMock.mockResolvedValue({ data: {}, error: null });
  });

  it('calls Resend with correct subject and recipients (monthly)', async () => {
    await sendMonthlyEmail(['a@b.com', 'c@d.com'], makeMonthlyData({ year: 2025, month: 4 }));
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@b.com', 'c@d.com'],
        subject: expect.stringContaining('Aprile 2025'),
      })
    );
  });

  it('uses "Riepilogo Trimestrale" subject for quarterly', async () => {
    await sendMonthlyEmail(
      ['a@b.com'],
      makeMonthlyData({ periodType: 'quarterly', quarter: 1, month: 3, year: 2026 })
    );
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Riepilogo Trimestrale'),
      })
    );
  });

  it('uses "Riepilogo Annuale" subject for yearly', async () => {
    await sendMonthlyEmail(
      ['a@b.com'],
      makeMonthlyData({ periodType: 'yearly', month: 12, year: 2025 })
    );
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Riepilogo Annuale'),
      })
    );
  });

  it('throws when Resend returns an error', async () => {
    resendSendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    await expect(sendMonthlyEmail(['a@b.com'], makeMonthlyData())).rejects.toThrow('Resend error');
  });
});
