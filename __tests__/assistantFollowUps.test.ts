import { describe, expect, it } from 'vitest';
import { buildFollowUpSuggestions } from '@/lib/utils/assistantFollowUps';
import { AssistantMonthContextBundle } from '@/types/assistant';

function makeBundle(overrides?: Partial<AssistantMonthContextBundle>): AssistantMonthContextBundle {
  return {
    selector: { year: 2026, month: 3 },
    currentSnapshot: null,
    previousSnapshot: null,
    cashflow: {
      totalIncome: 0,
      totalExpenses: 0,
      totalDividends: 0,
      netCashFlow: 0,
      transactionCount: 0,
    },
    netWorth: { start: null, end: 120000, delta: null, deltaPct: null },
    allocationChanges: [],
    topExpensesByCategory: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {},
    targetAllocation: null,
    dataQuality: {
      hasSnapshot: true,
      hasPreviousBaseline: false,
      hasCashflowData: false,
      isPartialMonth: true,
      notes: [],
    },
    ...overrides,
  };
}

describe('buildFollowUpSuggestions', () => {
  it('should return curated continuations for a mode when no bundle is provided', () => {
    const result = buildFollowUpSuggestions('month_analysis', null);

    expect(result.length).toBeGreaterThan(0);
    expect(result.map((f) => f.id)).toContain('month-compare-prev');
    // Every chip carries a non-empty prompt the composer can submit.
    result.forEach((followUp) => expect(followUp.prompt.trim().length).toBeGreaterThan(0));
  });

  it('should never return more than three suggestions', () => {
    const bundle = makeBundle({
      dataQuality: {
        hasSnapshot: true,
        hasPreviousBaseline: true,
        hasCashflowData: true,
        isPartialMonth: false,
        notes: [],
      },
      cashflow: {
        totalIncome: 1000,
        totalExpenses: -3000,
        totalDividends: 0,
        netCashFlow: -2000,
        transactionCount: 5,
      },
    });

    const result = buildFollowUpSuggestions('month_analysis', bundle);

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('should lead with a negative-cashflow prompt when the period spent more than it earned', () => {
    const bundle = makeBundle({
      dataQuality: {
        hasSnapshot: true,
        hasPreviousBaseline: false,
        hasCashflowData: true,
        isPartialMonth: false,
        notes: [],
      },
      cashflow: {
        totalIncome: 1000,
        totalExpenses: -3000,
        totalDividends: 0,
        netCashFlow: -2000,
        transactionCount: 5,
      },
    });

    const result = buildFollowUpSuggestions('month_analysis', bundle);

    expect(result[0].id).toBe('ctx-negative-cashflow');
  });

  it('should lead with the asset class that moved the most in absolute terms', () => {
    const bundle = makeBundle({
      allocationChanges: [
        { assetClass: 'equity', previousValue: 50000, currentValue: 52000, absoluteChange: 2000, percentagePointsChange: 1 },
        { assetClass: 'bonds', previousValue: 20000, currentValue: 12000, absoluteChange: -8000, percentagePointsChange: -4 },
        { assetClass: 'cash', previousValue: 0, currentValue: 0, absoluteChange: 0, percentagePointsChange: 0 },
      ],
    });

    const result = buildFollowUpSuggestions('month_analysis', bundle);

    // bonds swung the most (|−8000| > |2000|); the zero-change class is ignored.
    expect(result[0].id).toBe('ctx-swing-bonds');
    expect(result[0].label).toContain('bonds');
  });

  it('should ignore allocation changes that are all zero', () => {
    const bundle = makeBundle({
      allocationChanges: [
        { assetClass: 'equity', previousValue: 50000, currentValue: 50000, absoluteChange: 0, percentagePointsChange: 0 },
      ],
    });

    const result = buildFollowUpSuggestions('month_analysis', bundle);

    expect(result.every((f) => !f.id.startsWith('ctx-swing-'))).toBe(true);
  });

  it('should de-duplicate by id', () => {
    const result = buildFollowUpSuggestions('chat', null);
    const ids = result.map((f) => f.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
