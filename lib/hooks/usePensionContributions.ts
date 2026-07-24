'use client';

/**
 * React Query hooks for the dedicated `pensionContributions` collection.
 *
 * Every id passed in is the OWNER's (`ownerId` from `useActiveAccount`), never the viewer's: a
 * delegated member records contributions on the shared account's data. The query key varies with the
 * optional `assetId`, so the per-fund and all-funds lists cache independently.
 *
 * Mutations invalidate a TRIPLE: pensionContributions.all + assets.all + dashboard.overview. The
 * usual asset/overview pair becomes a triple because a contribution moves the fund's value — and, for
 * a voluntary one, the source account's balance too — so the asset table and the hero total both go
 * stale (same rule as the trade ledger). Demo mode is gated at the UI (button disable), not here.
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  getPensionContributions,
  recordPensionContribution,
  deletePensionContribution,
  type PensionContributionInput,
} from '@/lib/services/pensionContributionService';
import type { PensionContribution } from '@/types/pension';

/**
 * List an owner's pension contributions, newest first, optionally scoped to one fund.
 *
 * For a lazily-opened dialog pass `{ enabled: isOpen }` so the query fires only when it is visible.
 */
export function usePensionContributions(
  ownerId: string | undefined,
  assetId?: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: assetId
      ? queryKeys.pensionContributions.byAsset(ownerId || '', assetId)
      : queryKeys.pensionContributions.all(ownerId || ''),
    queryFn: () => getPensionContributions(ownerId!, assetId),
    enabled: !!ownerId && (options?.enabled ?? true),
  });
}

/** Invalidate the contribution list, the asset table, and the overview hero after a mutation. */
function invalidatePensionCaches(queryClient: QueryClient, ownerId: string): void {
  // pensionContributions.all is a prefix of byAsset → this also refreshes any open per-fund list.
  queryClient.invalidateQueries({ queryKey: queryKeys.pensionContributions.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(ownerId) });
}

export function useRecordPensionContribution(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PensionContributionInput) => recordPensionContribution(ownerId, input),
    onSuccess: () => invalidatePensionCaches(queryClient, ownerId),
  });
}

/**
 * Delete a contribution and reverse its value/transfer effect.
 *
 * Takes the whole record, not an id: the reversal needs the nature, the amount and the linked
 * transfer/source account, and the caller already holds them from the list query.
 */
export function useDeletePensionContribution(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contribution: PensionContribution) => deletePensionContribution(contribution),
    onSuccess: () => invalidatePensionCaches(queryClient, ownerId),
  });
}
