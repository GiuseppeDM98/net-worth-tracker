/**
 * Tests for lib/utils/marketEffect.ts — the market effect of a traded instrument, and the money
 * the trades put in: a fee counts there only while no spending row carries it (2026-11-12).
 */
import { describe, expect, it } from 'vitest';

import { tradeAwarePriceEffect, tradeMoneyIn } from '@/lib/utils/marketEffect';
import type { AssetTransaction } from '@/types/assetTransactions';

const DAY = new Date(2026, 7, 5, 12);
const buy = (overrides: Partial<AssetTransaction> = {}): AssetTransaction => ({
  id: 't1', userId: 'u', assetId: 'etf', type: 'buy', date: DAY, quantity: 2, pricePerUnit: 100, priceEur: 100,
  fees: 5, createdAt: DAY, updatedAt: DAY, ...overrides,
}) as AssetTransaction;

describe('tradeMoneyIn', () => {
  it('counts a fee only while no spending row carries it', () => {
    expect(tradeMoneyIn([buy({ feeExpenseId: 'fee-1' })])).toBe(200);
    expect(tradeMoneyIn([buy()])).toBe(205);
    expect(tradeMoneyIn([buy({ type: 'sell', feeExpenseId: 'fee-1' })])).toBe(-200);
    expect(tradeMoneyIn([buy({ type: 'sell' })])).toBe(-195);
    expect(tradeMoneyIn([buy({ isBaseline: true })])).toBe(0);
  });
});

describe('tradeAwarePriceEffect', () => {
  it('reads a buy of 2 at 100 worth 200 as no market with its fee row, −5 without', () => {
    const current = { quantity: 2, totalValue: 200 };
    expect(tradeAwarePriceEffect(undefined, current, [buy({ feeExpenseId: 'fee-1' })])).toBeCloseTo(0, 9);
    expect(tradeAwarePriceEffect(undefined, current, [buy()])).toBeCloseTo(-5, 9);
  });
});
