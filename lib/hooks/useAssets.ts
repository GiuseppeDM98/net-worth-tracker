'use client';

/**
 * React Query hooks for Asset management
 *
 * Provides:
 * - Data fetching with caching (useAssets)
 * - Mutations with automatic cache invalidation (useCreateAsset, useUpdateAsset, useDeleteAsset)
 *
 * Cache invalidation strategy: Invalidate all asset queries after mutations
 * to ensure UI reflects latest server state (new/updated/deleted assets).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets, createAsset, updateAsset, deleteAsset } from '@/lib/services/assetService';
import { AssetFormData } from '@/types/assets';

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
 * Create a new asset with automatic cache invalidation
 *
 * After successful creation, invalidates all asset queries to trigger refetch,
 * ensuring the new asset appears in the UI immediately.
 *
 * @param userId - User ID
 * @returns React Query mutation with mutate function and status
 */
export function useCreateAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetData: AssetFormData) => createAsset(userId, assetData),
    onSuccess: () => {
      // Invalidate assets query to trigger refetch and show new asset in UI
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
    },
  });
}

/**
 * Update an existing asset with automatic cache invalidation
 *
 * @param userId - User ID
 * @returns React Query mutation with mutate function and status
 */
export function useUpdateAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, updates }: { assetId: string; updates: Partial<AssetFormData> }) =>
      updateAsset(assetId, updates),
    onSuccess: () => {
      // Invalidate to show updated asset data in UI
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
    },
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
    },
  });
}
