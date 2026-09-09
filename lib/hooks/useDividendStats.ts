'use client';

import { useQuery } from '@tanstack/react-query';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { DividendStatsPayload } from '@/types/dividend';

/**
 * The server-measured half of the Dividendi tab: yield on cost, current yield, DPS growth and
 * per-instrument total return — everything the browser cannot derive from the dividend list
 * because it needs the cost-basis engines and the trade ledger.
 *
 * WHY NO DATE BOUNDS. Before the 2026-08-23 redesign this was fetched with the period's
 * `startDate`/`endDate` and refetched on every switch of the axis. Those bounds only ever
 * narrowed `periodStats` — a block the tab now derives in memory (dividendAnalytics) — while
 * YOC and current yield are TTM by construction and DPS growth and total return are all-time.
 * Passing them therefore bought nothing and cost a refetch per click, and it let a period
 * change silently move figures that are not on the period axis. One query per owner, cached.
 *
 * The Rendimento tile says so on the surface (`describeYieldFooter`): a tile measured on a
 * window other than the picker's must name its own window.
 */
export function useDividendStats(ownerId: string | null | undefined, enabled = true) {
  return useQuery<DividendStatsPayload>({
    queryKey: ['dividend-stats', ownerId ?? ''],
    enabled: Boolean(ownerId) && enabled,
    queryFn: async () => {
      const response = await authenticatedFetch(`/api/dividends/stats?userId=${ownerId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Errore nel caricamento delle metriche di rendimento');
      }
      const data = await response.json();
      return (data.stats ?? {}) as DividendStatsPayload;
    },
  });
}
