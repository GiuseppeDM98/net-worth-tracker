/**
 * ANALISI CASHFLOW PAGE
 *
 * Standalone page extracted from the Cashflow tab in Block 1 (foundation).
 * Owns its own data-fetching so it's usable independently from the Cashflow route.
 *
 * DATA FETCHING:
 * - Expenses + categories: React Query via useExpenses / useExpenseCategories
 * - cashflowHistoryStartYear + spendingRolesEnabled: `useSettings` (the ONE settings key, 2026-09-29;
 *   non-fatal, safe defaults on failure)
 *
 * WHY NOT SHARE STATE WITH THE CASHFLOW PAGE:
 * These are separate routes with separate lifecycles. The DATA is already shared: both pages
 * read the same React Query keys, so a visit after Cashflow opens on the cache.
 */

'use client';

import { useEffect } from 'react';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useExpenses, useExpenseCategories } from '@/lib/hooks/useExpenses';
import { useSettings } from '@/lib/hooks/useSettings';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { AnalisiTab } from '@/components/cashflow/AnalisiTab';
import { PageContainer } from '@/components/layout/PageContainer';

/** The cashflow floor when the settings carry none: last year (the same default Cashflow uses). */
const DEFAULT_HISTORY_START_YEAR = new Date().getFullYear() - 1;

export default function AnalisiPage() {
  const { ownerId } = useActiveAccount();

  const expensesQuery = useExpenses(ownerId);
  const { data: allExpenses = [], isLoading: expensesLoading, isError: expensesError } = expensesQuery;
  // The taxonomy feeds AnalisiTab directly (entity search + URL-focus label
  // resolution) and shares the RQ cache with the Cashflow page's sibling tabs.
  const categoriesQuery = useExpenseCategories(ownerId);
  const { data: categories = [], isLoading: categoriesLoading, isError: categoriesError } = categoriesQuery;

  // The two settings the page reads — the history floor and the 50/30/20 flag — from the ONE
  // settings key every page shares (2026-09-29): a visit after Cashflow opens on the cache.
  const settingsQuery = useSettings(ownerId);
  const { data: settings, isLoading: settingsLoading, isError: settingsError } = settingsQuery;
  // The header's «Aggiornato alle…» while figures restored from the persisted cache are being
  // reread; the tab owns the header, so the reading travels down as a prop.
  const freshness = useFreshness([expensesQuery, categoriesQuery, settingsQuery]);
  // The URL-focus restore in AnalisiTab validates against the floored history, so it
  // must not fire until the DEFINITIVE floor is known — the restore is one-shot and
  // a wrong provisional floor would silently drop a valid bookmarked focus. The flag waits the
  // same way: a provisional `false` would open the Flusso on «Per tipo» and then jump it.
  // A failed read settles on the defaults: non-fatal for the page, as it always was.
  const settingsSettled = !settingsLoading && (settings !== undefined || settingsError);
  const cashflowHistoryStartYear = settings?.cashflowHistoryStartYear ?? DEFAULT_HISTORY_START_YEAR;
  const spendingRolesEnabled = settings?.spendingRolesEnabled ?? false;

  useEffect(() => {
    if (!settingsError) return;
    // Logged, not shown: the trend charts simply start at last year and the Flusso stays «Per tipo».
    console.error('Failed to load analisi settings, using fallback defaults', {
      userId: ownerId,
      operation: 'loadAnalisiSettings',
    });
  }, [settingsError, ownerId]);

  const loading = expensesLoading || categoriesLoading || !settingsSettled;
  // A failed read is not an empty ledger: `= []` above hides the difference, so the flag
  // travels with the data (lib/utils/statesNarrative.ts).
  const loadFailed = expensesError || categoriesError;

  return (
    <PageContainer>
      <AnalisiTab
        allExpenses={allExpenses}
        categories={categories}
        loading={loading}
        loadFailed={loadFailed}
        historyStartYear={cashflowHistoryStartYear}
        spendingRolesEnabled={spendingRolesEnabled}
        freshness={freshness}
      />
    </PageContainer>
  );
}
