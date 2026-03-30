'use client';

/**
 * React Query hook for all user expenses
 *
 * Intended for aggregate calculations (e.g., dashboard KPI cards) that need
 * the full expense history rather than a single month.
 *
 * Query strategy:
 * - staleTime 5 minutes — full expense list changes less often than current-month stats
 * - enabled guard prevents fetching before auth or when the feature is not configured
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllExpenses } from '@/lib/services/expenseService';

/**
 * Fetch all expenses for a user with React Query caching
 *
 * @param userId - User ID (undefined before auth completes)
 * @param enabled - Additional guard; set to false when the caller does not need this data
 * @returns React Query result with the full expense array
 */
export function useAllExpenses(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.expenses.all(userId || ''),
    queryFn: () => getAllExpenses(userId!),
    enabled: !!userId && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
