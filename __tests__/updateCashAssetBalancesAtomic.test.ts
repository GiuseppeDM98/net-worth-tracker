import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test for `updateCashAssetBalancesAtomic`.
 *
 * Unlike cashBalanceReconciliation.test.ts (which mocks this function away), this
 * exercises the REAL implementation against a fake Firestore transaction that
 * enforces the SDK's "all reads before all writes" rule. A transaction that issues
 * a `get()` after an `update()` throws — exactly as the live Firestore client does —
 * so a regression to the interleaved read/write loop would fail here.
 */

// ─── In-memory asset store ──────────────────────────────────────────────────
const store = new Map<string, { userId: string; quantity: number }>();

const invalidateMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: (...args: unknown[]) => invalidateMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  collection: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  deleteField: vi.fn(),
  Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    let hasWritten = false;
    const pending: { id: string; data: Record<string, unknown> }[] = [];
    const tx = {
      get: async (ref: { id: string }) => {
        if (hasWritten) {
          throw new Error(
            'Firestore transactions require all reads to be executed before all writes.',
          );
        }
        const data = store.get(ref.id);
        return { exists: () => data !== undefined, data: () => data };
      },
      update: (ref: { id: string }, data: Record<string, unknown>) => {
        hasWritten = true;
        pending.push({ id: ref.id, data });
      },
    };
    await fn(tx as unknown as Parameters<typeof fn>[0]);
    for (const w of pending) {
      store.set(w.id, { ...store.get(w.id)!, ...(w.data as { quantity: number }) });
    }
  },
}));

import { updateCashAssetBalancesAtomic } from '@/lib/services/assetService';

describe('updateCashAssetBalancesAtomic', () => {
  beforeEach(() => {
    store.clear();
    invalidateMock.mockClear();
  });

  it('applies all deltas atomically for a 2-account transfer (reads before writes)', async () => {
    store.set('origin', { userId: 'u1', quantity: 1000 });
    store.set('dest', { userId: 'u1', quantity: 200 });

    await updateCashAssetBalancesAtomic([
      { assetId: 'origin', signedDelta: -300 },
      { assetId: 'dest', signedDelta: 300 },
    ]);

    expect(store.get('origin')!.quantity).toBe(700);
    expect(store.get('dest')!.quantity).toBe(500);
    expect(invalidateMock).toHaveBeenCalledWith('u1', 'cash_asset_balance_updated');
  });

  it('aggregates duplicate asset IDs and skips a net-zero (self-transfer) update', async () => {
    store.set('a', { userId: 'u1', quantity: 1000 });

    await updateCashAssetBalancesAtomic([
      { assetId: 'a', signedDelta: -300 },
      { assetId: 'a', signedDelta: 300 },
    ]);

    expect(store.get('a')!.quantity).toBe(1000); // unchanged
    expect(invalidateMock).not.toHaveBeenCalled(); // no write → no invalidation
  });

  it('stores the balance to the cent, without the binary noise of the sum (2026-10-07)', async () => {
    // The anchor: the raw sum IS noisy, so the case proves the rounding and not a lucky pair.
    expect(4000.1 + 33.2).not.toBe(4033.3);
    store.set('a', { userId: 'u1', quantity: 4000.1 });

    await updateCashAssetBalancesAtomic([{ assetId: 'a', signedDelta: 33.2 }]);

    expect(store.get('a')!.quantity).toBe(4033.3);
  });

  it('sums multiple deltas on the same asset', async () => {
    store.set('a', { userId: 'u1', quantity: 1000 });

    await updateCashAssetBalancesAtomic([
      { assetId: 'a', signedDelta: -100 },
      { assetId: 'a', signedDelta: -50 },
    ]);

    expect(store.get('a')!.quantity).toBe(850);
  });

  it('skips missing assets but still applies the rest', async () => {
    store.set('dest', { userId: 'u1', quantity: 200 });

    await updateCashAssetBalancesAtomic([
      { assetId: 'missing', signedDelta: -300 },
      { assetId: 'dest', signedDelta: 300 },
    ]);

    expect(store.has('missing')).toBe(false);
    expect(store.get('dest')!.quantity).toBe(500);
  });

  it('is a no-op when all deltas are zero', async () => {
    store.set('a', { userId: 'u1', quantity: 1000 });

    await updateCashAssetBalancesAtomic([{ assetId: 'a', signedDelta: 0 }]);

    expect(store.get('a')!.quantity).toBe(1000);
    expect(invalidateMock).not.toHaveBeenCalled();
  });
});
