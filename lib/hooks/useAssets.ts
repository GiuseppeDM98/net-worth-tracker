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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets, deleteAsset } from '@/lib/services/assetService';

/**
 * Fetch all assets for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with assets data, loading state, and error
 */
export function useAssets(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.all(userId || ''),
    queryFn: () => getAllAssets(userId!),
    enabled: !!userId, // Only run if userId exists (prevents query before auth)
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
    mutationKey: ['deleteAsset', userId],
    mutationFn: (assetId: string) => deleteAsset(assetId, userId),
    onSuccess: () => {
      // Invalidate to remove deleted asset from UI
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(userId) });
    },
  });
}
