'use client';

/**
 * The Cashflow's yearly figures (`AnnualCashflowData`: the last full year, else the running year
 * annualised) for the surfaces that read them beside the FIRE page: the Calcolatore, the
 * Proiezione, the What If baseline, the FIRE assumptions and the accumulation plan.
 *
 * Computed in memory from the FIRE page's RECENT expenses window (January of last year → this
 * December, `fireWindows`) — the key Coast FIRE and the Calcolatore read as well, so after any of
 * them the others read nothing. It replaces the `['annualCashflowData', ownerId]` query that
 * re-read the account's whole expense list (2026-09-30, the upstream realignment T2).
 */

import { useMemo } from 'react';
import { useExpensesInRange } from '@/lib/hooks/useExpenses';
import { computeAnnualCashflowData, type AnnualCashflowData } from '@/lib/services/fireService';
import { fireWindows } from '@/lib/utils/expenseWindows';

export interface UseAnnualCashflowResult {
  /** `undefined` until the window has been read. */
  data: AnnualCashflowData | undefined;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
}

export function useAnnualCashflow(ownerId: string | undefined | null, options?: { enabled?: boolean }): UseAnnualCashflowResult {
  const readAt = useMemo(() => new Date(), []);
  const recentWindow = useMemo(() => fireWindows(readAt, null).recent, [readAt]);
  const { data: recentExpenses, isLoading, isError, isSuccess } = useExpensesInRange(ownerId ?? undefined, recentWindow, options);
  const data = useMemo(
    () => (recentExpenses ? computeAnnualCashflowData(recentExpenses, readAt) : undefined),
    [recentExpenses, readAt],
  );
  return { data, isLoading, isError, isSuccess };
}
