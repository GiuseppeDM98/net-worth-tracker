'use client';

/**
 * React Query hooks for the asset trade ledger (Registro operazioni asset).
 *
 * Mutations invalidate a TRIPLE: assetTransactions.all + assets.all + dashboard.overview. The dual
 * asset/overview rule becomes a triple here because a trade's optional cash settlement moves a cash
 * asset balance, so both the hero total and the asset table change
 * (docs/specs/1-asset-transactions/03-service-and-api.md §5). Demo mode is gated at the UI (button
 * disable), like every other mutation — not here.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  getAssetTransactions,
  getAssetLedgerMeta,
  createAssetTransaction,
  updateAssetTransaction,
  deleteAssetTransaction,
} from '@/lib/services/assetTransactionService';
import type { AssetTransactionFormData } from '@/types/assetTransactions';

/**
 * List ledger trades for an owner, optionally scoped to one asset.
 *
 * For a lazily-opened movements dialog pass `{ enabled: isOpen }` so the query fires only when the
 * dialog is open (the exposure/lazy-load precedent).
 */
export function useAssetTransactions(
  ownerId: string | undefined,
  assetId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: assetId
      ? queryKeys.assetTransactions.byAsset(ownerId || '', assetId)
      : queryKeys.assetTransactions.all(ownerId || ''),
    queryFn: () => getAssetTransactions(ownerId!, assetId),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}

/** The per-user ledger metadata doc; `data === null` means migration has not run yet. */
export function useAssetLedgerMeta(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assetTransactions.meta(ownerId || ''),
    queryFn: () => getAssetLedgerMeta(ownerId!),
    enabled: !!ownerId,
  });
}

/** Invalidate the trade list, the asset table, and the overview hero after a trade mutation. */
function invalidateTradeCaches(queryClient: QueryClient, ownerId: string): void {
  // assetTransactions.all is a prefix of byAsset → this also refreshes any open movements list.
  queryClient.invalidateQueries({ queryKey: queryKeys.assetTransactions.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
}

export function useCreateAssetTransaction(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AssetTransactionFormData) => createAssetTransaction(ownerId, data),
    onSuccess: () => invalidateTradeCaches(queryClient, ownerId),
  });
}

export function useUpdateAssetTransaction(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      updates,
    }: {
      transactionId: string;
      updates: Partial<AssetTransactionFormData>;
    }) => updateAssetTransaction(ownerId, transactionId, updates),
    onSuccess: () => invalidateTradeCaches(queryClient, ownerId),
  });
}

export function useDeleteAssetTransaction(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (transactionId: string) => deleteAssetTransaction(ownerId, transactionId),
    onSuccess: () => invalidateTradeCaches(queryClient, ownerId),
  });
}
