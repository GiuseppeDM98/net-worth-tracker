import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense } from '@/types/expenses';
import type { PDFDataContext, SectionSelection } from '@/types/pdf';

const authenticatedFetchMock = vi.fn();
const getAllExpensesMock = vi.fn();
const calculatePerformanceForPeriodMock = vi.fn();

vi.mock('@/lib/utils/authFetch', () => ({
  authenticatedFetch: authenticatedFetchMock,
}));

vi.mock('@/lib/services/assetAllocationService', () => ({
  compareAllocations: vi.fn(),
  getSettings: vi.fn(async () => ({ withdrawalRate: 4 })),
}));

vi.mock('@/lib/services/assetService', () => ({
  calculateAnnualPortfolioCost: vi.fn(() => 0),
  calculateAssetValue: vi.fn(() => 0),
  calculateFIRENetWorth: vi.fn(() => 0),
  calculateIlliquidNetWorth: vi.fn(() => 0),
  calculateLiquidNetWorth: vi.fn(() => 0),
  calculatePortfolioWeightedTER: vi.fn(() => 0),
  calculateTotalValue: vi.fn(() => 0),
  calculateUnrealizedGains: vi.fn(() => 0),
}));

vi.mock('@/lib/services/expenseService', () => ({
  calculateTotalExpenses: vi.fn((expenses: Expense[]) =>
    Math.abs(expenses.filter((expense) => expense.type !== 'income').reduce((sum, expense) => sum + expense.amount, 0))
  ),
  calculateTotalIncome: vi.fn((expenses: Expense[]) =>
    expenses.filter((expense) => expense.type === 'income').reduce((sum, expense) => sum + expense.amount, 0)
  ),
  getAllExpenses: getAllExpensesMock,
}));

vi.mock('@/lib/services/fireService', () => {
  const calculateFIREMetrics = (currentNetWorth: number, annualExpenses: number, withdrawalRate: number) => {
    const fireNumber = annualExpenses / (withdrawalRate / 100);
    return {
      fireNumber,
      progressToFI: (currentNetWorth / fireNumber) * 100,
      monthlyAllowance: (currentNetWorth * (withdrawalRate / 100)) / 12,
      dailyAllowance: (currentNetWorth * (withdrawalRate / 100)) / 365,
      currentWR: (annualExpenses / currentNetWorth) * 100,
      yearsOfExpenses: currentNetWorth / annualExpenses,
    };
  };

  return {
    calculateFIREMetrics,
    getAnnualExpenses: vi.fn(async () => 48000),
    getAnnualIncome: vi.fn(async () => 120000),
  };
});

vi.mock('@/lib/services/performanceService', () => ({
  calculatePerformanceForPeriod: calculatePerformanceForPeriodMock,
}));

vi.mock('@/lib/services/chartService', () => ({
  formatCurrency: vi.fn(),
  formatPercentage: vi.fn(),
}));

function makeExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-1',
    userId: 'u1',
    type: 'variable',
    categoryId: 'cat',
    categoryName: 'Casa',
    amount: -1000,
    currency: 'EUR',
    date: new Date(2025, 0, 10),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Expense;
}

describe('PDF household data', () => {
  beforeEach(() => {
    getAllExpensesMock.mockReset();
    calculatePerformanceForPeriodMock.mockReset();
    authenticatedFetchMock.mockReset();
    authenticatedFetchMock.mockResolvedValue({ ok: false, statusText: 'not mocked' });
  });

  it('derives FIRE expenses and income from the scoped expense set', async () => {
    const { prepareFireData } = await import('@/lib/services/pdfDataService');
    const scopedExpenses = [
      makeExpense({ id: 'income', type: 'income', amount: 30000 }),
      makeExpense({ id: 'rent', type: 'fixed', amount: -12000 }),
      makeExpense({ id: 'food', type: 'variable', amount: -6000 }),
    ];

    const result = await prepareFireData('u1', scopedExpenses, 100000);

    expect(result.annualExpenses).toBe(18000);
    expect(result.annualIncome).toBe(30000);
    expect(result.fireNumber).toBe(450000);
    expect(result.currentWithdrawalRate).toBe(18);
  });

  it('loads and scopes expenses for performance-only household exports', async () => {
    const { fetchPDFData } = await import('@/lib/services/pdfDataService');
    const sharedExpense = makeExpense({
      id: 'shared',
      amount: -1000,
      attributionProfileId: 'shared-50',
      attributionProfileName: 'Comune 50/50',
      attributionSplits: [
        { participantId: 'self', participantName: 'Io', percentage: 50 },
        { participantId: 'partner', participantName: 'Partner', percentage: 50 },
      ],
    });
    getAllExpensesMock.mockResolvedValue([sharedExpense]);
    calculatePerformanceForPeriodMock.mockResolvedValue({
      hasInsufficientData: false,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 1, 1),
      dividendEndDate: new Date(2026, 1, 1),
      numberOfMonths: 2,
      timePeriod: 'ALL',
      riskFreeRate: 4,
    });

    const context = {
      userId: 'u1',
      userName: 'Test User',
      generatedAt: new Date(),
      assets: [],
      snapshots: [
        {
          userId: 'u1',
          year: 2026,
          month: 1,
          totalNetWorth: 1000,
          liquidNetWorth: 1000,
          illiquidNetWorth: 0,
          byAssetClass: { cash: 1000 },
          byAsset: [],
          assetAllocation: { cash: 100 },
          createdAt: new Date(),
        },
        {
          userId: 'u1',
          year: 2026,
          month: 2,
          totalNetWorth: 1100,
          liquidNetWorth: 1100,
          illiquidNetWorth: 0,
          byAssetClass: { cash: 1100 },
          byAsset: [],
          assetAllocation: { cash: 100 },
          createdAt: new Date(),
        },
      ],
      allocationTargets: {} as PDFDataContext['allocationTargets'],
      householdConfig: {
        userId: 'u1',
        enabled: true,
        participants: [
          { id: 'self', name: 'Io', role: 'self', sortOrder: 0, active: true },
          { id: 'partner', name: 'Partner', role: 'partner', sortOrder: 1, active: true },
        ],
        profiles: [
          {
            id: 'self-100',
            name: 'Io 100%',
            type: 'personal',
            splits: [{ participantId: 'self', participantName: 'Io', percentage: 100 }],
            sortOrder: 0,
            active: true,
          },
          {
            id: 'shared-50',
            name: 'Comune 50/50',
            type: 'shared',
            splits: [
              { participantId: 'self', participantName: 'Io', percentage: 50 },
              { participantId: 'partner', participantName: 'Partner', percentage: 50 },
            ],
            sortOrder: 1,
            active: true,
          },
        ],
        attributionRules: [],
        defaultAssetProfileId: 'self-100',
        defaultExpenseProfileId: 'self-100',
        defaultIncomeProfileId: 'self-100',
      },
      householdScope: { kind: 'participant', id: 'self' },
      householdScopeLabel: 'Persona: Io',
    } satisfies PDFDataContext;
    const sections: SectionSelection = {
      portfolio: false,
      allocation: false,
      history: false,
      cashflow: false,
      performance: true,
      fire: false,
      summary: false,
    };

    await fetchPDFData('u1', context, sections, 'total');

    expect(getAllExpensesMock).toHaveBeenCalledWith('u1');
    expect(calculatePerformanceForPeriodMock).toHaveBeenCalledWith(
      'u1',
      context.snapshots,
      'ALL',
      2.5,
      undefined,
      undefined,
      [expect.objectContaining({ id: 'shared', amount: -500 })],
      undefined
    );
  });
});
