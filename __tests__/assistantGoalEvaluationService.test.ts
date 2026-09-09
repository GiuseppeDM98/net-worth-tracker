/**
 * Unit tests for evaluateActiveGoals.
 *
 * The claim under test is the one that made goal completion never fire: goals are
 * measured against the CURRENT month, whatever period the user was reading, and
 * they are measured even when the chat carried no context bundle at all.
 *
 * The store and the context builder are mocked — the arithmetic they wrap is
 * covered by assistantGoalEvaluation and assistantMonthContextService.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantMemoryDocument,
  AssistantMemoryItem,
  AssistantMonthContextBundle,
} from '@/types/assistant';

const {
  getAssistantMemoryDocumentMock,
  applyAssistantMemoryMutationsMock,
  buildAssistantMonthContextMock,
} = vi.hoisted(() => ({
  getAssistantMemoryDocumentMock: vi.fn(),
  applyAssistantMemoryMutationsMock: vi.fn(),
  buildAssistantMonthContextMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/assistant/store', () => ({
  getAssistantMemoryDocument: getAssistantMemoryDocumentMock,
  applyAssistantMemoryMutations: applyAssistantMemoryMutationsMock,
}));

vi.mock('@/lib/services/assistantMonthContextService', () => ({
  buildAssistantMonthContext: buildAssistantMonthContextMock,
}));

import { evaluateActiveGoals } from '@/lib/server/assistant/goalEvaluationService';

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
      byAssetClass: { cash: 45000, equity: 60000, bonds: 15000 },
      byAsset: [],
      assetAllocation: { cash: 37.5, equity: 50, bonds: 12.5 },
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
    netWorth: { start: null, end: 120000, delta: null, deltaPct: null },
    allocationChanges: [],
    expensesByCategory: [],
    incomeByCategory: [],
    expensesByType: [],
    topIndividualExpenses: [],
    bySubCategoryAllocation: {},
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

function makeMemoryDocument(
  overrides: Partial<AssistantMemoryDocument> = {}
): AssistantMemoryDocument {
  return {
    preferences: {
      responseStyle: 'balanced',
      includeMacroContext: false,
      memoryEnabled: true,
      includeDummySnapshots: false,
    },
    items: [],
    suggestions: [],
    updatedAt: null,
    ...overrides,
  };
}

describe('evaluateActiveGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAssistantMonthContextMock.mockResolvedValue(makeBundle());
    applyAssistantMemoryMutationsMock.mockResolvedValue(makeMemoryDocument());
  });

  it('always evaluates against the current month', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({ items: [makeGoalItem()] })
    );

    await evaluateActiveGoals('user-1', { now: NOW });

    expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', { year: 2026, month: 8 }, false);
  });

  it('persists the evaluation and the suggestion in ONE transaction', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({ items: [makeGoalItem()] })
    );

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result).toEqual({ evaluatedGoals: 1, suggestionsCreated: 1 });
    expect(applyAssistantMemoryMutationsMock).toHaveBeenCalledTimes(1);

    const [userId, mutations] = applyAssistantMemoryMutationsMock.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(mutations).toHaveLength(2);
    expect(mutations[0]).toMatchObject({
      kind: 'item',
      item: { id: 'goal-1', lastEvaluationAt: NOW },
    });
    expect(mutations[1]).toMatchObject({
      kind: 'suggestion',
      suggestion: { id: 'goal_suggestion_goal-1', itemId: 'goal-1', status: 'pending' },
    });
  });

  it('records an unmet goal without emitting a suggestion', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({
        items: [
          makeGoalItem({
            structuredGoal: {
              kind: 'net_worth_target',
              targetValue: 500000,
              unit: 'eur',
              direction: 'at_least',
            },
          }),
        ],
      })
    );

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result).toEqual({ evaluatedGoals: 1, suggestionsCreated: 0 });
    const [, mutations] = applyAssistantMemoryMutationsMock.mock.calls[0];
    expect(mutations).toHaveLength(1);
    expect(mutations[0].item.lastEvaluationResult.matched).toBe(false);
  });

  it('evaluates goals extracted in the same turn but not yet persisted', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(makeMemoryDocument());
    const pendingGoal = makeGoalItem({ id: 'goal-new' });

    const result = await evaluateActiveGoals('user-1', { pendingItems: [pendingGoal], now: NOW });

    expect(result.evaluatedGoals).toBe(1);
    expect(applyAssistantMemoryMutationsMock).toHaveBeenCalledTimes(1);
    const [, mutations] = applyAssistantMemoryMutationsMock.mock.calls[0];
    // The item itself, its evaluation, and the completion suggestion
    expect(mutations).toHaveLength(3);
  });

  it('writes nothing at all when memory is disabled', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({
        preferences: {
          responseStyle: 'balanced',
          includeMacroContext: false,
          memoryEnabled: false,
          includeDummySnapshots: false,
        },
        items: [makeGoalItem()],
      })
    );

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result.skippedReason).toBe('memory_disabled');
    expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
    expect(applyAssistantMemoryMutationsMock).not.toHaveBeenCalled();
  });

  it('does not build a context bundle when there is nothing to evaluate', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({ items: [makeGoalItem({ structuredGoal: undefined })] })
    );

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result.skippedReason).toBe('no_active_goals');
    expect(buildAssistantMonthContextMock).not.toHaveBeenCalled();
  });

  it('still persists new memory items when no goal can be evaluated', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(makeMemoryDocument());
    const pendingFact: AssistantMemoryItem = {
      id: 'fact-1',
      userId: 'user-1',
      category: 'fact',
      text: 'Ho un mutuo a tasso fisso',
      createdAt: NOW,
      updatedAt: NOW,
      status: 'active',
    };

    const result = await evaluateActiveGoals('user-1', { pendingItems: [pendingFact], now: NOW });

    expect(result.skippedReason).toBe('no_active_goals');
    expect(applyAssistantMemoryMutationsMock).toHaveBeenCalledTimes(1);
    const [, mutations] = applyAssistantMemoryMutationsMock.mock.calls[0];
    expect(mutations).toEqual([{ kind: 'item', item: pendingFact }]);
  });

  it('skips evaluation when the current month has no snapshot yet', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({ items: [makeGoalItem()] })
    );
    buildAssistantMonthContextMock.mockResolvedValue(makeBundle({ currentSnapshot: null }));

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result.skippedReason).toBe('no_snapshot');
    expect(applyAssistantMemoryMutationsMock).not.toHaveBeenCalled();
  });

  it('does not re-emit a suggestion the user has ignored', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({
        items: [makeGoalItem()],
        suggestions: [
          {
            id: 'goal_suggestion_goal-1',
            userId: 'user-1',
            itemId: 'goal-1',
            type: 'complete_goal',
            status: 'ignored',
            createdAt: new Date(2026, 6, 10),
            updatedAt: new Date(2026, 6, 20),
            evidenceSummary: 'già valutato',
            evaluation: {
              matched: true,
              metricValue: 45000,
              targetValue: 40000,
              unit: 'eur',
              evaluatedAgainst: 'cash',
              summary: 'già valutato',
            },
          },
        ],
      })
    );

    const result = await evaluateActiveGoals('user-1', { now: NOW });

    expect(result).toEqual({ evaluatedGoals: 1, suggestionsCreated: 0 });
  });

  it('passes the dummy-snapshot preference through to the context builder', async () => {
    getAssistantMemoryDocumentMock.mockResolvedValue(
      makeMemoryDocument({
        preferences: {
          responseStyle: 'balanced',
          includeMacroContext: false,
          memoryEnabled: true,
          includeDummySnapshots: true,
        },
        items: [makeGoalItem()],
      })
    );

    await evaluateActiveGoals('user-1', { now: NOW });

    expect(buildAssistantMonthContextMock).toHaveBeenCalledWith('user-1', { year: 2026, month: 8 }, true);
  });
});
