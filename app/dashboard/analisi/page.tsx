/**
 * ANALISI CASHFLOW PAGE
 *
 * Standalone page extracted from the Cashflow tab in Block 1 (foundation).
 * Owns its own data-fetching so it's usable independently from the Cashflow route.
 *
 * DATA FETCHING:
 * - Expenses + categories: React Query via useExpenses / useExpenseCategories
 * - cashflowHistoryStartYear: one-time read from getSettings (non-fatal, safe default on failure)
 *
 * WHY NOT SHARE DATA WITH CASHFLOW PAGE:
 * These are separate routes with separate lifecycles. Sharing would require
 * lifting state to a layout, adding unnecessary coupling. The overhead is one
 * extra Firestore read (settings) which is cached by the service layer.
 */

'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { getSettings } from '@/lib/services/assetAllocationService';
import { queryKeys } from '@/lib/query/queryKeys';
import { AnalisiTab } from '@/components/cashflow/AnalisiTab';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function AnalisiPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: allExpenses = [], isLoading: expensesLoading } = useExpenses(user?.uid);
  // Categories are loaded so AnalisiTab's sibling components (e.g. ExpenseTrackingTab)
  // share the same RQ cache; we only need the loading flag here.
  const { isLoading: categoriesLoading } = useExpenseCategories(user?.uid);

  const [cashflowHistoryStartYear, setCashflowHistoryStartYear] = useState<number>(
    new Date().getFullYear() - 1
  );

  // Load cashflowHistoryStartYear — same pattern as cashflow/page.tsx. Literal copy intentional:
  // avoid a shared hook abstraction for a one-time read used in two places with the same logic.
  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      try {
        const settings = await getSettings(user.uid);
        if (settings?.cashflowHistoryStartYear !== undefined) {
          setCashflowHistoryStartYear(settings.cashflowHistoryStartYear);
        }
      } catch (error) {
        // Non-fatal: trend charts will simply show data from currentYear-1 onward.
        console.error('Failed to load analisi settings, using fallback defaults', {
          userId: user.uid,
          operation: 'loadAnalisiSettings',
          error: getErrorMessage(error),
        });
      }
    };
    void loadSettings();
  }, [user]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.all(user?.uid || ''),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.expenses.categories(user?.uid || ''),
    });
  };

  const loading = expensesLoading || categoriesLoading;

  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header — standard dashboard page pattern */}
      <div className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Analisi
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
          Analisi Cashflow
        </h1>
        <p className="mt-2 text-muted-foreground">
          Distribuzione delle spese, pattern e trend nel tempo
        </p>
      </div>

      <AnalisiTab
        allExpenses={allExpenses}
        loading={loading}
        onRefresh={handleRefresh}
        historyStartYear={cashflowHistoryStartYear}
      />
    </div>
  );
}
