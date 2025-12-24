'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllAssets, createAsset, updateAsset, deleteAsset } from '@/lib/services/assetService';
import { AssetFormData } from '@/types/assets';

export function useAssets(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.all(userId || ''),
    queryFn: () => getAllAssets(userId!),
    enabled: !!userId, // Only run if userId exists
  });
}

export function useCreateAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetData: AssetFormData) => createAsset(userId, assetData),
    onSuccess: () => {
      // Invalidate assets query to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
    },
  });
}

export function useUpdateAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, updates }: { assetId: string; updates: Partial<AssetFormData> }) =>
      updateAsset(assetId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
    },
  });
}

export function useDeleteAsset(userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(userId) });
    },
  });
}
