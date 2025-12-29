'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getUserSnapshots } from '@/lib/services/snapshotService';

export function useSnapshots(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshots.all(userId || ''),
    queryFn: () => getUserSnapshots(userId!),
    enabled: !!userId,
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
 * Mutation hook for creating a new snapshot
 * Automatically invalidates the snapshots cache on success
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
