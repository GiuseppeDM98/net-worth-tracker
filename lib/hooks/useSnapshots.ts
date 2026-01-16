'use client';

/**
 * React Query hooks for Snapshot management
 *
 * Provides:
 * - Data fetching with caching (useSnapshots)
 * - Mutations with automatic cache invalidation (useCreateSnapshot)
 *
 * Cache invalidation strategy: After snapshot creation, invalidate both
 * snapshots AND assets queries since snapshot creation updates asset prices.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getUserSnapshots } from '@/lib/services/snapshotService';

/**
 * Fetch all snapshots for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with snapshots data, loading state, and error
 */
export function useSnapshots(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshots.all(userId || ''),
    queryFn: () => getUserSnapshots(userId!),
    enabled: !!userId, // Only run if userId exists (prevents query before auth)
  });
}

interface CreateSnapshotParams {
  userId: string;
  year?: number;
  month?: number;
}

interface CreateSnapshotResponse {
  success: boolean;
  message: string;
  snapshotId: string | null;
  data?: {
    year: number;
    month: number;
    totalNetWorth: number;
    liquidNetWorth: number;
    assetsCount: number;
  };
  error?: string;
}

/**
 * Create a new snapshot with automatic cache invalidation
 *
 * After successful snapshot creation, invalidates both snapshots and assets queries
 * to trigger refetch and show updated data in the UI.
 *
 * Cache invalidation rationale:
 * - Snapshots: New snapshot must appear in historical data
 * - Assets: Snapshot creation updates asset prices, Overview page shows asset-based values
 *
 * @param userId - User ID
 * @returns React Query mutation with mutate function and status
 */
export function useCreateSnapshot(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: Omit<CreateSnapshotParams, 'userId'> = {}) => {
      const response = await fetch('/api/portfolio/snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          ...params,
        }),
      });

      const result: CreateSnapshotResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create snapshot');
      }

      return result;
    },
    onSuccess: () => {
      // Invalidate snapshots query to trigger automatic refetch
      queryClient.invalidateQueries({
        queryKey: queryKeys.snapshots.all(userId),
      });

      // CRITICAL: Also invalidate assets cache since snapshot creation updates asset prices
      // The Overview page displays values calculated from assets, not snapshots
      queryClient.invalidateQueries({
        queryKey: queryKeys.assets.all(userId),
      });
    },
  });
}
