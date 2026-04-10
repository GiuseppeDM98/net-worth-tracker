import { describe, expect, it } from 'vitest';
import {
  buildGoalCompletionSuggestions,
  evaluateStructuredGoal,
  parseStructuredGoalFromText,
} from '@/lib/server/assistant/goalEvaluation';
import { AssistantMemoryItem, AssistantMonthContextBundle } from '@/types/assistant';

function makeBundle(overrides?: Partial<AssistantMonthContextBundle>): AssistantMonthContextBundle {
  return {
    selector: { year: 2026, month: 3 },
    currentSnapshot: {
      userId: 'user-1',
      year: 2026,
      month: 3,
      totalNetWorth: 120000,
      liquidNetWorth: 45000,
      illiquidNetWorth: 75000,
      byAssetClass: {
        cash: 45000,
        equity: 60000,
        bonds: 15000,
      },
      byAsset: [],
      assetAllocation: {
        cash: 37.5,
        equity: 50,
        bonds: 12.5,
      },
      createdAt: new Date(),
    },
    previousSnapshot: null,
    cashflow: {
      totalIncome: 0,
      totalExpenses: 0,
      totalDividends: 0,
      netCashFlow: 0,
      transactionCount: 0,
    },
    netWorth: {
      start: null,
      end: 120000,
      delta: null,
      deltaPct: null,
    },
    allocationChanges: [],
    topExpensesByCategory: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {
      equity: {
        'Azioni USA': 42000,
      },
    },
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

function makeGoal(overrides: Partial<AssistantMemoryItem> = {}): AssistantMemoryItem {
  return {
    id: 'goal-1',
    userId: 'user-1',
    category: 'goal',
    text: 'Portare la liquidità a 40k',
    structuredGoal: {
      kind: 'cash_target',
      targetValue: 40000,
      unit: 'eur',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
    ...overrides,
  };
}

describe('assistant goal evaluation', () => {
  it('parses goals with the number before the liquidity keyword', () => {
    const parsed = parseStructuredGoalFromText('Raggiungere 10.000€ di liquidità');
    expect(parsed).toEqual({
      kind: 'cash_target',
      targetValue: 10000,
      unit: 'eur',
    });
  });

  it('parses patrimony-liquid goals separately from cash goals', () => {
    const parsed = parseStructuredGoalFromText('Raggiungere 50k di patrimonio liquido');
    expect(parsed).toEqual({
      kind: 'liquid_net_worth_target',
      targetValue: 50000,
      unit: 'eur',
    });
  });

  it('parses natural-language equity goals with invested wording', () => {
    const parsed = parseStructuredGoalFromText(
      'Raggiungere 100k investiti in azioni in generale (non in singolo strumento)'
    );
    expect(parsed).toEqual({
      kind: 'asset_class_value_target',
      assetClass: 'equity',
      targetValue: 100000,
      unit: 'eur',
    });
  });

  it('parses natural-language bond goals with avere/in wording', () => {
    const parsed = parseStructuredGoalFromText('Avere 50k in obbligazioni');
    expect(parsed).toEqual({
      kind: 'asset_class_value_target',
      assetClass: 'bonds',
      targetValue: 50000,
      unit: 'eur',
    });
  });

  it('parses natural-language equity allocation goals with synonym labels', () => {
    const parsed = parseStructuredGoalFromText('Portare la percentuale azioni al 60%');
    expect(parsed).toEqual({
      kind: 'asset_class_percentage_target',
      assetClass: 'equity',
      targetValue: 60,
      unit: 'percent',
    });
  });

  it('matches a completed liquidity goal', () => {
    const result = evaluateStructuredGoal(makeGoal().structuredGoal!, makeBundle());
    expect(result?.matched).toBe(true);
    expect(result?.evaluatedAgainst).toBe('cash');
    expect(result?.metricValue).toBe(45000);
  });

  it('evaluates patrimony-liquid goals against liquid net worth', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'liquid_net_worth_target',
        targetValue: 40000,
        unit: 'eur',
      },
      makeBundle()
    );
    expect(result?.matched).toBe(true);
    expect(result?.evaluatedAgainst).toBe('liquid_net_worth');
  });

  it('does not match an unmet net worth goal', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'net_worth_target',
        targetValue: 150000,
        unit: 'eur',
      },
      makeBundle()
    );
    expect(result?.matched).toBe(false);
    expect(result?.metricValue).toBe(120000);
  });

  it('matches an asset class percentage goal', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'asset_class_percentage_target',
        assetClass: 'equity',
        targetValue: 45,
        unit: 'percent',
      },
      makeBundle()
    );
    expect(result?.matched).toBe(true);
    expect(result?.evaluatedAgainst).toBe('asset_class_percentage');
  });

  it('matches a sub-category value goal', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'sub_category_value_target',
        subCategory: 'Azioni USA',
        targetValue: 40000,
        unit: 'eur',
      },
      makeBundle()
    );
    expect(result?.matched).toBe(true);
    expect(result?.evaluatedAgainst).toBe('sub_category_value');
  });

  it('returns no suggestion when data is missing', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoal()],
      makeBundle({ currentSnapshot: null }),
      [],
      ({ itemId }) => `suggestion-${itemId}`
    );
    expect(suggestions).toHaveLength(0);
  });
});
