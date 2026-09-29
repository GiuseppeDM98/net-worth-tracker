'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getMortgageInstalments } from '@/lib/services/expenseService';

/**
 * The instalments linked to the given properties (Patrimonio's «Mutuo» tile): ONE `in` query for
 * every property (lib/services/expenseService.ts, 2026-09-29).
 *
 * Keyed UNDER the assets key, so every mutation that moves a debt — an instalment saved, edited,
 * deleted, a series settled — refreshes it with the assets' own invalidation; «Collega la serie al
 * mutuo» moves no asset, so `LinkSeriesDialog` invalidates the assets key itself (until 2026-09-29
 * this hook carried `staleTime: 0` instead and re-read on every mount). The global staleTime applies.
 * Disabled (and `isLoading` false) while no property carries a debt.
 */
export function useMortgageInstalments(userId: string | undefined, propertyIds: string[]) {
  return useQuery({
    queryKey: [...queryKeys.assets.all(userId || ''), 'mortgage-instalments', propertyIds],
    queryFn: () => getMortgageInstalments(userId!, propertyIds),
    enabled: !!userId && propertyIds.length > 0,
  });
}
