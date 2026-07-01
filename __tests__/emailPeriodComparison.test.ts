import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

// Hoisted Resend mock — monthlyEmailService (imported transitively) constructs `new Resend()`.
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

// Per-collection query results — filled per-test. Every query against a collection returns
// the same docs regardless of the where() filters, which is sufficient: for non-yearly periods
// the previous-period and YoY queries hit the same mock, so their deltas come out identical.
const collectionMocks: Record<string, any> = {};

function buildQueryMock(name: string) {
  const result = () => Promise.resolve(collectionMocks[name] ?? { empty: true, docs: [] });
  function chainNode(): any {
    return {
      where: () => chainNode(),
      limit: () => ({ get: vi.fn().mockImplementation(result) }),
      get: vi.fn().mockImplementation(result),
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

import { computeDelta, buildPeriodComparison } from '@/lib/server/emailPeriodComparison';
import type { MonthlyEmailData } from '@/lib/server/monthlyEmailService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEmailData(overrides: Partial<MonthlyEmailData> = {}): MonthlyEmailData {
  return {
    periodType: 'monthly',
    year: 2026,
    month: 3,
    currentNetWorth: 150000,
    previousNetWorth: 145000,
    netWorthDelta: 5000,
    netWorthDeltaPct: 3.45,
    liquidNetWorth: 30000,
    byAssetClass: {},
    previousByAssetClass: {},
    assetClassPerformers: { bestPct: null, worstPct: null, bestAbs: null, worstAbs: null },
    totalIncome: 3500,
    totalExpenses: 2000,
    topExpenseCategories: [
      { name: 'Alimentari', amount: 800 },
      { name: 'Trasporti', amount: 600 },
    ],
    allIncomeCategories: [],
    topIndividualExpenses: [],
    topIndividualIncome: [],
    expensesByType: [],
    dividendTotal: 0,
    dividendCount: 0,
    ...overrides,
  };
}

function snapshotDoc(totalNetWorth: number) {
  return { data: () => ({ totalNetWorth, isDummy: false }) };
}

// Classification is by `type` (mirrors the app), so fixtures must carry a realistic type.
function expenseDoc(amount: number, categoryName: string, categoryId: string, type: string) {
  return { data: () => ({ amount, categoryName, categoryId, type }) };
}

/** A baseline period with NW 145000 and three transactions (income 3000, two expenses). */
function seedBaselinePeriod() {
  collectionMocks['monthly-snapshots'] = { empty: false, docs: [snapshotDoc(145000)] };
  collectionMocks['expenses'] = {
    empty: false,
    docs: [
      expenseDoc(3000, 'Stipendio', 'inc1', 'income'),
      expenseDoc(-700, 'Alimentari', 'c1', 'variable'),
      expenseDoc(-500, 'Trasporti', 'c2', 'variable'),
    ],
  };
}

beforeEach(() => {
  for (const key of Object.keys(collectionMocks)) delete collectionMocks[key];
});

// ─── computeDelta ─────────────────────────────────────────────────────────────

describe('computeDelta', () => {
  it('computes absolute and percentage change against a positive base', () => {
    expect(computeDelta(150, 100)).toEqual({ absChange: 50, pctChange: 50 });
  });

  it('returns null pctChange when the baseline is zero', () => {
    expect(computeDelta(150, 0)).toEqual({ absChange: 150, pctChange: null });
  });

  it('uses the absolute value of the base for percentage (negative base)', () => {
    expect(computeDelta(-50, -100)).toEqual({ absChange: 50, pctChange: 50 });
  });

  it('returns null when the current value is null', () => {
    expect(computeDelta(null, 100)).toBeNull();
  });

  it('returns null when the baseline value is null', () => {
    expect(computeDelta(100, null)).toBeNull();
  });
});

// ─── buildPeriodComparison ────────────────────────────────────────────────────

describe('buildPeriodComparison', () => {
  it('computes net worth, income, expense and savings deltas vs the previous period', async () => {
    seedBaselinePeriod();
    const result = await buildPeriodComparison('user1', makeEmailData());

    expect(result.previousEqualsYoy).toBe(false);
    expect(result.vsPrevious.netWorth?.absChange).toBe(5000); // 150000 - 145000
    expect(result.vsPrevious.netWorth?.pctChange).toBeCloseTo(3.448, 2);
    expect(result.vsPrevious.income?.absChange).toBe(500); // 3500 - 3000
    expect(result.vsPrevious.expenses?.absChange).toBe(800); // 2000 - 1200
    expect(result.vsPrevious.savings?.absChange).toBe(-300); // 1500 - 1800
  });

  it('computes per-category expense deltas against the baseline', async () => {
    seedBaselinePeriod();
    const result = await buildPeriodComparison('user1', makeEmailData());

    const alimentari = result.categoryDeltas.find((c) => c.name === 'Alimentari');
    expect(alimentari?.current).toBe(800);
    expect(alimentari?.vsPrevious?.absChange).toBe(100); // 800 - 700
  });

  it('marks previousEqualsYoy for yearly periods and reuses the single baseline', async () => {
    seedBaselinePeriod();
    const result = await buildPeriodComparison(
      'user1',
      makeEmailData({ periodType: 'yearly', month: 12, year: 2026 })
    );

    expect(result.previousEqualsYoy).toBe(true);
    expect(result.vsPrevious.netWorth?.absChange).toBe(5000);
    // For yearly, the YoY axis mirrors the previous-period axis.
    expect(result.vsYoy.netWorth?.absChange).toBe(result.vsPrevious.netWorth?.absChange);
  });

  it('returns null cashflow deltas when the baseline period has no tracked transactions', async () => {
    // Snapshot present (net worth comparable) but no expense docs in the window.
    collectionMocks['monthly-snapshots'] = { empty: false, docs: [snapshotDoc(140000)] };
    collectionMocks['expenses'] = { empty: true, docs: [] };

    const result = await buildPeriodComparison('user1', makeEmailData());

    expect(result.vsPrevious.netWorth?.absChange).toBe(10000); // 150000 - 140000
    expect(result.vsPrevious.income).toBeNull();
    expect(result.vsPrevious.expenses).toBeNull();
    expect(result.vsPrevious.savings).toBeNull();
  });

  it('returns null net worth delta when the baseline snapshot is missing', async () => {
    collectionMocks['monthly-snapshots'] = { empty: true, docs: [] };
    collectionMocks['expenses'] = { empty: false, docs: [expenseDoc(-700, 'Alimentari', 'c1', 'variable')] };

    const result = await buildPeriodComparison('user1', makeEmailData());

    expect(result.vsPrevious.netWorth).toBeNull();
    // Cashflow is still comparable from the expense docs.
    expect(result.vsPrevious.expenses?.absChange).toBe(1300); // 2000 - 700
  });
});
