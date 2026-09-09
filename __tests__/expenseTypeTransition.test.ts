import { describe, it, expect } from 'vitest';

import {
  isStoredPositive,
  needsSignFlip,
  crossesTransferBoundary,
} from '@/lib/utils/expenseTypeTransition';
import { ExpenseType } from '@/types/expenses';

const NEGATIVE_TYPES: ExpenseType[] = ['fixed', 'variable', 'debt'];
const POSITIVE_TYPES: ExpenseType[] = ['income', 'transfer'];

describe('expenseTypeTransition', () => {
  describe('isStoredPositive', () => {
    it.each(POSITIVE_TYPES)('should be true for %s', (type) => {
      expect(isStoredPositive(type)).toBe(true);
    });

    it.each(NEGATIVE_TYPES)('should be false for %s', (type) => {
      expect(isStoredPositive(type)).toBe(false);
    });
  });

  describe('needsSignFlip', () => {
    it('should flip when crossing the income boundary', () => {
      expect(needsSignFlip('variable', 'income')).toBe(true);
      expect(needsSignFlip('income', 'debt')).toBe(true);
    });

    it('should flip when crossing the transfer boundary from an expense type', () => {
      // A variable category re-typed into a transfer one must flip its stored
      // negatives to positive: transfers are stored positive like income.
      expect(needsSignFlip('variable', 'transfer')).toBe(true);
      expect(needsSignFlip('transfer', 'fixed')).toBe(true);
    });

    it('should not flip between the two positive types', () => {
      expect(needsSignFlip('income', 'transfer')).toBe(false);
      expect(needsSignFlip('transfer', 'income')).toBe(false);
    });

    it('should not flip between expense types', () => {
      expect(needsSignFlip('fixed', 'variable')).toBe(false);
      expect(needsSignFlip('variable', 'debt')).toBe(false);
    });
  });

  describe('crossesTransferBoundary', () => {
    it.each(['fixed', 'variable', 'debt', 'income'] as ExpenseType[])(
      'should be true for %s → transfer and transfer → %s',
      (type) => {
        expect(crossesTransferBoundary(type, 'transfer')).toBe(true);
        expect(crossesTransferBoundary('transfer', type)).toBe(true);
      }
    );

    it('should be false when neither side is a transfer', () => {
      expect(crossesTransferBoundary('variable', 'income')).toBe(false);
      expect(crossesTransferBoundary('fixed', 'debt')).toBe(false);
    });

    it('should be false for transfer → transfer', () => {
      expect(crossesTransferBoundary('transfer', 'transfer')).toBe(false);
    });
  });
});
