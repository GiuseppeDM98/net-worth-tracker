import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

/**
 * fetchFreshLedgerMeta (lib/hooks/useAssetTransactions.ts): the ledger meta as the SERVER holds it
 * now. The meta query is persisted to IndexedDB, `null` included, so a restored `null` on an account
 * migrated from another device must not decide which path a new ledger asset takes (2026-11-12).
 */

const mocks = vi.hoisted(() => ({ getAssetLedgerMeta: vi.fn() }));

vi.mock('@/lib/services/assetTransactionService', () => ({
  getAssetTransactions: vi.fn(),
  getAssetLedgerMeta: mocks.getAssetLedgerMeta,
  createAssetTransaction: vi.fn(),
  updateAssetTransaction: vi.fn(),
  deleteAssetTransaction: vi.fn(),
}));

import { fetchFreshLedgerMeta } from '@/lib/hooks/useAssetTransactions';
import { queryKeys } from '@/lib/query/queryKeys';

describe('fetchFreshLedgerMeta', () => {
  it('asks the server once when the cache holds a (possibly restored) null meta', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5 * 60 * 1000 } } });
    queryClient.setQueryData(queryKeys.assetTransactions.meta('owner-1'), null);
    const meta = { userId: 'owner-1', migratedAssetCount: 2, baselineDate: new Date(2026, 0, 1, 12) };
    mocks.getAssetLedgerMeta.mockResolvedValue(meta);

    const fresh = await fetchFreshLedgerMeta(queryClient, 'owner-1');

    expect(fresh).toEqual(meta);
    expect(mocks.getAssetLedgerMeta).toHaveBeenCalledTimes(1);
    expect(mocks.getAssetLedgerMeta).toHaveBeenCalledWith('owner-1');
  });
});
