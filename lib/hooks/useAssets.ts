'use client';

/**
 * React Query hooks for Asset management
 *
 * Provides:
 * - Data fetching with caching (useAssets)
 * - Mutations with automatic cache invalidation (useDeleteAsset)
 *
 * Cache invalidation strategy: Invalidate all asset queries after mutations
 * to ensure UI reflects latest server state (new/updated/deleted assets).
 */

import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets, deleteAsset } from '@/lib/services/assetService';

/**
 * Fetch all assets for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * `options.enabled` lets a dialog read only while open (`DividendDialog`); read `isLoading`, not
 * `isPending`, on a disabled query.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with assets data, loading state, and error
 */
export function useAssets(userId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    ...assetsQueryOptions(userId || ''),
    enabled: !!userId && (options?.enabled ?? true), // Only run if userId exists (prevents query before auth)
  });
}

/**
 * The assets query as options, for an imperative `queryClient.fetchQuery` that must share the
 * hook's cache (Rendimenti's base resolution): the same key, the same reader, the global staleTime.
 */
export function assetsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.assets.all(userId),
    queryFn: () => getAllAssets(userId),
  });
}

/**
 * Delete an asset with automatic cache invalidation
 *
 * @param userId - User ID
 * @returns React Query mutation with mutate function and status
 */
export function useDeleteAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId, userId),
    onSuccess: () => {
      // Invalidate to remove deleted asset from UI
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(userId) });
    },
  });
}
