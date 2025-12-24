'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getUserSnapshots } from '@/lib/services/snapshotService';

export function useSnapshots(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.snapshots.all(userId || ''),
    queryFn: () => getUserSnapshots(userId!),
    enabled: !!userId,
  });
}
