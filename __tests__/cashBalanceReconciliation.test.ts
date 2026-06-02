import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock assetService before importing the module under test.
// Transfer operations now use updateCashAssetBalancesAtomic (atomic transaction);
// single-asset operations still use updateCashAssetBalance.
const mockUpdateCashAssetBalance = vi.fn();
const mockUpdateCashAssetBalancesAtomic = vi.fn();
vi.mock('@/lib/services/assetService', () => ({
  updateCashAssetBalance: (...args: unknown[]) => mockUpdateCashAssetBalance(...args),
  updateCashAssetBalancesAtomic: (...args: unknown[]) => mockUpdateCashAssetBalancesAtomic(...args),
}));

import {
  reconcileTransferEdit,
  reconcileTransferCreate,
  reconcileSingleEdit,
  reconcileSingleCreate,
  reconcileTransferDelete,
} from '@/lib/services/cashBalanceReconciliation';

describe('cashBalanceReconciliation', () => {
  beforeEach(() => {
    mockUpdateCashAssetBalance.mockReset();
    mockUpdateCashAssetBalance.mockResolvedValue(undefined);
    mockUpdateCashAssetBalancesAtomic.mockReset();
    mockUpdateCashAssetBalancesAtomic.mockResolvedValue(undefined);
  });

  // ─── reconcileTransferEdit ─────────────────────────────────────────────────

  describe('reconcileTransferEdit', () => {
    it('should call updateCashAssetBalancesAtomic with correct deltas', async () => {
      const result = await reconcileTransferEdit({
        oldOriginId: 'oldOrigin',
        oldDestId: 'oldDest',
        newOriginId: 'newOrigin',
        newDestId: 'newDest',
        oldAmount: 100,
        newAmount: 200,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalancesAtomic).toHaveBeenCalledTimes(1);
      const updates = mockUpdateCashAssetBalancesAtomic.mock.calls[0][0] as { assetId: string; signedDelta: number }[];
      // Net delta per asset: oldOrigin +100, oldDest -100, newOrigin -200, newDest +200
      expect(updates).toEqual(expect.arrayContaining([
        { assetId: 'oldOrigin', signedDelta: 100 },
        { assetId: 'oldDest',   signedDelta: -100 },
        { assetId: 'newOrigin', signedDelta: -200 },
        { assetId: 'newDest',   signedDelta: 200 },
      ]));
    });

    it('should aggregate net deltas when old and new IDs overlap', async () => {
      // oldOrigin === newOrigin: net delta = +100 - 200 = -100
      const result = await reconcileTransferEdit({
        oldOriginId: 'sharedOrigin',
        oldDestId: 'oldDest',
        newOriginId: 'sharedOrigin',
        newDestId: 'newDest',
        oldAmount: 100,
        newAmount: 200,
      });

      expect(result).toBe(true);
      const updates = mockUpdateCashAssetBalancesAtomic.mock.calls[0][0] as { assetId: string; signedDelta: number }[];
      expect(updates).toEqual(expect.arrayContaining([
        { assetId: 'sharedOrigin', signedDelta: -100 }, // +100 - 200 = -100
        { assetId: 'oldDest',      signedDelta: -100 },
        { assetId: 'newDest',      signedDelta: 200 },
      ]));
    });

    it('should skip missing asset IDs', async () => {
      const result = await reconcileTransferEdit({
        oldOriginId: undefined,
        oldDestId: 'oldDest',
        newOriginId: 'newOrigin',
        newDestId: undefined,
        oldAmount: 50,
        newAmount: 75,
      });

      expect(result).toBe(true);
      const updates = mockUpdateCashAssetBalancesAtomic.mock.calls[0][0] as { assetId: string; signedDelta: number }[];
      expect(updates).toEqual(expect.arrayContaining([
        { assetId: 'oldDest',   signedDelta: -50 },
        { assetId: 'newOrigin', signedDelta: -75 },
      ]));
      expect(updates).toHaveLength(2);
    });

    it('should return false when no asset IDs are provided', async () => {
      const result = await reconcileTransferEdit({
        oldOriginId: undefined,
        oldDestId: undefined,
        newOriginId: undefined,
        newDestId: undefined,
        oldAmount: 100,
        newAmount: 200,
      });

      expect(result).toBe(false);
      expect(mockUpdateCashAssetBalancesAtomic).not.toHaveBeenCalled();
    });

    it('should propagate errors from the atomic transaction', async () => {
      mockUpdateCashAssetBalancesAtomic.mockRejectedValueOnce(new Error('Firestore write failed'));

      await expect(
        reconcileTransferEdit({
          oldOriginId: 'origin',
          oldDestId: 'dest',
          newOriginId: 'newOrigin',
          newDestId: 'newDest',
          oldAmount: 100,
          newAmount: 200,
        })
      ).rejects.toThrow('Firestore write failed');
    });
  });

  // ─── reconcileSingleEdit ───────────────────────────────────────────────────

  describe('reconcileSingleEdit', () => {
    it('should compute delta when linked asset stays the same', async () => {
      const result = await reconcileSingleEdit({
        oldLinkedAssetId: 'assetA',
        newLinkedAssetId: 'assetA',
        oldSignedAmount: -100,
        newSignedAmount: -150,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledWith('assetA', -50);
    });

    it('should skip update when delta is negligible (same asset)', async () => {
      const result = await reconcileSingleEdit({
        oldLinkedAssetId: 'assetA',
        newLinkedAssetId: 'assetA',
        oldSignedAmount: -100,
        newSignedAmount: -100,
      });

      expect(result).toBe(false);
      expect(mockUpdateCashAssetBalance).not.toHaveBeenCalled();
    });

    it('should reverse old and apply new when linked asset changes', async () => {
      const result = await reconcileSingleEdit({
        oldLinkedAssetId: 'assetA',
        newLinkedAssetId: 'assetB',
        oldSignedAmount: -100,
        newSignedAmount: -200,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledTimes(2);
      expect(mockUpdateCashAssetBalance).toHaveBeenNthCalledWith(1, 'assetA', 100);
      expect(mockUpdateCashAssetBalance).toHaveBeenNthCalledWith(2, 'assetB', -200);
    });

    it('should handle only old asset being unlinked', async () => {
      const result = await reconcileSingleEdit({
        oldLinkedAssetId: 'assetA',
        newLinkedAssetId: undefined,
        oldSignedAmount: -100,
        newSignedAmount: -100,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledWith('assetA', 100);
    });

    it('should handle newly linked asset (no old linked)', async () => {
      const result = await reconcileSingleEdit({
        oldLinkedAssetId: undefined,
        newLinkedAssetId: 'assetB',
        oldSignedAmount: -100,
        newSignedAmount: -150,
      });

      expect(result).toBe(true);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledWith('assetB', -150);
    });
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

  // ─── reconcileSingleCreate ─────────────────────────────────────────────────

  describe('reconcileSingleCreate', () => {
    it('should apply signed amount to linked asset', async () => {
      await reconcileSingleCreate({ linkedAssetId: 'cash1', signedAmount: -250 });

      expect(mockUpdateCashAssetBalance).toHaveBeenCalledTimes(1);
      expect(mockUpdateCashAssetBalance).toHaveBeenCalledWith('cash1', -250);
    });

    it('should propagate errors', async () => {
      mockUpdateCashAssetBalance.mockRejectedValueOnce(new Error('fail'));

      await expect(
        reconcileSingleCreate({ linkedAssetId: 'cash1', signedAmount: -100 })
      ).rejects.toThrow('fail');
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
});
