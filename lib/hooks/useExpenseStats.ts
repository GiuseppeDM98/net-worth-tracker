'use client';

/**
 * React Query hook for Expense Statistics
 *
 * Provides:
 * - Expense statistics with caching and automatic refresh
 *
 * Query strategy:
 * - Shorter staleTime (2 minutes) than assets/snapshots for fresher stats
 * - Limited retry (1 attempt) since expense stats are non-critical for app functionality
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getExpenseStats } from '@/lib/services/expenseService';

/**
 * Fetch expense statistics for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * Configuration:
 * - retry: 1 - Limited retries since expense stats are non-critical (won't break app if unavailable)
 * - staleTime: 2 minutes - Shorter than assets/snapshots to show fresher expense data
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with expense statistics, loading state, and error
 */
export function useExpenseStats(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.stats(userId || ''),
    queryFn: () => getExpenseStats(userId!),
    enabled: !!userId, // Only run if userId exists (prevents query before auth)
    retry: 1, // Limit retries - stats are non-critical, failing won't break app
    staleTime: 2 * 60 * 1000, // 2 minutes - Refresh more frequently than assets for up-to-date stats
  });
}
