'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getMortgageInstalments } from '@/lib/services/expenseService';

/**
 * The instalments linked to the given properties (Patrimonio's «Mutuo» tile).
 *
 * Keyed UNDER the assets key, so every mutation that moves a debt — an instalment saved, edited,
 * deleted, a series settled — refreshes it with the assets' own invalidation. `staleTime: 0`
 * because linking a series from Cashflow moves no asset: the page re-reads the few rows on mount.
 * Disabled (and `isLoading` false) while no property carries a debt.
 */
export function useMortgageInstalments(userId: string | undefined, propertyIds: string[]) {
  return useQuery({
    queryKey: [...queryKeys.assets.all(userId || ''), 'mortgage-instalments', propertyIds],
    queryFn: () => getMortgageInstalments(userId!, propertyIds),
    enabled: !!userId && propertyIds.length > 0,
    staleTime: 0,
  });
}
