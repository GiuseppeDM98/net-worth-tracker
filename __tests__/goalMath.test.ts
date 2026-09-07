/**
 * Unit tests for the Goal-Based Investing math extracted out of goalService.ts.
 *
 * calculateGoalProgress' tests followed the function here from goalService.test.ts;
 * deriveTargetAllocationFromGoals, pickNextGoalColor and serializeGoalForFirestore are
 * covered here for the first time — the first because the assistant now reports the
 * targets it derives, the last two because the new POST /api/goals route builds a goal
 * document by hand.
 */

import { describe, it, expect, vi } from 'vitest';

// goalMath imports calculateAssetValue from assetService, which pulls the client SDK.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: Asset) => {
    const base = asset.quantity * asset.currentPrice;
    return asset.outstandingDebt ? Math.max(0, base - asset.outstandingDebt) : base;
  },
}));

import {
  calculateGoalProgress,
  deriveTargetAllocationFromGoals,
  pickNextGoalColor,
  serializeGoalForFirestore,
} from '@/lib/utils/goalMath';
import { Asset } from '@/types/assets';
import { GOAL_COLORS, InvestmentGoal } from '@/types/goals';

// ==================== Test Fixtures ====================

const now = new Date();

const mockAssets = [
  {
    id: 'asset1',
    userId: 'user1',
    ticker: 'VWCE',
    name: 'Vanguard FTSE All-World',
    type: 'etf' as const,
    assetClass: 'equity' as const,
    currency: 'EUR',
    quantity: 100,
    currentPrice: 100,
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'asset2',
    userId: 'user1',
    ticker: 'AGGH',
    name: 'iShares Global Aggregate Bond',
    type: 'etf' as const,
    assetClass: 'bonds' as const,
    currency: 'EUR',
    quantity: 200,
    currentPrice: 50,
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  },
] as unknown as Asset[];
// asset1 = €10,000 (equity), asset2 = €10,000 (bonds)

const mockGoal: InvestmentGoal = {
  id: 'goal1',
  name: 'Acquisto Casa',
  targetAmount: 200000,
  priority: 'alta',
  color: GOAL_COLORS[0],
  recommendedAllocation: { bonds: 70, equity: 30 },
  createdAt: now,
  updatedAt: now,
};

function makeGoal(overrides: Partial<InvestmentGoal>): InvestmentGoal {
  return { ...mockGoal, ...overrides };
}

// ==================== calculateGoalProgress ====================

describe('calculateGoalProgress', () => {
  it('should calculate zero progress with no assignments', () => {
    const result = calculateGoalProgress(mockGoal, [], mockAssets);

    expect(result.goalId).toBe('goal1');
    expect(result.goalName).toBe('Acquisto Casa');
    expect(result.currentValue).toBe(0);
    expect(result.progressPercentage).toBeCloseTo(0, 1);
    expect(result.remainingAmount).toBe(200000);
  });

  it('should calculate correct progress with assignments', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 }, // 50% of €10,000 = €5,000
      { goalId: 'goal1', assetId: 'asset2', percentage: 100 }, // 100% of €10,000 = €10,000
    ];

    const result = calculateGoalProgress(mockGoal, assignments, mockAssets);

    expect(result.currentValue).toBe(15000); // €5,000 + €10,000
    expect(result.progressPercentage).toBeCloseTo(7.5, 1); // 15000/200000 * 100
    expect(result.remainingAmount).toBe(185000);
  });

  it('should compute actual allocation by asset class', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 }, // equity €5,000
      { goalId: 'goal1', assetId: 'asset2', percentage: 100 }, // bonds €10,000
    ];

    const result = calculateGoalProgress(mockGoal, assignments, mockAssets);

    // Total assigned = €15,000. equity = 5000/15000 = 33.3%, bonds = 10000/15000 = 66.7%
    expect(result.actualAllocation.equity).toBeCloseTo(33.33, 1);
    expect(result.actualAllocation.bonds).toBeCloseTo(66.67, 1);
  });

  it('should skip orphaned assignments (deleted assets)', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
      { goalId: 'goal1', assetId: 'deleted_asset', percentage: 100 },
    ];

    const result = calculateGoalProgress(mockGoal, assignments, mockAssets);

    // Only asset1 should be counted
    expect(result.currentValue).toBe(5000);
  });

  it('should filter assignments to only this goal', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
      { goalId: 'other_goal', assetId: 'asset2', percentage: 100 },
    ];

    const result = calculateGoalProgress(mockGoal, assignments, mockAssets);

    expect(result.currentValue).toBe(5000); // Only asset1 for goal1
  });

  it('should handle zero target amount without division by zero', () => {
    const zeroGoal = makeGoal({ targetAmount: 0 });
    const assignments = [{ goalId: 'goal1', assetId: 'asset1', percentage: 50 }];

    const result = calculateGoalProgress(zeroGoal, assignments, mockAssets);

    expect(result.progressPercentage).toBeUndefined();
    expect(result.remainingAmount).toBeUndefined();
  });

  it('should handle undefined target amount (open-ended goal)', () => {
    const openGoal = makeGoal({ targetAmount: undefined });
    const assignments = [{ goalId: 'goal1', assetId: 'asset1', percentage: 50 }];

    const result = calculateGoalProgress(openGoal, assignments, mockAssets);

    expect(result.currentValue).toBe(5000);
    expect(result.progressPercentage).toBeUndefined();
    expect(result.remainingAmount).toBeUndefined();
    expect(result.targetAmount).toBeUndefined();
  });
});

// ==================== deriveTargetAllocationFromGoals ====================

describe('deriveTargetAllocationFromGoals', () => {
  it('should return null when no goal carries a recommended allocation', () => {
    const goals = [makeGoal({ recommendedAllocation: undefined })];

    const result = deriveTargetAllocationFromGoals(goals, [], mockAssets);

    expect(result).toBeNull();
  });

  it('should return null when every goal is open-ended', () => {
    // No targetAmount means no gap to fill, so there is nothing to weight by.
    const goals = [makeGoal({ targetAmount: undefined })];

    const result = deriveTargetAllocationFromGoals(goals, [], mockAssets);

    expect(result).toBeNull();
  });

  it('should return a single goal allocation unchanged and summing to 100', () => {
    const goals = [makeGoal({ recommendedAllocation: { bonds: 70, equity: 30 } })];

    const result = deriveTargetAllocationFromGoals(goals, [], mockAssets);

    expect(result).toEqual({ bonds: 70, equity: 30 });
  });

  it('should weight goals by remaining gap and priority', () => {
    // Casa: gap 100k × alta(3) = 300k weight, all equity.
    // Auto: gap 100k × bassa(1) = 100k weight, all bonds.
    // → equity 75%, bonds 25%.
    const goals = [
      makeGoal({
        id: 'casa',
        targetAmount: 100000,
        priority: 'alta',
        recommendedAllocation: { equity: 100 },
      }),
      makeGoal({
        id: 'auto',
        name: 'Auto',
        targetAmount: 100000,
        priority: 'bassa',
        recommendedAllocation: { bonds: 100 },
      }),
    ];

    const result = deriveTargetAllocationFromGoals(goals, [], mockAssets);

    expect(result).toEqual({ equity: 75, bonds: 25 });
  });

  it('should exclude a fully funded goal from the blend', () => {
    // Casa is already covered by its assignment, so only Auto steers the target.
    const goals = [
      makeGoal({
        id: 'casa',
        targetAmount: 10000,
        recommendedAllocation: { equity: 100 },
      }),
      makeGoal({
        id: 'auto',
        name: 'Auto',
        targetAmount: 50000,
        recommendedAllocation: { bonds: 100 },
      }),
    ];
    const assignments = [{ goalId: 'casa', assetId: 'asset1', percentage: 100 }]; // €10,000

    const result = deriveTargetAllocationFromGoals(goals, assignments, mockAssets);

    expect(result).toEqual({ bonds: 100 });
  });

  it('should always total exactly 100 after rounding', () => {
    // Three equal-weight thirds would round to 33.3 × 3 = 99.9 without the remainder step.
    const goals = [
      makeGoal({ id: 'a', targetAmount: 30000, recommendedAllocation: { equity: 100 } }),
      makeGoal({ id: 'b', targetAmount: 30000, recommendedAllocation: { bonds: 100 } }),
      makeGoal({ id: 'c', targetAmount: 30000, recommendedAllocation: { cash: 100 } }),
    ];

    const result = deriveTargetAllocationFromGoals(goals, [], mockAssets);

    const total = Object.values(result ?? {}).reduce((sum, pct) => sum + pct, 0);
    expect(total).toBeCloseTo(100, 6);
  });
});

// ==================== pickNextGoalColor ====================

describe('pickNextGoalColor', () => {
  it('should pick the first palette colour for the first goal', () => {
    expect(pickNextGoalColor([])).toBe(GOAL_COLORS[0]);
  });

  it('should skip colours already in use', () => {
    const goals = [makeGoal({ color: GOAL_COLORS[0] }), makeGoal({ color: GOAL_COLORS[1] })];

    expect(pickNextGoalColor(goals)).toBe(GOAL_COLORS[2]);
  });

  it('should wrap around once every palette colour is taken', () => {
    const goals = GOAL_COLORS.map((color, index) => makeGoal({ id: `g${index}`, color }));

    expect(GOAL_COLORS).toContain(pickNextGoalColor(goals));
  });
});

// ==================== serializeGoalForFirestore ====================

describe('serializeGoalForFirestore', () => {
  it('should omit every unset optional field rather than write undefined', () => {
    const goal = makeGoal({
      targetAmount: undefined,
      targetDate: undefined,
      monthlyContribution: undefined,
      recommendedAllocation: undefined,
      notes: undefined,
    });

    const result = serializeGoalForFirestore(goal);

    expect(Object.values(result)).not.toContain(undefined);
    expect(result).not.toHaveProperty('targetAmount');
    expect(result).not.toHaveProperty('targetDate');
    expect(result).not.toHaveProperty('monthlyContribution');
    expect(result).not.toHaveProperty('recommendedAllocation');
    expect(result).not.toHaveProperty('notes');
  });

  it('should keep every field that is set', () => {
    const goal = makeGoal({
      targetAmount: 50000,
      targetDate: '2030-06-01',
      monthlyContribution: 400,
      recommendedAllocation: { equity: 60, bonds: 40 },
      notes: 'Casa al mare',
    });

    const result = serializeGoalForFirestore(goal);

    expect(result).toMatchObject({
      id: 'goal1',
      name: 'Acquisto Casa',
      priority: 'alta',
      color: GOAL_COLORS[0],
      targetAmount: 50000,
      targetDate: '2030-06-01',
      monthlyContribution: 400,
      recommendedAllocation: { equity: 60, bonds: 40 },
      notes: 'Casa al mare',
    });
  });

  it('should keep a zero contribution, which is a value and not an absence', () => {
    const result = serializeGoalForFirestore(makeGoal({ monthlyContribution: 0 }));

    expect(result.monthlyContribution).toBe(0);
  });
});
