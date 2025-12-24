'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllExpenses } from '@/lib/services/expenseService';
import { getAllCategories } from '@/lib/services/expenseCategoryService';

/**
 * Hook to fetch all expenses for a user
 * Follows pattern from useAssets.ts
 */
export function useExpenses(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.all(userId || ''),
    queryFn: () => getAllExpenses(userId!),
    enabled: !!userId, // Only run if userId exists
  });
}

/**
 * Hook to fetch all expense categories for a user
 */
export function useExpenseCategories(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.categories(userId || ''),
    queryFn: () => getAllCategories(userId!),
    enabled: !!userId,
  });
}
