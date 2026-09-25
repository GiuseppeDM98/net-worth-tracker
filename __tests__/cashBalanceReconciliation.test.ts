import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock assetService before importing the module under test.
// Every write goes through updateCashAssetBalancesAtomic (one transaction per save).
const mockUpdateCashAssetBalance = vi.fn();
const mockUpdateCashAssetBalancesAtomic = vi.fn();
vi.mock('@/lib/services/assetService', () => ({
  updateCashAssetBalance: (...args: unknown[]) => mockUpdateCashAssetBalance(...args),
  updateCashAssetBalancesAtomic: (...args: unknown[]) => mockUpdateCashAssetBalancesAtomic(...args),
}));

// The property half of a delete (a mortgage instalment's principal) has its own transaction.
const mockReverseDebtRepayments = vi.fn();
vi.mock('@/lib/services/debtRepaymentService', () => ({
  reverseDebtRepayments: (...args: unknown[]) => mockReverseDebtRepayments(...args),
}));

import {
  applyBalanceEffects,
  reconcileTransferCreate,
  reconcileTransferDelete,
  reverseAppliedBalances,
} from '@/lib/services/cashBalanceReconciliation';

describe('cashBalanceReconciliation', () => {
  beforeEach(() => {
    mockUpdateCashAssetBalance.mockReset();
    mockUpdateCashAssetBalance.mockResolvedValue(undefined);
    mockUpdateCashAssetBalancesAtomic.mockReset();
    mockUpdateCashAssetBalancesAtomic.mockResolvedValue(undefined);
    mockReverseDebtRepayments.mockReset();
    mockReverseDebtRepayments.mockResolvedValue(false);
  });

  // ─── reconcileTransferCreate ───────────────────────────────────────────────

  describe('reconcileTransferCreate', () => {
    it('should debit origin and credit destination atomically', async () => {
      const result = await reconcileTransferCreate({
        originId: 'origin',
        destId: 'dest',
        amount: 500,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([
        { assetId: 'origin', signedDelta: -500 },
        { assetId: 'dest',   signedDelta: 500 },
      ]);
    });

    it('should handle missing destination', async () => {
      const result = await reconcileTransferCreate({
        originId: 'origin',
        destId: undefined,
        amount: 300,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([
        { assetId: 'origin', signedDelta: -300 },
      ]);
    });

    it('should propagate errors from the atomic transaction', async () => {
      mockUpdateCashAssetBalancesAtomic.mockRejectedValueOnce(new Error('write failed'));

      await expect(
        reconcileTransferCreate({ originId: 'origin', destId: 'dest', amount: 100 })
      ).rejects.toThrow('write failed');
    });
  });

  // ─── reconcileTransferDelete ───────────────────────────────────────────────

  describe('reconcileTransferDelete', () => {
    it('should reverse origin debit and destination credit atomically', async () => {
      const result = await reconcileTransferDelete({
        originId: 'origin',
        destId: 'dest',
        amount: 400,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([
        { assetId: 'origin', signedDelta: 400 },
        { assetId: 'dest',   signedDelta: -400 },
      ]);
    });

    it('should return false when no asset IDs present', async () => {
      const result = await reconcileTransferDelete({
        originId: undefined,
        destId: undefined,
        amount: 100,
      });

      expect(result).toBe(false);
      expect(mockUpdateCashAssetBalancesAtomic).not.toHaveBeenCalled();
    });

    it('should propagate errors from the atomic transaction', async () => {
      mockUpdateCashAssetBalancesAtomic.mockRejectedValueOnce(new Error('write failed'));

      await expect(
        reconcileTransferDelete({ originId: 'origin', destId: 'dest', amount: 100 })
      ).rejects.toThrow('write failed');
    });
  });
// ─── applyBalanceEffects / reverseAppliedBalances ────────────────────────────

  describe('applyBalanceEffects', () => {
    it('should commit the effects netted per account in ONE atomic transaction', async () => {
      const result = await applyBalanceEffects([
        { assetId: 'bnl', delta: -559 },
        { assetId: 'bnl', delta: -100 },
        { assetId: 'carta', delta: 300 },
      ]);
      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([
        { assetId: 'bnl', signedDelta: -659 },
        { assetId: 'carta', signedDelta: 300 },
      ]);
    });

    it('should write nothing when there is no effect or they cancel out', async () => {
      expect(await applyBalanceEffects([])).toBe(false);
      expect(await applyBalanceEffects([{ assetId: 'bnl', delta: 50 }, { assetId: 'bnl', delta: -50 }])).toBe(false);
      expect(mockUpdateCashAssetBalancesAtomic).not.toHaveBeenCalled();
    });
  });

  describe('reverseAppliedBalances', () => {
    it('should give back what a series applied, skipping the occurrences still waiting for their date', async () => {
      const result = await reverseAppliedBalances([
        { type: 'debt', amount: -559, linkedCashAssetId: 'bnl' },
        { type: 'debt', amount: -559, linkedCashAssetId: 'bnl' },
        { type: 'debt', amount: -559, linkedCashAssetId: 'bnl', balancePending: true },
        { type: 'debt', amount: -559 },
      ]);
      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([{ assetId: 'bnl', signedDelta: 1118 }]);
    });

    it('should give back both accounts of a transfer, and nothing for one that never moved', async () => {
      await reverseAppliedBalances([{ type: 'transfer', amount: 300, linkedCashAssetId: 'bnl', transferCashAssetId: 'carta' }]);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledWith([
        { assetId: 'bnl', signedDelta: 300 },
        { assetId: 'carta', signedDelta: -300 },
      ]);
      mockUpdateCashAssetBalancesAtomic.mockClear();
      expect(await reverseAppliedBalances([{ type: 'transfer', amount: 300, linkedCashAssetId: 'bnl', transferCashAssetId: 'carta', balancePending: true }])).toBe(false);
      expect(mockUpdateCashAssetBalancesAtomic).not.toHaveBeenCalled();
    });

    it('should hand every deleted row to the debt reversal too, and report a debt that moved', async () => {
      mockReverseDebtRepayments.mockResolvedValue(true);
      const rows = [{ type: 'debt' as const, amount: -750, debtAssetId: 'casa', debtPrincipalRepaid: 412.3 }];
      // No account on the row: only the property moves, and that still counts as a write.
      expect(await reverseAppliedBalances(rows)).toBe(true);
      expect(mockReverseDebtRepayments).toHaveBeenCalledWith(rows);
      expect(mockUpdateCashAssetBalancesAtomic).not.toHaveBeenCalled();
    });
  });
});
