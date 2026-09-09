/**
 * Unit tests for the assistant's structured-goal evaluation.
 *
 * The regex parser these tests used to cover is gone: structure now arrives from
 * the Haiku extraction tool (see assistantMemoryExtraction.test.ts), so what is
 * left to prove here is the comparison itself — direction, deadline, missing
 * data, and the durability of an ignored suggestion.
 */

import { describe, expect, it } from 'vitest';
import {
  buildGoalCompletionSuggestions,
  evaluateStructuredGoal,
} from '@/lib/server/assistant/goalEvaluation';
import {
  AssistantMemoryItem,
  AssistantMemorySuggestion,
  AssistantMonthContextBundle,
  AssistantStructuredGoal,
} from '@/types/assistant';

const NOW = new Date(2026, 7, 15, 12, 0, 0); // 15 August 2026, noon

function makeBundle(overrides?: Partial<AssistantMonthContextBundle>): AssistantMonthContextBundle {
  return {
    selector: { year: 2026, month: 8 },
    currentSnapshot: {
      userId: 'user-1',
      year: 2026,
      month: 8,
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
      createdAt: NOW,
    },
    previousSnapshot: null,
    cashflow: {
      totalIncome: 0,
      totalExpenses: 0,
      totalDividends: 0,
      netCashFlow: 0,
      transactionCount: 0,
      expenseTransactionCount: 0,
    },
    netWorth: {
      start: null,
      end: 120000,
      delta: null,
      deltaPct: null,
    },
    allocationChanges: [],
    expensesByCategory: [],
    incomeByCategory: [],
    expensesByType: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {
      equity: {
        'Azioni USA': 42000,
      },
    },
    targetAllocation: null,
    targetAllocationSource: 'manual',
    goals: null,
    expenseCategories: [],
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

function makeGoalItem(overrides: Partial<AssistantMemoryItem> = {}): AssistantMemoryItem {
  return {
    id: 'goal-1',
    userId: 'user-1',
    category: 'goal',
    text: 'Portare la liquidità a 40k',
    structuredGoal: {
      kind: 'cash_target',
      targetValue: 40000,
      unit: 'eur',
      direction: 'at_least',
    },
    createdAt: new Date(2026, 6, 1),
    updatedAt: new Date(2026, 6, 1),
    status: 'active',
    ...overrides,
  };
}

function makeSuggestion(
  overrides: Partial<AssistantMemorySuggestion> = {}
): AssistantMemorySuggestion {
  return {
    id: 'goal_suggestion_goal-1',
    userId: 'user-1',
    itemId: 'goal-1',
    type: 'complete_goal',
    status: 'pending',
    createdAt: new Date(2026, 6, 10),
    updatedAt: new Date(2026, 6, 10),
    evidenceSummary: 'Liquidità: 45.000 € su target minimo 40.000 €',
    evaluation: {
      matched: true,
      metricValue: 45000,
      targetValue: 40000,
      unit: 'eur',
      evaluatedAgainst: 'cash',
      summary: 'Liquidità: 45.000 € su target minimo 40.000 €',
    },
    ...overrides,
  };
}

const suggestionId = ({ itemId }: { itemId: string }) => `goal_suggestion_${itemId}`;

// ── Direction ────────────────────────────────────────────────────────────────

describe('evaluateStructuredGoal — direction', () => {
  it('matches an at_least goal once the metric reaches the target', () => {
    const result = evaluateStructuredGoal(
      { kind: 'cash_target', targetValue: 40000, unit: 'eur', direction: 'at_least' },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(true);
    expect(result?.metricValue).toBe(45000);
    expect(result?.evaluatedAgainst).toBe('cash');
  });

  it('does not match an at_least goal still below the target', () => {
    const result = evaluateStructuredGoal(
      { kind: 'net_worth_target', targetValue: 150000, unit: 'eur', direction: 'at_least' },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(false);
    expect(result?.metricValue).toBe(120000);
  });

  it('matches an at_most goal only when the metric is BELOW the cap', () => {
    // "Porta la liquidità sotto il 10%" — cash is 37.5% of the portfolio, so this
    // must NOT be reported as reached. Under the old >= logic it was, immediately.
    const overCap = evaluateStructuredGoal(
      {
        kind: 'asset_class_percentage_target',
        assetClass: 'cash',
        targetValue: 10,
        unit: 'percent',
        direction: 'at_most',
      },
      makeBundle(),
      NOW
    );
    expect(overCap?.matched).toBe(false);
    expect(overCap?.metricValue).toBe(37.5);

    const underCap = evaluateStructuredGoal(
      {
        kind: 'asset_class_percentage_target',
        assetClass: 'bonds',
        targetValue: 20,
        unit: 'percent',
        direction: 'at_most',
      },
      makeBundle(),
      NOW
    );
    expect(underCap?.matched).toBe(true);
    expect(underCap?.metricValue).toBe(12.5);
  });

  it('reads a legacy goal without direction as at_least', () => {
    const legacyGoal = {
      kind: 'liquid_net_worth_target',
      targetValue: 40000,
      unit: 'eur',
    } as AssistantStructuredGoal;

    const result = evaluateStructuredGoal(legacyGoal, makeBundle(), NOW);

    expect(result?.matched).toBe(true);
    expect(result?.evaluatedAgainst).toBe('liquid_net_worth');
  });
});

// ── Metrics ──────────────────────────────────────────────────────────────────

describe('evaluateStructuredGoal — metrics', () => {
  it('evaluates an asset class value against the snapshot class total', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'asset_class_value_target',
        assetClass: 'equity',
        targetValue: 50000,
        unit: 'eur',
        direction: 'at_least',
      },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(true);
    expect(result?.metricValue).toBe(60000);
    expect(result?.evaluatedAgainst).toBe('asset_class_value');
  });

  it('matches a sub-category name case-insensitively', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'sub_category_value_target',
        subCategory: 'azioni usa',
        targetValue: 40000,
        unit: 'eur',
        direction: 'at_least',
      },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(true);
    expect(result?.metricValue).toBe(42000);
  });

  it('records the period the metric was read from', () => {
    const result = evaluateStructuredGoal(
      { kind: 'net_worth_target', targetValue: 100000, unit: 'eur', direction: 'at_least' },
      makeBundle(),
      NOW
    );

    expect(result?.evaluatedPeriod).toEqual({ year: 2026, month: 8 });
  });
});

// ── Missing data ─────────────────────────────────────────────────────────────

describe('evaluateStructuredGoal — missing data', () => {
  it('returns null when the current month has no snapshot', () => {
    const result = evaluateStructuredGoal(
      { kind: 'net_worth_target', targetValue: 100000, unit: 'eur', direction: 'at_least' },
      makeBundle({ currentSnapshot: null }),
      NOW
    );

    expect(result).toBeNull();
  });

  it('returns null for an asset class goal with no class', () => {
    const result = evaluateStructuredGoal(
      { kind: 'asset_class_value_target', targetValue: 50000, unit: 'eur', direction: 'at_least' },
      makeBundle(),
      NOW
    );

    expect(result).toBeNull();
  });

  it('returns null for a percentage goal on an empty portfolio', () => {
    const emptySnapshot = { ...makeBundle().currentSnapshot!, totalNetWorth: 0 };
    const result = evaluateStructuredGoal(
      {
        kind: 'asset_class_percentage_target',
        assetClass: 'equity',
        targetValue: 50,
        unit: 'percent',
        direction: 'at_least',
      },
      makeBundle({ currentSnapshot: emptySnapshot }),
      NOW
    );

    expect(result).toBeNull();
  });
});

// ── Deadline ─────────────────────────────────────────────────────────────────

describe('evaluateStructuredGoal — deadline', () => {
  it('says so in the summary when an unmet goal is past its deadline', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'net_worth_target',
        targetValue: 150000,
        unit: 'eur',
        direction: 'at_least',
        deadlineIso: '2026-06-30',
      },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(false);
    expect(result?.deadlinePassed).toBe(true);
    expect(result?.summary).toContain('scadenza superata');
  });

  it('still matches a goal reached after its deadline', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'cash_target',
        targetValue: 40000,
        unit: 'eur',
        direction: 'at_least',
        deadlineIso: '2026-06-30',
      },
      makeBundle(),
      NOW
    );

    expect(result?.matched).toBe(true);
    expect(result?.deadlinePassed).toBe(true);
    expect(result?.summary).not.toContain('scadenza superata');
  });

  it('does not flag a deadline still in the future', () => {
    const result = evaluateStructuredGoal(
      {
        kind: 'net_worth_target',
        targetValue: 150000,
        unit: 'eur',
        direction: 'at_least',
        deadlineIso: '2027-12-31',
      },
      makeBundle(),
      NOW
    );

    expect(result?.deadlinePassed).toBe(false);
    expect(result?.summary).not.toContain('scadenza');
  });
});

// ── Suggestions ──────────────────────────────────────────────────────────────

describe('buildGoalCompletionSuggestions', () => {
  it('emits a suggestion for a matched goal with no prior suggestion', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem()],
      makeBundle(),
      [],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].itemId).toBe('goal-1');
    expect(suggestions[0].status).toBe('pending');
    expect(suggestions[0].evaluation.matched).toBe(true);
  });

  it('never suggests a goal without a structured goal', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem({ structuredGoal: undefined })],
      makeBundle(),
      [],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(0);
  });

  it('emits nothing when the metric is not computable', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem()],
      makeBundle({ currentSnapshot: null }),
      [],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(0);
  });

  it('skips a goal that is not active', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem({ status: 'completed' })],
      makeBundle(),
      [],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(0);
  });

  it('does not re-emit while a suggestion is still pending', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem()],
      makeBundle(),
      [makeSuggestion({ status: 'pending' })],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(0);
  });

  it('does not re-emit after the user ignored the suggestion', () => {
    // The durable "Ignora": previously only `pending` blocked emission, so the
    // very next evaluation overwrote the ignored suggestion back to pending.
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem()],
      makeBundle(),
      [makeSuggestion({ status: 'ignored', updatedAt: new Date(2026, 6, 20) })],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(0);
  });

  it('re-emits when the goal was edited after being ignored', () => {
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      // The user changed what they are aiming at — the old decision no longer applies
      [makeGoalItem({ updatedAt: new Date(2026, 7, 1) })],
      makeBundle(),
      [makeSuggestion({ status: 'ignored', updatedAt: new Date(2026, 6, 20) })],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe('goal_suggestion_goal-1');
  });

  it('re-emits after an accepted suggestion is explicitly reactivated', () => {
    // reactivateGoal flips the item back to active and bumps updatedAt; an accepted
    // suggestion must not keep the banner suppressed forever.
    const suggestions = buildGoalCompletionSuggestions(
      'user-1',
      [makeGoalItem({ updatedAt: new Date(2026, 7, 10) })],
      makeBundle(),
      [makeSuggestion({ status: 'accepted', updatedAt: new Date(2026, 7, 5) })],
      suggestionId,
      NOW
    );

    expect(suggestions).toHaveLength(1);
  });
});
