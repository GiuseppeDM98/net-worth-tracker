'use client';

/**
 * React Query hook for the owner's dividend receipts (the `dividends` collection read through the
 * client reader, `lib/services/dividendReceiptsService.ts` — the Admin-SDK `dividendService` is
 * server-only). Rendimenti's per-instrument attribution reads it (2026-09-29).
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import { getDividendReceipts } from '@/lib/services/dividendReceiptsService';
import type { DividendReceipt } from '@/lib/utils/performanceAttribution';

/**
 * Every dividend record of the owner, as receipts.
 *
 * @param ownerId - Whose dividends (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export function useDividendReceipts(ownerId: string | undefined) {
  return useQuery({
    ...dividendReceiptsQueryOptions(ownerId || ''),
    enabled: !!ownerId,
  });
}

/** The receipts query as options, for an imperative `queryClient.fetchQuery` on the hook's own cache. */
export function dividendReceiptsQueryOptions(ownerId: string) {
  return queryOptions<DividendReceipt[]>({
    queryKey: queryKeys.dividendReceipts.all(ownerId),
    queryFn: () => getDividendReceipts(ownerId),
  });
}
