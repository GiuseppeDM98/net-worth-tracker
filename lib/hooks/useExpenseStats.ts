'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getExpenseStats } from '@/lib/services/expenseService';

export function useExpenseStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.stats(userId || ''),
    queryFn: () => getExpenseStats(userId!),
    enabled: !!userId,
    retry: 1, // Expense stats are non-critical
    staleTime: 2 * 60 * 1000, // 2 minutes (shorter than assets/snapshots)
  });
}
