'use client';

/**
 * React Query hooks for Expense and Category management
 *
 * Provides:
 * - Data fetching with caching (useExpenses, useExpensesInRange, useExpenseBounds, useExpenseCategories)
 *
 * Query strategy: Only run when userId is available to prevent unnecessary
 * API calls before authentication completes.
 *
 * WHICH ONE (since 2026-09-30): Tracciamento, Divisione, Budget and FIRE read a WINDOW
 * (`useExpensesInRange` with a window of lib/utils/expenseWindows.ts). `useExpenses` reads the
 * whole collection and is for the pages with no window to read, which share its one list: Storico
 * (the Driver spans every year), Analisi (the history from the floor on, measured too close to
 * everything to be worth a list of its own), Centri di Costo (a centre is lifetime) and its
 * «Collega spese…». Every key sits under `queryKeys.expenses.all`, so one invalidation reaches
 * them all.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getAllExpenses, getExpenseDateBounds, getExpensesByDateRange } from '@/lib/services/expenseService';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import type { ExpenseWindow } from '@/lib/utils/expenseWindows';

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

/** The key of a hook called without a window: never fetched (`enabled` is false), never matched. */
const NO_WINDOW: ExpenseWindow = { from: new Date(0), to: new Date(0) };

/**
 * The expenses of one window as query options — the key carries both bounds, so a different
 * window is a different cache entry and the previous one stays. For an imperative
 * `queryClient.fetchQuery` on the hook's own cache (the budget dialog's suggestion).
 */
export function expensesInRangeQueryOptions(userId: string, window: ExpenseWindow) {
  return queryOptions({
    queryKey: queryKeys.expenses.range(userId, window.from.toISOString(), window.to.toISOString()),
    queryFn: () => getExpensesByDateRange(userId, window.from, window.to),
  });
}

/**
 * Fetch the expenses dated inside a window (lib/utils/expenseWindows.ts), both ends included.
 *
 * No `gcTime` here: the key is under the persisted `expenses` prefix, kept for 24 hours by
 * `applyPersistedQueryDefaults`. And no `placeholderData`: while a NEW window is read the list is
 * empty and `isLoading` is true — the rows of the previous window under the new period would be
 * figures of the wrong months. Read `isLoading`, not `isPending`, when `enabled` can be false.
 *
 * @param userId - User ID (undefined before auth completes)
 * @param window - The window to read, or null when there is none (yet): nothing is fetched
 * @param options.enabled - Lets a caller wait for an input of its window (a lazily mounted tab, the settings' floor)
 */
export function useExpensesInRange(userId: string | undefined, window: ExpenseWindow | null, options?: { enabled?: boolean }) {
  return useQuery({
    ...expensesInRangeQueryOptions(userId || '', window ?? NO_WINDOW),
    enabled: !!userId && window !== null && (options?.enabled ?? true),
  });
}

/**
 * The dates of the account's oldest and newest expense, or null when it has none — two
 * one-document reads beside a window (see `getExpenseDateBounds`).
 */
export function useExpenseBounds(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.expenses.bounds(userId || ''),
    queryFn: () => getExpenseDateBounds(userId!),
    enabled: !!userId,
  });
}

/**
 * Fetch all expense categories for a user with React Query caching
 *
 * Query only runs when userId is defined (enabled: !!userId) to prevent
 * unnecessary API calls before authentication completes.
 *
 * `options.enabled` lets a dialog read only while open (`ExpenseDialog`); read `isLoading`, not
 * `isPending`, on a disabled query.
 *
 * @param userId - User ID (undefined before auth completes)
 * @returns React Query result with expense categories data, loading state, and error
 */
export function useExpenseCategories(userId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    ...categoriesQueryOptions(userId || ''),
    enabled: !!userId && (options?.enabled ?? true), // Only run if userId exists (prevents query before auth)
  });
}

/**
 * The categories query as options, for an imperative `queryClient.fetchQuery` on the hook's own
 * cache (a dialog reading the list once after a write, the CSV import before it commits).
 */
export function categoriesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.expenses.categories(userId),
    queryFn: () => getAllCategories(userId),
  });
}
