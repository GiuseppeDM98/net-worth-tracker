import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PRINT_COLORS } from '@/lib/constants/printTokens';

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

// Snapshot returned by adminDb.collection('budgets').doc(uid).get() — mock-prefixed
// so it can be referenced inside the hoisted vi.mock factory. Default: no budget doc.
let mockBudgetDoc: { exists: boolean; data?: () => any } = { exists: false };

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
      doc: () => ({ get: () => Promise.resolve(mockBudgetDoc) }),
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
  buildEmailAiPrompt,
  resolveEmailPeriodRange,
  isLastDayOfMonthItaly,
  isLastDayOfQuarterItaly,
  isLastDayOfHalfYearItaly,
  isLastDayOfYearItaly,
  monthToQuarter,
  monthToSemester,
  getQuarterStartMonth,
  getSemesterStartMonth,
  getPreviousQuarterEnd,
  getPreviousHalfEnd,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedHalfYearEnd,
  getMostRecentCompletedYearEnd,
  computeAssetClassPerformers,
  aggregateExpenses,
  buildMonthlyEmailData,
  buildPeriodEmailData,
  generateEmailHtml,
  sendMonthlyEmail,
  type MonthlyEmailData,
} from '@/lib/server/monthlyEmailService';
import { MAX_CATEGORY_DELTAS, type PeriodComparison } from '@/lib/server/emailPeriodComparison';
import type { AssistantMemoryItem, AssistantMonthContextBundle, AssistantPreferences } from '@/types/assistant';
import type { MonthlySnapshot } from '@/types/assets';
import type { BudgetAlert } from '@/types/budget';

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
      { key: 'cat-alimentari', name: 'Alimentari', amount: 800 },
      { key: 'cat-trasporti', name: 'Trasporti', amount: 600 },
    ],
    allIncomeCategories: [],
    topIndividualExpenses: [],
    topIndividualIncome: [],
    expensesByType: [],
    dividendTotal: 450,
    dividendCount: 3,
    ...overrides,
  };
}

function makePreferences(overrides: Partial<AssistantPreferences> = {}): AssistantPreferences {
  return {
    responseStyle: 'balanced',
    includeMacroContext: false,
    memoryEnabled: false,
    includeDummySnapshots: false,
    ...overrides,
  };
}

/** A bundle shaped like the one the range builder produces for a completed quarter. */
function makeBundle(overrides: Partial<AssistantMonthContextBundle> = {}): AssistantMonthContextBundle {
  return {
    selector: { year: 2026, month: 9 },
    currentSnapshot: {
      userId: 'user-1',
      year: 2026,
      month: 9,
      totalNetWorth: 200000,
      liquidNetWorth: 50000,
      byAssetClass: { equity: 120000, bonds: 60000, cash: 20000 },
      byAsset: [],
    } as unknown as MonthlySnapshot,
    previousSnapshot: null,
    cashflow: {
      totalIncome: 9000,
      totalExpenses: -7000,
      totalDividends: 0,
      netCashFlow: 2000,
      transactionCount: 12,
      expenseTransactionCount: 9,
    },
    netWorth: { start: 188000, end: 200000, delta: 12000, deltaPct: 6.38 },
    allocationChanges: [],
    expensesByCategory: [
      {
        categoryName: 'Casa',
        total: -4000,
        transactionCount: 3,
        subCategories: [{ subCategoryName: 'Affitto', total: -3000, transactionCount: 1 }],
      },
      { categoryName: 'Cibo', total: -3000, transactionCount: 6, subCategories: [] },
    ],
    incomeByCategory: [{ categoryName: 'Stipendio', total: 9000, transactionCount: 3 }],
    expensesByType: [{ type: 'fixed', label: 'Spese Fisse', total: -7000 }],
    topIndividualExpenses: [
      { categoryName: 'Casa', subCategoryName: 'Affitto', amount: -1000, date: '2026-07-03' },
    ],
    bySubCategoryAllocation: {},
    targetAllocation: null,
    targetAllocationSource: 'manual',
    goals: null,
    expenseCategories: [{ name: 'Casa', type: 'fixed', subCategories: ['Affitto'] }],
    dataQuality: {
      hasSnapshot: true,
      hasPreviousBaseline: true,
      hasCashflowData: true,
      isPartialMonth: false,
      notes: ['Finestra di analisi: Q3 2026 (Luglio-Settembre 2026), 3 mesi.'],
    },
    ...overrides,
  };
}

function makeComparison(overrides: Partial<PeriodComparison> = {}): PeriodComparison {
  return {
    previousEqualsYoy: false,
    vsPrevious: {
      baselineLabel: 'Q2 2026',
      netWorth: { absChange: 12000, pctChange: 6.4 },
      income: { absChange: 500, pctChange: 5.9 },
      expenses: { absChange: 300, pctChange: 4.5 },
      savings: { absChange: 200, pctChange: 11.1 },
    },
    vsYoy: {
      baselineLabel: 'Q3 2025',
      netWorth: { absChange: 30000, pctChange: 17.6 },
      income: null,
      expenses: { absChange: -400, pctChange: -5.4 },
      savings: null,
    },
    categoryDeltas: [
      {
        name: 'Casa',
        current: 4000,
        vsPrevious: { absChange: 200, pctChange: 5.3 },
        vsYoy: { absChange: 100, pctChange: 2.6 },
      },
    ],
    ...overrides,
  };
}

const BUDGET_ALERT: BudgetAlert = {
  key: 'cat-cibo',
  label: 'Cibo',
  level: 'exceeded',
  threshold: 100,
  spent: 620,
  budgetAmount: 500,
  usedRatio: 1.24,
  forecastedOverrun: true,
  thresholdCrossed: true,
  crossedOn: null,
};

// ─── buildEmailAiPrompt ───────────────────────────────────────────────────────

describe('buildEmailAiPrompt', () => {
  it('carries the exhaustive bundle blocks the in-app assistant gets', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    // Every guardrail in ASSISTANT_SYSTEM_CORE that promises an exhaustive block is only
    // true if these sections are actually in the message.
    expect(userContent).toContain('--- SPESE PER CATEGORIA E SOTTOCATEGORIA');
    expect(userContent).toContain('--- ENTRATE PER CATEGORIA');
    expect(userContent).toContain('--- ALLOCAZIONE CORRENTE');
    expect(userContent).toContain('--- CATEGORIE DI SPESA CONFIGURATE ---');
    expect(userContent).toContain('--- OBIETTIVI DI INVESTIMENTO');
    expect(userContent).toContain('--- NOTE QUALITÀ DATI ---');
    // Sub-category rows travel with their parent category.
    expect(userContent).toContain('Affitto');
  });

  it('labels the data block with the email period, not with the closing month', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ periodType: 'quarterly', quarter: 3, month: 9, year: 2026 }),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('=== DATI FINANZIARI: Q3 2026 ===');
    expect(userContent).not.toContain('=== DATI FINANZIARI: Settembre 2026 ===');
  });

  it('states the market effect as a computed figure, not something to estimate', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      // delta 12.000 − risparmio netto 2.000 = 10.000
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- EFFETTO MERCATO (calcolato) ---');
    expect(userContent).toMatch(/Variazione di mercato\/valutativa[^\n]*\+10\.000/);
    expect(userContent).toContain('non ricalcolarla');
  });

  it('says the market effect is not computable when the window has no starting snapshot', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      makeBundle({ netWorth: { start: null, end: 200000, delta: null, deltaPct: null } }),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- EFFETTO MERCATO (calcolato) ---');
    expect(userContent).toMatch(/Non calcolabile/);
  });

  it('declares the category-delta cap in the text the model reads', () => {
    const categoryDeltas = Array.from({ length: MAX_CATEGORY_DELTAS }, (_, i) => ({
      name: `Categoria ${i}`,
      current: 100 - i,
      vsPrevious: null,
      vsYoy: null,
    }));
    const topExpenseCategories = Array.from({ length: MAX_CATEGORY_DELTAS + 3 }, (_, i) => ({
      key: `cat-${i}`,
      name: `Categoria ${i}`,
      amount: 100 - i,
    }));

    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ topExpenseCategories }),
      makeComparison({ categoryDeltas }),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain(`--- VARIAZIONE SPESE PER CATEGORIA (le prime ${MAX_CATEGORY_DELTAS}`);
    // The omission is stated, with its size: a silent cap is what this replaces.
    expect(userContent).toContain('3 categorie');
    expect(userContent).toContain('omesse');
  });

  it('does not claim an omission when every category fits under the cap', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ topExpenseCategories: [{ key: 'cat-casa', name: 'Casa', amount: 4000 }] }),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).not.toContain('omesse');
  });

  it('includes the budget alerts for a monthly email', () => {
    // A warning row alongside the exceeded one: the projection note belongs to the former
    // only — on an already-exceeded budget "sforamento previsto" says nothing.
    const warning: BudgetAlert = {
      key: 'cat-casa',
      label: 'Casa',
      level: 'warning',
      threshold: 90,
      spent: 460,
      budgetAmount: 500,
      usedRatio: 0.92,
      forecastedOverrun: true,
      thresholdCrossed: true,
      crossedOn: null,
    };
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ budgetAlerts: [BUDGET_ALERT, warning] }),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- AVVISI BUDGET DEL MESE ---');
    expect(userContent).toContain('Cibo');
    expect(userContent).toContain('124%');
    expect(userContent).toContain('budget superato');
    expect(userContent).toContain('sforamento previsto');
  });

  it('omits the budget alerts on a non-monthly period even if some are attached', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ periodType: 'quarterly', quarter: 3, month: 9, budgetAlerts: [BUDGET_ALERT] }),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).not.toContain('AVVISI BUDGET');
  });

  it('omits the YoY block when it coincides with the previous period', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({ periodType: 'yearly', month: 12, year: 2025 }),
      makeComparison({ previousEqualsYoy: true }),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- CONFRONTO COL PERIODO PRECEDENTE');
    expect(userContent).not.toContain("ANNO PRECEDENTE");
  });

  it('renders both comparison axes when they differ', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- CONFRONTO COL PERIODO PRECEDENTE (Q2 2026) ---');
    expect(userContent).toContain('Q3 2025');
  });

  it('reports the Hall of Fame standing when the period has one', () => {
    const { userContent } = buildEmailAiPrompt(
      makeMonthlyData({
        hallOfFameRank: { rank: 2, total: 14, trend: 'growth', scope: 'month' },
      }),
      makeComparison(),
      makeBundle(),
      makePreferences(),
      []
    );

    expect(userContent).toContain('--- HALL OF FAME ---');
    expect(userContent).toContain('2°');
  });

  it('injects memory only when the preference allows it', () => {
    const items: AssistantMemoryItem[] = [
      {
        id: 'm1',
        userId: 'user-1',
        category: 'goal',
        text: 'Vuole comprare casa entro il 2032',
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
      },
    ];

    const withMemory = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      makeBundle(),
      makePreferences({ memoryEnabled: true }),
      items
    ).userContent;
    const withoutMemory = buildEmailAiPrompt(
      makeMonthlyData(),
      makeComparison(),
      makeBundle(),
      makePreferences({ memoryEnabled: false }),
      items
    ).userContent;

    expect(withMemory).toContain('comprare casa');
    expect(withoutMemory).not.toContain('comprare casa');
  });

  it('scales the word ceiling with the period and states the new patrimony section', () => {
    const cases: Array<[MonthlyEmailData['periodType'], number]> = [
      ['monthly', 500],
      ['quarterly', 700],
      ['semiannual', 700],
      ['yearly', 900],
    ];

    for (const [periodType, words] of cases) {
      const { system } = buildEmailAiPrompt(
        makeMonthlyData({ periodType, month: periodType === 'monthly' ? 3 : 12 }),
        makeComparison(),
        makeBundle(),
        makePreferences(),
        []
      );
      expect(system).toContain(`massimo ${words} parole`);
      expect(system).toContain('Patrimonio e investimenti');
    }
  });

  it('keeps the system block free of per-request data', () => {
    const a = buildEmailAiPrompt(
      makeMonthlyData({ currentNetWorth: 1 }),
      makeComparison(),
      makeBundle(),
      makePreferences({ responseStyle: 'concise' }),
      []
    ).system;
    const b = buildEmailAiPrompt(
      makeMonthlyData({ currentNetWorth: 999999, year: 2019, month: 11 }),
      makeComparison({ previousEqualsYoy: true }),
      makeBundle({ netWorth: { start: null, end: null, delta: null, deltaPct: null } }),
      makePreferences({ responseStyle: 'deep', memoryEnabled: true }),
      []
    ).system;

    // Same period type → byte-identical system, so the prefix never varies per user.
    expect(a).toBe(b);
  });
});

// ─── resolveEmailPeriodRange ──────────────────────────────────────────────────

describe('resolveEmailPeriodRange', () => {
  it('maps each period type onto the months the email figures already cover', () => {
    expect(resolveEmailPeriodRange(makeMonthlyData({ year: 2026, month: 7 }))).toEqual({
      year: 2026,
      startMonth: 7,
      endMonth: 7,
      label: 'Luglio 2026',
    });
    expect(
      resolveEmailPeriodRange(makeMonthlyData({ periodType: 'quarterly', quarter: 3, year: 2026, month: 9 }))
    ).toEqual({ year: 2026, startMonth: 7, endMonth: 9, label: 'Q3 2026' });
    expect(
      resolveEmailPeriodRange(makeMonthlyData({ periodType: 'semiannual', semester: 2, year: 2026, month: 12 }))
    ).toEqual({ year: 2026, startMonth: 7, endMonth: 12, label: '2° Semestre 2026' });
    expect(
      resolveEmailPeriodRange(makeMonthlyData({ periodType: 'yearly', year: 2025, month: 12 }))
    ).toEqual({ year: 2025, startMonth: 1, endMonth: 12, label: 'Anno 2025' });
  });
});

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

// ─── Semi-annual period helpers ──────────────────────────────────────────────

describe('isLastDayOfHalfYearItaly', () => {
  it('returns true on June 30 (end of H1)', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-06-30T10:00:00Z'))).toBe(true);
  });

  it('returns true on December 31 (end of H2)', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-12-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on June 29', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-06-29T10:00:00Z'))).toBe(false);
  });

  it('returns false on March 31 (quarter end, not half-year end)', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-03-31T10:00:00Z'))).toBe(false);
  });

  it('returns false on September 30 (quarter end, not half-year end)', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-09-30T10:00:00Z'))).toBe(false);
  });

  it('returns false on July 31 (last day of month but not half-year)', () => {
    expect(isLastDayOfHalfYearItaly(new Date('2026-07-31T10:00:00Z'))).toBe(false);
  });
});

describe('monthToSemester', () => {
  it('maps June (6) to H1', () => {
    expect(monthToSemester(6)).toBe(1);
  });
  it('maps December (12) to H2', () => {
    expect(monthToSemester(12)).toBe(2);
  });
});

describe('getSemesterStartMonth', () => {
  it('H1 (end month 6) starts in January (1)', () => {
    expect(getSemesterStartMonth(6)).toBe(1);
  });
  it('H2 (end month 12) starts in July (7)', () => {
    expect(getSemesterStartMonth(12)).toBe(7);
  });
});

describe('getPreviousHalfEnd', () => {
  it('H1 (June) → H2 of the previous year (December)', () => {
    expect(getPreviousHalfEnd(2026, 6)).toEqual({ year: 2025, month: 12 });
  });
  it('H2 (December) → H1 of the same year (June)', () => {
    expect(getPreviousHalfEnd(2026, 12)).toEqual({ year: 2026, month: 6 });
  });
});

describe('getMostRecentCompletedHalfYearEnd', () => {
  it('July 1 2026 → June 2026 (H1 completed)', () => {
    expect(getMostRecentCompletedHalfYearEnd(new Date('2026-07-01T10:00:00Z'))).toEqual({
      year: 2026,
      month: 6,
    });
  });
  it('February 2 2026 → December 2025 (H2 previous year)', () => {
    expect(getMostRecentCompletedHalfYearEnd(new Date('2026-02-02T10:00:00Z'))).toEqual({
      year: 2025,
      month: 12,
    });
  });
  // Consistent with getMostRecentCompletedQuarterEnd: a period counts as completed once the
  // current Italy time is past midnight of its last day (so on June 30 daytime, H1 is complete).
  it('June 30 2026 daytime → June 2026 (H1 just completed)', () => {
    expect(getMostRecentCompletedHalfYearEnd(new Date('2026-06-30T10:00:00Z'))).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it('June 15 2026 → December 2025 (H1 still in progress)', () => {
    expect(getMostRecentCompletedHalfYearEnd(new Date('2026-06-15T10:00:00Z'))).toEqual({
      year: 2025,
      month: 12,
    });
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

// ─── aggregateExpenses ────────────────────────────────────────────────────────

// Minimal QueryDocumentSnapshot stub — aggregateExpenses only reads doc.data().
function makeExpenseDoc(data: Record<string, unknown>) {
  return { data: () => data } as unknown as FirebaseFirestore.QueryDocumentSnapshot;
}

describe('aggregateExpenses', () => {
  it('classifies by type, not by amount sign, so a positive-amount refund still counts as expense', () => {
    // A refund booked inside an expense category: expense type but POSITIVE amount.
    // It must land in totalExpenses (matching the in-app Cashflow total), NOT in income.
    const docs = [
      makeExpenseDoc({ amount: -100, type: 'variable', categoryName: 'Alimentari' }),
      makeExpenseDoc({ amount: 76, type: 'variable', categoryName: 'Alimentari' }), // refund
      makeExpenseDoc({ amount: 2000, type: 'income', categoryName: 'Stipendio' }),
    ];

    const { totalIncome, totalExpenses } = aggregateExpenses(docs);

    expect(totalExpenses).toBe(176); // 100 + 76 (refund counted as spending via Math.abs)
    expect(totalIncome).toBe(2000); // refund must NOT inflate income
  });

  it('skips transfers on both signs', () => {
    const docs = [
      makeExpenseDoc({ amount: 500, type: 'transfer', categoryName: 'Giroconto' }),
      makeExpenseDoc({ amount: -500, type: 'transfer', categoryName: 'Giroconto' }),
      makeExpenseDoc({ amount: -50, type: 'fixed', categoryName: 'Affitto' }),
    ];

    const { totalIncome, totalExpenses } = aggregateExpenses(docs);

    expect(totalIncome).toBe(0);
    expect(totalExpenses).toBe(50);
  });
});

// ─── generateEmailHtml ────────────────────────────────────────────────────────

describe('generateEmailHtml', () => {
  it('opens on the verdict, not on a number', () => {
    // The fixture grew by 5.000 € while saving 1.500 €, so the residual is +3.500 €: the
    // market moved it, and the headline is allowed to say so.
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('Marzo è cresciuto: il mercato ha spinto');
    expect(html).toContain('Marzo 2025');
  });

  it('puts the verdict in the inbox preview, so the reader knows before opening', () => {
    const html = generateEmailHtml(makeMonthlyData());
    const preheader = html.slice(html.indexOf('<div style="display:none'), html.indexOf('</div>'));
    expect(preheader).toContain('Marzo è cresciuto');
  });

  it('never blames the market when the market did not lose', () => {
    // Δ −3.000 € with +1.500 € saved ⇒ the residual is −4.500 €: the market did lose.
    expect(generateEmailHtml(makeMonthlyData({ netWorthDelta: -3000, netWorthDeltaPct: -2 }))).toContain(
      'Marzo è in calo: il mercato ha pesato',
    );
    // The same fall with 5.000 € overspent leaves a POSITIVE residual (−3.000 − (−5.000) =
    // +2.000): the market gained and the flows are what pulled the total down.
    expect(
      generateEmailHtml(makeMonthlyData({ netWorthDelta: -3000, netWorthDeltaPct: -2, totalExpenses: 8500 })),
    ).toContain('nonostante il mercato');
  });

  it('carries no arrow glyphs: the sign is the colour and the sign of the figure', () => {
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).not.toContain('▲');
    expect(html).not.toContain('▼');
  });

  it('shows the expense categories with it-IT percentages', () => {
    // Alimentari 800/2000 = 40%, Trasporti 600/2000 = 30% — commas, never dots (The Comma Rule).
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('Alimentari');
    expect(html).toContain('Trasporti');
    expect(html).toContain('40,0%');
    expect(html).toContain('30,0%');
    expect(html).not.toContain('40.0%');
  });

  it('closes a long category list on a residual row, so the shares reach 100%', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        totalExpenses: 2000,
        topExpenseCategories: Array.from({ length: 9 }, (_, index) => ({
          key: `cat-${index}`,
          name: `Categoria ${index}`,
          amount: 400 - index * 40,
        })),
      }),
    );
    expect(html).toContain('Altre 3 categorie');
  });

  it('shows the composition with the app’s own class labels', () => {
    // equity = 90000 / 150000 = 60%. The label comes from ASSET_CLASS_LABELS, so the email
    // cannot call a class something no screen calls it.
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('Azioni');
    expect(html).toContain('60,0%');
  });

  it('names the class that moved, in percent and in euro, when they differ', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        assetClassPerformers: {
          bestPct: { name: 'Criptovalute', deltaPct: 10, deltaAbs: 900 },
          worstPct: { name: 'Obbligazioni', deltaPct: -5, deltaAbs: -2000 },
          bestAbs: { name: 'Azioni', deltaPct: 4, deltaAbs: 10000 },
          worstAbs: { name: 'Obbligazioni', deltaPct: -5, deltaAbs: -2000 },
        },
      }),
    );
    expect(html).toContain('Andamento per classe');
    expect(html).toContain('migliore in percentuale');
    expect(html).toContain('migliore in euro');
    expect(html).toContain('peggiore');
  });

  it('omits the class-move tile when nothing is attributable', () => {
    expect(generateEmailHtml(makeMonthlyData())).not.toContain('Andamento per classe');
  });

  it('states the savings rate and what net savings means', () => {
    // saved = 3500 − 2000 = 1500; rate = 1500/3500 ≈ 42,9%
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).toContain('42,9%');
    expect(html).toContain('Risparmio netto = entrate − uscite');
  });

  it('shows the income categories when there are any', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        allIncomeCategories: [
          { key: 'cat-stipendio', name: 'Stipendio', amount: 3000 },
          { key: 'cat-freelance', name: 'Freelance', amount: 500 },
        ],
      }),
    );
    expect(html).toContain('Entrate per categoria');
    expect(html).toContain('Stipendio');
    expect(html).toContain('85,7%');
  });

  it('omits the income tile when nothing came in by category', () => {
    expect(generateEmailHtml(makeMonthlyData({ allIncomeCategories: [] }))).not.toContain('Entrate per categoria');
  });

  it('omits the expense tile when there was no spending', () => {
    const html = generateEmailHtml(makeMonthlyData({ totalExpenses: 0, topExpenseCategories: [] }));
    expect(html).not.toContain('Spese per categoria');
  });

  it('shows the largest single expenses, with the note under the category', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        topIndividualExpenses: [
          { description: 'Affitto', categoryName: 'Casa', amount: 1200 },
          { description: 'Spesa settimanale', categoryName: 'Alimentari', amount: 250 },
        ],
      }),
    );
    expect(html).toContain('Spese maggiori');
    expect(html).toContain('Affitto');
    expect(html).toContain('Spesa settimanale');
  });

  it('shows the dividends tile only when something was received', () => {
    expect(generateEmailHtml(makeMonthlyData())).toContain('Dividendi e cedole');
    expect(generateEmailHtml(makeMonthlyData({ dividendCount: 0, dividendTotal: 0 }))).not.toContain(
      'Dividendi e cedole',
    );
  });

  it('speaks each period in its own words', () => {
    const quarterly = generateEmailHtml(makeMonthlyData({ periodType: 'quarterly', quarter: 1, month: 3, year: 2026 }));
    expect(quarterly).toContain('Q1 2026');
    expect(quarterly).toContain('Riepilogo trimestrale');
    expect(quarterly).toContain('Il primo trimestre');

    const yearly = generateEmailHtml(makeMonthlyData({ periodType: 'yearly', month: 12, year: 2025 }));
    expect(yearly).toContain('Anno 2025');
    expect(yearly).toContain('Riepilogo annuale');

    const semiannual = generateEmailHtml(makeMonthlyData({ periodType: 'semiannual', semester: 1, month: 6, year: 2026 }));
    expect(semiannual).toContain('1° Semestre 2026');
    expect(semiannual).toContain('Riepilogo semestrale');
  });

  it('renders the year-earlier tile when the two baselines are different windows', () => {
    const comparison: PeriodComparison = {
      previousEqualsYoy: false,
      vsPrevious: {
        baselineLabel: 'mese precedente',
        netWorth: { absChange: 5000, pctChange: 3.4 },
        income: { absChange: 500, pctChange: 16.7 },
        expenses: { absChange: 800, pctChange: 66.7 },
        savings: { absChange: -300, pctChange: -16.7 },
      },
      vsYoy: {
        baselineLabel: 'Marzo 2024',
        netWorth: { absChange: 20000, pctChange: 15.4 },
        income: null,
        expenses: { absChange: -200, pctChange: -9.1 },
        savings: null,
      },
      categoryDeltas: [],
    };
    const html = generateEmailHtml(makeMonthlyData(), comparison);
    expect(html).toContain('Rispetto a un anno fa');
    expect(html).toContain('Marzo 2024');
    // A metric without a baseline is unknowable, not zero.
    expect(html).toContain('N/D');
    expect(html).toContain('confronta due snapshot di fine periodo');
  });

  it('drops the year-earlier tile entirely when it would repeat the period tiles', () => {
    // On a yearly email the previous period IS the previous year (`previousEqualsYoy`), so
    // every figure in the tile is already printed by Patrimonio and Cashflow above it:
    // The One-Tile-One-Question Rule. The old «Confronti» table printed it anyway.
    const identical = {
      baselineLabel: '2024',
      netWorth: { absChange: 12000, pctChange: 9.1 },
      income: { absChange: 1000, pctChange: 2.5 },
      expenses: { absChange: 500, pctChange: 1.8 },
      savings: { absChange: 500, pctChange: 5.0 },
    };
    const html = generateEmailHtml(
      makeMonthlyData({ periodType: 'yearly', month: 12, year: 2025 }),
      { previousEqualsYoy: true, vsPrevious: identical, vsYoy: identical, categoryDeltas: [] } as PeriodComparison,
    );
    expect(html).not.toContain('Rispetto a un anno fa');
  });

  it('omits the year-earlier tile when no comparison was built', () => {
    expect(generateEmailHtml(makeMonthlyData())).not.toContain('Rispetto a un anno fa');
  });

  it('names the untyped residual so the type shares reach 100', () => {
    // 2.000 € of spending, of which only 1.500 € carries a type: the missing 500 € used to be
    // dropped from the table while still counting in the total.
    const html = generateEmailHtml(
      makeMonthlyData({
        totalExpenses: 2000,
        expensesByType: [
          { type: 'fixed', label: 'Spese Fisse', amount: 1000 },
          { type: 'variable', label: 'Spese Variabili', amount: 500 },
        ],
      }),
    );
    expect(html).toContain('Non classificate');
    expect(html).toContain('25,0%');
  });

  it('omits the untyped row when every expense carries a type', () => {
    const html = generateEmailHtml(
      makeMonthlyData({
        totalExpenses: 2000,
        expensesByType: [
          { type: 'fixed', label: 'Spese Fisse', amount: 1200 },
          { type: 'variable', label: 'Spese Variabili', amount: 800 },
        ],
      }),
    );
    expect(html).toContain('Spese Fisse');
    expect(html).not.toContain('Non classificate');
  });

  it('places the AI comment second — under the verdict, never in its place', () => {
    const html = generateEmailHtml(makeMonthlyData({ aiComment: 'Il mese chiude con un fenicottero.' }));
    const verdictAt = html.indexOf('Marzo è cresciuto');
    const commentAt = html.indexOf('Commento AI');
    const patrimonioAt = html.indexOf('>Patrimonio<');
    expect(verdictAt).toBeLessThan(commentAt);
    expect(commentAt).toBeLessThan(patrimonioAt);
  });

  it('still opens on a verdict when the AI comment is missing', () => {
    // Generation is non-blocking, so the comment can simply be absent — which is exactly why
    // the opening sentence cannot be the comment.
    const html = generateEmailHtml(makeMonthlyData());
    expect(html).not.toContain('Commento AI');
    expect(html).toContain('Marzo è cresciuto');
  });

  it('carries no colour that is not a token', () => {
    // Every hex in the message must come from `printTokens`; the slate ramp the email used to
    // run on (#0f172a, #64748b, #94a3b8, #16a34a, #dc2626) is gone.
    const html = generateEmailHtml(makeMonthlyData());
    for (const stale of ['#0f172a', '#64748b', '#94a3b8', '#16a34a', '#dc2626', '#f1f5f9', '#f8fafc']) {
      expect(html).not.toContain(stale);
    }
    expect(html).toContain(PRINT_COLORS.foreground);
    expect(html).toContain(PRINT_COLORS.positive);
  });
});

// ─── buildMonthlyEmailData ────────────────────────────────────────────────────

describe('buildMonthlyEmailData', () => {
  beforeEach(() => {
    Object.keys(collectionMocks).forEach((k) => delete collectionMocks[k]);
    mockBudgetDoc = { exists: false };
  });

  it('attaches budget alerts for an exceeded expense budget', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    // March 2025 has 31 days; the period-end forecast collapses to actuals.
    collectionMocks['expenses'] = {
      docs: [{ data: () => ({ amount: -600, categoryId: 'c1', categoryName: 'Spesa', date: new Date(2025, 2, 10) }) }],
    };
    collectionMocks['dividends'] = { docs: [] };
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', categoryId: 'c1', categoryName: 'Spesa', monthlyAmount: 400, order: 0 }],
        alertsEnabled: true,
      }),
    };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.budgetAlerts).toBeDefined();
    expect(result!.budgetAlerts!.some((a) => a.label === 'Spesa' && a.level === 'exceeded')).toBe(true);
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
        { data: () => ({ amount: 3000, type: 'income', categoryName: 'Stipendio', categoryId: 'cat1' }) },
        { data: () => ({ amount: -500, type: 'variable', categoryName: 'Alimentari', categoryId: 'cat2' }) },
        { data: () => ({ amount: -300, type: 'variable', categoryName: 'Trasporti', categoryId: 'cat3' }) },
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
