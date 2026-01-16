'use client';

/**
 * React Query hooks for Expense and Category management
 *
 * Provides:
 * - Data fetching with caching (useExpenses, useExpenseCategories)
 *
 * Query strategy: Only run when userId is available to prevent unnecessary
 * API calls before authentication completes.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllExpenses } from '@/lib/services/expenseService';
import { getAllCategories } from '@/lib/services/expenseCategoryService';

/**
 * Fetch all expenses for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with expenses data, loading state, and error
 */
export function useExpenses(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.all(userId || ''),
    queryFn: () => getAllExpenses(userId!),
    enabled: !!userId, // Only run if userId exists (prevents query before auth)
  });
}

/**
 * Fetch all expense categories for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with expense categories data, loading state, and error
 */
export function useExpenseCategories(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.categories(userId || ''),
    queryFn: () => getAllCategories(userId!),
    enabled: !!userId, // Only run if userId exists (prevents query before auth)
  });
}
