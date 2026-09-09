'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getBudgetHistory } from '@/lib/services/budgetHistoryService';

/**
 * The monthly budget records of `monthKeys` for the owner, cached per owner and window.
 * Nothing invalidates it on the client: the only writer is the daily cron, and a stale
 * record is at worst today's capture missing — the running month reads today's
 * configuration anyway (lib/utils/budgetHistory.ts → resolveMonthCeilings).
 */
export function useBudgetHistory(ownerId: string | undefined, monthKeys: string[]) {
  return useQuery({
    queryKey: queryKeys.budgetHistory.months(ownerId ?? '', monthKeys),
    queryFn: () => getBudgetHistory(ownerId!, monthKeys),
    enabled: !!ownerId && monthKeys.length > 0,
    staleTime: 60 * 60 * 1000,
  });
}
