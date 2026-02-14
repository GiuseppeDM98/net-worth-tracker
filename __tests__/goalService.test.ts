/**
 * Unit tests for goal service pure functions.
 * Tests calculation logic, validation, and orphan cleanup.
 * Firebase-dependent functions (getGoalData, saveGoalData) are NOT tested here.
 */

import { describe, it, expect } from 'vitest';

// Mock Firebase-dependent modules before importing goalService
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: any) => {
    const base = asset.quantity * asset.currentPrice;
    return asset.outstandingDebt ? Math.max(0, base - asset.outstandingDebt) : base;
  },
}));

import {
  calculateGoalProgress,
  getUnassignedValue,
  validateAssignments,
  cleanOrphanedAssignments,
  getAvailablePercentage,
} from '@/lib/services/goalService';
import { vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

// ==================== Test Fixtures ====================

const now = Timestamp.now();

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
  {
    id: 'asset3',
    userId: 'user1',
    ticker: 'CASH',
    name: 'Conto Deposito',
    type: 'cash' as const,
    assetClass: 'cash' as const,
    currency: 'EUR',
    quantity: 1,
    currentPrice: 5000,
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  },
];
// asset1 = €10,000, asset2 = €10,000, asset3 = €5,000. Total = €25,000

const mockGoal = {
  id: 'goal1',
  name: 'Acquisto Casa',
  targetAmount: 200000,
  priority: 'alta' as const,
  color: '#3B82F6',
  recommendedAllocation: { bonds: 70, equity: 30 },
  createdAt: now,
  updatedAt: now,
};

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
    const zeroGoal = { ...mockGoal, targetAmount: 0 };
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
    ];

    const result = calculateGoalProgress(zeroGoal, assignments, mockAssets);

    expect(result.progressPercentage).toBeUndefined();
    expect(result.remainingAmount).toBeUndefined();
  });

  it('should handle undefined target amount (open-ended goal)', () => {
    const openGoal = { ...mockGoal, targetAmount: undefined };
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
    ];

    const result = calculateGoalProgress(openGoal, assignments, mockAssets);

    expect(result.currentValue).toBe(5000);
    expect(result.progressPercentage).toBeUndefined();
    expect(result.remainingAmount).toBeUndefined();
    expect(result.targetAmount).toBeUndefined();
  });
});

// ==================== getUnassignedValue ====================

describe('getUnassignedValue', () => {
  it('should return total portfolio value when no assignments', () => {
    const result = getUnassignedValue(mockAssets, []);

    expect(result).toBe(25000); // 10000 + 10000 + 5000
  });

  it('should subtract assigned portions', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 }, // 50% of €10,000 assigned
      { goalId: 'goal1', assetId: 'asset2', percentage: 100 }, // 100% of €10,000 assigned
    ];

    const result = getUnassignedValue(mockAssets, assignments);

    // asset1: 50% unassigned = €5,000
    // asset2: 0% unassigned = €0
    // asset3: 100% unassigned = €5,000
    expect(result).toBe(10000);
  });

  it('should handle multiple goals assigning same asset', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 30 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 40 },
    ];

    const result = getUnassignedValue(mockAssets, assignments);

    // asset1: 30% unassigned = €3,000
    // asset2 + asset3 fully unassigned = €15,000
    expect(result).toBe(18000);
  });

  it('should cap unassigned at 0 when over-assigned', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 60 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 60 },
    ];

    const result = getUnassignedValue(mockAssets, assignments);

    // asset1: over-assigned (120%), unassigned = 0
    // asset2 + asset3 = €15,000
    expect(result).toBe(15000);
  });
});

// ==================== validateAssignments ====================

describe('validateAssignments', () => {
  it('should return empty array for valid assignments', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 50 },
    ];

    const errors = validateAssignments(assignments, mockAssets);

    expect(errors).toHaveLength(0);
  });

  it('should detect over-assigned assets', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 60 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 50 },
    ];

    const errors = validateAssignments(assignments, mockAssets);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Vanguard FTSE All-World');
    expect(errors[0]).toContain('110.0%');
  });

  it('should return empty for no assignments', () => {
    const errors = validateAssignments([], mockAssets);
    expect(errors).toHaveLength(0);
  });
});

// ==================== cleanOrphanedAssignments ====================

describe('cleanOrphanedAssignments', () => {
  it('should remove assignments for deleted assets', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
      { goalId: 'goal1', assetId: 'deleted_asset', percentage: 100 },
    ];

    const cleaned = cleanOrphanedAssignments(assignments, mockAssets);

    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].assetId).toBe('asset1');
  });

  it('should keep all assignments when no orphans', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 50 },
      { goalId: 'goal2', assetId: 'asset2', percentage: 100 },
    ];

    const cleaned = cleanOrphanedAssignments(assignments, mockAssets);

    expect(cleaned).toHaveLength(2);
  });

  it('should handle empty assignments', () => {
    const cleaned = cleanOrphanedAssignments([], mockAssets);
    expect(cleaned).toHaveLength(0);
  });
});

// ==================== getAvailablePercentage ====================

describe('getAvailablePercentage', () => {
  it('should return 100% when no assignments exist', () => {
    const result = getAvailablePercentage('asset1', [], undefined);
    expect(result).toBe(100);
  });

  it('should subtract assigned percentages from other goals', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 30 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 25 },
    ];

    const result = getAvailablePercentage('asset1', assignments, undefined);

    expect(result).toBe(45);
  });

  it('should exclude a specific goal when editing', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 30 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 25 },
    ];

    // Editing goal1's assignment — should not count goal1's 30%
    const result = getAvailablePercentage('asset1', assignments, 'goal1');

    expect(result).toBe(75); // 100 - 25 (only goal2 counts)
  });

  it('should not go below 0', () => {
    const assignments = [
      { goalId: 'goal1', assetId: 'asset1', percentage: 60 },
      { goalId: 'goal2', assetId: 'asset1', percentage: 60 },
    ];

    const result = getAvailablePercentage('asset1', assignments, undefined);

    expect(result).toBe(0); // Max(0, 100 - 120)
  });
});
