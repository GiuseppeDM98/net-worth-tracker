'use client';

/**
 * React Query hooks for the model portfolio (`modelPortfolios/{ownerId}`).
 * `ownerId` is the owner's (`useActiveAccount`), never the viewer's. A write invalidates only
 * `queryKeys.modelPortfolio.byOwner(ownerId)`: nothing here touches assets or the plans.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { deleteModelPortfolio, getModelPortfolio, saveModelPortfolio } from '@/lib/services/modelPortfolioService';
import type { Asset } from '@/types/assets';
import type { ModelPortfolioInput } from '@/types/modelPortfolio';

export function useModelPortfolio(ownerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.modelPortfolio.byOwner(ownerId || ''),
    queryFn: () => getModelPortfolio(ownerId!),
    enabled: !!ownerId,
  });
}

export function useSaveModelPortfolio(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, allAssets }: { input: ModelPortfolioInput; allAssets: Asset[] }) =>
      saveModelPortfolio(ownerId, input, allAssets),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelPortfolio.byOwner(ownerId) }),
  });
}

export function useDeleteModelPortfolio(ownerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteModelPortfolio(ownerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelPortfolio.byOwner(ownerId) }),
  });
}
